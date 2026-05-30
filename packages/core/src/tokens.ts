/**
 * Token system for dependency injection.
 * Tokens identify injectable dependencies without runtime type reflection.
 */

export type Token<T = any> = symbol | string | (new (...args: any[]) => T);

export interface TokenDescriptor {
  token: Token;
  optional?: boolean;
}

let tokenCounter = 0;

export function createToken<T = any>(description: string): Token<T> {
  return Symbol(`orbit:${description}:${tokenCounter++}`);
}

// Well-known tokens for Cloudflare bindings
export const ENV_TOKEN = createToken<any>('env');
export const D1_TOKEN = createToken<any>('d1');
export const KV_TOKEN = createToken<any>('kv');
export const R2_TOKEN = createToken<any>('r2');
export const QUEUE_TOKEN = (name: string) => createToken<any>(`queue:${name}`);
export const DO_TOKEN = (name: string) => createToken<any>(`do:${name}`);
export const EXECUTION_CTX_TOKEN = createToken<any>('execution-context');
export const REQUEST_TOKEN = createToken<any>('request');
