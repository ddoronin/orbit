import { describe, it, expect } from 'vitest';
import { SocketImpl } from './socket.js';
import { decodeMessage } from './protocol.js';

function makeWs() {
  const sent: string[] = [];
  return { sent, ws: { send(s: string) { sent.push(s); } } as unknown as WebSocket };
}

const fakeActor = {
  call: async () => null, cast: async () => undefined, connect: async () => new Response(null),
  snapshot: async () => ({}), id: 'a', name: 'A',
} as any;

describe('SocketImpl', () => {
  it('exposes topic and raw ws', () => {
    const { ws } = makeWs();
    const all = new Set<WebSocket>([ws]);
    const map = new WeakMap();
    const s = new SocketImpl(ws, all, map, 'room:1', fakeActor);
    expect(s.topic).toBe('room:1');
    expect(s.raw).toBe(ws);
    expect(s.actor).toBe(fakeActor);
  });

  it('assign() merges per-connection state', () => {
    const { ws } = makeWs();
    const s = new SocketImpl(ws, new Set(), new WeakMap(), 't', fakeActor);
    s.assign({ a: 1 });
    s.assign({ b: 2 });
    expect(s.assigns).toEqual({ a: 1, b: 2 });
  });

  it('send() emits a frame addressed to this socket', () => {
    const { ws, sent } = makeWs();
    const s = new SocketImpl(ws, new Set([ws]), new WeakMap(), 'room:1', fakeActor);
    s.send('hello', { x: 1 });
    expect(sent).toHaveLength(1);
    const msg = decodeMessage(sent[0])!;
    expect(msg.event).toBe('hello');
    expect(msg.payload).toEqual({ x: 1 });
    expect(msg.topic).toBe('room:1');
  });

  it('broadcastFrom() sends to others but not self', () => {
    const self = makeWs();
    const peer1 = makeWs();
    const peer2 = makeWs();
    const all = new Set<WebSocket>([self.ws, peer1.ws, peer2.ws]);
    const s = new SocketImpl(self.ws, all, new WeakMap(), 'room:1', fakeActor);
    s.broadcastFrom('typing', { user: 'u' });
    expect(self.sent).toHaveLength(0);
    expect(peer1.sent).toHaveLength(1);
    expect(peer2.sent).toHaveLength(1);
  });

  it('send() silently ignores a closed socket', () => {
    const ws = { send() { throw new Error('closed'); } } as unknown as WebSocket;
    const s = new SocketImpl(ws, new Set(), new WeakMap(), 't', fakeActor);
    expect(() => s.send('x', {})).not.toThrow();
  });
});
