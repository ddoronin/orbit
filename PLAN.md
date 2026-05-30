# Orbit — Engineering Plan

> A framework for building distributed web applications on Cloudflare Workers,
> Durable Objects, D1, R2, KV, and Queues.
>
> Think Phoenix/Nest.js, but for the Cloudflare edge.

---

## 1. Foundational Insight

Durable Objects are actors. Everything flows from this:

| Erlang/Akka concept       | Cloudflare primitive               |
|---------------------------|------------------------------------|
| Process / Actor           | Durable Object instance            |
| Mailbox                   | DO `fetch()` queue (single-thread) |
| Process registry          | DO namespace + string ID           |
| Cluster sharding          | CF global routing (automatic)      |
| Persistent state          | DO Storage API                     |
| Hibernation               | DO WebSocket Hibernation API       |
| ETS / DETS                | D1 (relational) / KV (cache)      |
| GenStage / Broadway       | Cloudflare Queues                  |
| PubSub                    | Fanout via DO + Queue              |
| Phoenix Channels          | WebSocket over DO Hibernation      |

The framework wraps these primitives with ergonomic abstractions without
hiding their nature.

---

## 2. Hard Technical Decisions (Resolved)

These must be settled before any code is written.

### 2.1 No Runtime Reflection

**Problem:** `Reflect.metadata` and `emitDecoratorMetadata` do not work in the
workerd runtime. Nest.js-style constructor injection that depends on
`Reflect.getMetadata('design:paramtypes', ...)` is impossible without a
compile-time transform.

**Decision:** Use a **compile-time code generator** (TypeScript transformer or
standalone codegen step) that:
- Reads decorated classes and generates a static dependency graph
- Emits a `__orbit_meta__` static property on each class with injection tokens
- Runs as part of the build pipeline (esbuild plugin or pre-build step)

Alternative considered: Manual token arrays like Angular's `providers` array.
Rejected — too verbose for the ergonomics we want.

```typescript
// What the developer writes:
@Injectable()
class UserService {
  constructor(private db: D1Database, private cache: KVStore) {}
}

// What the codegen emits (added as static property):
UserService.__orbit_meta__ = {
  inject: [D1_TOKEN, KV_TOKEN],
};
```

### 2.2 Monorepo, Multiple Packages

The framework ships as separate packages under `@orbit/` scope:

| Package             | Purpose                              | Deps                  |
|---------------------|--------------------------------------|-----------------------|
| `@orbit/core`       | DI container, module system, config  | none                  |
| `@orbit/actors`     | Actor base class, registry, messages | `@orbit/core`         |
| `@orbit/http`       | Router, controllers, middleware      | `@orbit/core`         |
| `@orbit/channels`   | WebSocket channels, socket mgmt      | `@orbit/actors`       |
| `@orbit/storage`    | D1/KV/R2 typed wrappers             | `@orbit/core`         |
| `@orbit/queues`     | Queue consumer/producer abstractions | `@orbit/core`         |
| `@orbit/cli`        | `orbit` CLI (scaffold, generate, dev)| all                   |
| `@orbit/testing`    | Test utilities, mocks, miniflare     | all                   |
| `@orbit/build`      | esbuild plugin, codegen, transforms  | none (build-time)     |

**Why separate packages:**
- Tree-shaking: an HTTP-only app doesn't bundle actor code
- Clear dependency boundaries prevent circular coupling
- Teams can own packages independently

**Monorepo tooling:** pnpm workspaces + Turborepo.

### 2.3 Build Pipeline

```
Source (.ts)
  │
  ├── @orbit/build codegen (decorator → static metadata)
  │
  ├── esbuild bundle (single Worker entry + DO class exports)
  │
  └── wrangler.toml generation (DO bindings from @Actor metadata)
```

The build step is NOT optional. `orbit build` (or `orbit dev`) must run before
deployment. This is the same model as Next.js, Remix, and SvelteKit — developers
are used to it.

### 2.4 Router: Custom Trie, Not Hono

Hono is excellent but:
- It owns the request/response lifecycle, which conflicts with our middleware pipeline
- Its middleware model doesn't support Guards/Pipes/Interceptors natively
- We need WebSocket route → Actor bridging as a first-class concept

Build a custom radix-trie router. It's ~300 lines of code for a correct
implementation. We can study Hono's and find-my-way's implementations.

### 2.5 D1 Query Builder: Adopt Drizzle

Don't build a query builder. Drizzle ORM already targets D1, is type-safe,
and has migrations. Orbit wraps it with:
- Auto-injection of D1 binding into Drizzle instance
- Migration CLI integration (`orbit migrate` delegates to `drizzle-kit`)
- Repository base class for common patterns

### 2.6 Actor ↔ Actor Communication

Actors communicate via the Worker as a message broker. An actor does NOT hold
a direct stub to another actor. Instead:

```
ActorA → (return instruction to Worker) → Worker → (fetch) → ActorB
```

Why: DO stubs obtained inside a DO create implicit coupling and make testing
hard. The Worker orchestration layer is explicit and interceptable (tracing,
error handling, rate limiting).

