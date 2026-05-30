import { describe, it, expect, vi } from 'vitest';
import { D1Service } from './d1.js';

function makeMockD1() {
  const calls: any[] = [];
  const prepare = vi.fn((sql: string) => {
    const stmt = {
      sql,
      bindings: [] as unknown[],
      bind(...args: unknown[]) {
        stmt.bindings = args;
        return stmt;
      },
      async all<T = any>() {
        calls.push({ op: 'all', sql, bindings: stmt.bindings });
        return { results: [{ id: 1, name: 'row' }] as T[], success: true };
      },
      async first<T = any>() {
        calls.push({ op: 'first', sql, bindings: stmt.bindings });
        return { id: 1, name: 'row' } as T;
      },
      async run() {
        calls.push({ op: 'run', sql, bindings: stmt.bindings });
        return { success: true, meta: { changes: 1 } };
      },
    };
    return stmt;
  });

  const batch = vi.fn(async (statements: any[]) => {
    calls.push({ op: 'batch', count: statements.length });
    return statements.map(() => ({ success: true }));
  });

  return { db: { prepare, batch } as unknown as D1Database, calls, prepare, batch };
}

describe('D1Service', () => {
  it('query() runs prepare().bind().all()', async () => {
    const { db, calls } = makeMockD1();
    const svc = new D1Service(db);
    const res = await svc.query('SELECT * FROM users WHERE id = ?', 42);
    expect(res.results).toHaveLength(1);
    expect(calls[0]).toMatchObject({ op: 'all', sql: 'SELECT * FROM users WHERE id = ?', bindings: [42] });
  });

  it('queryFirst() returns a single row', async () => {
    const { db } = makeMockD1();
    const svc = new D1Service(db);
    const row = await svc.queryFirst<{ id: number }>('SELECT * FROM users WHERE id = ?', 1);
    expect(row?.id).toBe(1);
  });

  it('execute() returns mutation result', async () => {
    const { db, calls } = makeMockD1();
    const svc = new D1Service(db);
    await svc.execute('INSERT INTO users (name) VALUES (?)', 'alice');
    expect(calls[0]).toMatchObject({ op: 'run', bindings: ['alice'] });
  });

  it('batch() runs multiple statements', async () => {
    const { db, calls } = makeMockD1();
    const svc = new D1Service(db);
    const res = await svc.batch([
      { sql: 'UPDATE users SET name = ?', bindings: ['bob'] },
      { sql: 'DELETE FROM sessions' },
    ]);
    expect(res).toHaveLength(2);
    expect(calls.at(-1)).toMatchObject({ op: 'batch', count: 2 });
  });

  it('raw returns the underlying D1Database', () => {
    const { db } = makeMockD1();
    const svc = new D1Service(db);
    expect(svc.raw).toBe(db);
  });
});
