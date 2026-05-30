/**
 * Queue consumer abstractions.
 */

export const ORBIT_QUEUE_CONSUMER_META = '__orbit_queue_consumer__';
export const ORBIT_QUEUE_RETRY_META = '__orbit_queue_retry__';

export interface QueueConsumerMetadata {
  queueName: string;
}

export interface RetryOptions {
  maxAttempts?: number;
  backoff?: 'linear' | 'exponential';
  delaySeconds?: number;
}

/**
 * Marks a class as a queue consumer for a named queue.
 */
export function QueueConsumer(queueName: string): ClassDecorator {
  return (target: any) => {
    target[ORBIT_QUEUE_CONSUMER_META] = { queueName };
    return target;
  };
}

/**
 * Configures retry behavior for queue processing.
 */
export function Retry(options: RetryOptions): MethodDecorator {
  return (target: any, propertyKey: string | symbol, _descriptor: PropertyDescriptor) => {
    const ctor = target.constructor;
    ctor[ORBIT_QUEUE_RETRY_META] = {
      method: String(propertyKey),
      ...options,
    };
  };
}

/**
 * Base class for queue consumers.
 */
export abstract class OrbitConsumer<T = unknown> {
  /**
   * Process a single message.
   * Override this for per-message processing.
   */
  async handle(message: QueueMessage<T>): Promise<void> {
    // Default: no-op, override in subclass
  }

  /**
   * Process a batch of messages.
   * Override this for batch processing.
   * If not overridden, falls back to calling handle() per message.
   */
  async handleBatch(messages: QueueMessage<T>[]): Promise<void> {
    for (const msg of messages) {
      await this.handle(msg);
    }
  }
}

export interface QueueMessage<T = unknown> {
  id: string;
  body: T;
  timestamp: Date;
  attempts: number;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
}

// --- Metadata readers ---

export function getQueueConsumerMeta(target: any): QueueConsumerMetadata | undefined {
  return target[ORBIT_QUEUE_CONSUMER_META];
}
