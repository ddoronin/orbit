import { describe, it, expect, vi } from 'vitest';
import {
  QueueConsumer,
  Retry,
  OrbitConsumer,
  getQueueConsumerMeta,
  ORBIT_QUEUE_CONSUMER_META,
  ORBIT_QUEUE_RETRY_META,
  type QueueMessage,
} from './consumer.js';

describe('@QueueConsumer', () => {
  it('stores queue name in metadata', () => {
    @QueueConsumer('emails')
    class Emails extends OrbitConsumer<unknown> {}

    expect(getQueueConsumerMeta(Emails)!.queueName).toBe('emails');
    expect((Emails as any)[ORBIT_QUEUE_CONSUMER_META]).toEqual({ queueName: 'emails' });
  });

  it('getQueueConsumerMeta returns undefined for plain classes', () => {
    class Bare {}
    expect(getQueueConsumerMeta(Bare)).toBeUndefined();
  });
});

describe('@Retry', () => {
  it('attaches retry config to the class', () => {
    @QueueConsumer('q')
    class C extends OrbitConsumer<unknown> {
      @Retry({ maxAttempts: 5, backoff: 'exponential' })
      async handle() { /* … */ }
    }
    expect((C as any)[ORBIT_QUEUE_RETRY_META]).toMatchObject({
      method: 'handle',
      maxAttempts: 5,
      backoff: 'exponential',
    });
  });
});

describe('OrbitConsumer.handleBatch', () => {
  it('defaults to calling handle() per message', async () => {
    @QueueConsumer('q')
    class C extends OrbitConsumer<{ n: number }> {
      seen: number[] = [];
      async handle(msg: QueueMessage<{ n: number }>) {
        this.seen.push(msg.body.n);
      }
    }
    const c = new C();
    const msgs: QueueMessage<{ n: number }>[] = [1, 2, 3].map((n) => ({
      id: String(n), body: { n }, timestamp: new Date(), attempts: 0, ack: () => {}, retry: () => {},
    }));
    await c.handleBatch(msgs);
    expect(c.seen).toEqual([1, 2, 3]);
  });

  it('can be overridden for batch processing', async () => {
    const seen: number[][] = [];
    @QueueConsumer('q')
    class C extends OrbitConsumer<{ n: number }> {
      async handleBatch(msgs: QueueMessage<{ n: number }>[]) {
        seen.push(msgs.map((m) => m.body.n));
      }
    }
    await new C().handleBatch([
      { id: '1', body: { n: 10 }, timestamp: new Date(), attempts: 0, ack: () => {}, retry: () => {} },
    ]);
    expect(seen).toEqual([[10]]);
  });
});
