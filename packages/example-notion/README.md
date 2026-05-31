# Building a Notion clone with Orbit

A tutorial that teaches the framework. By the end you'll understand why Orbit looks the way it does, what every decorator means, and how to extend the example to fit your own product.

Demo: [https://orbit-notion.doronindm.workers.dev/](https://orbit-notion.doronindm.workers.dev/)

---

## Table of contents

1. [What we're building](#what-were-building)
2. [The big idea: actors on the edge](#the-big-idea-actors-on-the-edge)
3. [A 60-second tour of the file tree](#a-60-second-tour-of-the-file-tree)
4. [Step 1 — A Page is an actor](#step-1--a-page-is-an-actor)
5. [Step 2 — Talking to an actor over HTTP](#step-2--talking-to-an-actor-over-http)
6. [Step 3 — Booting the worker](#step-3--booting-the-worker)
7. [Step 4 — Multiple users editing the same page](#step-4--multiple-users-editing-the-same-page)
8. [Step 5 — Presence and the alarm clock](#step-5--presence-and-the-alarm-clock)
9. [Step 6 — Workspaces, members, and authorization](#step-6--workspaces-members-and-authorization)
10. [Step 7 — Authentication with `bearer`](#step-7--authentication-with-bearer)
11. [Concept reference card](#concept-reference-card)
12. [Running the example locally](#running-the-example-locally)
13. [Where to go next](#where-to-go-next)

---

## What we're building

A simplified Notion: a Cloudflare Worker that serves a REST API plus a WebSocket for real-time collaborative editing, **and** a small SPA in `public/` that's served by the same Worker via Cloudflare's static-assets layer. Users belong to workspaces. Workspaces own pages. Pages are trees of blocks (paragraphs, headings, to-dos, code blocks). Multiple users can edit the same page at the same time and see each other's cursors.

You'll write three kinds of code:

- **Actors** — domain objects with state (workspace, page).
- **Controllers** — REST endpoints that read input, talk to actors, return JSON.
- **One application class** — declares actors, controllers, and which URLs map to WebSocket connections.

That's it. No services unless you want them, no modules, no plugins, no global setup file. The whole "wiring" portion of the app fits in ~20 lines.

> Just want to run it? Jump to [Running the example locally](#running-the-example-locally) — it's one command.

---

## The big idea: actors on the edge

Orbit is a framework for Cloudflare Workers. Its key bet is:

> **A Durable Object is an actor.**

A Durable Object (DO) is a single-threaded, persistent JavaScript object pinned to a specific point on Cloudflare's network. There's exactly one instance globally for any given ID. It has its own storage. It can hold WebSocket connections. It runs handlers one at a time.

That's the actor model: one mailbox, single-threaded execution, durable state, a stable identity. Erlang processes look like this. Akka actors look like this. Phoenix Channels look like this.

The Notion example uses two actor types:

- **`WorkspaceActor`** — one instance per workspace. Holds the member list and the page index.
- **`PageActor`** — one instance per page. Holds the blocks, the version counter, and the set of users currently viewing the page.

You don't have to think about Durable Object lifecycle, hibernation, storage keys, or fetch handlers. Orbit wraps all of that. You write a class with state and methods; Orbit makes it a DO.

Storage primitives (KV for sessions, D1 for relational data, R2 for blobs) are still injectable when you need them — they just aren't always the right tool. This Notion clone keeps collaborative page/workspace state in Durable Objects, uses KV for auth sessions, and includes D1 + Queues login-audit routes as end-to-end examples.

---

## A 60-second tour of the file tree

```
src/
├── index.ts                  # @OrbitApp + createWorker + queue()
├── types.ts                  # Block, PageState, WorkspaceState
├── auth.controller.ts        # POST /auth/login (passwordless dev login)
├── d1.controller.ts          # /d1/login-events (D1 end-to-end example)
├── queue.controller.ts       # /queue/login-events (Queues producer example)
├── queue.consumer.ts         # Queue consumer persists events into D1
├── workspace.actor.ts        # Workspace DO
├── workspace.controller.ts   # /workspaces/* REST endpoints
├── page.actor.ts             # Page DO with broadcast + presence
└── page.controller.ts        # /pages/* REST endpoints
migrations/
└── 0001_login_audit.sql      # notion_login_events D1 table
public/
├── index.html                # SPA shell
├── styles.css                # Notion-ish styling
└── app.js                    # Vanilla JS: REST + raw WebSocket
```

There are no `*.module.ts` files, no `*.service.ts` files, no DI configuration files. The actors are the service layer.

---

## Step 1 — A Page is an actor

Open `src/page.actor.ts`. Here's the trimmed shape:

```ts
import { Actor, Handle, OrbitActor } from "@orbit/app";

@Actor("Page")
export class PageActor extends OrbitActor<PageState> {
  initialState(): PageState {
    return { title: "Untitled", blocks: {} /* … */ };
  }

  @Handle("page.title.set")
  async setTitle(p: { title: string }) {
    this.updateState((s) => {
      s.title = p.title;
    });
  }
}
```

Three things to notice.

### `@Actor('Page')`

This decorator says "this class is an actor named `Page`." The string is the **DO binding name** — the same name you'd put in `wrangler.toml` if you were writing one by hand. Orbit derives that binding for you.

### `extends OrbitActor<PageState>`

`OrbitActor<S>` is the base class. The type parameter `S` is the shape of the actor's state.

- `this.state` is the current state — typed as `S`.
- `this.updateState(fn)` lets you mutate a draft and replaces the state with the result.
- After every handler returns, Orbit serializes `this.state` and writes it to DO storage. When the actor wakes from hibernation, it hydrates from storage. You never call `storage.put` directly.

`initialState()` is called the first time the actor wakes with no saved state.

### `@Handle('page.title.set')`

Each `@Handle` registers a message type. When something calls this actor with `type: 'page.title.set'`, the framework dispatches to the matching method. The method receives the payload as its first argument and returns whatever the caller should see.

Why string-typed messages instead of method names? Because actors are addressed across the network. A controller sends `{ type, payload }` over a `fetch()` call to the actor's DO. The string is the protocol.

Some handlers in `page.actor.ts` are more interesting:

```ts
@Handle('page.block.insert')
async insertBlock(p: InsertBlockPayload): Promise<Block> {
  const block: Block = { id: p.blockId, type: p.type, text: p.text ?? '', children: [] };

  this.bumpVersion((s) => {
    s.blocks[block.id] = block;
    const siblings = p.parentBlockId ? s.blocks[p.parentBlockId].children : s.rootBlockIds;
    siblings.splice(/* … */, 0, block.id);
  });

  this.broadcast('page.block.inserted', { block, version: this.state.version });
  return block;
}
```

`this.broadcast(event, payload)` sends a message to **every WebSocket connected to this page**. That's how a block insert from user A reaches user B in real time. We'll wire those WebSockets up in step 4.

### What you get for free

Because `@Actor` registers a built-in handler called `__orbit.snapshot__`, every actor has a `ref.snapshot<S>()` call available without you writing any code. You don't add a "read my state" handler to every actor by hand.

---

## Step 2 — Talking to an actor over HTTP

Open `src/page.controller.ts`. Controllers are how the outside world reaches actors.

```ts
import {
  Resource,
  Get,
  Post,
  Param,
  Body,
  Auth,
  Inject,
  ActorRegistry,
  ACTOR_REGISTRY_TOKEN,
  bearer,
} from "@orbit/app";

@Resource("/pages", { guards: [bearer("SESSIONS")] })
export class PageController {
  constructor(@Inject(ACTOR_REGISTRY_TOKEN) private actors: ActorRegistry) {}

  @Get("/:id")
  async show(@Param("id") id: string, @Auth() me: Session): Promise<PageState> {
    const page = await this.actors.ref(PageActor, id).snapshot<PageState>();
    if (!page.pageId) throw new NotFoundException(`Page ${id}`);
    return page;
  }
}
```

Let's break that down decorator by decorator.

### `@Resource('/pages', { guards: [bearer('SESSIONS')] })`

Equivalent to writing three decorators stacked:

```ts
@Controller('/pages')
@Injectable()
@UseGuard(bearer('SESSIONS'))   // applied to every method
```

- `@Controller` declares the URL prefix.
- `@Injectable` makes the class resolvable from the DI container.
- `bearer('SESSIONS')` is a built-in guard that reads `Authorization: Bearer <token>` from the request and looks `session:<token>` up in the `SESSIONS` KV namespace. If the lookup succeeds, the session JSON is attached to the request context.

You can still use `@Controller` + `@Injectable` separately if you want guards on only some routes; `@Resource` is the shortcut for "every method on this class requires auth."

### `constructor(@Inject(ACTOR_REGISTRY_TOKEN) private actors: ActorRegistry)`

This is dependency injection. We ask for the `ActorRegistry` — a singleton that knows how to look up an actor by class + ID. Orbit registers it automatically based on the `actors` list in `@OrbitApp`; we just inject it.

Why `@Inject(TOKEN)` instead of just `private actors: ActorRegistry`? Because workerd (the Cloudflare runtime) doesn't support TypeScript's `Reflect.metadata`. Orbit can't read constructor types at runtime, so you tell it which token to look up. The cost is one decorator per parameter; the benefit is no codegen step.

### `@Get('/:id')` and `@Param('id')`

Standard route + path parameter. The path `/:id` is matched against the controller prefix `/pages`, so the full URL is `GET /pages/:id`.

### `@Auth()`

Inject the authenticated session that the `bearer('SESSIONS')` guard parsed. Without a guard, this would be `undefined`. With one, you get a typed object — in this app, `{ userId, displayName }`.

### `this.actors.ref(PageActor, id).snapshot<PageState>()`

Three steps in one line:

1. **`ref(PageActor, id)`** — get an `ActorRef<PageActor>` for the page with that ID. Under the hood this finds the DO namespace for `'Page'`, derives a `DurableObjectId` from the string, and fetches a stub. Cheap.
2. **`.snapshot<PageState>()`** — call the built-in `__orbit.snapshot__` handler and get the state back as a typed value.

If you wanted to call your own handler instead:

```ts
await this.actors
  .ref(PageActor, id)
  .call("page.block.insert", { blockId, type, text });
```

`call` awaits a typed result. `cast` sends without awaiting (still resolves when the actor ACKs). `connect(request)` forwards a WebSocket upgrade.

---

## Step 3 — Booting the worker

This is the whole entry point of the application, `src/index.ts`:

```ts
import { OrbitApp, createWorker, bearer } from "@orbit/app";
import { WorkspaceActor } from "./workspace.actor.js";
import { PageActor } from "./page.actor.js";
import { WorkspaceController } from "./workspace.controller.js";
import { PageController } from "./page.controller.js";
import { AuthController } from "./auth.controller.js";

@OrbitApp({
  actors: [WorkspaceActor, PageActor],
  controllers: [AuthController, WorkspaceController, PageController],
  channels: [
    {
      url: "/pages/:id/socket",
      actor: PageActor,
      idParam: "id",
      guards: [bearer("SESSIONS")],
    },
  ],
  bindings: { KV: "SESSIONS" },
})
export class NotionApp {}

const worker = createWorker(NotionApp);
export default worker;
export const { Workspace, Page } = worker;
```

That's the entire wiring layer. Let's read it carefully.

### `@OrbitApp({ ... })`

The single composition root. Everything the framework needs to know about your app is here.

| Field         | What it does                                                                                                                                             |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `actors`      | Classes decorated with `@Actor`. Each becomes a Durable Object class on the worker. Their DI registrations are auto-added.                               |
| `controllers` | Classes decorated with `@Controller` or `@Resource`. Their routes are auto-registered onto the worker's router.                                          |
| `channels`    | URL patterns that map to a specific actor — when a client connects via WebSocket, the framework finds the right actor instance and forwards the upgrade. |
| `providers`   | (Not used here) Custom services. Plain `@Injectable` classes or `{ provide, useFactory, inject }` objects.                                               |
| `bindings`    | Names env bindings should bind under: `{ KV: 'SESSIONS' }` means `env.SESSIONS` is exposed via `KV_TOKEN`.                                               |

There are no nested modules. Add a new feature by adding to these arrays. Delete a feature by removing from these arrays.

### `createWorker(NotionApp)`

One call. It returns a value that:

1. Implements `{ fetch, queue? }` — the Worker default export.
2. Has every actor's DO class hanging off it, keyed by `@Actor` name. So `worker.Workspace` is the `WorkspaceActor`'s DO class.

`export default worker` makes the worker handle HTTP requests. `export const { Workspace, Page } = worker` exposes the DO classes so wrangler can bind them. You repeat each name once because Cloudflare requires DO class names to be statically reachable from the module — there's no way to spread them dynamically. (A future `@orbit/build` step can eliminate that repetition.)

### What happened inside `createWorker`

Conceptually:

```
build the DI container from @OrbitApp metadata
  ↓
register env-derived tokens:
  KV_TOKEN          → env.SESSIONS    (from bindings)
  D1_TOKEN          → env.DB          (from bindings)
  ACTOR_REGISTRY    → new ActorRegistry(env) with WorkspaceActor + PageActor pre-registered
  ↓
build a router:
  - default middleware: logger, security headers, CORS
  - register every controller from @OrbitApp.controllers
  - for each channel: add a WS route that resolves the actor by URL param and forwards the upgrade
  ↓
compose each actor into a DO class
  ↓
return { fetch, ...DOClasses }
```

This used to be ~30 lines of boilerplate you wrote yourself. Now it's a function call.

---

## Step 4 — Multiple users editing the same page

So far you've seen HTTP CRUD against actors. The interesting part of Notion is collaboration. Watch how that's wired.

### The channel route

In `index.ts`:

```ts
channels: [
  {
    url: "/pages/:id/socket",
    actor: PageActor,
    idParam: "id",
    guards: [bearer("SESSIONS")],
  },
];
```

This says: when a client does a WebSocket upgrade to `/pages/abc-123/socket`, find the `PageActor` instance with ID `abc-123` and forward the upgrade to its DO. The `bearer` guard runs first — if the session lookup fails, the upgrade is rejected with 401.

The client now has a WebSocket connected directly to the page's DO. From here:

### A client sends a frame, the actor handles it

The actor's built-in WebSocket handler parses incoming JSON as `{ type, payload }` and dispatches to a matching `@Handle`. So a browser writing:

```js
socket.send(
  JSON.stringify({
    type: "page.block.insert",
    payload: { blockId: "...", type: "paragraph", text: "hi" },
  }),
);
```

triggers `PageActor.insertBlock(payload)` in the DO.

### The actor broadcasts back

Look at the bottom of `insertBlock`:

```ts
this.broadcast("page.block.inserted", { block, version: this.state.version });
```

`broadcast` sends a JSON frame to every connected WebSocket — so every other user editing this page sees the new block instantly.

### Why this works

This pattern works because **all WebSockets for a given page connect to the same DO**. Cloudflare routes them by ID. The DO is single-threaded, so two simultaneous inserts can't race. The DO has the state in memory. The DO knows who's connected.

In a traditional architecture you'd need a pub/sub broker, a fan-out worker, sticky sessions, locks. With actors-as-DOs, the actor IS the broker. The Worker just routes the upgrade.

---

## Step 5 — Presence and the alarm clock

Presence is "who's looking at this page right now and where is their cursor." It's the other piece of real-time UX.

Three handlers in `page.actor.ts`:

```ts
@Handle('page.presence.update')
async updatePresence(p: { userId; displayName; color; cursorBlockId? }): Promise<PresenceEntry[]> {
  this.updateState((s) => { s.presence[p.userId] = { ...p, lastSeen: Date.now() }; });
  this.broadcast('page.presence.changed', { entry: this.state.presence[p.userId] });
  await this.setAlarm(Date.now() + PRESENCE_SWEEP_INTERVAL_MS);
  return Object.values(this.state.presence);
}
```

When user A's cursor moves, the client sends `page.presence.update`. The actor records it, broadcasts to everyone else, and **sets an alarm** for 15 seconds in the future.

```ts
@OnAlarm()
async sweepPresence(): Promise<void> {
  const cutoff = Date.now() - PRESENCE_TTL_MS;
  // remove entries last seen before cutoff
  // broadcast 'page.presence.left' for each
  if (Object.keys(this.state.presence).length > 0) {
    await this.setAlarm(Date.now() + PRESENCE_SWEEP_INTERVAL_MS);
  }
}
```

`@OnAlarm` registers a method as the alarm callback. When the alarm fires, this method runs. It cleans up stale entries (anyone whose last heartbeat is more than 30 seconds ago), broadcasts that they're gone, and re-arms the alarm if there's still anyone around.

### Why alarms are a big deal

Workers can't run periodic timers. They're stateless functions that wake on a request. But Durable Objects have an alarm primitive: "wake me up at time T even if no request comes in." That's how you do background work on a serverless edge — the actor schedules its own future work.

For Notion-style presence, this means:

- If a user closes their tab without a clean WebSocket close, their entry will still expire within 30 seconds.
- If nobody's on the page, the actor stops scheduling alarms and goes back to sleep. Zero ongoing cost.

The state and the schedule live in the same DO. You didn't deploy a cron job, you didn't spin up a worker. The actor manages itself.

---

## Step 6 — Workspaces, members, and authorization

Open `src/workspace.actor.ts`. It's the same shape as `PageActor` but holds workspace metadata.

```ts
@Actor("Workspace")
export class WorkspaceActor extends OrbitActor<WorkspaceState> {
  initialState(): WorkspaceState {
    return {
      workspaceId: "",
      name: "",
      ownerId: "",
      members: {},
      pages: {} /* … */,
    };
  }

  @Handle("workspace.invite")
  async invite(p: { inviterId; userId; role }): Promise<void> {
    this.assertRole(p.inviterId, ["owner", "editor"]);
    this.updateState((s) => {
      s.members[p.userId] = p.role;
    });
  }
}
```

Notice the authorization style. The actor doesn't trust the controller — it re-checks roles every time. Even though `PageController` and `WorkspaceController` enforce auth on the way in, the actor enforces it on the way out. Defense in depth.

Why? Because actors are addressable by any code in the worker. If you add a new feature module that calls `workspace.invite` directly, you want the actor to refuse anyway. Putting the authorization on the actor instead of the controller means it can't be bypassed.

### Cross-actor orchestration

When a user creates a page (in `PageController.create`):

```ts
const summary = await this.actors
  .ref(WorkspaceActor, body.workspaceId)
  .call("workspace.createPage", {
    authorId: me.userId,
    pageId,
    title,
    parentPageId,
  });

return this.actors.ref(PageActor, summary.pageId).call("page.init", {
  pageId: summary.pageId,
  workspaceId: body.workspaceId,
  title: body.title,
});
```

The controller talks to two actors in sequence:

1. **`WorkspaceActor.createPage`** — adds the page summary to the workspace's index. This is where authorization happens ("can this user create pages?").
2. **`PageActor.init`** — initializes the new page's DO with title and workspace ID.

Notice that **actors don't talk directly to each other**. The Worker orchestrates them. This is deliberate. PLAN.md §2.6 explains why: direct actor-to-actor stubs create implicit coupling and make testing harder. The Worker is the explicit orchestration layer. If a step needs to be retried, traced, rate-limited, or rolled back, that logic lives in the controller, not buried inside an actor.

For fire-and-forget actor-to-actor messages, use Queues. For request-response, route through the Worker.

---

## Step 7 — Authentication with `bearer`

Open `src/index.ts` and look at the `channels` declaration:

```ts
{ url: '/pages/:id/socket', actor: PageActor, idParam: 'id', guards: [bearer('SESSIONS')] }
```

`bearer('SESSIONS')` is a guard. Guards run before the request reaches the handler (REST) or the upgrade is accepted (WS). They can return false or throw to reject.

What `bearer('SESSIONS')` actually does:

1. Read the `Authorization` header. Reject 401 if it doesn't start with `Bearer `.
2. Extract the token.
3. Resolve `KV_TOKEN` from the DI container — which `createWorker` bound to `env.SESSIONS`.
4. Look up `session:<token>` as JSON. Reject 401 if absent.
5. Attach the parsed session to `ctx.auth`.

Controllers reach the session two ways:

- **`@Auth() me: Session` parameter** — most ergonomic.
- **`authOf<Session>(ctx)`** — for use inside middleware/guards/helpers.

For local development, the bundled `AuthController` provides a passwordless dev login:

```sh
curl -X POST http://localhost:8787/auth/login \
  -H "Content-Type: application/json" \
  -d '{"displayName":"Alice"}'
# => { "token": "...", "session": { "userId": "alice", "displayName": "Alice" } }
```

It mints a token, writes `session:<token>` into the SESSIONS KV, and hands the token back. The SPA in `public/` calls this endpoint and stores the token in `localStorage`. In production you'd swap this out for a real auth provider that produces session entries in the same shape.

### Auth on WebSockets, in browsers

Browsers can't set custom headers on WebSocket upgrades, so the `bearer()` guard also accepts the token via an `?access_token=…` query param (RFC 6750 §2.3). The frontend connects with:

```js
new WebSocket(`/pages/${pageId}/socket?access_token=${token}`);
```

and the same guard authenticates both REST and WS.

### Why guards run on WebSocket upgrades

Cloudflare evaluates HTTP middleware (including guards) on the upgrade request. So `bearer('SESSIONS')` on a WebSocket route works the same as on a REST route — the upgrade is rejected before any frames are exchanged. After the connection is open, the session payload is no longer in scope (the actor doesn't see HTTP headers), so if you need the user identity inside the actor, send it as part of the first frame or include it in the URL.

---

## Concept reference card

A glossary you can return to.

### Decorators you'll use most

| Decorator                       | Where                 | Purpose                                          |
| ------------------------------- | --------------------- | ------------------------------------------------ |
| `@OrbitApp({...})`              | One class per app     | Declare the entire application                   |
| `@Actor(name)`                  | Actor class           | Mark as a Durable Object                         |
| `@Handle(type)`                 | Actor method          | Register a message handler                       |
| `@OnAlarm()`                    | Actor method          | Register the alarm callback                      |
| `@Resource(prefix, { guards })` | Controller class      | `@Controller + @Injectable + class-level guards` |
| `@Controller(prefix)`           | Controller class      | Declare URL prefix                               |
| `@Get/@Post/@Patch/@Delete`     | Controller method     | Declare HTTP route                               |
| `@Param/@Query/@Body/@Header`   | Controller parameter  | Inject pieces of the request                     |
| `@Auth()`                       | Controller parameter  | Inject the session attached by a guard           |
| `@Injectable()`                 | Service class         | Make resolvable from DI                          |
| `@Inject(token)`                | Constructor parameter | Say which token to resolve                       |
| `@UseGuard(g)`                  | Controller method     | Add a guard to just one route                    |

### What gets injected

| Token                  | Comes from                                      |
| ---------------------- | ----------------------------------------------- |
| `KV_TOKEN`             | The KV binding named in `@OrbitApp.bindings.KV` |
| `D1_TOKEN`             | The D1 binding named in `@OrbitApp.bindings.D1` |
| `R2_TOKEN`             | The R2 binding named in `@OrbitApp.bindings.R2` |
| `ENV_TOKEN`            | The whole `env` object                          |
| `ACTOR_REGISTRY_TOKEN` | The `ActorRegistry` singleton, auto-registered  |
| `EXECUTION_CTX_TOKEN`  | The Worker `ExecutionContext`                   |
| `REQUEST_TOKEN`        | The current `Request` (REQUEST scope only)      |

### `ActorRef` methods

```ts
ref.call(type, payload); // request/response, typed
ref.cast(type, payload); // fire-and-forget, awaits ACK
ref.snapshot<S>(); // built-in, returns current state
ref.connect(request); // forward a WebSocket upgrade
```

### `OrbitActor` methods you call from handlers

```ts
this.updateState(s => { ... })    // immutable mutation; auto-persists
this.setState(newState)           // replace entire state
this.snapshot                     // readonly snapshot of state (getter)
this.broadcast(event, payload)    // every connected WebSocket
this.broadcastExcept(ws, event, payload)
this.setAlarm(timestamp)          // schedule future wakeup
this.deleteAlarm()
this.persist()                    // manual persist (rarely needed)
this.storage                      // raw DurableObjectStorage (escape hatch)
```

### `OrbitActor` lifecycle hooks

```ts
initialState(): S                 // required; called when DO has no saved state
onActivate(): Promise<void>       // optional; called when DO wakes
onDeactivate(): Promise<void>     // optional; best-effort before eviction
```

---

## Running the example locally

You need **Node.js 23+** and npm. Wrangler is installed as a dev dependency. An `.nvmrc` is included — run `nvm use` in this directory if you use nvm.

```sh
# from the orbit repo root
npm install
cd packages/example-notion && nvm use   # optional, if you use nvm
npm run dev
```

That single command does three things:

1. **Compiles the TypeScript** — `wrangler dev` runs the `[build]` step from `wrangler.toml` (`npx tsc`) and re-runs it whenever files in `src/` change.
2. **Boots `wrangler dev` on `http://localhost:8787`** with local-mode Durable Objects and an in-memory KV namespace for sessions.
3. **Serves the SPA** in `public/` (`index.html`, `styles.css`, `app.js`) via Cloudflare's static-assets layer. Any GET that doesn't match a file falls through to the Worker (so `/auth/login`, `/workspaces/*`, `/pages/*`, and the `/pages/:id/socket` WS upgrade all reach the orbit router).

Open <http://localhost:8787> in your browser. Type any display name and hit **Enter** — the SPA calls `POST /auth/login`, gets a token, joins the shared workspace, and you're in. Open a second window with a different name to see live presence and real-time block updates.

### What's happening behind the scenes

- **`POST /auth/login {displayName}`** — `AuthController` mints a random token, writes `session:<token> → {userId, displayName}` into the SESSIONS KV (30-day TTL), and returns `{ token, session }`. The SPA persists `token` in `localStorage`.
- **`POST /workspaces`** / **`GET /workspaces/:id`** — initializes or fetches the shared workspace DO. Any authenticated user is added to it automatically, so everyone lands in the same docs space.
- **`POST /pages`** — creates a new page (initializes its DO and indexes it on the workspace).
- **WebSocket** — the SPA opens `ws://localhost:8787/pages/:id/socket?access_token=<token>` and sends `{ "type": "page.presence.update", "payload": { … } }` and friends. Other connected clients receive `{ "event": "page.block.inserted", "payload": …, "topic": "Page" }` etc.

### curl smoke tests (optional)

```sh
TOKEN=$(curl -s -X POST http://localhost:8787/auth/login \
  -H "Content-Type: application/json" \
  -d '{"displayName":"Alice"}' | jq -r .token)

WS=$(curl -s http://localhost:8787/workspaces \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"My workspace"}' | jq -r .workspaceId)

curl -s http://localhost:8787/pages \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"workspaceId\":\"$WS\",\"title\":\"Hello\"}"
```

Inside the socket, send a block insert:

```json
{
  "type": "page.block.insert",
  "payload": { "blockId": "b1", "type": "paragraph", "text": "hello" }
}
```

Other clients on the same page receive:

```json
{"event":"page.block.inserted","payload":{"block":{...},"version":1},"topic":"Page","ref":null}
```

That's the framework's broadcast in action.

### D1 end-to-end example route

The example app also exposes a minimal D1-backed flow:

- `POST /d1/login-events` inserts a login audit row
- `GET /d1/login-events` returns the latest rows

Migration file:

`migrations/0001_login_audit.sql`

Apply it in local dev before calling the endpoints:

```sh
cd packages/example-notion
npx wrangler d1 migrations apply ORBIT_NOTION_DB --local
```

Then smoke-test the route:

```sh
curl -s -X POST http://localhost:8787/d1/login-events \
  -H "Content-Type: application/json" \
  -d '{"displayName":"Alice","userId":"u-alice"}'

curl -s http://localhost:8787/d1/login-events
```

### Queues end-to-end example route

The same app also includes a minimal queue producer/consumer flow:

- `POST /queue/login-events` enqueues a login audit event to `ORBIT_NOTION_AUDIT_QUEUE`
- Worker `queue()` dispatches to `LoginAuditQueueConsumer`
- The consumer inserts events into the same `notion_login_events` D1 table

Local smoke test:

```sh
curl -s -X POST http://localhost:8787/queue/login-events \
  -H "Content-Type: application/json" \
  -d '{"displayName":"Bob","userId":"u-bob"}'

# after queue consumption, this includes Bob's event
curl -s http://localhost:8787/d1/login-events
```

### Deploying

Before deploying to Cloudflare, swap the placeholder KV id in `wrangler.toml` for a real one:

```sh
npx wrangler kv namespace create SESSIONS
# paste the returned id into the [[kv_namespaces]] block, then:
npm --workspace @orbit/example-notion run deploy
```

---

## Where to go next

You now understand the framework's core surface. To go deeper:

- **Read [`@orbit/app`](../app/README.md)** — the umbrella package. `createWorker` lives there.
- **Read [`@orbit/actors`](../actors/README.md)** — actor lifecycle, persistence, channels integration.
- **Read [`@orbit/http`](../http/README.md)** — router internals, the middleware/guard/pipe pipeline.
- **Read [`@orbit/channels`](../channels/README.md)** — Phoenix-style channels for richer WebSocket semantics (join/leave, replies, multiple topics per DO). The Notion example uses raw actor broadcasts; for larger apps you'll want channels.
- **Read [`@orbit/testing`](../testing/README.md)** — `createTestActor` lets you unit-test actor handlers without a Worker runtime.

### Common next steps for this example

- **Add a "recent edits" feed.** Wire `PageActor` to send a `Queue` message on every change; consume from a worker that updates a D1 search index.
- **Add per-block comments.** Either as part of `PageState` or as a separate `CommentThreadActor` per block. The latter scales better for hot blocks.
- **Add cursors that survive disconnects.** Store the last cursor position in the page state keyed by user, not just in the presence map.
- **Add page deletion with cascade.** A `DELETE /pages/:id` route that calls `PageActor.delete` and then `WorkspaceActor.deletePage` to remove from the index.

Each of these is a small addition: one new actor handler, or one new controller method, or one new array entry in `@OrbitApp`. The framework gets out of your way.
