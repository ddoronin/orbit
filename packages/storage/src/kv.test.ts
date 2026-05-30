import { describe, it, expect, vi } from 'vitest';
import { KVService } from './kv.js';

function makeMockKV() {
  const store = new Map<string, string>();
  const opts = new Map<string, any>();
  return {
    kv: {
      async get(key: string, type?: 'json' | 'text') {
        const v = store.get(key);
        if (v === undefined) return null;
        return type === 'json' ? JSON.parse(v) : v;
      },
      async put(key: string, value: string, options?: any) {
        store.set(key, value);
        if (options) opts.set(key, options);
      },
      async delete(key: string) {
        store.delete(key);
        opts.delete(key);
      },
      async list(opts: any = {}) {
        const keys = [...store.keys()]
          .filter((k) => !opts.prefix || k.startsWith(opts.prefix))
          .slice(0, opts.limit ?? Infinity)
          .map((k) => ({ name: k }));
        return { keys, list_complete: true, cursor: '' };
      },
    } as unknown as KVNamespace,
    store,
    opts,
  };
}

describe('KVService', () => {
  it('put/get round-trips JSON', async () => {
    const { kv, store } = makeMockKV();
    const svc = new KVService(kv);
    await svc.put('foo', { n: 1 });
    expect(store.get('foo')).toBe('{"n":1}');
    expect(await svc.get<{ n: number }>('foo')).toEqual({ n: 1 });
  });

  it('returns null when key missing', async () => {
    const { kv } = makeMockKV();
    const svc = new KVService(kv);
    expect(await svc.get('absent')).toBeNull();
  });

  it('putText/getText skip JSON serialization', async () => {
    const { kv } = makeMockKV();
    const svc = new KVService(kv);
    await svc.putText('greeting', 'hello');
    expect(await svc.getText('greeting')).toBe('hello');
  });

  it('delete removes the key', async () => {
    const { kv, store } = makeMockKV();
    const svc = new KVService(kv);
    await svc.put('foo', 1);
    await svc.delete('foo');
    expect(store.has('foo')).toBe(false);
  });

  it('list filters by prefix and limit', async () => {
    const { kv } = makeMockKV();
    const svc = new KVService(kv);
    await svc.put('user:1', 'a');
    await svc.put('user:2', 'b');
    await svc.put('post:1', 'c');
    const out = await svc.list({ prefix: 'user:' });
    expect(out.keys.map((k: any) => k.name)).toEqual(['user:1', 'user:2']);
  });

  it('getOrSet calls factory once and caches', async () => {
    const { kv } = makeMockKV();
    const svc = new KVService(kv);
    const factory = vi.fn(async () => ({ count: 5 }));
    const a = await svc.getOrSet('cached', 60, factory);
    const b = await svc.getOrSet('cached', 60, factory);
    expect(a).toEqual({ count: 5 });
    expect(b).toEqual({ count: 5 });
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('raw returns the underlying KVNamespace', () => {
    const { kv } = makeMockKV();
    const svc = new KVService(kv);
    expect(svc.raw).toBe(kv);
  });
});
