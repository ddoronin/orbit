import { describe, expect, it } from 'vitest';

import { Actor, Handle, defineActorMessages } from './decorators.js';
import { ORBIT_ACTOR_META, ORBIT_HANDLERS_META } from './types.js';

const ROOM_MESSAGES = defineActorMessages({
  SEND: 'room.send',
  SNAPSHOT: 'room.snapshot',
});

@Actor('Room')
class RoomActor {
  @Handle(ROOM_MESSAGES.SEND)
  async onSend() {
    return null;
  }

  @Handle(ROOM_MESSAGES.SNAPSHOT)
  async onSnapshot() {
    return null;
  }

  async __orbitSnapshot__() {
    return null;
  }
}

describe('defineActorMessages', () => {
  it('returns a frozen message map object', () => {
    expect(Object.isFrozen(ROOM_MESSAGES)).toBe(true);
    expect(ROOM_MESSAGES.SEND).toBe('room.send');
  });

  it('works with @Handle message registration', () => {
    const meta = (RoomActor as any)[ORBIT_ACTOR_META];
    expect(meta.name).toBe('Room');

    const handlers = (RoomActor as any)[ORBIT_HANDLERS_META] as Array<{
      type: string;
      method: string;
    }>;

    expect(handlers.some((h) => h.type === ROOM_MESSAGES.SEND)).toBe(true);
    expect(handlers.some((h) => h.type === ROOM_MESSAGES.SNAPSHOT)).toBe(true);
  });
});
