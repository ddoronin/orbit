import { describe, it, expect } from 'vitest';
import {
  encodeMessage,
  decodeMessage,
  replyOk,
  replyError,
  broadcastMessage,
} from './protocol.js';

describe('Channel Protocol', () => {
  it('encodes a server message to JSON', () => {
    const msg = broadcastMessage('room:42', 'new_message', { text: 'hello' });
    const encoded = encodeMessage(msg);
    const parsed = JSON.parse(encoded);

    expect(parsed.event).toBe('new_message');
    expect(parsed.topic).toBe('room:42');
    expect(parsed.payload.text).toBe('hello');
    expect(parsed.ref).toBeNull();
  });

  it('decodes a valid client message', () => {
    const raw = JSON.stringify({
      event: 'new_msg',
      topic: 'room:42',
      payload: { text: 'hello' },
      ref: '1',
    });

    const msg = decodeMessage(raw);
    expect(msg).not.toBeNull();
    expect(msg!.event).toBe('new_msg');
    expect(msg!.topic).toBe('room:42');
    expect(msg!.ref).toBe('1');
  });

  it('returns null for invalid JSON', () => {
    expect(decodeMessage('not json')).toBeNull();
  });

  it('returns null for missing required fields', () => {
    expect(decodeMessage(JSON.stringify({ event: 'test' }))).toBeNull();
    expect(decodeMessage(JSON.stringify({ topic: 'test' }))).toBeNull();
  });

  it('creates ok reply', () => {
    const reply = replyOk('room:42', '1', { count: 5 });
    expect(reply.event).toBe('phx_reply');
    expect(reply.topic).toBe('room:42');
    expect(reply.ref).toBe('1');
    expect((reply.payload as any).status).toBe('ok');
    expect((reply.payload as any).response.count).toBe(5);
  });

  it('creates error reply', () => {
    const reply = replyError('room:42', '1', 'not allowed');
    expect((reply.payload as any).status).toBe('error');
    expect((reply.payload as any).response.reason).toBe('not allowed');
  });
});
