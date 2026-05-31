# @orbit/actors

Actor abstraction over Cloudflare Durable Objects. Each `@Actor` class becomes a DO; messages are dispatched by `@Handle` decorators; state is auto-persisted; WebSockets are managed via the DO Hibernation API.

## Concepts

- **`OrbitActor<S>`** — base class. Holds typed state, exposes `updateState`, `broadcast`, `setAlarm`, `persist`, `storage`.
- **`@Actor(name, options?)`** — marks a class. `name` is the DO binding name. Options: `{ autoPersist: boolean }` (default true).
- **`@Handle(type, opts?)`** — registers a message handler. Optional Zod schema validation.
- **`defineActorMessages({...})`** — typed helper for stable actor message-name maps.
- **`@OnAlarm()`** — registers the alarm handler.
- **`ActorRegistry`** + **`ActorRef<T>`** — resolve and call actors by name + ID.
- **`composeDurableObject(ActorClass, options?)`** — turn an actor class into a DO class, optionally bridging channels.

## Defining an actor

```ts
import {
  Actor,
  Handle,
  OnAlarm,
  OrbitActor,
  defineActorMessages,
} from "@orbit/actors";

interface RoomState {
  messages: string[];
}

const ROOM_MESSAGES = defineActorMessages({
  SEND: "room.send",
});

@Actor("Room")
export class RoomActor extends OrbitActor<RoomState> {
  initialState(): RoomState {
    return { messages: [] };
  }

  @Handle(ROOM_MESSAGES.SEND)
  async onSend(p: { text: string }) {
    this.updateState((s) => {
      s.messages.push(p.text);
    });
    this.broadcast("new_message", { text: p.text });
  }

  @OnAlarm()
  async cleanup() {
    this.updateState((s) => {
      s.messages = s.messages.slice(-100);
    });
  }
}
```

Prefer message maps over inline string literals in `@Handle(...)` so names stay centralized and refactor-friendly.

State auto-persists after every successful handler. To opt out, use `@Actor('Room', { autoPersist: false })` and call `await this.persist()` manually.

## Calling an actor

```ts
import { ActorRegistry, ACTOR_REGISTRY_TOKEN } from "@orbit/actors";

@Injectable()
class RoomService {
  constructor(@Inject(ACTOR_REGISTRY_TOKEN) private actors: ActorRegistry) {}

  async post(roomId: string, text: string) {
    return this.actors.ref(RoomActor, roomId).call("send", { text });
  }

  async snapshot(roomId: string) {
    return this.actors.ref(RoomActor, roomId).snapshot<RoomState>();
  }
}
```

`ref.call(type, payload)` awaits the result. `ref.cast(type, payload)` is fire-and-forget (but still awaits the ACK). `ref.connect(request)` forwards a WebSocket upgrade to the actor's DO.

## Built-in snapshot

Every `@Actor` class automatically registers a handler for `__orbit.snapshot__` that returns the current state. Call it via `ref.snapshot<S>()`. No need to write `@Handle('foo.snapshot')` yourself.

## WebSockets

The DO accepts WebSocket upgrades via `this.acceptWebSocket(ws)`. Incoming string messages are parsed as `{ type, payload }` and dispatched to the matching `@Handle`. `this.broadcast(event, payload)` sends to every connected socket; `this.broadcastExcept(ws, event, payload)` skips one.

For richer WebSocket semantics (topic-based join/leave, presence, replies), use [`@orbit/channels`](../channels) and bridge via `composeDurableObject(ActorClass, { channels, buildHandler })` — or just declare a `ChannelRoute` in `@OrbitApp` and let `createWorker` wire it up.

## DO class generation

`composeDurableObject(ActorClass)` returns a DO class. Export it from your Worker module:

```ts
export const Room = composeDurableObject(RoomActor);
```

`createWorker(App)` from [`@orbit/app`](../app) does this automatically for every actor in `@OrbitApp.actors`.

## Testing

```ts
import { createTestActor } from "@orbit/testing";

const handle = await createTestActor(RoomActor);
await handle.call("send", { text: "hi" });
expect(handle.state.messages).toEqual(["hi"]);
await handle.triggerAlarm();
```

## See also

- [`@orbit/channels`](../channels) — typed WebSocket channels backed by actors
- [`@orbit/app`](../app) — auto-wiring via `@OrbitApp.actors`
- [`@orbit/testing`](../testing) — actor test utilities
