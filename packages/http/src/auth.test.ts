import { describe, it, expect } from 'vitest';
import { Container, ENV_TOKEN, UnauthorizedException } from '@orbit/core';
import { bearer, authOf } from './auth.js';

class MockKV {
  constructor(private store: Record<string, unknown>) {}
  async get(key: string, _format: 'json'): Promise<unknown> {
    return this.store[key] ?? null;
  }
}

function buildCtx(headers: Record<string, string>, kv: MockKV): any {
  const container = new Container();
  container.registerValue(ENV_TOKEN, { SESSIONS: kv });
  return {
    request: { headers: new Headers(headers) },
    container,
  };
}

describe('bearer guard', () => {
  it('accepts a valid token', async () => {
    const kv = new MockKV({ 'session:abc': { userId: 'u1', displayName: 'Alice' } });
    const ctx = buildCtx({ Authorization: 'Bearer abc' }, kv);
    const ok = await bearer('SESSIONS')(ctx);
    expect(ok).toBe(true);
    expect(authOf<{ userId: string }>(ctx).userId).toBe('u1');
  });

  it('rejects a missing header', async () => {
    const ctx = buildCtx({}, new MockKV({}));
    await expect(bearer('SESSIONS')(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a wrong scheme', async () => {
    const ctx = buildCtx({ Authorization: 'Basic abc' }, new MockKV({}));
    await expect(bearer('SESSIONS')(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects an unknown token', async () => {
    const ctx = buildCtx({ Authorization: 'Bearer nope' }, new MockKV({}));
    await expect(bearer('SESSIONS')(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects when the KV binding is missing', async () => {
    const container = new Container();
    container.registerValue(ENV_TOKEN, {});
    const ctx = { request: { headers: new Headers({ Authorization: 'Bearer abc' }) }, container } as any;
    await expect(bearer('SESSIONS')(ctx)).rejects.toThrow(/No KV binding/);
  });
});
