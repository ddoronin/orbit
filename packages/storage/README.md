# @orbit/storage

Thin injectable wrappers around Cloudflare's storage primitives: D1, KV, R2.

The wrappers exist for one reason: to give you a typed service to inject. The underlying CF bindings are simple enough that there is no abstraction layer hiding them — `service.raw` always returns the native binding.

## Bindings

Add to your `@OrbitApp`:

```ts
@OrbitApp({
  providers: [D1Service, KVService, R2Service],
  bindings: { D1: 'DB', KV: 'SESSIONS', R2: 'FILES' },
})
class App {}
```

`createWorker` wires `env.DB → D1_TOKEN`, `env.SESSIONS → KV_TOKEN`, `env.FILES → R2_TOKEN`.

For multiple bindings of the same kind, pass `{ default: 'DB', analytics: 'ANALYTICS_DB' }` — the `default` entry binds the canonical token; the others are accessible as `env:analytics`, etc.

## D1Service

```ts
import { D1Service } from '@orbit/storage';

class UserRepo {
  constructor(@Inject(D1Service) private db: D1Service) {}

  list() {
    return this.db.query<User>('SELECT * FROM users');
  }
  byId(id: string) {
    return this.db.queryFirst<User>('SELECT * FROM users WHERE id = ?', id);
  }
  insert(u: User) {
    return this.db.execute('INSERT INTO users (id, email) VALUES (?, ?)', u.id, u.email);
  }
}
```

For complex queries, inject `DRIZZLE_TOKEN` and use Drizzle ORM directly:

```ts
{ provide: DRIZZLE_TOKEN, useFactory: (db: D1Database) => drizzle(db), inject: [D1_TOKEN] }
```

## KVService

```ts
class SessionStore {
  constructor(@Inject(KVService) private kv: KVService) {}

  get(id: string) { return this.kv.get<Session>(`session:${id}`); }
  put(id: string, s: Session) { return this.kv.put(`session:${id}`, s, { expirationTtl: 3600 }); }

  cached(id: string) {
    return this.kv.getOrSet(`user:${id}`, 60, () => fetchUser(id));
  }
}
```

## R2Service

```ts
class Files {
  constructor(@Inject(R2Service) private r2: R2Service) {}

  upload(key: string, body: ReadableStream, contentType: string) {
    return this.r2.put(key, body, { httpMetadata: { contentType } });
  }
  download(key: string) { return this.r2.get(key); }
}
```

## See also

- [`@orbit/app`](../app) — `bindings` declaration
- [`@orbit/core`](../core) — `D1_TOKEN`, `KV_TOKEN`, `R2_TOKEN`
