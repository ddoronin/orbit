/**
 * Socket — represents a single WebSocket connection within a channel.
 */

import type { ActorRef } from '@orbit/actors';
import { encodeMessage, broadcastMessage, type ServerMessage } from './protocol.js';

export interface Socket {
  /** Per-connection state */
  readonly assigns: Record<string, unknown>;

  /** Set per-connection state */
  assign(data: Record<string, unknown>): void;

  /** Send event to this socket only */
  send(event: string, payload: unknown): void;

  /** Send to all sockets in this channel EXCEPT this one */
  broadcastFrom(event: string, payload: unknown): void;

  /** Reference to the backing actor */
  readonly actor: ActorRef;

  /** The topic this socket joined */
  readonly topic: string;

  /** Raw WebSocket (escape hatch) */
  readonly raw: WebSocket;
}

export class SocketImpl implements Socket {
  private _assigns: Record<string, unknown> = {};

  constructor(
    private ws: WebSocket,
    private allSockets: Set<WebSocket>,
    private socketDataMap: WeakMap<WebSocket, SocketImpl>,
    public readonly topic: string,
    public readonly actor: ActorRef,
  ) {}

  get assigns(): Record<string, unknown> {
    return this._assigns;
  }

  get raw(): WebSocket {
    return this.ws;
  }

  assign(data: Record<string, unknown>): void {
    Object.assign(this._assigns, data);
  }

  send(event: string, payload: unknown): void {
    const msg = broadcastMessage(this.topic, event, payload);
    try {
      this.ws.send(encodeMessage(msg));
    } catch {
      // Socket may be closed
    }
  }

  broadcastFrom(event: string, payload: unknown): void {
    const msg = encodeMessage(broadcastMessage(this.topic, event, payload));
    for (const ws of this.allSockets) {
      if (ws === this.ws) continue;
      try {
        ws.send(msg);
      } catch {
        // Socket may be closed
      }
    }
  }
}
