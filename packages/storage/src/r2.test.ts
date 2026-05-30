import { describe, it, expect, vi } from 'vitest';
import { R2Service } from './r2.js';

function makeMockR2() {
  const store = new Map<string, any>();
  return {
    bucket: {
      async put(key: string, body: any, options?: any) {
        const obj = { key, body, ...options };
        store.set(key, obj);
        return obj;
      },
      async get(key: string) {
        return store.get(key) ?? null;
      },
      async delete(keyOrKeys: string | string[]) {
        if (Array.isArray(keyOrKeys)) {
          keyOrKeys.forEach((k) => store.delete(k));
        } else {
          store.delete(keyOrKeys);
        }
      },
      async list(options: any = {}) {
        const objects = [...store.values()].filter(
          (o) => !options.prefix || o.key.startsWith(options.prefix),
        );
        return { objects, truncated: false, delimitedPrefixes: [] };
      },
      async head(key: string) {
        return store.get(key) ?? null;
      },
    } as unknown as R2Bucket,
    store,
  };
}

describe('R2Service', () => {
  it('put + get + head', async () => {
    const { bucket } = makeMockR2();
    const svc = new R2Service(bucket);
    await svc.put('docs/a.txt', 'hello', { httpMetadata: { contentType: 'text/plain' } });
    const obj = (await svc.get('docs/a.txt')) as any;
    expect(obj.key).toBe('docs/a.txt');
    expect((await svc.head('docs/a.txt') as any).key).toBe('docs/a.txt');
  });

  it('delete single + many', async () => {
    const { bucket, store } = makeMockR2();
    const svc = new R2Service(bucket);
    await svc.put('a', 'x');
    await svc.put('b', 'y');
    await svc.put('c', 'z');
    await svc.delete('a');
    await svc.deleteMany(['b', 'c']);
    expect(store.size).toBe(0);
  });

  it('list filters by prefix', async () => {
    const { bucket } = makeMockR2();
    const svc = new R2Service(bucket);
    await svc.put('img/1.png', 'x');
    await svc.put('img/2.png', 'y');
    await svc.put('doc/3.pdf', 'z');
    const out = await svc.list({ prefix: 'img/' });
    expect(out.objects).toHaveLength(2);
  });

  it('raw returns the underlying R2Bucket', () => {
    const { bucket } = makeMockR2();
    const svc = new R2Service(bucket);
    expect(svc.raw).toBe(bucket);
  });
});
