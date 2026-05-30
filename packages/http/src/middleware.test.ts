import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Router } from './router.js';
import { cors, requestLogger, securityHeaders, timing } from './middleware.js';

function ok() {
  return new Response('ok');
}

describe('cors', () => {
  it('answers OPTIONS preflight with 204 and ACAO/ACAM headers', async () => {
    // CORS short-circuits OPTIONS inside the middleware, so we invoke it directly
    const mw = cors({ origin: 'https://x.com' });
    const ctx = { request: new Request('https://test.local/x', { method: 'OPTIONS' }) } as any;
    const res = await mw(ctx, async () => new Response('should not run'));
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://x.com');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('GET');
  });

  it('adds CORS headers to normal responses', async () => {
    const r = new Router().use(cors()).get('/x', ok);
    const res = await r.handle(new Request('https://test.local/x'), null);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('emits Allow-Credentials when configured', async () => {
    const r = new Router().use(cors({ credentials: true })).get('/x', ok);
    const res = await r.handle(new Request('https://test.local/x'), null);
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  });

  it('emits Expose-Headers when provided', async () => {
    const r = new Router().use(cors({ exposeHeaders: 'X-Total' })).get('/x', ok);
    const res = await r.handle(new Request('https://test.local/x'), null);
    expect(res.headers.get('Access-Control-Expose-Headers')).toBe('X-Total');
  });
});

describe('requestLogger', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { logSpy = vi.spyOn(console, 'log').mockImplementation(() => {}); });
  afterEach(() => { logSpy.mockRestore(); });

  it('logs request + response and propagates traceparent', async () => {
    const r = new Router().use(requestLogger()).get('/y', ok);
    const res = await r.handle(
      new Request('https://test.local/y', { headers: { traceparent: '00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01' } }),
      null,
    );
    expect(res.headers.get('x-trace-id')).toBe('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    const events = logSpy.mock.calls.map((c) => JSON.parse(c[0] as string).msg);
    expect(events).toContain('request');
    expect(events).toContain('response');
  });

  it('logs failures and rethrows', async () => {
    const r = new Router().use(requestLogger()).get('/z', () => { throw new Error('boom'); });
    const res = await r.handle(new Request('https://test.local/z'), null);
    expect(res.status).toBe(500);
    const events = logSpy.mock.calls.map((c) => JSON.parse(c[0] as string).msg);
    expect(events).toContain('request failed');
  });
});

describe('securityHeaders', () => {
  it('sets standard security headers', async () => {
    const r = new Router().use(securityHeaders()).get('/x', ok);
    const res = await r.handle(new Request('https://test.local/x'), null);
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('Referrer-Policy')).toBeTruthy();
  });
});

describe('timing', () => {
  it('attaches Server-Timing header', async () => {
    const r = new Router().use(timing()).get('/x', ok);
    const res = await r.handle(new Request('https://test.local/x'), null);
    expect(res.headers.get('Server-Timing')).toMatch(/^total;dur=\d+/);
  });
});
