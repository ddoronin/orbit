# @orbitstack/channels

Phoenix-style WebSocket channels backed by Durable Objects. Topic-based routing, JSON wire protocol, integration with `OrbitActor`.

## When to use

- Multiple logical "topics" share one DO (e.g. `room:42`, `room:42:typing`).
- You want client-driven join/leave with server-side authorization.
- You want replies correlated by `ref` for client request/response over a socket.

If you just need broadcast on state change, the actor's built-in WebSocket dispatch is simpler — skip channels.

## Defining a channel

```ts
import { Channel, On, OrbitChannel, type Socket } from '@orbitstack/channels';

@Channel('room:*')
export class RoomChannel extends OrbitChannel {
  async onJoin(topic: string, params: any, socket: Socket): Promise<boolean> {
    const roomId = topic.split(':')[1];
    socket.assign({ roomId, userId: params.userId });
    return true;
  }

  @On('new_msg')
  async onNewMsg(payload: { text: string }, socket: Socket) {
    await socket.actor.cast('send', {
      text: payload.text,
      userId: socket.assigns.userId,
    });
  }

  @On('typing')
  async onTyping(_p: unknown, socket: Socket) {
    socket.broadcastFrom('typing', { userId: socket.assigns.userId });
  }

  async onLeave(socket: Socket) {
    await socket.actor.cast('leave', { userId: socket.assigns.userId });
  }
}
```

## Wire protocol

```ts
// Client → Server
{ event: 'phx_join' | 'phx_leave' | custom, topic: 'room:42', payload: any, ref: 'client-ref' }

// Server → Client
{ event: 'phx_reply' | custom, topic: 'room:42', payload: any, ref: string | null }
```

Replies use the same `ref` the client sent. Broadcasts have `ref: null`. Heartbeat: client sends `phx_heartbeat`, server replies with `phx_reply`.

## Mounting on an actor's DO

```ts
import { composeDurableObject } from '@orbitstack/actors';
import { ChannelHandler } from '@orbitstack/channels';

export const Room = composeDurableObject(RoomActor, {
  channels: [RoomChannel],
  buildHandler: () => new ChannelHandler([RoomChannel], null as any),
});
```

With `@orbitstack/app`, do this declaratively:

```ts
@OrbitApp({
  actors: [RoomActor],
  channels: [{
    url: '/rooms/:id/socket',
    actor: RoomActor,
    idParam: 'id',
    channels: [RoomChannel],
  }],
})
class App {}
```

`createWorker(App)` composes the actor + channels into a single DO export named `Room` automatically.

## Socket API

```ts
interface Socket {
  assigns: Record<string, unknown>;     // per-connection state
  assign(data: Record<string, unknown>): void;
  send(event: string, payload: unknown): void;
  broadcastFrom(event: string, payload: unknown): void;  // everyone except self
  readonly actor: ActorRef;             // backing actor reference
  readonly topic: string;
  readonly raw: WebSocket;              // escape hatch
}
```

## Client

See [`@orbitstack/client`](../client) — `OrbitSocket` with join/leave, replies, reconnect, heartbeat.

## See also

- [`@orbitstack/actors`](../actors) — `OrbitActor`, `composeDurableObject`
- [`@orbitstack/app`](../app) — `@OrbitApp.channels` auto-wiring
- [`@orbitstack/client`](../client) — browser/Node WebSocket client
