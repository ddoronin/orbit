import { describe, it, expect } from 'vitest';
import { OrbitActor } from './actor.js';
import { Actor, Handle, OnAlarm } from './decorators.js';
import { ORBIT_ACTOR_META, ORBIT_HANDLERS_META, ORBIT_ALARM_META } from './types.js';

// Test actor
interface CounterState {
  count: number;
  history: string[];
}

@Actor('Counter')
class CounterActor extends OrbitActor<CounterState> {
  initialState(): CounterState {
    return { count: 0, history: [] };
  }

  @Handle('increment')
  async onIncrement(msg: { amount?: number }) {
    const amount = msg.amount ?? 1;
    this.updateState(s => {
      s.count += amount;
      s.history.push(`+${amount}`);
    });
    return { count: this.state.count };
  }

  @Handle('decrement')
  async onDecrement() {
    this.updateState(s => {
      s.count--;
      s.history.push('-1');
    });
    return { count: this.state.count };
  }

  @Handle('get')
  async onGet() {
    return this.snapshot;
  }

  @Handle('fail')
  async onFail() {
    throw new Error('intentional failure');
  }

  @OnAlarm()
  async onAlarm() {
    this.updateState(s => {
      s.history = s.history.slice(-10);
    });
  }
}

describe('Actor Decorators', () => {
  it('@Actor stores metadata', () => {
    const meta = (CounterActor as any)[ORBIT_ACTOR_META];
    expect(meta).toBeDefined();
    expect(meta.name).toBe('Counter');
    expect(meta.options.autoPersist).toBe(true);
  });

  it('@Handle registers handler metadata', () => {
    const handlers = (CounterActor as any)[ORBIT_HANDLERS_META];
    // 4 user-declared handlers plus the built-in __orbit.snapshot__ handler
    expect(handlers).toHaveLength(5);
    expect(handlers.map((h: any) => h.type)).toContain('increment');
    expect(handlers.map((h: any) => h.type)).toContain('decrement');
    expect(handlers.map((h: any) => h.type)).toContain('get');
    expect(handlers.map((h: any) => h.type)).toContain('fail');
    expect(handlers.map((h: any) => h.type)).toContain('__orbit.snapshot__');
  });

  it('@OnAlarm stores alarm method name', () => {
    const alarmMethod = (CounterActor as any)[ORBIT_ALARM_META];
    expect(alarmMethod).toBe('onAlarm');
  });
});

describe('OrbitActor', () => {
  function createActor() {
    const actor = new CounterActor();
    const mockStorage = {
      data: new Map<string, any>(),
      async get(key: string) { return this.data.get(key); },
      async put(key: string, value: any) { this.data.set(key, value); },
      async setAlarm() {},
      async deleteAlarm() {},
    };
    const mockState = {
      id: { toString: () => 'test-id' },
      storage: mockStorage,
    };

    (actor as any).__ctx__ = {
      actorId: 'test-id',
      actorName: 'Counter',
      storage: mockStorage,
      state: mockState,
      env: {},
    };
    actor.__initState__();
    return { actor, mockStorage, mockState };
  }

  it('initializes state', () => {
    const { actor } = createActor();
    expect(actor.snapshot.count).toBe(0);
    expect(actor.snapshot.history).toEqual([]);
  });

  it('dispatches messages to handlers', async () => {
    const { actor, mockState } = createActor();

    const response = await actor.__dispatch__(
      { type: 'increment', payload: { amount: 5 } },
      mockState as any,
    );

    const result = await response.json() as any;
    expect(result.ok).toBe(true);
    expect(result.data.count).toBe(5);
  });

  it('persists state after handler (autoPersist)', async () => {
    const { actor, mockStorage, mockState } = createActor();

    await actor.__dispatch__(
      { type: 'increment', payload: {} },
      mockState as any,
    );

    const saved = mockStorage.data.get('__orbit_state__');
    expect(saved).toBeDefined();
    expect(saved.count).toBe(1);
  });

  it('returns error for unknown message type', async () => {
    const { actor, mockState } = createActor();

    const response = await actor.__dispatch__(
      { type: 'unknown', payload: {} },
      mockState as any,
    );

    expect(response.status).toBe(400);
    const result = await response.json() as any;
    expect(result.ok).toBe(false);
  });

  it('rolls back state on handler error', async () => {
    const { actor, mockState } = createActor();

    // First increment successfully
    await actor.__dispatch__({ type: 'increment', payload: {} }, mockState as any);
    expect(actor.snapshot.count).toBe(1);

    // Then fail
    const response = await actor.__dispatch__({ type: 'fail', payload: {} }, mockState as any);
    const result = await response.json() as any;
    expect(result.ok).toBe(false);

    // State should be rolled back
    expect(actor.snapshot.count).toBe(1);
  });

  it('hydrates state from storage', () => {
    const { actor } = createActor();
    const savedState: CounterState = { count: 42, history: ['init'] };
    actor.__hydrate__(savedState);
    expect(actor.snapshot.count).toBe(42);
    expect(actor.snapshot.history).toEqual(['init']);
  });

  it('handles alarm', async () => {
    const { actor, mockState } = createActor();

    // Add a lot of history
    for (let i = 0; i < 20; i++) {
      await actor.__dispatch__({ type: 'increment', payload: {} }, mockState as any);
    }
    expect(actor.snapshot.history.length).toBe(20);

    // Trigger alarm (trims to last 10)
    await actor.__onAlarm__();
    expect(actor.snapshot.history.length).toBe(10);
  });
});
