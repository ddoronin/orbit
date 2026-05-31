/**
 * D1 integration module.
 *
 * Provides injectable D1 database access. Uses Drizzle ORM directly
 * for query building — Orbit only provides the DI glue.
 */

import { Injectable, Inject, D1_TOKEN, createToken } from '@orbitstack/core';

export const DRIZZLE_TOKEN = createToken<any>('drizzle');

/**
 * D1 database wrapper with convenience methods.
 * For complex queries, use Drizzle ORM directly with DRIZZLE_TOKEN.
 */
@Injectable()
export class D1Service {
  constructor(@Inject(D1_TOKEN) private db: D1Database) {}

  /**
   * Execute a prepared statement.
   */
  async query<T = Record<string, unknown>>(
    sql: string,
    ...bindings: unknown[]
  ): Promise<D1Result<T>> {
    return this.db.prepare(sql).bind(...bindings).all<T>();
  }

  /**
   * Execute a prepared statement and return first row.
   */
  async queryFirst<T = Record<string, unknown>>(
    sql: string,
    ...bindings: unknown[]
  ): Promise<T | null> {
    return this.db.prepare(sql).bind(...bindings).first<T>();
  }

  /**
   * Execute a mutation (INSERT, UPDATE, DELETE).
   */
  async execute(sql: string, ...bindings: unknown[]): Promise<D1Result> {
    return this.db.prepare(sql).bind(...bindings).run();
  }

  /**
   * Run multiple statements in a batch (transactional).
   */
  async batch<T = unknown>(
    statements: { sql: string; bindings?: unknown[] }[],
  ): Promise<D1Result<T>[]> {
    const prepared = statements.map(s =>
      s.bindings ? this.db.prepare(s.sql).bind(...s.bindings) : this.db.prepare(s.sql),
    );
    return this.db.batch<T>(prepared);
  }

  /** Raw D1Database access (escape hatch) */
  get raw(): D1Database {
    return this.db;
  }
}

