/**
 * Wire protocol for Orbit Channels.
 * Compatible with Phoenix Channel protocol.
 */

export interface ClientMessage {
  event: string;
  topic: string;
  payload: unknown;
  ref: string;
}

export interface ServerMessage {
  event: string;
  topic: string;
  payload: unknown;
  ref: string | null;
}

// Well-known events
export const CHANNEL_JOIN = 'phx_join';
export const CHANNEL_LEAVE = 'phx_leave';
export const CHANNEL_REPLY = 'phx_reply';
export const CHANNEL_ERROR = 'phx_error';
export const CHANNEL_CLOSE = 'phx_close';
export const CHANNEL_HEARTBEAT = 'heartbeat';

export function encodeMessage(msg: ServerMessage): string {
  return JSON.stringify(msg);
}

export function decodeMessage(data: string): ClientMessage | null {
  try {
    const parsed = JSON.parse(data);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof parsed.event === 'string' &&
      typeof parsed.topic === 'string'
    ) {
      return {
        event: parsed.event,
        topic: parsed.topic,
        payload: parsed.payload ?? {},
        ref: parsed.ref ?? '',
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function replyOk(topic: string, ref: string, payload?: unknown): ServerMessage {
  return {
    event: CHANNEL_REPLY,
    topic,
    ref,
    payload: { status: 'ok', response: payload ?? {} },
  };
}

export function replyError(topic: string, ref: string, reason?: string): ServerMessage {
  return {
    event: CHANNEL_REPLY,
    topic,
    ref,
    payload: { status: 'error', response: { reason: reason ?? 'error' } },
  };
}

export function broadcastMessage(topic: string, event: string, payload: unknown): ServerMessage {
  return {
    event,
    topic,
    ref: null,
    payload,
  };
}
