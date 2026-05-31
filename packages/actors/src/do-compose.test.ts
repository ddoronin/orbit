import { describe, it, expect, vi } from 'vitest';
import { composeDurableObject } from './do-compose.js';
import { Actor, Handle } from './decorators.js';
import { OrbitActor } from './actor.js';
import { MockDurableObjectState } from '@orbitstack/testing';

@Actor('Doc')
class DocActor extends OrbitActor<{ ok: boolean }> {
  initialState() { return { ok: false }; }
  @Handle('toggle') async toggle() {
    this.updateState((s) => { s.ok = !s.ok; });
    return this.state.ok;
  }
}

class NotAnActor {}

describe('composeDurableObject', () => {
  it('throws when class lacks @Actor metadata', () => {
    expect(() => composeDurableObject(NotAnActor as any)).toThrow('not decorated with @Actor');
  });

  it('falls back to actor message dispatch with no channels', async () => {
    const DO = composeDurableObject(DocActor);
    const state = new MockDurableObjectState();
    const instance = new (DO as any)(state, {});
    await Promise.resolve();
    const res = await instance.fetch(new Request('https://actor', {
      method: 'POST',
      body: JSON.stringify({ type: 'toggle', payload: null }),
    }));
    expect((await res.json()).data).toBe(true);
  });

  it('routes WebSocket events to channels.handleMessage when channels are configured', async () => {
    const handler = {
      handleUpgrade: vi.fn(() => new Response('upgraded')),
      handleMessage: vi.fn(async () => {}),
      handleClose: vi.fn(async () => {}),
      handleError: vi.fn(async () => {}),
    };
    const DO = composeDurableObject(DocActor, {
      channels: [class {}],
      buildHandler: () => handler,
    });
    const state = new MockDurableObjectState();
    const instance = new (DO as any)(state, {});
    await Promise.resolve();

    // WS upgrade
    const upgradeRes = await instance.fetch(
      new Request('https://actor', { headers: { Upgrade: 'websocket' } }),
    );
    expect(await upgradeRes.text()).toBe('upgraded');
    expect(handler.handleUpgrade).toHaveBeenCalled();

    // Frame
    const fakeWs = {} as WebSocket;
    await instance.webSocketMessage(fakeWs, '{}');
    expect(handler.handleMessage).toHaveBeenCalledWith(fakeWs, '{}');

    // Close + error
    await instance.webSocketClose(fakeWs, 1000, 'bye', true);
    expect(handler.handleClose).toHaveBeenCalledWith(fakeWs);
    await instance.webSocketError(fakeWs, new Error('x'));
    expect(handler.handleError).toHaveBeenCalledWith(fakeWs);
  });

  it('returns 500 on malformed JSON during HTTP dispatch', async () => {
    const DO = composeDurableObject(DocActor);
    const state = new MockDurableObjectState();
    const instance = new (DO as any)(state, {});
    await Promise.resolve();
    const res = await instance.fetch(new Request('https://actor', { method: 'POST', body: 'oops' }));
    expect(res.status).toBe(500);
  });
});
