# @orbit/core

The kernel of the framework. Provides the DI container, decorators, tokens, application graph, and Cloudflare Worker factory.

If you're building an app, use [`@orbit/app`](../app) instead — it re-exports everything here and adds `createWorker`. Use `@orbit/core` directly when extending the framework or building a custom runtime composer.

## What's in here

- **`@OrbitApp({ providers, actors, controllers, channels, bindings })`** — sole composition root. No nested modules.
- **`@Injectable({ scope? })`**, **`@Inject(token)`** — class-based DI.
- **`Container`** — the DI container. Supports `SINGLETON`, `REQUEST`, `TRANSIENT` scopes and child scopes.
- **`buildAppGraph(App)`**, **`buildContainer(graph)`** — turn an `@OrbitApp` class into a configured container.
- **`OrbitFactory.create(App, options)`** — low-level Worker handler builder. Takes a `fetchHandler` + `registerEnvBindings` hook.
- **Tokens:** `ENV_TOKEN`, `KV_TOKEN`, `D1_TOKEN`, `R2_TOKEN`, `QUEUE_TOKEN(name)`, `DO_TOKEN(name)`, `EXECUTION_CTX_TOKEN`, `REQUEST_TOKEN`, plus `createToken<T>(name)` for your own.
- **Errors:** `HttpException`, `NotFoundException`, `UnauthorizedException`, `ForbiddenException`, `BadRequestException`, `ConflictException`, `InternalServerErrorException`, `ActorError`.
- **`Logger`**, **`TraceContext`** — structured JSON logging with W3C traceparent propagation.

## DI in one minute

```ts
import { Injectable, Inject, KV_TOKEN, OrbitApp, Container, buildAppGraph, buildContainer } from '@orbit/core';

@Injectable()
class Sessions {
  constructor(@Inject(KV_TOKEN) private kv: KVNamespace) {}
  get(id: string) { return this.kv.get(`session:${id}`, 'json'); }
}

@OrbitApp({
  providers: [
    { provide: KV_TOKEN, useFactory: (env: any) => env.SESSIONS, inject: [ENV_TOKEN] },
    Sessions,
  ],
})
class App {}

const container = buildContainer(buildAppGraph(App));
container.registerValue(ENV_TOKEN, env);
const sessions = await container.resolve(Sessions);
```

No `Reflect.metadata` is used — decorators stash data in static properties so the runtime works under workerd.

## Scopes

| Scope        | Lifetime                                  |
|--------------|-------------------------------------------|
| `SINGLETON`  | Cached on the root container per isolate. |
| `REQUEST`    | Cached on child scopes created per HTTP request. |
| `TRANSIENT`  | New instance on every `resolve`.          |

`container.createScope()` returns a child container that inherits parent registrations and isolates `REQUEST` instances.

## When to use this directly

- Writing a non-HTTP runtime (Queue-only, cron-only) and `createWorker`'s router auto-build is overkill.
- Building a custom `@orbit/*` package that needs to introspect the app graph.
- Testing services in isolation with a hand-built container.

## See also

- [`@orbit/app`](../app) — `createWorker(App)` and umbrella exports
- [`@orbit/testing`](../testing) — `createTestContainer(App)` for unit tests
