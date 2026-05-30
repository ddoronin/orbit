/**
 * Queue producer — typed wrapper around CF Queue.send().
 */

import { Injectable, Inject, QUEUE_TOKEN, createToken } from '@orbit/core';

export class QueueProducer<T = unknown> {
  constructor(private queue: any) {}

  async send(body: T, options?: QueueSendOptions): Promise<void> {
    await this.queue.send(body, options);
  }

  async sendBatch(messages: { body: T; options?: QueueSendOptions }[]): Promise<void> {
    await this.queue.sendBatch(
      messages.map(m => ({
        body: m.body,
        ...m.options,
      })),
    );
  }
}

interface QueueSendOptions {
  contentType?: 'json' | 'text' | 'bytes' | 'v8';
  delaySeconds?: number;
}

/**
 * Create a typed queue producer token.
 */
export function createQueueProducerToken<T = unknown>(queueName: string) {
  return createToken<QueueProducer<T>>(`queue-producer:${queueName}`);
}
