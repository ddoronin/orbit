/**
 * Queue handler — generates the queue() export for a Worker.
 */

import { Container } from '@orbit/core';
import {
  getQueueConsumerMeta,
  type OrbitConsumer,
  type QueueMessage,
} from './consumer.js';

export interface QueueHandlerConfig {
  consumers: (new (...args: any[]) => OrbitConsumer<any>)[];
}

/**
 * Creates a queue handler function for Cloudflare Workers.
 */
export function createQueueHandler(config: QueueHandlerConfig) {
  const consumerMap = new Map<string, new (...args: any[]) => OrbitConsumer<any>>();

  for (const ConsumerClass of config.consumers) {
    const meta = getQueueConsumerMeta(ConsumerClass);
    if (meta) {
      consumerMap.set(meta.queueName, ConsumerClass);
    }
  }

  return async (batch: MessageBatch<any>, container: Container): Promise<void> => {
    const ConsumerClass = consumerMap.get(batch.queue);
    if (!ConsumerClass) {
      console.error(`No consumer registered for queue: ${batch.queue}`);
      return;
    }

    const consumer = await container.resolve(ConsumerClass) as OrbitConsumer<any>;

    const messages: QueueMessage<any>[] = batch.messages.map(msg => ({
      id: msg.id,
      body: msg.body,
      timestamp: msg.timestamp,
      attempts: msg.attempts,
      ack: () => msg.ack(),
      retry: (opts?: { delaySeconds?: number }) => msg.retry(opts),
    }));

    await consumer.handleBatch(messages);
  };
}
