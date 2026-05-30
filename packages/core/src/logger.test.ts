import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger, generateTraceId, generateSpanId, createTraceContext } from './logger.js';

describe('Logger', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    logSpy.mockRestore();
  });

  function lastEntry() {
    return JSON.parse(logSpy.mock.calls.at(-1)![0] as string);
  }

  it('emits structured JSON with level, msg, logger, ts', () => {
    const log = new Logger('app');
    log.info('hello');
    const entry = lastEntry();
    expect(entry.level).toBe('info');
    expect(entry.msg).toBe('hello');
    expect(entry.logger).toBe('app');
    expect(typeof entry.ts).toBe('number');
  });

  it('includes trace fields when given', () => {
    const log = new Logger('app', { traceId: 'tid', spanId: 'sid' });
    log.warn('oops');
    expect(lastEntry()).toMatchObject({ traceId: 'tid', spanId: 'sid', level: 'warn' });
  });

  it('merges extra data into the entry', () => {
    new Logger('http').error('bad', { status: 500 });
    expect(lastEntry()).toMatchObject({ level: 'error', status: 500 });
  });

  it('debug/info/warn/error map to their level field', () => {
    const log = new Logger('app');
    log.debug('d'); expect(lastEntry().level).toBe('debug');
    log.info('i'); expect(lastEntry().level).toBe('info');
    log.warn('w'); expect(lastEntry().level).toBe('warn');
    log.error('e'); expect(lastEntry().level).toBe('error');
  });

  it('child() extends the name and inherits context', () => {
    const root = new Logger('app', { traceId: 't', spanId: 's' });
    const sub = root.child('req', { reqId: 'r1' });
    sub.info('hi');
    const entry = lastEntry();
    expect(entry.logger).toBe('app.req');
    expect(entry.reqId).toBe('r1');
    expect(entry.traceId).toBe('t');
  });
});

describe('Trace helpers', () => {
  it('generateTraceId returns 32 hex chars', () => {
    const id = generateTraceId();
    expect(id).toMatch(/^[0-9a-f]{32}$/);
  });

  it('generateSpanId returns 16 hex chars', () => {
    expect(generateSpanId()).toMatch(/^[0-9a-f]{16}$/);
  });

  it('createTraceContext without header generates new ids', () => {
    const ctx = createTraceContext();
    expect(ctx.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(ctx.spanId).toMatch(/^[0-9a-f]{16}$/);
    expect(ctx.parentSpanId).toBeUndefined();
  });

  it('createTraceContext parses W3C traceparent header', () => {
    const traceparent = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
    const ctx = createTraceContext(traceparent);
    expect(ctx.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
    expect(ctx.parentSpanId).toBe('00f067aa0ba902b7');
    expect(ctx.spanId).not.toBe(ctx.parentSpanId);
  });

  it('createTraceContext falls back to fresh ids for malformed header', () => {
    const ctx = createTraceContext('garbage');
    expect(ctx.parentSpanId).toBeUndefined();
    expect(ctx.traceId).toMatch(/^[0-9a-f]{32}$/);
  });
});
