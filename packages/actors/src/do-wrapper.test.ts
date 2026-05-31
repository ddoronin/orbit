import { describe, it, expect } from 'vitest';
import { wrapActor } from './do-wrapper.js';
import { Actor, Handle, OnAlarm } from './decorators.js';
import { OrbitActor } from './actor.js';
import { MockDurableObjectState } from '@orbitstack/testing';

@Actor('Counter')
class CounterActor extends OrbitActor<{ n: number }> {
  initialState() { return { n: 0 }; }
  @Handle('bump') async bump(p: { by?: number } = {}) {
    this.updateState((s) => { s.n += p.by ?? 1; });
    return this.state.n;
  }
  @OnAlarm() async onAlarm() {
    this.updateState((s) => { s.n = 0; });
  }
}

class Bare {}

describe('wrapActor', () => {
  it('throws when class is not decorated', () => {
    expect(() => wrapActor(Bare as any)).toThrow('not decorated with @Actor');
  });

  it('produces a DO class that initializes state lazily', async () => {
    const DO = wrapActor(CounterActor);
    const state = new MockDurableObjectState();
    const instance = new (DO as any)(state, {});
    // Allow microtasks scheduled by blockConcurrencyWhile to complete
    await Promise.resolve();
    expect(instance).toBeDefined();
  });

  it('fetch() dispatches JSON envelopes', async () => {
    const DO = wrapActor(CounterActor);
    const state = new MockDurableObjectState();
    const instance = new (DO as any)(state, {});
    await Promise.resolve();
    const req = new Request('https://actor/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'bump', payload: { by: 3 } }),
    });
    const res = await instance.fetch(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, data: 3 });
  });

  it('fetch() returns 500 on malformed JSON', async () => {
    const DO = wrapActor(CounterActor);
    const state = new MockDurableObjectState();
    const instance = new (DO as any)(state, {});
    await Promise.resolve();
    const req = new Request('https://actor/message', { method: 'POST', body: 'not json' });
    const res = await instance.fetch(req);
    expect(res.status).toBe(500);
  });

  it('alarm() invokes @OnAlarm handler', async () => {
    const DO = wrapActor(CounterActor);
    const state = new MockDurableObjectState();
    const instance = new (DO as any)(state, {});
    await Promise.resolve();
    await instance.fetch(new Request('https://actor', {
      method: 'POST',
      body: JSON.stringify({ type: 'bump', payload: {} }),
    }));
    await instance.alarm();
    const snap = await instance.fetch(new Request('https://actor', {
      method: 'POST',
      body: JSON.stringify({ type: '__orbit.snapshot__', payload: null }),
    }));
    expect((await snap.json()).data).toEqual({ n: 0 });
  });
});