For fire-and-forget actor→actor messaging where the source actor doesn't need
to wait, use Queues as the transport.

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Orbit Application                       │
│                                                             │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐               │
│  │  Module A  │  │  Module B  │  │  Module C  │  ...         │
│  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘               │
│        │               │               │                     │
│  ┌─────▼───────────────▼───────────────▼─────┐              │
│  │            Application Kernel              │              │
│  │   (DI container, module graph, boot)       │              │
│  └─────┬─────────────────────────┬────────────┘             │
│        │                         │                           │
│  ┌─────▼─────────┐     ┌────────▼───────────┐              │
│  │   HTTP Layer   │     │   Actor System     │              │
│  │   Router,      │     │   DO abstraction,  │              │
│  │   Controllers, │     │   registry,        │              │
│  │   Middleware    │     │   typed messages   │              │
│  └─────┬─────────┘     └────────┬───────────┘              │
│        │                         │                           │
│  ┌─────▼─────────────────────────▼───────────────────────┐  │
│  │                 Platform Bindings                      │  │
│  │          D1 │ KV │ R2 │ Queues │ DO Storage           │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Phase 1 — Core Runtime (`@orbit/core` + `@orbit/build`)

**Goal:** Boot an Orbit application, resolve dependencies, handle config.
No HTTP, no actors yet — just the kernel.

### 4.1 Module System

```typescript
@Module({
  imports: [DatabaseModule],
  providers: [UserService, EmailService],
  exports: [UserService],
})
export class UserModule {}

@OrbitApp({
  modules: [UserModule, AuthModule],
})
export class App {}
```

**Implementation details:**

- `@Module` and `@OrbitApp` are marker decorators. They store metadata as static
  properties (via the codegen transform, not runtime reflection).
- At build time, the codegen:
  1. Walks all `@Module` classes, builds a DAG
  2. Detects circular dependencies → build error with clear message
  3. Validates that `exports` are a subset of `providers`
  4. Emits a `__orbit_module_graph__` manifest (JSON)
- At runtime, the DI container reads the manifest to wire dependencies.

### 4.2 Dependency Injection Container

```typescript
@Injectable()
class UserService {
  constructor(private repo: UserRepository) {}
}

// Manual token for CF bindings
@Injectable()
class UserRepository {
  constructor(@Inject(D1_TOKEN) private db: D1Database) {}
}
```

**Container implementation:**

```typescript
class Container {
  private instances = new Map<Token, unknown>();
  private factories = new Map<Token, Factory>();

  register(token: Token, factory: Factory, scope: Scope): void;
  resolve<T>(token: Token<T>): T;
  createScope(): Container;  // child container for REQUEST scope
}
```

