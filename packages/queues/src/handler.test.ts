import { describe, it, expect, vi } from 'vitest';
import { Container } from '@orbitstack/core';
import { QueueConsumer, OrbitConsumer, type QueueMessage } from './consumer.js';
import { createQueueHandler } from './handler.js';

@QueueConsumer('emails')
class EmailWorker extends OrbitConsumer<{ to: string }> {
  seen: string[] = [];
  async handle(msg: QueueMessage<{ to: string }>) {
    this.seen.push(msg.body.to);
  }
}

@QueueConsumer('orders')
class OrderWorker extends OrbitConsumer<{ id: number }> {
  batched: number[][] = [];
  async handleBatch(msgs: QueueMessage<{ id: number }>[]) {
    this.batched.push(msgs.map((m) => m.body.id));
  }
}

function fakeBatch(queue: string, bodies: any[]) {
  return {
    queue,
    messages: bodies.map((body, i) => ({
      id: String(i),
      body,
      timestamp: new Date(),
      attempts: 0,
      ack: vi.fn(),
      retry: vi.fn(),
    })),
  } as unknown as MessageBatch<any>;
}

describe('createQueueHandler', () => {
  it('dispatches batches to the matching consumer (handle path)', async () => {
    const container = new Container();
    const instance = new EmailWorker();
    container.registerFactory(EmailWorker, () => instance);
    const handler = createQueueHandler({ consumers: [EmailWorker, OrderWorker] });
    await handler(fakeBatch('emails', [{ to: 'a' }, { to: 'b' }]), container);
    expect(instance.seen).toEqual(['a', 'b']);
  });

  it('uses handleBatch() when overridden', async () => {
    const container = new Container();
    const instance = new OrderWorker();
    container.registerFactory(OrderWorker, () => instance);
    const handler = createQueueHandler({ consumers: [EmailWorker, OrderWorker] });
    await handler(fakeBatch('orders', [{ id: 1 }, { id: 2 }]), container);
    expect(instance.batched).toEqual([[1, 2]]);
  });

  it('is a no-op (and warns) when no consumer matches the queue', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const container = new Container();
    const handler = createQueueHandler({ consumers: [EmailWorker] });
    await handler(fakeBatch('unknown-queue', [{}]), container);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
