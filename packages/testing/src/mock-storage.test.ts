import { describe, it, expect } from 'vitest';
import { MockDurableObjectStorage, MockKVNamespace, MockR2Bucket } from './mock-storage.js';

describe('MockDurableObjectStorage', () => {
  it('stores and retrieves values', async () => {
    const storage = new MockDurableObjectStorage();
    await storage.put('key1', { value: 42 });
    expect(await storage.get('key1')).toEqual({ value: 42 });
  });

  it('returns undefined for missing keys', async () => {
    const storage = new MockDurableObjectStorage();
    expect(await storage.get('missing')).toBeUndefined();
  });

  it('deletes values', async () => {
    const storage = new MockDurableObjectStorage();
    await storage.put('key1', 'value');
    expect(await storage.delete('key1')).toBe(true);
    expect(await storage.get('key1')).toBeUndefined();
  });

  it('lists with prefix', async () => {
    const storage = new MockDurableObjectStorage();
    await storage.put('user:1', 'a');
    await storage.put('user:2', 'b');
    await storage.put('post:1', 'c');

    const result = await storage.list({ prefix: 'user:' });
    expect(result.size).toBe(2);
  });

  it('manages alarms', async () => {
    const storage = new MockDurableObjectStorage();
    expect(await storage.getAlarm()).toBeNull();

    await storage.setAlarm(new Date('2025-01-01'));
    expect(await storage.getAlarm()).toBe(new Date('2025-01-01').getTime());

    await storage.deleteAlarm();
    expect(await storage.getAlarm()).toBeNull();
  });
});

describe('MockKVNamespace', () => {
  it('stores and retrieves JSON values', async () => {
    const kv = new MockKVNamespace();
    await kv.put('key', JSON.stringify({ data: 'test' }));
    expect(await kv.get('key', 'json')).toEqual({ data: 'test' });
  });

  it('returns null for missing keys', async () => {
    const kv = new MockKVNamespace();
    expect(await kv.get('missing', 'json')).toBeNull();
  });

  it('deletes values', async () => {
    const kv = new MockKVNamespace();
    await kv.put('key', 'value');
    await kv.delete('key');
    expect(await kv.get('key')).toBeNull();
  });

  it('lists keys with prefix', async () => {
    const kv = new MockKVNamespace();
    await kv.put('user:1', 'a');
    await kv.put('user:2', 'b');
    await kv.put('post:1', 'c');

    const result = await kv.list({ prefix: 'user:' });
    expect(result.keys).toHaveLength(2);
  });
});

describe('MockR2Bucket', () => {
  it('stores and retrieves objects', async () => {
    const r2 = new MockR2Bucket();
    await r2.put('file.txt', 'hello world', {
      httpMetadata: { contentType: 'text/plain' },
    });

    const obj = await r2.get('file.txt');
    expect(obj).not.toBeNull();
    expect(await obj.text()).toBe('hello world');
  });

  it('returns null for missing keys', async () => {
    const r2 = new MockR2Bucket();
    expect(await r2.get('missing')).toBeNull();
  });

  it('deletes objects', async () => {
    const r2 = new MockR2Bucket();
    await r2.put('file.txt', 'data');
    await r2.delete('file.txt');
    expect(await r2.get('file.txt')).toBeNull();
  });

  it('lists objects', async () => {
    const r2 = new MockR2Bucket();
    await r2.put('a.txt', '1');
    await r2.put('b.txt', '2');

    const result = await r2.list();
    expect(result.objects).toHaveLength(2);
  });
});
