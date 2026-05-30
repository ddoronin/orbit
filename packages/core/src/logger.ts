/**
 * Structured logger with trace context.
 */

export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export class Logger {
  private context: Record<string, unknown>;

  constructor(
    private name: string,
    private trace?: TraceContext,
  ) {
    this.context = {};
  }

  child(name: string, context?: Record<string, unknown>): Logger {
    const logger = new Logger(`${this.name}.${name}`, this.trace);
    logger.context = { ...this.context, ...context };
    return logger;
  }

  debug(msg: string, data?: Record<string, unknown>): void {
    this.log('debug', msg, data);
  }

  info(msg: string, data?: Record<string, unknown>): void {
    this.log('info', msg, data);
  }

  warn(msg: string, data?: Record<string, unknown>): void {
    this.log('warn', msg, data);
  }

  error(msg: string, data?: Record<string, unknown>): void {
    this.log('error', msg, data);
  }

  private log(level: LogLevel, msg: string, data?: Record<string, unknown>): void {
    const entry = {
      level,
      msg,
      logger: this.name,
      ts: Date.now(),
      ...(this.trace ? { traceId: this.trace.traceId, spanId: this.trace.spanId } : {}),
      ...this.context,
      ...data,
    };
    console.log(JSON.stringify(entry));
  }
}

export function generateTraceId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export function generateSpanId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export function createTraceContext(parentHeader?: string | null): TraceContext {
  if (parentHeader) {
    // Parse W3C Traceparent: version-traceId-parentId-flags
    const parts = parentHeader.split('-');
    if (parts.length === 4) {
      return {
        traceId: parts[1],
        spanId: generateSpanId(),
        parentSpanId: parts[2],
      };
    }
  }

  return {
    traceId: generateTraceId(),
    spanId: generateSpanId(),
  };
}
