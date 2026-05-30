/**
 * ChannelHandler — manages WebSocket connections and dispatches
 * events to the appropriate OrbitChannel instance.
 *
 * This runs inside a Durable Object and handles the WebSocket
 * Hibernation API callbacks.
 */

import type { ActorRef } from '@orbit/actors';
import { OrbitChannel, type ChannelMetadata, ORBIT_CHANNEL_META } from './channel.js';
import { SocketImpl, type Socket } from './socket.js';
import {
  decodeMessage,
  encodeMessage,
  replyOk,
  replyError,
  CHANNEL_JOIN,
  CHANNEL_LEAVE,
  CHANNEL_HEARTBEAT,
  CHANNEL_REPLY,
} from './protocol.js';

export class ChannelHandler {
  private channels: OrbitChannel[] = [];
  private channelByPattern = new Map<string, OrbitChannel>();
  private sockets = new Set<WebSocket>();
  private socketMap = new WeakMap<WebSocket, SocketImpl>();
  private socketTopics = new WeakMap<WebSocket, string>();

  constructor(
    channelClasses: (new () => OrbitChannel)[],
    private actorRef: ActorRef,
  ) {
    for (const ChannelClass of channelClasses) {
      const instance = new ChannelClass();
      const meta: ChannelMetadata | undefined = (ChannelClass as any)[ORBIT_CHANNEL_META];
      if (meta) {
        this.channelByPattern.set(meta.topicPattern, instance);
        this.channels.push(instance);
      }
    }
  }

  /**
   * Handle WebSocket upgrade.
   */
  handleUpgrade(request: Request, doState: DurableObjectState): Response {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    doState.acceptWebSocket(server);
    this.sockets.add(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  /**
   * Handle incoming WebSocket message (Hibernation API callback).
   */
  async handleMessage(ws: WebSocket, rawMessage: string | ArrayBuffer): Promise<void> {
    if (typeof rawMessage !== 'string') return;

    const msg = decodeMessage(rawMessage);
    if (!msg) return;

    // Handle heartbeat
    if (msg.event === CHANNEL_HEARTBEAT) {
      ws.send(encodeMessage({
        event: CHANNEL_REPLY,
        topic: 'phoenix',
        ref: msg.ref,
        payload: { status: 'ok', response: {} },
      }));
      return;
    }

    // Handle join
    if (msg.event === CHANNEL_JOIN) {
      await this.handleJoin(ws, msg.topic, msg.payload, msg.ref);
      return;
    }

    // Handle leave
    if (msg.event === CHANNEL_LEAVE) {
      await this.handleLeave(ws, msg.topic, msg.ref);
      return;
    }

    // Handle custom event
    const channel = this.findChannelForTopic(msg.topic);
    if (!channel) return;

    const socket = this.getSocket(ws, msg.topic);
    const handlers = channel.__getEventHandlers__();
    const methodName = handlers.get(msg.event);

    if (methodName && typeof (channel as any)[methodName] === 'function') {
      try {
        await (channel as any)[methodName](msg.payload, socket);
        if (msg.ref) {
          ws.send(encodeMessage(replyOk(msg.topic, msg.ref)));
        }
      } catch (err: any) {
        if (msg.ref) {
          ws.send(encodeMessage(replyError(msg.topic, msg.ref, err.message)));
        }
      }
    }
  }

  /**
   * Handle WebSocket close (Hibernation API callback).
   */
  async handleClose(ws: WebSocket): Promise<void> {
    const topic = this.socketTopics.get(ws);
    if (topic) {
      const channel = this.findChannelForTopic(topic);
      const socket = this.socketMap.get(ws);
      if (channel && socket) {
        await channel.onLeave(socket);
      }
    }
    this.sockets.delete(ws);
  }

  /**
   * Handle WebSocket error.
   */
  async handleError(ws: WebSocket): Promise<void> {
    await this.handleClose(ws);
  }

  /**
   * Broadcast to all connected sockets.
   */
  broadcast(event: string, payload: unknown, topic?: string): void {
    const msg = encodeMessage({
      event,
      topic: topic ?? '',
      ref: null,
      payload,
    });
    for (const ws of this.sockets) {
      try {
        ws.send(msg);
      } catch {
        this.sockets.delete(ws);
      }
    }
  }

  private async handleJoin(
    ws: WebSocket,
    topic: string,
    payload: unknown,
    ref: string,
  ): Promise<void> {
    const channel = this.findChannelForTopic(topic);
    if (!channel) {
      ws.send(encodeMessage(replyError(topic, ref, 'no matching channel')));
      return;
    }

    const socket = this.getSocket(ws, topic);
    try {
      const accepted = await channel.onJoin(topic, payload, socket);
      if (accepted) {
        this.socketTopics.set(ws, topic);
        ws.send(encodeMessage(replyOk(topic, ref)));
      } else {
        ws.send(encodeMessage(replyError(topic, ref, 'join rejected')));
      }
    } catch (err: any) {
      ws.send(encodeMessage(replyError(topic, ref, err.message)));
    }
  }

  private async handleLeave(ws: WebSocket, topic: string, ref: string): Promise<void> {
    const channel = this.findChannelForTopic(topic);
    const socket = this.socketMap.get(ws);
    if (channel && socket) {
      await channel.onLeave(socket);
    }
    this.socketTopics.delete(ws);
    ws.send(encodeMessage(replyOk(topic, ref)));
  }

  private findChannelForTopic(topic: string): OrbitChannel | null {
    for (const [pattern, channel] of this.channelByPattern) {
      const patternParts = pattern.split(':');
      const topicParts = topic.split(':');
      if (patternParts.length === topicParts.length) {
        const matches = patternParts.every((p, i) => p === '*' || p === topicParts[i]);
        if (matches) return channel;
      }
      // Trailing wildcard
      if (patternParts[patternParts.length - 1] === '*' && topicParts.length >= patternParts.length) {
        const matches = patternParts.slice(0, -1).every((p, i) => p === '*' || p === topicParts[i]);
        if (matches) return channel;
      }
    }
    return null;
  }

  private getSocket(ws: WebSocket, topic: string): SocketImpl {
    let socket = this.socketMap.get(ws);
    if (!socket) {
      socket = new SocketImpl(ws, this.sockets, this.socketMap, topic, this.actorRef);
      this.socketMap.set(ws, socket);
    }
    return socket;
  }
}
