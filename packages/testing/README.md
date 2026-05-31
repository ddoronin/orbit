# @orbit/testing

Test utilities and in-memory mocks for Orbit. No Miniflare or workerd runtime needed for unit tests.

## What's in here

- **`createTestContainer(App, options?)`** — builds a DI container from `@OrbitApp`, with overrides.
- **`createTestActor(ActorClass)`** — instantiates an actor against a mock DO storage, exposes `call`, `cast`, `state`, `triggerAlarm`.
- **`createTestApp(router)`** — adapts a `Router` for in-process HTTP testing.
- **Mocks** — `MockDurableObjectStorage`, `MockDurableObjectState`, `MockKVNamespace`, `MockR2Bucket`, `MockD1Database`, `MockD1PreparedStatement`.

## Service test (DI container)

```ts
import { createTestContainer } from "@orbit/testing";

const { container } = await createTestContainer(App, {
  overrides: [{ provide: ExternalService, useValue: { call: vi.fn() } }],
});
const userSvc = await container.resolve(UserService);
```

## Actor test

```ts
import { createTestActor } from "@orbit/testing";
import { CounterActor } from "./counter.actor.js";

const counter = await createTestActor(CounterActor);

await counter.call("bump");
expect(counter.state.n).toBe(1);

const snap = await counter.call("__orbit.snapshot__");
expect(snap).toEqual({ n: 1 });

await counter.triggerAlarm();
```

`counter.instance` exposes the underlying actor for direct inspection. `counter.storage` exposes the mock storage to assert persistence.

## HTTP test

```ts
import { createTestApp } from "@orbit/testing";
import { router } from "@orbit/http";

const app = createTestApp(
  router().get("/health", (ctx) => ctx.json({ ok: true })),
);
const res = await app.request("/health");
expect(res.status).toBe(200);
```

## Controller integration test with overrides

```ts
import { OrbitApp, Inject, Injectable } from "@orbit/core";
import { Resource, Get, Router, registerControllers } from "@orbit/http";
import { createTestApp, createTestContainer } from "@orbit/testing";

@Injectable()
class UsersService {
  async list(): Promise<string[]> {
    return ["real-user"];
  }
}

@Resource("/users")
class UsersController {
  constructor(@Inject(UsersService) private readonly users: UsersService) {}

  @Get("/")
  async list() {
    return { users: await this.users.list() };
  }
}

@OrbitApp({ providers: [UsersService], controllers: [UsersController] })
class UsersApp {}

const { container } = await createTestContainer(UsersApp, {
  overrides: [
    {
      provide: UsersService,
      useValue: { list: async () => ["override-user"] },
    },
  ],
});

const router = new Router();
registerControllers(router, [UsersController], container);

const app = createTestApp(router);
const res = await app.request("/users");
expect(await res.json()).toEqual({ users: ["override-user"] });
```

## Mocks

The mocks implement the CF binding interfaces faithfully enough for unit tests:

```ts
const kv = new MockKVNamespace({ "session:abc": { userId: "u1" } });
await kv.get("session:abc", "json"); // → { userId: 'u1' }

const storage = new MockDurableObjectStorage();
await storage.put("k", 1);
await storage.get("k"); // → 1
await storage.setAlarm(Date.now() + 1000);
```

Use them when you need to wire a test without spinning up Miniflare.

## See also

- [`@orbit/app`](../app) — the apps you're testing
- [`@orbit/actors`](../actors) — actor base class
