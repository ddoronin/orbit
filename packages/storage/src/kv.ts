/**
 * KV namespace wrapper with typed access.
 */

import { Injectable, Inject, KV_TOKEN } from '@orbitstack/core';

/**
 * Typed KV store wrapper.
 * Handles JSON serialization/deserialization and key prefixing.
 */
@Injectable()
export class KVService {
  constructor(@Inject(KV_TOKEN) private kv: KVNamespace) {}

  async get<T = unknown>(key: string): Promise<T | null> {
    const value = await this.kv.get(key, 'json');
    return value as T | null;
  }

  async getText(key: string): Promise<string | null> {
    return this.kv.get(key, 'text');
  }

  async put<T = unknown>(key: string, value: T, options?: KVPutOptions): Promise<void> {
    await this.kv.put(key, JSON.stringify(value), options);
  }

  async putText(key: string, value: string, options?: KVPutOptions): Promise<void> {
    await this.kv.put(key, value, options);
  }

  async delete(key: string): Promise<void> {
    await this.kv.delete(key);
  }

  async list(options?: KVListOptions): Promise<KVNamespaceListResult<unknown>> {
    return this.kv.list(options);
  }

  /**
   * Get-or-set pattern: returns cached value if exists,
   * otherwise calls factory, caches result, and returns it.
   */
  async getOrSet<T>(
    key: string,
    ttl: number,
    factory: () => Promise<T>,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const value = await factory();
    await this.put(key, value, { expirationTtl: ttl });
    return value;
  }

  /** Raw KVNamespace access (escape hatch) */
  get raw(): KVNamespace {
    return this.kv;
  }
}

interface KVPutOptions {
  expiration?: number;
  expirationTtl?: number;
  metadata?: Record<string, unknown>;
}

interface KVListOptions {
  prefix?: string;
  limit?: number;
  cursor?: string;
}

