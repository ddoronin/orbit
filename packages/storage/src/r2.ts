/**
 * R2 bucket wrapper with typed access.
 */

import { Injectable, Inject, R2_TOKEN } from '@orbitstack/core';

@Injectable()
export class R2Service {
  constructor(@Inject(R2_TOKEN) private bucket: R2Bucket) {}

  async get(key: string): Promise<R2ObjectBody | null> {
    return this.bucket.get(key);
  }

  async put(
    key: string,
    value: ReadableStream | ArrayBuffer | string,
    options?: R2PutOptions,
  ): Promise<R2Object> {
    return this.bucket.put(key, value, options);
  }

  async delete(key: string): Promise<void> {
    await this.bucket.delete(key);
  }

  async deleteMany(keys: string[]): Promise<void> {
    await this.bucket.delete(keys);
  }

  async list(options?: R2ListOptions): Promise<R2Objects> {
    return this.bucket.list(options);
  }

  async head(key: string): Promise<R2Object | null> {
    return this.bucket.head(key);
  }

  /** Raw R2Bucket access (escape hatch) */
  get raw(): R2Bucket {
    return this.bucket;
  }
}

interface R2PutOptions {
  httpMetadata?: {
    contentType?: string;
    contentLanguage?: string;
    contentDisposition?: string;
    contentEncoding?: string;
    cacheControl?: string;
    cacheExpiry?: Date;
  };
  customMetadata?: Record<string, string>;
  sha256?: ArrayBuffer | string;
}

interface R2ListOptions {
  prefix?: string;
  limit?: number;
  cursor?: string;
  delimiter?: string;
  include?: ('httpMetadata' | 'customMetadata')[];
}

