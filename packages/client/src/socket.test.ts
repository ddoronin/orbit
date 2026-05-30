import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OrbitSocket } from './socket.js';

type Listener = (e: any) => void;

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static OPEN = 1;
  url: string;
  readyState = 0;
  onopen: Listener | null = null;
  onclose: Listener | null = null;
  onerror: Listener | null = null;
  onmessage: Listener | null = null;
  sent: string[] = [];

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(s: string) {
    this.sent.push(s);
  }

  close(code = 1000, reason = 'normal') {
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }

  // Test helpers
  triggerOpen() {
    this.readyState = 1;
    this.onopen?.({});
  }
  triggerMessage(data: unknown) {
    this.onmessage?.({ data: typeof data === 'string' ? data : JSON.stringify(data) });
  }
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  (globalThis as any).WebSocket = FakeWebSocket;
});

afterEach(() => {
  vi.useRealTimers();
});

function lastWs() {
  return FakeWebSocket.instances.at(-1)!;
}

describe('OrbitSocket', () => {
  it('connects and exposes open state', async () => {
    const socket = new OrbitSocket('ws://x/socket');
    const promise = socket.connect();
    expect(socket.state).toBe('connecting');
    lastWs().triggerOpen();
    await promise;
    expect(socket.state).toBe('open');
  });

  it('appends params to the URL', async () => {
    const socket = new OrbitSocket('ws://x/socket', { params: { token: 't' } });
    socket.connect();
    expect(lastWs().url).toContain('token=t');
  });

  it('sends phx_join when channel.join() is called', async () => {
    const socket = new OrbitSocket('ws://x/socket');
    const connect = socket.connect();
    lastWs().triggerOpen();
    await connect;
    const ch = socket.channel('room:1', { userId: 'u1' });
    const joining = ch.join();
    // emit reply for the join ref
    const join = JSON.parse(lastWs().sent[0]);
    expect(join.event).toBe('phx_join');
    expect(join.payload).toEqual({ userId: 'u1' });
    lastWs().triggerMessage({ event: 'phx_reply', topic: 'room:1', ref: join.ref, payload: { status: 'ok', response: { joined: true } } });
    await expect(joining).resolves.toEqual({ joined: true });
  });

  it('routes broadcast events to channel.on() handlers', async () => {
    const socket = new OrbitSocket('ws://x/socket');
    const conn = socket.connect();
    lastWs().triggerOpen();
    await conn;
    const ch = socket.channel('room:1');
    const handler = vi.fn();
    ch.on('new_msg', handler);
    lastWs().triggerMessage({ event: 'new_msg', topic: 'room:1', ref: null, payload: { text: 'hi' } });
    expect(handler).toHaveBeenCalledWith({ text: 'hi' });
  });

  it('push() resolves with the server reply payload', async () => {
    const socket = new OrbitSocket('ws://x/socket');
    const conn = socket.connect();
    lastWs().triggerOpen();
    await conn;
    const ch = socket.channel('room:1');
    const ack = ch.push('say', { text: 'hello' });
    const sent = JSON.parse(lastWs().sent.at(-1)!);
    lastWs().triggerMessage({ event: 'phx_reply', topic: 'room:1', ref: sent.ref, payload: { status: 'ok', response: { ok: 1 } } });
    await expect(ack).resolves.toEqual({ ok: 1 });
  });

  it('push() rejects on phx_reply error', async () => {
    const socket = new OrbitSocket('ws://x/socket');
    const conn = socket.connect();
    lastWs().triggerOpen();
    await conn;
    const ch = socket.channel('room:1');
    const ack = ch.push('say', {});
    const sent = JSON.parse(lastWs().sent.at(-1)!);
    lastWs().triggerMessage({
      event: 'phx_reply', topic: 'room:1', ref: sent.ref,
      payload: { status: 'error', response: { reason: 'forbidden' } },
    });
    await expect(ack).rejects.toThrow('forbidden');
  });

  it('disconnect() closes the socket and transitions to closed', async () => {
    const socket = new OrbitSocket('ws://x/socket');
    const conn = socket.connect();
    lastWs().triggerOpen();
    await conn;
    socket.disconnect();
    expect(socket.state).toBe('closed');
  });

  it('socket.on("open") fires after connect', async () => {
    const socket = new OrbitSocket('ws://x/socket');
    const opened = vi.fn();
    socket.on('open', opened);
    const conn = socket.connect();
    lastWs().triggerOpen();
    await conn;
    expect(opened).toHaveBeenCalled();
  });
});
