/**
 * OrbitChannel — base class for WebSocket channel definitions.
 */

import type { Socket } from './socket.js';

export const ORBIT_CHANNEL_META = '__orbit_channel__';
export const ORBIT_CHANNEL_EVENTS_META = '__orbit_channel_events__';

export interface ChannelMetadata {
  topicPattern: string;
}

export interface ChannelEventMeta {
  event: string;
  method: string;
}

/**
 * Decorator: marks a class as a channel handler for a topic pattern.
 * Pattern supports wildcards: 'room:*' matches 'room:42', 'room:abc', etc.
 */
export function Channel(topicPattern: string): ClassDecorator {
  return (target: any) => {
    target[ORBIT_CHANNEL_META] = { topicPattern };
    if (!target[ORBIT_CHANNEL_EVENTS_META]) {
      target[ORBIT_CHANNEL_EVENTS_META] = [];
    }
    return target;
  };
}

/**
 * Decorator: marks a method as a handler for a specific channel event.
 */
export function On(event: string): MethodDecorator {
  return (target: any, propertyKey: string | symbol, _descriptor: PropertyDescriptor) => {
    const ctor = target.constructor;
    if (!ctor[ORBIT_CHANNEL_EVENTS_META]) {
      ctor[ORBIT_CHANNEL_EVENTS_META] = [];
    }
    ctor[ORBIT_CHANNEL_EVENTS_META].push({
      event,
      method: String(propertyKey),
    });
  };
}

/**
 * Base class for channel implementations.
 */
export abstract class OrbitChannel {
  /**
   * Called when a client joins this channel.
   * Return true to accept, false to reject.
   */
  async onJoin(topic: string, payload: unknown, socket: Socket): Promise<boolean> {
    return true;
  }

  /**
   * Called when a client leaves the channel.
   */
  async onLeave(socket: Socket): Promise<void> {}

  /**
   * Get event handler map from decorators.
   * @internal
   */
  __getEventHandlers__(): Map<string, string> {
    const events: ChannelEventMeta[] =
      (this.constructor as any)[ORBIT_CHANNEL_EVENTS_META] ?? [];
    return new Map(events.map(e => [e.event, e.method]));
  }

  /**
   * Check if a topic matches this channel's pattern.
   * @internal
   */
  static __matchesTopic__(topic: string): boolean {
    const meta: ChannelMetadata | undefined = (this as any)[ORBIT_CHANNEL_META];
    if (!meta) return false;
    return matchTopicPattern(meta.topicPattern, topic);
  }
}

/**
 * Match a topic against a pattern.
 * 'room:*' matches 'room:42'
 * 'chat:*:messages' matches 'chat:42:messages'
 */
export function matchTopicPattern(pattern: string, topic: string): boolean {
  const patternParts = pattern.split(':');
  const topicParts = topic.split(':');

  if (patternParts.length !== topicParts.length) {
    // Allow trailing wildcard to match any remaining
    if (patternParts[patternParts.length - 1] === '*' && topicParts.length >= patternParts.length) {
      return patternParts.slice(0, -1).every((p, i) => p === '*' || p === topicParts[i]);
    }
    return false;
  }

  return patternParts.every((part, i) => part === '*' || part === topicParts[i]);
}

// --- Metadata readers ---

export function getChannelMeta(target: any): ChannelMetadata | undefined {
  return target[ORBIT_CHANNEL_META];
}

export function getChannelEvents(target: any): ChannelEventMeta[] {
  return target[ORBIT_CHANNEL_EVENTS_META] ?? [];
}
