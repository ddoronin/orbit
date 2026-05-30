/**
 * Built-in middleware for common use cases.
 */

import { createTraceContext, Logger } from '@orbit/core';
import type { MiddlewareFn, RequestContext } from './router.js';

// WebSocket upgrade responses (101 + webSocket field) have immutable headers in
// workerd — any `response.headers.set(...)` throws. Middleware that decorates
// responses (CORS, security headers, trace id) must skip them.
function isWebSocketUpgrade(response: Response): boolean {
  return response.status === 101 || (response as unknown as { webSocket?: unknown }).webSocket != null;
}

/**
 * CORS middleware.
 */
export function cors(options: CorsOptions = {}): MiddlewareFn {
  const {
    origin = '*',
    methods = 'GET,POST,PUT,DELETE,PATCH,OPTIONS',
    allowHeaders = 'Content-Type,Authorization',
    exposeHeaders = '',
    maxAge = 86400,
    credentials = false,
  } = options;

  return async (ctx, next) => {
    // Handle preflight
    if (ctx.request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin, methods, allowHeaders, exposeHeaders, maxAge, credentials),
      });
    }

    const response = await next();
    if (isWebSocketUpgrade(response)) return response;
    const headers = corsHeaders(origin, methods, allowHeaders, exposeHeaders, maxAge, credentials);
    for (const [key, value] of Object.entries(headers)) {
      response.headers.set(key, value);
    }
    return response;
  };
}

function corsHeaders(
  origin: string,
  methods: string,
  allowHeaders: string,
  exposeHeaders: string,
  maxAge: number,
  credentials: boolean,
): Record<string, string> {
  const h: Record<string, string> = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': allowHeaders,
    'Access-Control-Max-Age': String(maxAge),
  };
  if (exposeHeaders) h['Access-Control-Expose-Headers'] = exposeHeaders;
  if (credentials) h['Access-Control-Allow-Credentials'] = 'true';
  return h;
}

export interface CorsOptions {
  origin?: string;
  methods?: string;
  allowHeaders?: string;
  exposeHeaders?: string;
  maxAge?: number;
  credentials?: boolean;
}

/**
 * Request logging middleware.
 */
export function requestLogger(): MiddlewareFn {
  return async (ctx, next) => {
    const start = Date.now();
    const trace = createTraceContext(ctx.request.headers.get('traceparent'));
    const logger = new Logger('http', trace);

    logger.info('request', {
      method: ctx.request.method,
      path: ctx.url.pathname,
    });

    try {
      const response = await next();
      const duration = Date.now() - start;

      logger.info('response', {
        method: ctx.request.method,
        path: ctx.url.pathname,
        status: response.status,
        duration,
      });

      // Propagate trace ID in response (skip for WS upgrades — headers immutable)
      if (!isWebSocketUpgrade(response)) {
        response.headers.set('x-trace-id', trace.traceId);
      }
      return response;
    } catch (err: any) {
      const duration = Date.now() - start;
      logger.error('request failed', {
        method: ctx.request.method,
        path: ctx.url.pathname,
        error: err.message,
        duration,
      });
      throw err;
    }
  };
}

/**
 * Security headers middleware.
 */
export function securityHeaders(): MiddlewareFn {
  return async (ctx, next) => {
    const response = await next();
    if (isWebSocketUpgrade(response)) return response;
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-XSS-Protection', '1; mode=block');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    return response;
  };
}

/**
 * Timing middleware — adds Server-Timing header.
 */
export function timing(): MiddlewareFn {
  return async (ctx, next) => {
    const start = Date.now();
    const response = await next();
    if (isWebSocketUpgrade(response)) return response;
    const duration = Date.now() - start;
    response.headers.set('Server-Timing', `total;dur=${duration}`);
    return response;
  };
}