**Scopes:**
- `SINGLETON` — one instance per Worker isolate lifetime (careful: Workers can
  be evicted at any time, so "singleton" means "cached for this invocation
  chain"). Appropriate for stateless services.
- `REQUEST` — one instance per incoming HTTP request. Created via child container.
- `TRANSIENT` — new instance every time. Rarely needed.

**Binding CF env:**
```typescript
// At Worker entry, before handling request:
container.register(D1_TOKEN, () => env.DB, 'SINGLETON');
container.register(KV_TOKEN, () => env.MY_KV, 'SINGLETON');
container.register(R2_TOKEN, () => env.MY_BUCKET, 'SINGLETON');
```

Tokens are `Symbol` constants exported from `@orbit/core`.

### 4.3 Application Factory

```typescript
// src/main.ts — compiles to Worker entry point
export default OrbitFactory.create(App);
```

`OrbitFactory.create()` returns a standard CF Worker module:

```typescript
{
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const container = buildContainer(App, env);
    const requestContainer = container.createScope();
    // ... route to controller or return 404
  },
  async queue(batch: MessageBatch, env: Env, ctx: ExecutionContext) {
    // ... route to queue consumer
  }
}
```

### 4.4 Configuration

```typescript
@Injectable()
class AppConfig {
  constructor(@Inject(ENV_TOKEN) private env: Env) {}

  get databaseUrl() { return this.env.DATABASE_URL; }
  get jwtSecret() { return this.env.JWT_SECRET; }
}
```

No magic config loader. Config is just an injectable service that reads from
`env`. Users can add Zod validation in their own config service:

```typescript
@Injectable()
class AppConfig {
  private validated: Config;

  constructor(@Inject(ENV_TOKEN) env: Env) {
    this.validated = ConfigSchema.parse(env);  // throws on invalid
  }
}
```

### 4.5 Deliverables

- [ ] `@orbit/core`: `@Module`, `@OrbitApp`, `@Injectable`, `@Inject`, `Container`, `OrbitFactory`
- [ ] `@orbit/build`: TypeScript transformer that extracts decorator metadata into static properties
- [ ] Build step: esbuild plugin that runs the transformer
- [ ] Unit tests: container resolution, scope isolation, circular dependency detection
- [ ] No CF runtime dependency in tests — pure TypeScript

### 4.6 Acceptance Criteria

```typescript
// This must work:
const container = new Container();
container.register(D1_TOKEN, () => mockDb, 'SINGLETON');
container.register(UserRepository, (d1) => new UserRepository(d1), 'SINGLETON', [D1_TOKEN]);
container.register(UserService, (repo) => new UserService(repo), 'REQUEST', [UserRepository]);

const scope = container.createScope();
const service = scope.resolve(UserService);
expect(service).toBeInstanceOf(UserService);
expect(service.repo).toBeInstanceOf(UserRepository);
```

---

## 5. Phase 2 — Actor System (`@orbit/actors`)

**Goal:** Make Durable Objects feel like actors with typed messages, lifecycle
hooks, and a registry — without hiding that they're DOs.

### 5.1 Actor Base Class

```typescript
@Actor('ChatRoom')
export class ChatRoomActor extends OrbitActor<ChatRoomState> {
  initialState(): ChatRoomState {
    return { messages: [], members: new Set() };
  }

  @Handle('join')
  async onJoin(msg: JoinMessage, ctx: ActorContext): Promise<JoinResult> {
    this.updateState(s => {
      s.members.add(msg.userId);
    });
    return { memberCount: this.state.members.size };
  }

  @Handle('send')
  async onSend(msg: SendMessage, ctx: ActorContext): Promise<void> {
    const entry = { text: msg.text, userId: msg.userId, ts: Date.now() };
    this.updateState(s => {
      s.messages.push(entry);
    });
    this.broadcast('new_message', entry);
  }

  @OnAlarm()
  async cleanup(): Promise<void> {
    // Periodic state maintenance
    this.updateState(s => {
      s.messages = s.messages.slice(-100);
    });
  }
}
```

### 5.2 What `OrbitActor` Compiles To

The build step transforms `@Actor` classes into standard DO classes:

```typescript
// Generated DO class (simplified)
export class ChatRoomActor_DO implements DurableObject {
  private state: DurableObjectState;
  private actor: ChatRoomActor;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    // Hydrate actor state from DO storage
    this.actor = new ChatRoomActor();
    state.blockConcurrencyWhile(async () => {
      const saved = await state.storage.get('__state__');
      if (saved) this.actor.__hydrate__(saved);
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket upgrade
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.actor.__handleWebSocket__(request, this.state);
    }

    // Message dispatch
    const envelope = await request.json() as MessageEnvelope;
    const handler = this.actor.__handlers__.get(envelope.type);
    if (!handler) return new Response('Unknown message type', { status: 400 });

    try {
      const result = await handler.call(this.actor, envelope.payload, {
        state: this.state,
        actorId: this.state.id.toString(),
      });
      // Persist state after handler completes
      await this.state.storage.put('__state__', this.actor.__serialize__());
      return Response.json({ ok: true, data: result });
    } catch (err) {
      return Response.json({ ok: false, error: err.message }, { status: 500 });
    }
  }

  async alarm(): Promise<void> {
    await this.actor.__onAlarm__();
    await this.state.storage.put('__state__', this.actor.__serialize__());
  }
}
```

### 5.3 Actor Registry (Client-Side)

The registry is how Workers (and controllers) interact with actors:

```typescript
@Injectable()
class ChatService {
  constructor(private actors: ActorRegistry) {}

  async joinRoom(roomId: string, userId: string): Promise<JoinResult> {
    const room = this.actors.ref(ChatRoomActor, roomId);
    return room.call('join', { userId });   // typed: returns Promise<JoinResult>
  }

  async sendMessage(roomId: string, text: string, userId: string): Promise<void> {
    const room = this.actors.ref(ChatRoomActor, roomId);
    await room.cast('send', { text, userId });  // fire-and-forget
  }
}
```

**`ActorRef<T>` API:**

```typescript
interface ActorRef<T extends OrbitActor<any>> {
  // Send message and await response
  call<M extends MessageType<T>>(type: M, payload: MessagePayload<T, M>): Promise<MessageResult<T, M>>;

  // Send message, don't wait for result (still waits for 200 ACK)
  cast<M extends MessageType<T>>(type: M, payload: MessagePayload<T, M>): Promise<void>;

  // Get a WebSocket connection to this actor
  connect(request: Request): Promise<Response>;
}
```

Type safety: `MessageType<T>` is a union of all `@Handle` type strings in actor T.
`MessagePayload<T, M>` and `MessageResult<T, M>` are the corresponding input/output types.
This is derived at build time from the handler signatures.

**Under the hood:**

```typescript
class ActorRefImpl<T> implements ActorRef<T> {
  constructor(
    private stub: DurableObjectStub,
    private actorName: string,
  ) {}

  async call(type: string, payload: unknown): Promise<unknown> {
    const res = await this.stub.fetch('https://actor/message', {
      method: 'POST',
      body: JSON.stringify({ type, payload }),
    });
    const body = await res.json();
    if (!body.ok) throw new ActorError(body.error);
    return body.data;
  }

  async cast(type: string, payload: unknown): Promise<void> {
    await this.call(type, payload); // same transport, ignore result
  }
}
```

### 5.4 Actor State Management

**Default mode: Auto-persist after each handler.**

State is serialized to DO Storage after every successful handler invocation.
This is safe because DO handlers run single-threaded.

```typescript
abstract class OrbitActor<S> {
  protected state: S;

  abstract initialState(): S;

  // Immer-style update (or plain function, no library dependency)
  protected updateState(fn: (draft: S) => void): void {
    // shallow clone + apply
    const next = structuredClone(this.state);
    fn(next);
    this.state = next;
    this.__dirty__ = true;
  }

  // Direct read
  get snapshot(): Readonly<S> {
    return this.state;
  }
}
```

**Advanced: Manual persistence control.**

For actors that handle many messages per second, auto-persist on every handler
is expensive. Allow opt-out:

```typescript
@Actor('Counter', { autoPersist: false })
class CounterActor extends OrbitActor<CounterState> {
  @Handle('increment')
  async onIncrement() {
    this.updateState(s => { s.count++; });
    // State is NOT auto-persisted
  }

  @OnAlarm()
  async flush() {
    await this.persist();  // manual flush
    this.setAlarm(Date.now() + 5000);  // re-arm
  }
}
```

### 5.5 Lifecycle Hooks

```typescript
abstract class OrbitActor<S> {
  // Called once when DO is first created or wakes from hibernation
  async onActivate(ctx: ActorContext): Promise<void> {}

  // Called before DO is evicted (best-effort, not guaranteed)
  async onDeactivate(): Promise<void> {}

  // Alarm handler
  async onAlarm(): Promise<void> {}
}
```

No supervision trees. DOs don't crash-and-restart like BEAM processes.
If a handler throws:
1. The error is returned to the caller as an error response
2. State is NOT persisted (roll back to pre-handler state)
3. Optionally: error is logged with traceId for observability

This is sufficient. "Restart strategies" are YAGNI on this platform — a DO
that encounters bad state can be explicitly reset by the application.

### 5.6 Message Validation

Every handler's input is validated with a Zod schema:

```typescript
const JoinMessage = z.object({
  userId: z.string().uuid(),
});
type JoinMessage = z.infer<typeof JoinMessage>;

@Handle('join', { schema: JoinMessage })
async onJoin(msg: JoinMessage, ctx: ActorContext): Promise<JoinResult> { ... }
```

If validation fails, the actor returns a 400 without invoking the handler.
This is the "zero magic serialization" principle — all messages have explicit schemas.

### 5.7 Deliverables

- [ ] `OrbitActor` base class with state management
- [ ] `@Actor`, `@Handle`, `@OnAlarm` decorators (codegen transform)
- [ ] DO class generator (build step: @Actor class → DO export)
- [ ] `ActorRegistry`, `ActorRef<T>` with typed messages
- [ ] `wrangler.toml` DO binding auto-generation from `@Actor` metadata
- [ ] Unit tests with mock DO storage (no CF runtime needed)
- [ ] Integration tests with miniflare

### 5.8 Acceptance Criteria

```typescript
// In a controller or service:
const room = actors.ref(ChatRoomActor, 'room-42');

// Type error: 'invalid_msg' is not a valid message type for ChatRoomActor
await room.call('invalid_msg', {});

// Type error: missing 'userId' field
await room.call('join', {});

// Correct:
const result = await room.call('join', { userId: '...' });
// result is typed as JoinResult
```

---

## 6. Phase 3 — HTTP Layer (`@orbit/http`)

**Goal:** Request → Response pipeline with controllers, guards, pipes, and middleware.

### 6.1 Router

Radix trie router. API:

```typescript
const routes = router()
  .get('/users/:id', UsersController, 'show')
  .post('/users', UsersController, 'create')
  .group('/admin', r => r
    .use(AdminGuard)
    .get('/stats', AdminController, 'stats')
  )
  .ws('/rooms/:id', RoomChannel);  // WebSocket → Actor bridge
```

Implementation: compile route tree at build time into a flat lookup table
for common cases, trie for parameterized routes.

### 6.2 Controllers

```typescript
@Controller('/users')
class UsersController {
  constructor(private users: UserService) {}

  @Get('/:id')
  @UseGuard(AuthGuard)
  async show(@Param('id') id: string): Promise<Response> {
    const user = await this.users.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return Response.json(user);
  }

  @Post('/')
  @UsePipe(BodyValidator(CreateUserSchema))
  async create(@Body() dto: CreateUserDto): Promise<Response> {
    const user = await this.users.create(dto);
    return Response.json(user, { status: 201 });
  }
}
```

**Parameter decorators** (`@Param`, `@Body`, `@Query`, `@Header`) are resolved
via codegen. At build time, the transformer records which parameters are which,
and the generated handler wrapper extracts them from the request.

### 6.3 Request Pipeline

```
Request
  → Global Middleware (logging, CORS, etc.)
  → Route matching
  → Route Middleware
  → Guards (auth checks → boolean, throw to reject)
  → Pipes (input transformation/validation)
  → Controller Handler
  → Response
```

On error at any stage → Exception Filter catches and maps to HTTP response.

```typescript
// Middleware: standard (req, next) => Response pattern
type Middleware = (ctx: RequestContext, next: () => Promise<Response>) => Promise<Response>;

// Guard: return true to proceed, throw to reject
interface Guard {
  canActivate(ctx: RequestContext): boolean | Promise<boolean>;
}

// Pipe: transform input before it reaches the handler
interface Pipe<In, Out> {
  transform(input: In, ctx: RequestContext): Out | Promise<Out>;
}

// Exception Filter: catch specific errors and return HTTP responses
interface ExceptionFilter {
  catch(error: Error, ctx: RequestContext): Response;
}
```

### 6.4 RequestContext

```typescript
interface RequestContext {
  readonly request: Request;
  readonly env: Env;
  readonly params: Record<string, string>;
  readonly query: URLSearchParams;
  readonly waitUntil: (p: Promise<unknown>) => void;

  // DI
  resolve<T>(token: Token<T>): T;

  // Actor access
  readonly actors: ActorRegistry;
}
```

### 6.5 WebSocket Route → Actor Bridge

```typescript
// Route definition
.ws('/rooms/:id', RoomChannel)

// When matched, the framework:
// 1. Extracts :id from URL
// 2. Gets ActorRef for the channel's target actor
// 3. Forwards the WebSocket upgrade request to the DO
// 4. DO accepts WebSocket using Hibernation API
```

This is the bridge between HTTP and the Actor system. The Channel (Phase 4)
defines what happens after the WebSocket is established.

### 6.6 Deliverables

- [ ] Radix trie router with param extraction
- [ ] `@Controller`, `@Get/Post/Put/Delete/Patch`, `@Param/@Body/@Query/@Header`
- [ ] Middleware, Guard, Pipe, ExceptionFilter interfaces and pipeline
- [ ] `RequestContext`
- [ ] WebSocket upgrade forwarding to DO
- [ ] Unit tests: route matching, middleware chain, guard rejection
- [ ] Integration tests: full request → response with miniflare

---

## 7. Phase 4 — Channels (`@orbit/channels`)

**Goal:** Phoenix Channels — typed WebSocket communication backed by actors.

### 7.1 Channel Definition

```typescript
@Channel('room:*')
class RoomChannel extends OrbitChannel<ChatRoomActor> {
  actor = ChatRoomActor;  // Each channel is backed by one actor type

  async onJoin(topic: string, params: JoinParams, socket: Socket): Promise<boolean> {
    const roomId = topic.split(':')[1];
    socket.assign({ roomId, userId: params.userId });
    return true;  // false rejects the join
  }

  @On('new_msg')
  async onNewMsg(payload: NewMsgPayload, socket: Socket): Promise<void> {
    // Delegate to actor
    await socket.actor.cast('send', {
      text: payload.text,
      userId: socket.assigns.userId,
    });
  }

  @On('typing')
  async onTyping(_payload: unknown, socket: Socket): Promise<void> {
    socket.broadcastFrom('typing', { userId: socket.assigns.userId });
  }

  async onLeave(socket: Socket): Promise<void> {
    await socket.actor.cast('leave', { userId: socket.assigns.userId });
  }
}
```

### 7.2 Wire Protocol

JSON over WebSocket (MessagePack can be added later as an option):

```typescript
// Client → Server
interface ClientMessage {
  event: string;          // 'phx_join' | 'phx_leave' | custom event name
  topic: string;          // 'room:42'
  payload: unknown;       // event-specific data
  ref: string;            // client-generated, for reply correlation
}

// Server → Client
interface ServerMessage {
  event: string;          // 'phx_reply' | custom event name
  topic: string;
  payload: unknown;
  ref: string | null;     // matches client ref for replies, null for broadcasts
}
```

### 7.3 WebSocket Hibernation Integration

The Channel runs inside the actor's DO. When a WebSocket message arrives:

1. DO wakes from hibernation
2. Framework deserializes the message
3. Matches the `event` field to a `@On` handler in the Channel
4. Handler executes (can update actor state, broadcast, etc.)
5. DO goes back to sleep

**Key implementation detail:** The Channel and Actor share a DO instance.
The Channel is the WebSocket interface to the Actor. They are NOT separate DOs.

```typescript
// Inside the generated DO class:
async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
  const msg: ClientMessage = JSON.parse(message as string);
  const channel = this.channel;  // RoomChannel instance

  if (msg.event === 'phx_join') {
    const ok = await channel.onJoin(msg.topic, msg.payload, this.getSocket(ws));
    ws.send(JSON.stringify({
      event: 'phx_reply',
      topic: msg.topic,
      ref: msg.ref,
      payload: { status: ok ? 'ok' : 'error' },
    }));
    return;
  }

  const handler = channel.__handlers__.get(msg.event);
  if (handler) {
    await handler.call(channel, msg.payload, this.getSocket(ws));
  }
}

async webSocketClose(ws: WebSocket) {
  await this.channel.onLeave(this.getSocket(ws));
  // Clean up connection tracking
}
```

### 7.4 Socket API

```typescript
interface Socket {
  // Per-connection state (stored in WS attachment via Hibernation API)
  assigns: Record<string, unknown>;
  assign(data: Record<string, unknown>): void;

  // Send to this socket only
  send(event: string, payload: unknown): void;

  // Send to all sockets in this actor EXCEPT this one
  broadcastFrom(event: string, payload: unknown): void;

  // Reference to the backing actor
  readonly actor: ActorRef<any>;

  // Raw WebSocket (escape hatch)
  readonly raw: WebSocket;
}
```

### 7.5 Broadcasting

```typescript
// Inside an actor (not channel):
class ChatRoomActor extends OrbitActor<ChatRoomState> {
  @Handle('send')
  async onSend(msg: SendMessage) {
    // ... update state ...

    // Broadcast to all connected WebSockets in this DO
    this.broadcast('new_message', {
      text: msg.text,
      userId: msg.userId,
      ts: Date.now(),
    });
  }
}
```

`this.broadcast()` iterates over all WebSocket connections held by this DO
(via `this.ctx.getWebSockets()`) and sends a ServerMessage to each.

**Cross-actor broadcast** (e.g., global announcements) is deferred to Phase 6
(PubSub). For MVP, each actor broadcasts only to its own connections.

### 7.6 Client Library

Ship a minimal client library (`@orbit/client`) for browser/Node:

```typescript
import { OrbitSocket } from '@orbit/client';

const socket = new OrbitSocket('wss://myapp.workers.dev/ws');
await socket.connect();

const channel = socket.channel('room:42', { token: '...' });
await channel.join();

channel.on('new_message', (msg) => {
  console.log(msg);
});

channel.push('new_msg', { text: 'hello' });
```

### 7.7 Deliverables

- [ ] `OrbitChannel` base class, `@Channel`, `@On` decorators
- [ ] Wire protocol encoder/decoder
- [ ] Socket API with assigns and broadcast
- [ ] Integration with actor DO (shared DO instance)
- [ ] `@orbit/client` browser WebSocket client
- [ ] Tests: join/leave lifecycle, message routing, broadcast

---

## 8. Phase 5 — Storage Adapters (`@orbit/storage`)

**Goal:** Typed wrappers around D1, KV, R2. Ergonomic, not magical.

### 8.1 D1 — Relational Storage

Adopt Drizzle ORM. Orbit provides integration glue:

```typescript
// Schema definition (standard Drizzle)
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// Orbit integration: injectable Drizzle instance
@Injectable()
class UserRepository {
  constructor(@Inject(DRIZZLE_TOKEN) private db: DrizzleD1Database) {}

  async findById(id: string) {
    return this.db.select().from(users).where(eq(users.id, id)).get();
  }

  async create(data: NewUser) {
    return this.db.insert(users).values(data).returning().get();
  }
}
```

**Orbit's D1 module:**

```typescript
@Module({
  providers: [
    {
      provide: DRIZZLE_TOKEN,
      useFactory: (env: Env) => drizzle(env.DB),
      inject: [ENV_TOKEN],
    },
  ],
  exports: [DRIZZLE_TOKEN],
})
export class D1Module {}
```

**Migrations:** `orbit migrate` wraps `drizzle-kit` commands. No custom migration system.

### 8.2 KV — Key-Value Cache

```typescript
@Injectable()
class SessionStore {
  constructor(@Inject(KV_TOKEN) private kv: KVNamespace) {}

  async get(sessionId: string): Promise<Session | null> {
    const raw = await this.kv.get(`session:${sessionId}`, 'json');
    return raw as Session | null;
  }

  async set(sessionId: string, session: Session, ttl: number = 3600): Promise<void> {
    await this.kv.put(`session:${sessionId}`, JSON.stringify(session), {
      expirationTtl: ttl,
    });
  }

  async delete(sessionId: string): Promise<void> {
    await this.kv.delete(`session:${sessionId}`);
  }
}
```

No wrapper class needed. KV's API is already simple. Orbit just makes the
binding injectable. Users write their own typed wrappers as services.

### 8.3 R2 — Object Storage

Same approach as KV — make the binding injectable, don't abstract it:

```typescript
@Injectable()
class FileService {
  constructor(@Inject(R2_TOKEN) private bucket: R2Bucket) {}

  async upload(key: string, body: ReadableStream, contentType: string) {
    return this.bucket.put(key, body, {
      httpMetadata: { contentType },
    });
  }

  async download(key: string) {
    return this.bucket.get(key);
  }
}
```

### 8.4 Deliverables

- [ ] `D1Module` with Drizzle integration
- [ ] Token exports: `D1_TOKEN`, `KV_TOKEN`, `R2_TOKEN`, `DRIZZLE_TOKEN`
- [ ] `orbit migrate` CLI wrapper around drizzle-kit
- [ ] Example repositories demonstrating patterns
- [ ] Tests with miniflare D1/KV/R2

---

## 9. Phase 6 — Queues & PubSub (`@orbit/queues`)

**Goal:** Durable async messaging between Workers, actors, and external systems.

### 9.1 Queue Consumer

```typescript
@QueueConsumer('email-queue')
class EmailWorker {
  constructor(private mailer: MailService) {}

  async handle(message: QueueMessage<EmailJob>): Promise<void> {
    await this.mailer.send(message.body);
  }

  async handleBatch(messages: QueueMessage<EmailJob>[]): Promise<void> {
    // Optional: batch processing
    await this.mailer.sendBatch(messages.map(m => m.body));
  }
}
```

The build step generates the Worker's `queue()` export:

```typescript
async queue(batch: MessageBatch, env: Env, ctx: ExecutionContext) {
  const container = buildContainer(App, env);
  const consumer = container.resolve(EmailWorker);
  // Route to handleBatch if defined, else iterate and call handle
  ...
}
```

### 9.2 Queue Producer

```typescript
@Injectable()
class OrderService {
  constructor(@Inject(QUEUE_TOKEN('email-queue')) private emailQueue: Queue) {}

  async placeOrder(order: Order) {
    // ... save order ...
    await this.emailQueue.send({
      to: order.email,
      template: 'order_confirmation',
      data: order,
    });
  }
}
```

### 9.3 PubSub (Cross-Actor Broadcast)

For cases where you need to notify multiple actors (e.g., "user went offline"
needs to be broadcast to all chat rooms they're in):

```typescript
@Actor('PubSub')
class PubSubActor extends OrbitActor<PubSubState> {
  initialState() { return { subscriptions: new Map() }; }

  @Handle('subscribe')
  async onSubscribe(msg: { topic: string; actorName: string; actorId: string }) {
    // Store subscription
  }

  @Handle('publish')
  async onPublish(msg: { topic: string; payload: unknown }, ctx: ActorContext) {
    // Fan out to all subscribed actors via their stubs
    const subs = this.state.subscriptions.get(msg.topic) || [];
    await Promise.all(subs.map(sub =>
      ctx.actors.ref(sub.actorName, sub.actorId).cast('__pubsub__', msg)
    ));
  }
}
```

**This is a user-space pattern, not a framework primitive.** We provide the
building blocks (actors + registry), users compose them. We include this as
an example/recipe, not as `@orbit/pubsub`.

### 9.4 Deliverables

- [ ] `@QueueConsumer` decorator + build step to generate `queue()` export
- [ ] Queue binding injection (`QUEUE_TOKEN('name')`)
- [ ] Dead-letter routing documentation
- [ ] PubSub recipe/example (not a core package)
- [ ] Tests with miniflare Queues

---

## 10. Phase 7 — Observability (`@orbit/core` — built-in)

Observability is not a separate phase — it's woven into the core from day one.
But the implementation is simple.

### 10.1 Tracing

```typescript
// Automatic: every request gets a traceId
// Propagated via headers (W3C Traceparent) to DO calls, Queue messages

interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
}

// Available in RequestContext and ActorContext
ctx.trace.traceId  // '4bf92f3577b34da6a3ce929d0e0e4736'
```

Implementation: middleware at the HTTP layer generates/propagates traceId.
Actor registry includes traceId in message envelopes. Queue producer includes
traceId in message metadata.

### 10.2 Logger

```typescript
@Injectable()
class Logger {
  constructor(@Inject(TRACE_TOKEN) private trace: TraceContext) {}

  info(msg: string, data?: Record<string, unknown>) {
    console.log(JSON.stringify({
      level: 'info',
      msg,
      traceId: this.trace.traceId,
      ts: Date.now(),
      ...data,
    }));
  }

  warn(msg: string, data?: Record<string, unknown>) { ... }
  error(msg: string, data?: Record<string, unknown>) { ... }
}
```

That's it. Structured JSON to `console.log`. Cloudflare Logpush or Tail Workers
handle the drain. No custom metrics system, no OTLP exporter in MVP. Users can
add those via middleware if needed.

### 10.3 Deliverables

- [ ] TraceContext middleware (generate/propagate W3C Traceparent)
- [ ] Logger injectable with automatic traceId tagging
- [ ] TraceId propagation in actor messages and queue messages

---

## 11. Phase 8 — CLI & DX (`@orbit/cli`)

### 11.1 Commands

```bash
orbit new my-app                 # Scaffold new project
orbit dev                        # Dev server (wraps wrangler dev + build watch)
orbit build                      # Production build
orbit deploy                     # Deploy (wraps wrangler deploy)
orbit generate module chat       # Generate module boilerplate
orbit generate actor ChatRoom    # Generate actor boilerplate
orbit generate controller Users  # Generate controller boilerplate
orbit migrate generate           # Generate migration (wraps drizzle-kit)
orbit migrate run                # Run migrations (wraps wrangler d1 migrations)
```

### 11.2 Project Structure

```
my-app/
  src/
    modules/
      chat/
        chat.module.ts
        chat.actor.ts
        chat.channel.ts
        chat.controller.ts
        chat.service.ts
      users/
        users.module.ts
        users.controller.ts
        users.service.ts
        users.repository.ts
    app.module.ts
    main.ts
  migrations/
  drizzle.config.ts
  wrangler.toml
  orbit.config.ts
  package.json
  tsconfig.json
```

### 11.3 `orbit.config.ts`

```typescript
import { defineConfig } from '@orbit/cli';

export default defineConfig({
  entry: 'src/main.ts',
  // Build options
  build: {
    outDir: 'dist',
    minify: true,
  },
  // Actor bindings (can also be auto-detected from @Actor decorators)
  actors: {
    ChatRoom: { className: 'ChatRoomActor' },
  },
});
```

### 11.4 Testing Utilities (`@orbit/testing`)

```typescript
import { createTestModule, createTestApp } from '@orbit/testing';

// Unit test — no CF runtime
test('UserService.findById', async () => {
  const mod = await createTestModule(UserModule, {
    overrides: [
      { provide: DRIZZLE_TOKEN, useValue: mockDb },
    ],
  });
  const service = mod.resolve(UserService);
  const user = await service.findById('123');
  expect(user).toBeDefined();
});

// Integration test — miniflare
test('GET /users/:id', async () => {
  const app = await createTestApp(App);
  const res = await app.request('/users/123');
  expect(res.status).toBe(200);
});

// Actor test — mock DO storage
test('ChatRoomActor.join', async () => {
  const actor = await createTestActor(ChatRoomActor);
  const result = await actor.call('join', { userId: 'user-1' });
  expect(result.memberCount).toBe(1);
  expect(actor.state.members.has('user-1')).toBe(true);
});
```

### 11.5 Deliverables

- [ ] `orbit` CLI with commands listed above
- [ ] Project scaffolding templates (api, realtime, full)
- [ ] Code generators for modules, actors, controllers, channels
- [ ] `@orbit/testing` with `createTestModule`, `createTestApp`, `createTestActor`
- [ ] Dev server with watch mode

---

## 12. Implementation Order & Dependencies

### Dependency Graph

```
Phase 1: @orbit/core + @orbit/build
    ↓
    ├── Phase 2: @orbit/actors (needs core DI + build codegen)
    │       ↓
    │       └── Phase 4: @orbit/channels (needs actors)
    │
    ├── Phase 3: @orbit/http (needs core DI)
    │
    ├── Phase 5: @orbit/storage (needs core DI)
    │
    └── Phase 6: @orbit/queues (needs core DI)

Phase 7: Observability (woven into core/actors/http from start)

Phase 8: @orbit/cli + @orbit/testing (can start after Phase 1, iterates with each phase)
```

### Milestones

| #  | What                          | Phases | Depends On | Team |
|----|-------------------------------|--------|------------|------|
| M1 | Core runtime + build pipeline | 1      | —          | 2    |
| M2 | Actor system                  | 2      | M1         | 2    |
| M3 | HTTP layer                    | 3      | M1         | 2    |
| M4 | Channels + WebSocket          | 4      | M2         | 2    |
| M5 | Storage adapters              | 5      | M1         | 1    |
| M6 | Queues                        | 6      | M1         | 1    |
| M7 | CLI + testing + DX            | 8      | M1+        | 2    |
| M8 | Observability polish          | 7      | M3, M2     | 1    |

### Critical Path

```
M1 → M2 → M4 (core → actors → channels)
```

M3, M5, M6 can all start as soon as M1 is complete. M7 starts with M1 and
grows incrementally as packages are added.

### Parallelization After M1

```
        ┌── M2 (actors) ──→ M4 (channels)
M1 ─────┼── M3 (http)
        ├── M5 (storage)
        ├── M6 (queues)
        └── M7 (cli, ongoing)
```

---

## 13. What Is NOT In Scope (Yet)

These are explicitly deferred. They may become Phase 2 of the project:

| Feature                | Why deferred                                               |
|------------------------|------------------------------------------------------------|
| Event Sourcing         | Complex, most apps don't need it. Use DO Storage directly. |
| Presence (CRDT)        | Can be built as a userland actor pattern first.            |
| Transactional Outbox   | Solvable with DO Storage + Queue, no framework needed.     |
| Supervision Trees      | DOs don't crash-restart like BEAM. Not the right model.    |
| Process.monitor()      | No equivalent in CF. Use health-check alarms instead.      |
| MessagePack protocol   | JSON first. Add MsgPack as option if perf demands it.      |
| OTLP/metrics export    | console.log + Logpush is enough for MVP.                   |
| GraphQL integration    | Users can add this themselves. HTTP layer is sufficient.    |
| Auth module            | Too opinionated. Provide Guard primitives, not auth logic. |
| Rate limiting          | Provide as an example actor, not a framework feature.      |

---

## 14. Key Principles

1. **Actors are the consistency boundary.** Coordinated state lives in a DO,
   not in a service called from multiple Workers.

2. **No global Worker state.** The DI container is request-scoped. Singletons
   are cached per-isolate but must be stateless.

3. **Don't fight the platform.** Use DO cold starts, WebSocket hibernation,
   and CF routing as-is. Don't build abstractions that pretend these don't exist.

4. **Compile-time over runtime.** Module graph validation, DI metadata,
   wrangler.toml generation — all happen at build time.

5. **Typed everything.** `ActorRef<T>` knows message types. Controllers have
   typed params. Schemas are Zod, not implicit JSON.parse.

6. **Thin wrappers, not abstractions.** KV and R2 don't need wrapper classes.
   D1 uses Drizzle directly. Only add framework API where it reduces real
   boilerplate (actors, channels, DI).

7. **Escape hatches everywhere.** Every abstraction exposes the underlying CF
   primitive. `socket.raw` gives the WebSocket. `actor.ctx.state` gives
   DurableObjectState. Users are never trapped.

---

## 15. Reference Implementations

- **Phoenix Framework** — channel protocol, presence design, PubSub architecture
- **Nest.js** — module system, DI container, decorator patterns, guard/pipe/filter pipeline
- **Hono** — CF-native patterns, middleware model (study, don't adopt as dependency)
- **Drizzle ORM** — adopt directly for D1
- **Miniflare** — local testing runtime
- **PartyKit / PartyServer** — DO-native WebSocket patterns, lessons learned
- **Cloudflare Agents SDK** — official DO patterns, study their `Agent` base class
