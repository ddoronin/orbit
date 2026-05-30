# @orbit/cli

The `orbit` command-line tool: scaffold projects, generate boilerplate, run a dev server, build for production, manage migrations.

## Commands

```
orbit new <name> [--template basic|realtime|full]
orbit dev                              # wrangler dev + orbit build --watch
orbit build                            # production bundle
orbit deploy                           # wrangler deploy
orbit generate actor <Name>
orbit generate controller <Name>
orbit generate channel <Name>
orbit generate service <Name>
orbit migrate generate                 # wraps drizzle-kit generate
orbit migrate run                      # wraps wrangler d1 migrations apply
```

## `orbit new`

Scaffolds a project directory with:

```
my-app/
├── src/
│   ├── main.ts            # @OrbitApp + createWorker
│   ├── app.service.ts
│   └── … (depending on template)
├── orbit.config.ts
├── wrangler.toml
├── tsconfig.json
├── package.json
└── .gitignore
```

Templates:

| Template   | Adds                                                         |
|------------|--------------------------------------------------------------|
| `basic`    | Controller + service only.                                   |
| `realtime` | Adds a `ChatRoomActor` with broadcast.                       |
| `full`     | Adds D1 migrations and a sample repository.                  |

## `orbit generate <type> <Name>`

Emits a single file in `src/` ready to be added to your `@OrbitApp` declaration. The generator prints a reminder of which array (`actors`, `controllers`, `providers`) to register the new class under.

## `orbit dev`

Wraps `wrangler dev` with a watcher that rebuilds via `@orbit/build` on every source change. Source maps are emitted; the bundled worker hot-reloads.

## See also

- [`@orbit/app`](../app) — what the scaffold imports
- [`@orbit/build`](../build) — the underlying build pipeline
