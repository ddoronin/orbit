# @orbitstack/http

HTTP layer: radix-trie router, controller decorators, middleware/guard/pipe pipeline, and built-in auth primitives.

## At a glance

- **Router** — `router()`, `Router.use/get/post/put/delete/patch/ws/group/handle`.
- **Controllers** — `@Controller(prefix)` or `@Resource(prefix, { guards, middleware })` (sugar combining `@Controller + @Injectable + class-level guards`).
- **Routes** — `@Get`, `@Post`, `@Put`, `@Delete`, `@Patch`.
- **Parameters** — `@Param`, `@Query`, `@Body`, `@Header`, `@Ctx`, `@Req`, `@Auth`.
- **Pipeline** — `@UseGuard`, `@UsePipe`, `@UseMiddleware`.
- **Built-ins** — `cors`, `requestLogger`, `securityHeaders`, `timing`, `bearer`.

## Defining a controller

```ts
import { Resource, Get, Post, Body, Param, Auth, bearer } from '@orbitstack/http';

@Resource('/posts', { guards: [bearer('SESSIONS')] })
export class PostsController {
  constructor(@Inject(PostService) private posts: PostService) {}

  @Get('/:id')
  show(@Param('id') id: string, @Auth() me: Session) {
    return this.posts.get(id, me.userId);
  }

  @Post('/')
  create(@Body() body: CreatePostDto, @Auth() me: Session) {
    return this.posts.create(body, me.userId);
  }
}
```

`@Resource` applies `@Controller + @Injectable` and pushes class-level guards/middleware in one decorator. Use plain `@Controller` if you want to wire guards/middleware manually.

## Pipeline

Per request:

```
middleware → guards → pipes → handler
```

- **Middleware** `(ctx, next) => Promise<Response>` — global, group, controller, or route-level.
- **Guards** `(ctx) => boolean | Promise<boolean>` — return false (or throw) to reject.
- **Pipes** `(value, ctx) => unknown` — transform input before the handler.

Errors propagate to the router; `HttpException` subclasses (`NotFoundException`, `UnauthorizedException`, …) serialize to JSON responses with the right status.

## Auth

```ts
import { bearer, authOf, Auth } from '@orbitstack/http';

@Resource('/admin', { guards: [bearer('SESSIONS')] })
class AdminController {
  @Get('/me')
  me(@Auth() session: Session) { return session; }
}
```

`bearer(store, opts?)` looks up `session:<token>` in the named KV binding (resolved through DI). On success it attaches the JSON value to `ctx.auth`; `@Auth()` injects it as a parameter. Use `authOf(ctx)` to read it manually inside middleware or guards.

## Router (manual)

```ts
import { router, cors, requestLogger } from '@orbitstack/http';

const app = router()
  .use(requestLogger())
  .use(cors())
  .get('/health', (ctx) => ctx.json({ ok: true }))
  .post('/users', (ctx) => /* … */)
  .ws('/rooms/:id', (ctx) => /* upgrade */);

return app.handle(request, container);
```

The route trie supports static (`/users`), parameter (`/users/:id`), and wildcard (`/files/*path`) segments. Use `.group(prefix, configure)` for shared middleware/guards across a subtree.

## Controller registration

Controllers register lazily — `registerControllers(router, [Ctrl], container)` adds routes that resolve the controller class through DI on every request. `createWorker` from [`@orbitstack/app`](../app) does this for every class in `@OrbitApp.controllers`.

## See also

- [`@orbitstack/app`](../app) — auto-router, `@OrbitApp({ controllers })`
- [`@orbitstack/core`](../core) — DI tokens, errors
- [`@orbitstack/channels`](../channels) — for `.ws()` routes that need typed channels
