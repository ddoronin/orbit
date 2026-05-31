# @orbitstack/queues

Decorator-based consumers and producers for Cloudflare Queues.

## Consumer

```ts
import { QueueConsumer, OrbitConsumer, Retry, type QueueMessage } from '@orbitstack/queues';

interface EmailJob { to: string; template: string; data: unknown }

@QueueConsumer('email-queue')
export class EmailWorker extends OrbitConsumer<EmailJob> {
  constructor(@Inject(MailService) private mailer: MailService) { super(); }

  @Retry({ maxAttempts: 5, backoff: 'exponential' })
  async handle(msg: QueueMessage<EmailJob>) {
    await this.mailer.send(msg.body);
  }

  async handleBatch(msgs: QueueMessage<EmailJob>[]) {
    // Optional. If defined, called instead of per-message handle.
    await this.mailer.sendBatch(msgs.map(m => m.body));
  }
}
```

## Producer

```ts
import { QueueProducer, createQueueProducerToken } from '@orbitstack/queues';

const EMAIL_QUEUE = createQueueProducerToken<EmailJob>('email-queue');

class OrderService {
  constructor(@Inject(EMAIL_QUEUE) private emails: QueueProducer<EmailJob>) {}

  async place(order: Order) {
    await this.emails.send({ to: order.email, template: 'confirm', data: order });
  }
}
```

## Wiring into a Worker

```ts
import { createQueueHandler } from '@orbitstack/queues';

export default {
  ...createWorker(App),
  queue: createQueueHandler(App, [EmailWorker]),
};
```

`createQueueHandler` builds a CF Queue handler that:

1. Walks the batch
2. Resolves the consumer through the DI container
3. Calls `handleBatch` if defined, else iterates `handle`
4. Applies `@Retry` policy on thrown errors
5. ACKs successes, retries failures, dead-letters when retries exhausted

## See also

- [`@orbitstack/core`](../core) — DI, `QUEUE_TOKEN(name)`
- [`@orbitstack/app`](../app) — `bindings.Queue` declaration
