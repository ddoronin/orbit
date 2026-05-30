import { describe, it, expect } from 'vitest';
import { matchTopicPattern, Channel, On, OrbitChannel, getChannelMeta, getChannelEvents } from './channel.js';

describe('matchTopicPattern', () => {
  it('matches exact topics', () => {
    expect(matchTopicPattern('room:lobby', 'room:lobby')).toBe(true);
    expect(matchTopicPattern('room:lobby', 'room:other')).toBe(false);
  });

  it('matches wildcard segments', () => {
    expect(matchTopicPattern('room:*', 'room:42')).toBe(true);
    expect(matchTopicPattern('room:*', 'room:abc')).toBe(true);
    expect(matchTopicPattern('room:*', 'chat:42')).toBe(false);
  });

  it('matches multiple wildcards', () => {
    expect(matchTopicPattern('*:*', 'room:42')).toBe(true);
    expect(matchTopicPattern('chat:*:messages', 'chat:42:messages')).toBe(true);
    expect(matchTopicPattern('chat:*:messages', 'chat:42:users')).toBe(false);
  });

  it('trailing wildcard matches remaining segments', () => {
    // Trailing * matches any remaining segments
    expect(matchTopicPattern('room:*', 'room:42:extra')).toBe(true);
    // But non-trailing mismatch rejects
    expect(matchTopicPattern('room:*:extra', 'room:42')).toBe(false);
  });
});

describe('Channel Decorators', () => {
  it('@Channel stores topic pattern', () => {
    @Channel('room:*')
    class TestChannel extends OrbitChannel {}

    const meta = getChannelMeta(TestChannel);
    expect(meta).toBeDefined();
    expect(meta!.topicPattern).toBe('room:*');
  });

  it('@On registers event handlers', () => {
    @Channel('room:*')
    class TestChannel extends OrbitChannel {
      @On('message')
      async onMessage() {}

      @On('typing')
      async onTyping() {}
    }

    const events = getChannelEvents(TestChannel);
    expect(events).toHaveLength(2);
    expect(events[0].event).toBe('message');
    expect(events[0].method).toBe('onMessage');
    expect(events[1].event).toBe('typing');
    expect(events[1].method).toBe('onTyping');
  });
});
