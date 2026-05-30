import { describe, it, expect } from 'vitest';
import {
  OrbitApp,
  Injectable,
  Inject,
  getAppMeta,
  getInjectableMeta,
  getInjectTokens,
} from './decorators.js';
import { createToken } from './tokens.js';

describe('Decorators', () => {
  it('@OrbitApp stores flat metadata', () => {
    class FooSvc {}
    class FooCtrl {}
    class FooActor {}

    @OrbitApp({
      providers: [FooSvc],
      controllers: [FooCtrl],
      actors: [FooActor],
      channels: [{ url: '/x/:id', actor: FooActor }],
      bindings: { KV: 'SESSIONS' },
    })
    class App {}

    const meta = getAppMeta(App);
    expect(meta).toBeDefined();
    expect(meta!.providers).toEqual([FooSvc]);
    expect(meta!.controllers).toEqual([FooCtrl]);
    expect(meta!.actors).toEqual([FooActor]);
    expect(meta!.channels).toHaveLength(1);
    expect(meta!.bindings.KV).toBe('SESSIONS');
  });

  it('@OrbitApp defaults empty arrays', () => {
    @OrbitApp({})
    class App {}

    const meta = getAppMeta(App)!;
    expect(meta.providers).toEqual([]);
    expect(meta.actors).toEqual([]);
    expect(meta.controllers).toEqual([]);
    expect(meta.channels).toEqual([]);
    expect(meta.bindings).toEqual({});
  });

  it('@Injectable stores scope metadata', () => {
    @Injectable({ scope: 'REQUEST' })
    class MyService {}

    const meta = getInjectableMeta(MyService);
    expect(meta).toBeDefined();
    expect(meta!.scope).toBe('REQUEST');
  });

  it('@Injectable defaults to SINGLETON scope', () => {
    @Injectable()
    class MyService {}

    const meta = getInjectableMeta(MyService);
    expect(meta!.scope).toBe('SINGLETON');
  });

  it('@Inject stores token at parameter index', () => {
    const DB_TOKEN = createToken('db');
    const CACHE_TOKEN = createToken('cache');

    @Injectable()
    class MyService {
      constructor(
        @Inject(DB_TOKEN) private db: any,
        @Inject(CACHE_TOKEN) private cache: any,
      ) {}
    }

    const tokens = getInjectTokens(MyService);
    expect(tokens[0]).toBe(DB_TOKEN);
    expect(tokens[1]).toBe(CACHE_TOKEN);
  });
});
