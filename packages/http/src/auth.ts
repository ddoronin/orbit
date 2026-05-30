/**
 * Built-in authentication primitives.
 */

import { UnauthorizedException, ENV_TOKEN } from '@orbit/core';
import type { GuardFn, RequestContext } from './router.js';

const AUTH_HEADER = 'authorization';
const SESSION_PREFIX = 'session:';
const QUERY_PARAM = 'access_token';

export interface BearerOptions {
  /** Env binding name of the KV namespace that stores session entries. */
  store: string;
  /** Prefix applied to session keys. Defaults to "session:". */
  prefix?: string;
  /** Header to read. Defaults to "authorization". */
  header?: string;
  /** Query param to read as fallback (RFC 6750 §2.3). Defaults to "access_token". Set to false to disable. */
  queryParam?: string | false;
}

/**
 * Bearer-token guard. Looks up `session:<token>` in the named KV binding.
 * On success, attaches the parsed JSON payload to `ctx.auth`.
 *
 * Reads `Authorization: Bearer <token>` by default. Falls back to a query
 * param (default `?access_token=`) when the header is absent — required for
 * browser WebSocket clients, which cannot set custom headers on upgrades.
 */
export function bearer<T = unknown>(store: string, opts: Partial<BearerOptions> = {}): GuardFn {
  const prefix = opts.prefix ?? SESSION_PREFIX;
  const header = (opts.header ?? AUTH_HEADER).toLowerCase();
  const queryParam = opts.queryParam === false ? null : (opts.queryParam ?? QUERY_PARAM);

  return async (ctx: RequestContext) => {
    let token: string | null = null;
    const raw = ctx.request.headers.get(header);
    if (raw?.startsWith('Bearer ')) {
      token = raw.slice('Bearer '.length).trim();
    } else if (queryParam && ctx.query) {
      token = ctx.query.get(queryParam);
    }
    if (!token) {
      throw new UnauthorizedException('Missing or invalid bearer token');
    }
    const env = await ctx.container.resolve(ENV_TOKEN);
    const kv = env?.[store] as KVNamespace | undefined;
    if (!kv) {
      throw new UnauthorizedException(`No KV binding "${store}"`);
    }
    const session = await kv.get(prefix + token, 'json');
    if (!session) {
      throw new UnauthorizedException('Session not found');
    }
    (ctx as any).auth = session as T;
    return true;
  };
}

/**
 * Read the auth payload attached by a guard. Throws if no guard ran.
 */
export function authOf<T = unknown>(ctx: RequestContext): T {
  const auth = (ctx as any).auth as T | undefined;
  if (!auth) throw new UnauthorizedException();
  return auth;
}
