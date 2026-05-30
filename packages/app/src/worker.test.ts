import { describe, it, expect, vi } from 'vitest';
import {
  OrbitApp,
  Injectable,
  Inject,
  KV_TOKEN,
  D1_TOKEN,
  ENV_TOKEN,
  Actor,
  Handle,
  OrbitActor,
  ActorRegistry,
  ACTOR_REGISTRY_TOKEN,
  Resource,
  Get,
  Post,
  Param,
  Body,
} from './index.js';
import { createWorker } from './worker.js';

@Actor('Thing')
class ThingActor extends OrbitActor<{ n: number }> {
  initialState() { return { n: 0 }; }
  @Handle('bump') async bump() { this.updateState((s) => { s.n += 1; }); return this.state.n; }
}

@Resource('/things')
class ThingsController {
  constructor(@Inject(ACTOR_REGISTRY_TOKEN) private actors: ActorRegistry) {}

  @Get('/:id/snapshot')
  async snap(@Param('id') id: string) {
    return this.actors.ref(ThingActor, id).snapshot();
  }

  @Post('/echo')
  async echo(@Body() body: any) {
    return body;
  }
}

@OrbitApp({
  actors: [ThingActor],
  controllers: [ThingsController],
  channels: [{ url: '/things/:id/socket', actor: ThingActor, idParam: 'id' }],
  bindings: { KV: 'SESSIONS', D1: 'DB' },
})
class App {}

@OrbitApp({})
class EmptyApp {}

function makeEnv(extra: Record<string, any> = {}) {
  return {
    SESSIONS: { kind: 'kv' },
    DB: { kind: 'd1' },
    Thing: makeFakeNamespace(),
    ...extra,
  };
}

function makeFakeNamespace() {
  return {
    idFromName: (n: string) => ({ toString: () => n }),
    get: () => ({
      async fetch(_url: string, init: RequestInit) {
        const body = JSON.parse(init.body as string);
        return Response.json({ ok: true, data: { type: body.type, ack: true } });
      },
    }),
  };
}

const ctx = {} as any;

describe('createWorker', () => {
  it('returns a fetch handler and DO classes named after @Actor', () => {
    const worker = createWorker(App);
    expect(typeof worker.fetch).toBe('function');
    expect(worker.Thing).toBeDefined();
    expect(typeof worker.Thing).toBe('function'); // DO class constructor
  });

  it('returns DO classes for an empty app (just the handler)', () => {
    const worker = createWorker(EmptyApp);
    expect(typeof worker.fetch).toBe('function');
  });

  it('exposes a built-in health check', async () => {
    const worker = createWorker(App, { bareMiddleware: true });
    const res = await worker.fetch(
      new Request('https://test.local/__orbit__/health'),
      makeEnv(),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('routes registered controllers', async () => {
    const worker = createWorker(App, { bareMiddleware: true });
    const res = await worker.fetch(
      new Request('https://test.local/things/echo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hello: 'world' }),
      }),
      makeEnv(),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hello: 'world' });
  });

  it('routes to an actor through the registry', async () => {
    const worker = createWorker(App, { bareMiddleware: true });
    const res = await worker.fetch(
      new Request('https://test.local/things/42/snapshot'),
      makeEnv(),
      ctx,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // The fake namespace echoes the message type that was sent
    expect((body as any).type).toBeDefined();
  });

  it('forwards WS upgrade to the channel actor', async () => {
    let receivedUpgrade = false;
    const env = makeEnv({
      Thing: {
        idFromName: (n: string) => ({ toString: () => n }),
        get: () => ({
          async fetch(_url: string, init: RequestInit) {
            if ((init.headers as Headers).get('Upgrade') === 'websocket') {
              receivedUpgrade = true;
              return new Response('upgraded');
            }
            return Response.json({ ok: true });
          },
        }),
      },
    });
    const worker = createWorker(App, { bareMiddleware: true });
    const res = await worker.fetch(
      new Request('https://test.local/things/42/socket', {
        headers: { Upgrade: 'websocket' },
      }),
      env,
      ctx,
    );
    expect(receivedUpgrade).toBe(true);
    expect(await res.text()).toBe('upgraded');
  });

  it('returns 404 for unknown routes', async () => {
    const worker = createWorker(App, { bareMiddleware: true });
    const res = await worker.fetch(
      new Request('https://test.local/nope'),
      makeEnv(),
      ctx,
    );
    expect(res.status).toBe(404);
  });
});
