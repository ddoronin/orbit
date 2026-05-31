# @orbit/cli

The `orbit` command-line tool: scaffold projects, generate boilerplate, run a dev server, build for production, manage migrations.

## Requirements

- Node.js 23.x

## Commands

```
orbit new <name> [--template api|realtime|full]
orbit dev                              # one build, then wrangler dev
orbit build [--strict-wiring]          # production bundle + actor wiring preflight
orbit build --generate-wiring          # emit generated wrangler + worker export snippets
orbit build --apply-generated-wiring    # merge wiring into wrangler.toml + worker entry (also emits artifacts)
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
├── AGENTS.md
├── .cursor/
│   └── rules/
│       ├── orbit.mdc
│       ├── wrangler.mdc
│       └── actors.mdc
├── src/
│   ├── main.ts            # @OrbitApp + createWorker
│   ├── app.service.ts
│   └── … (depending on template)
├── orbit.config.ts
├── wrangler.toml
├── tsconfig.json
├── package.json
├── .gitignore
└── .npmrc
```

Templates:

| Template   | Adds                                                                         |
| ---------- | ---------------------------------------------------------------------------- |
| `api`      | Controller + service only.                                                   |
| `realtime` | Adds a `ChatRoomActor`, registers it in `@OrbitApp`, and exports `ChatRoom`. |
| `full`     | Adds D1 migrations and a sample repository.                                  |

## `orbit generate <type> <Name>`

Emits a single file in `src/` ready to be added to your `@OrbitApp` declaration. The generator prints a reminder of which array (`actors`, `controllers`, `providers`) to register the new class under.

## `orbit dev`

Runs `orbit build` once and then starts `wrangler dev`. Continuous rebuild/watch integration is not implemented yet.

## Build preflight checks

`orbit build` warns when actor wiring appears inconsistent:

- Actor registered in `@OrbitApp({ actors: [...] })` but not exported from `export const { ... } = worker`
- Actor Durable Object name missing from `wrangler.toml` `class_name = "..."`

Warnings are non-blocking and intended to catch common setup mistakes early.

Use strict mode to fail the build when warnings are present:

```bash
orbit build --strict-wiring
# or
ORBIT_STRICT_PREFLIGHT=1 orbit build
```

Optional generation mode writes build-time wiring artifacts to `dist/`:

```bash
orbit build --generate-wiring
# writes dist/orbit.generated.wrangler.toml
# writes dist/orbit.generated.worker-exports.ts
```

Optional apply mode merges generated wiring into source files and then runs build:

```bash
orbit build --apply-generated-wiring
# updates src/main.ts export const { ... } = worker
# updates wrangler.toml durable_objects bindings + migrations (if missing)

# env equivalent
ORBIT_APPLY_GENERATED_WIRING=1 orbit build
```

## See also

- [`@orbit/app`](../app) — what the scaffold imports
- [`@orbit/build`](../build) — the underlying build pipeline
