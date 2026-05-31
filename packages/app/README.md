# @orbit/app

The umbrella package. Pulls in `@orbit/core`, `@orbit/actors`, `@orbit/http`, and `@orbit/channels`, and adds `createWorker(App)` — a single call that boots an entire Orbit application on Cloudflare Workers.

If you're building an Orbit app, this is the only package you need to import from.

## Quick start

```ts
import {
  OrbitApp,
  createWorker,
  Resource,
  Get,
  Actor,
  Handle,
  OrbitActor,
} from "@orbit/app";

@Actor("Counter")
class CounterActor extends OrbitActor<{ n: number }> {
  initialState() {
    return { n: 0 };
  }
  @Handle("bump") async bump() {
    this.updateState((s) => {
      s.n++;
    });
  }
}

@Resource("/counters")
class CounterController {
  @Get("/:id") async show(/* … */) {
    /* … */
  }
}

@OrbitApp({
  actors: [CounterActor],
  controllers: [CounterController],
})
class App {}

const worker = createWorker(App);
export default worker;
export const { Counter } = worker;
```

## `createWorker(App, options?)`

Returns `OrbitHandler & Record<string, DurableObjectClass>` — a Worker default export with one DO class per `@Actor`, keyed by the actor's name.

The function:

1. Walks `@OrbitApp` metadata: `actors`, `controllers`, `channels`, `providers`, `bindings`.
2. Auto-registers env-derived providers: `KV_TOKEN`, `D1_TOKEN`, `R2_TOKEN`, `QUEUE_TOKEN(name)`, `DO_TOKEN(name)`, `ACTOR_REGISTRY_TOKEN`.
3. Builds a router with `requestLogger`, `securityHeaders`, `cors` middleware (skip with `{ bareMiddleware: true }`).
4. Registers every controller via `registerControllers`.
5. For each `ChannelRoute`, adds a WebSocket route that forwards the upgrade to the named actor's DO instance.
6. Composes each actor with optional channel handlers via `composeDurableObject`.

## App declaration

```ts
@OrbitApp({
  actors: [WorkspaceActor, PageActor],
  controllers: [WorkspaceController, PageController],
  channels: [
    {
      url: "/pages/:id/socket",
      actor: PageActor,
      idParam: "id",
      guards: [bearer("SESSIONS")],
    },
  ],
  providers: [SomeService, { provide: TOKEN, useFactory: () => "…" }],
  bindings: { KV: "SESSIONS", D1: "DB", R2: "FILES" },
})
class App {}
```

### `bindings`

| Key     | Effect                                                                     |
| ------- | -------------------------------------------------------------------------- |
| `KV`    | Binds `KV_TOKEN` to `env[<name>]`. Pass `{ default, other }` for multiple. |
| `D1`    | Same, with `D1_TOKEN`.                                                     |
| `R2`    | Same, with `R2_TOKEN`.                                                     |
| `Queue` | `{ logical: envKey }` — register `QUEUE_TOKEN('logical')`.                 |
| `DO`    | `{ logical: envKey }` — register `DO_TOKEN('logical')`.                    |

### `channels`

Each `ChannelRoute` declares a WebSocket URL that maps to one actor:

```ts
channels: [
  {
    url: "/rooms/:id/socket",
    actor: RoomActor,
    idParam: "id",
    guards: [bearer("SESSIONS")],
    channels: [PresenceChannel], // optional: mount in the actor's DO
  },
];
```

If `channels: [...]` is provided, the actor's DO is built with `composeDurableObject(..., { channels, buildHandler })` so WebSocket frames hit a `ChannelHandler` instead of the actor's built-in WS dispatch.

## DO export pattern

Because Cloudflare requires statically-reachable DO names from the default export module, spread them once:

```ts
const worker = createWorker(App);
export default worker;
export const { Workspace, Page } = worker;
```

That's all the wiring you write.

## See also

- [`../../AGENTS.md`](../../AGENTS.md) — agent checklist and self-check command
- [`../../.cursor/skills/orbit/SKILL.md`](../../.cursor/skills/orbit/SKILL.md) — installable Orbit workflow skill
- [`@orbit/core`](../core) — DI, `@OrbitApp`, tokens
- [`@orbit/actors`](../actors) — `@Actor`, `OrbitActor`, `ActorRegistry`
- [`@orbit/http`](../http) — `@Resource`, `@Controller`, `bearer`, router
- [`@orbit/channels`](../channels) — `@Channel`, `OrbitChannel`, sockets
