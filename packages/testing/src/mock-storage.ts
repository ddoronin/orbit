/**
 * Mock implementations of Cloudflare storage APIs for testing.
 */

export class MockDurableObjectStorage {
  private data = new Map<string, any>();
  private alarm: Date | null = null;

  async get<T = unknown>(key: string): Promise<T | undefined>;
  async get<T = unknown>(keys: string[]): Promise<Map<string, T>>;
  async get<T = unknown>(keyOrKeys: string | string[]): Promise<T | undefined | Map<string, T>> {
    if (Array.isArray(keyOrKeys)) {
      const result = new Map<string, T>();
      for (const key of keyOrKeys) {
        if (this.data.has(key)) {
          result.set(key, this.data.get(key) as T);
        }
      }
      return result;
    }
    return this.data.get(keyOrKeys) as T | undefined;
  }

  async put<T>(key: string, value: T): Promise<void>;
  async put<T>(entries: Record<string, T>): Promise<void>;
  async put<T>(keyOrEntries: string | Record<string, T>, value?: T): Promise<void> {
    if (typeof keyOrEntries === 'string') {
      this.data.set(keyOrEntries, value);
    } else {
      for (const [k, v] of Object.entries(keyOrEntries)) {
        this.data.set(k, v);
      }
    }
  }

  async delete(key: string): Promise<boolean>;
  async delete(keys: string[]): Promise<number>;
  async delete(keyOrKeys: string | string[]): Promise<boolean | number> {
    if (Array.isArray(keyOrKeys)) {
      let count = 0;
      for (const key of keyOrKeys) {
        if (this.data.delete(key)) count++;
      }
      return count;
    }
    return this.data.delete(keyOrKeys);
  }

  async list(options?: { prefix?: string; limit?: number }): Promise<Map<string, any>> {
    const result = new Map<string, any>();
    for (const [key, value] of this.data) {
      if (options?.prefix && !key.startsWith(options.prefix)) continue;
      result.set(key, value);
      if (options?.limit && result.size >= options.limit) break;
    }
    return result;
  }

  async setAlarm(scheduledTime: Date | number): Promise<void> {
    this.alarm = typeof scheduledTime === 'number' ? new Date(scheduledTime) : scheduledTime;
  }

  async getAlarm(): Promise<number | null> {
    return this.alarm ? this.alarm.getTime() : null;
  }

  async deleteAlarm(): Promise<void> {
    this.alarm = null;
  }

  async transaction<T>(closure: (txn: MockDurableObjectStorage) => Promise<T>): Promise<T> {
    // Simple implementation: just run the closure
    return closure(this);
  }

  // Test helpers
  __getData(): Map<string, any> {
    return new Map(this.data);
  }

  __clear(): void {
    this.data.clear();
    this.alarm = null;
  }
}

export class MockDurableObjectState {
  storage: MockDurableObjectStorage;
  id: { toString(): string; name?: string };

  constructor(id = 'test-actor-id') {
    this.storage = new MockDurableObjectStorage();
    this.id = {
      toString: () => id,
      name: id,
    };
  }

  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T> {
    return fn();
  }

  acceptWebSocket(_ws: any): void {
    // no-op in tests
  }

  getWebSockets(): any[] {
    return [];
  }
}

export class MockKVNamespace {
  private data = new Map<string, { value: string; metadata?: any; expiry?: number }>();

  async get(key: string, type?: string): Promise<any> {
    const entry = this.data.get(key);
    if (!entry) return null;
    if (entry.expiry && Date.now() > entry.expiry) {
      this.data.delete(key);
      return null;
    }
    if (type === 'json') return JSON.parse(entry.value);
    return entry.value;
  }

  async put(key: string, value: string, options?: any): Promise<void> {
    const entry: any = { value };
    if (options?.expirationTtl) {
      entry.expiry = Date.now() + options.expirationTtl * 1000;
    }
    if (options?.metadata) {
      entry.metadata = options.metadata;
    }
    this.data.set(key, entry);
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }

  async list(options?: any): Promise<{ keys: { name: string }[]; list_complete: boolean; cursor?: string }> {
    const keys: { name: string }[] = [];
    for (const key of this.data.keys()) {
      if (options?.prefix && !key.startsWith(options.prefix)) continue;
      keys.push({ name: key });
      if (options?.limit && keys.length >= options.limit) break;
    }
    return { keys, list_complete: true };
  }

  __clear(): void {
    this.data.clear();
  }
}

export class MockR2Bucket {
  private data = new Map<string, { body: any; metadata?: any; httpMetadata?: any }>();

  async get(key: string): Promise<any> {
    const obj = this.data.get(key);
    if (!obj) return null;
    return {
      key,
      body: obj.body,
      bodyUsed: false,
      async text() { return typeof obj.body === 'string' ? obj.body : JSON.stringify(obj.body); },
      async json() { return typeof obj.body === 'string' ? JSON.parse(obj.body) : obj.body; },
      async arrayBuffer() { return new TextEncoder().encode(typeof obj.body === 'string' ? obj.body : JSON.stringify(obj.body)).buffer; },
      customMetadata: obj.metadata ?? {},
      httpMetadata: obj.httpMetadata ?? {},
    };
  }

  async put(key: string, value: any, options?: any): Promise<any> {
    this.data.set(key, {
      body: value,
      metadata: options?.customMetadata,
      httpMetadata: options?.httpMetadata,
    });
    return { key };
  }

  async delete(keyOrKeys: string | string[]): Promise<void> {
    const keys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];
    for (const key of keys) {
      this.data.delete(key);
    }
  }

  async head(key: string): Promise<any> {
    if (!this.data.has(key)) return null;
    return { key };
  }

  async list(options?: any): Promise<{ objects: { key: string }[]; truncated: boolean }> {
    const objects: { key: string }[] = [];
    for (const key of this.data.keys()) {
      if (options?.prefix && !key.startsWith(options.prefix)) continue;
      objects.push({ key });
      if (options?.limit && objects.length >= options.limit) break;
    }
    return { objects, truncated: false };
  }

  __clear(): void {
    this.data.clear();
  }
}

export class MockD1Database {
  private data: Record<string, any[]> = {};

  prepare(sql: string): MockD1PreparedStatement {
    return new MockD1PreparedStatement(sql, this);
  }

  async batch<T = any>(stmts: MockD1PreparedStatement[]): Promise<any[]> {
    return Promise.all(stmts.map(s => s.all()));
  }

  // Test helper: set table data
  __setTable(name: string, rows: any[]): void {
    this.data[name] = [...rows];
  }

  __getTable(name: string): any[] {
    return this.data[name] ?? [];
  }

  __clear(): void {
    this.data = {};
  }
}

export class MockD1PreparedStatement {
  private bindings: any[] = [];

  constructor(
    private sql: string,
    private db: MockD1Database,
  ) {}

  bind(...values: any[]): this {
    this.bindings = values;
    return this;
  }

  async all<T = any>(): Promise<{ results: T[]; success: boolean; meta: any }> {
    return { results: [] as T[], success: true, meta: {} };
  }

  async first<T = any>(): Promise<T | null> {
    return null;
  }

  async run(): Promise<{ success: boolean; meta: any }> {
    return { success: true, meta: { changes: 1 } };
  }

  async raw<T = any>(): Promise<T[]> {
    return [];
  }
}
