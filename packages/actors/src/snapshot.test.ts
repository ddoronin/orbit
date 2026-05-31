import { describe, it, expect } from 'vitest';
import { Actor, Handle, ORBIT_SNAPSHOT_TYPE } from './decorators.js';
import { OrbitActor } from './actor.js';
import { MockDurableObjectState } from '@orbitstack/testing';

interface CountState { count: number }

@Actor('Counter')
class CounterActor extends OrbitActor<CountState> {
  initialState(): CountState { return { count: 0 }; }
  @Handle('bump')
  async bump() {
    this.updateState((s) => { s.count += 1; });
  }
}

describe('built-in snapshot handler', () => {
  it('returns the current state', async () => {
    const mockState = new MockDurableObjectState();
    const actor = new CounterActor();
    (actor as any).__ctx__ = {
      actorId: 't',
      actorName: 'Counter',
      storage: mockState.storage,
      state: mockState,
      env: {},
    };
    (actor as any).__initState__();

    const initial = await (actor as any).__dispatch__(
      { type: ORBIT_SNAPSHOT_TYPE, payload: null },
      mockState,
    );
    const body = await initial.json();
    expect(body.ok).toBe(true);
    expect(body.data).toEqual({ count: 0 });

    await (actor as any).__dispatch__({ type: 'bump', payload: null }, mockState);
    const after = await (actor as any).__dispatch__(
      { type: ORBIT_SNAPSHOT_TYPE, payload: null },
      mockState,
    );
    expect((await after.json()).data).toEqual({ count: 1 });
  });
});
