import { describe, it, expect, vi } from 'vitest';
import { ActorRegistry } from './registry.js';
import { Actor, Handle, ORBIT_SNAPSHOT_TYPE } from './decorators.js';
import { OrbitActor } from './actor.js';
import { ActorError } from '@orbitstack/core';

@Actor('Thing')
class ThingActor extends OrbitActor<{ count: number }> {
  initialState() { return { count: 0 }; }
  @Handle('bump') async bump() { this.updateState((s) => { s.count += 1; }); return this.state.count; }
}

class UndecoratedActor extends OrbitActor<{}> {
  initialState() { return {}; }
}

function makeFakeNamespace(responses: Record<string, any>) {
  const fetches: any[] = [];
  const stub = {
    async fetch(_url: string, init: RequestInit) {
      const body = JSON.parse(init.body as string);
      fetches.push({ url: _url, init, body });
      const payload = responses[body.type] ?? { ok: true, data: null };
      return new Response(JSON.stringify(payload), { status: payload.ok === false ? 500 : 200 });
    },
  };
  return {
    namespace: {
      idFromName(name: string) { return { name, toString: () => name }; },
      get(_id: any) { return stub; },
    } as unknown as DurableObjectNamespace,
    fetches,
  };
}

describe('ActorRegistry', () => {
  it('autoRegister binds env bindings whose key matches @Actor name', () => {
    const env = { Thing: { idFromName: () => ({}), get: () => ({}) } };
    const reg = new ActorRegistry(env);
    reg.autoRegister([ThingActor, UndecoratedActor]);
    expect(() => reg.ref(ThingActor, 'a')).not.toThrow();
  });

  it('ref() throws when class is missing @Actor', () => {
    const reg = new ActorRegistry({ Thing: {} });
    expect(() => reg.ref(UndecoratedActor as any, 'x')).toThrow('not decorated with @Actor');
  });

  it('ref() throws when no binding registered', () => {
    const reg = new ActorRegistry({});
    reg.autoRegister([ThingActor]);
    expect(() => reg.ref(ThingActor, 'x')).toThrow('No namespace registered');
  });

  it('refByName resolves through registered namespaces', () => {
    const { namespace } = makeFakeNamespace({ bump: { ok: true, data: 1 } });
    const reg = new ActorRegistry({});
    reg.registerNamespace('Thing', namespace);
    const ref = reg.refByName('Thing', 'x');
    expect(ref.name).toBe('Thing');
    expect(ref.id).toBe('x');
  });
});

describe('ActorRef', () => {
  it('call() POSTs an envelope and unwraps {ok,data}', async () => {
    const { namespace, fetches } = makeFakeNamespace({ bump: { ok: true, data: 7 } });
    const reg = new ActorRegistry({});
    reg.registerNamespace('Thing', namespace);
    const ref = reg.ref(ThingActor, 'r1');
    const out = await ref.call<number>('bump', { delta: 1 });
    expect(out).toBe(7);
    expect(fetches[0].body).toEqual({ type: 'bump', payload: { delta: 1 } });
  });

  it('call() throws ActorError when response.ok=false', async () => {
    const { namespace } = makeFakeNamespace({ bump: { ok: false, error: 'nope' } });
    const reg = new ActorRegistry({});
    reg.registerNamespace('Thing', namespace);
    await expect(reg.ref(ThingActor, 'r1').call('bump')).rejects.toThrow(ActorError);
  });

  it('cast() ignores the returned data', async () => {
    const { namespace, fetches } = makeFakeNamespace({ bump: { ok: true, data: 'irrelevant' } });
    const reg = new ActorRegistry({});
    reg.registerNamespace('Thing', namespace);
    await reg.ref(ThingActor, 'r1').cast('bump', { delta: 1 });
    expect(fetches).toHaveLength(1);
  });

  it('snapshot() calls __orbit.snapshot__', async () => {
    const { namespace, fetches } = makeFakeNamespace({
      [ORBIT_SNAPSHOT_TYPE]: { ok: true, data: { count: 3 } },
    });
    const reg = new ActorRegistry({});
    reg.registerNamespace('Thing', namespace);
    const out = await reg.ref(ThingActor, 'r1').snapshot<{ count: number }>();
    expect(out).toEqual({ count: 3 });
    expect(fetches[0].body.type).toBe(ORBIT_SNAPSHOT_TYPE);
  });

  it('connect() forwards a websocket upgrade', async () => {
    const upgradeReq = new Request('https://test.local/socket', { headers: { upgrade: 'websocket' } });
    let received: Request | null = null;
    const ns = {
      idFromName: (n: string) => ({ name: n, toString: () => n }),
      get: () => ({
        async fetch(url: string, init: RequestInit) {
          received = new Request(url, init);
          return new Response('upgraded');
        },
      }),
    } as unknown as DurableObjectNamespace;
    const reg = new ActorRegistry({});
    reg.registerNamespace('Thing', ns);
    const res = await reg.ref(ThingActor, 'r1').connect(upgradeReq);
    expect(await res.text()).toBe('upgraded');
    expect(received!.headers.get('Upgrade')).toBe('websocket');
  });
});
