# @orbit/client

Browser/Node WebSocket client for Orbit Channels. Implements the Phoenix-compatible wire protocol with auto-reconnect and heartbeat.

## Quick start

```ts
import { OrbitSocket } from '@orbit/client';

const socket = new OrbitSocket('wss://my-app.workers.dev/rooms/42/socket', {
  params: { token: localStorage.getItem('session')! },
  reconnect: true,
  heartbeatIntervalMs: 30_000,
});

await socket.connect();

const channel = socket.channel('room:42', { userId: 'u1' });
await channel.join();

channel.on('new_message', (msg) => console.log(msg));
channel.on('typing', ({ userId }) => showTyping(userId));

await channel.push('new_msg', { text: 'hello' });
```

## API

### `OrbitSocket`

```ts
new OrbitSocket(url, {
  params?: Record<string, string>;        // appended to URL on connect
  heartbeatIntervalMs?: number;
  reconnect?: boolean;
  reconnectMaxAttempts?: number;
  reconnectIntervalMs?: number;
});

socket.connect(): Promise<void>;
socket.disconnect(): void;
socket.channel(topic, params?): OrbitChannel;
socket.on('open' | 'close' | 'error', listener): void;
socket.state: 'connecting' | 'open' | 'closing' | 'closed';
```

### `OrbitChannel`

```ts
channel.join(): Promise<unknown>;       // server's onJoin reply
channel.leave(): Promise<void>;
channel.push(event, payload): Promise<unknown>;  // resolves with server reply
channel.on(event, handler): void;
channel.off(event, handler?): void;
```

## Wire protocol

JSON over WebSocket, identical to Phoenix Channels v2:

```
{ event, topic, payload, ref }
```

Replies use the `ref` the client sent. Broadcasts have `ref: null`.

## Reconnect

When `reconnect: true`, the client retries with backoff up to `reconnectMaxAttempts` (default Infinity). Joined channels rejoin automatically.

## See also

- [`@orbit/channels`](../channels) — server-side channel definition
- [`@orbit/actors`](../actors) — actors backing each channel
