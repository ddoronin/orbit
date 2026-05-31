# @orbitstack/cli

The `orbit` command-line tool: scaffold projects, generate boilerplate, run a dev server, build for production, manage migrations.

## Requirements

- Node.js 23.x

## Commands

```
orbitstack new <name> [--template api|realtime|full]
orbitstack dev                              # one build, then wrangler dev
orbitstack build [--strict-wiring]          # production bundle + actor wiring preflight
orbitstack build --generate-wiring          # emit generated wrangler + worker export snippets
orbitstack build --apply-generated-wiring    # merge wiring into wrangler.toml + worker entry (also emits artifacts)
orbitstack deploy                           # wrangler deploy
orbitstack generate actor <Name>
orbitstack generate controller <Name>
orbitstack generate channel <Name>
orbitstack generate service <Name>
orbitstack migrate generate                 # wraps drizzle-kit generate
orbitstack migrate run                      # wraps wrangler d1 migrations apply
```

## `orbitstack new`

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

## `orbitstack generate <type> <Name>`

Emits a single file in `src/` ready to be added to your `@OrbitApp` declaration. The generator prints a reminder of which array (`actors`, `controllers`, `providers`) to register the new class under.

## `orbitstack dev`

Runs `orbitstack build` once and then starts `wrangler dev`. Continuous rebuild/watch integration is not implemented yet.

## Build preflight checks

`orbitstack build` warns when actor wiring appears inconsistent:

- Actor registered in `@OrbitApp({ actors: [...] })` but not exported from `export const { ... } = worker`
- Actor Durable Object name missing from `wrangler.toml` `class_name = "..."`

Warnings are non-blocking and intended to catch common setup mistakes early.

Use strict mode to fail the build when warnings are present:

```bash
orbitstack build --strict-wiring
# or
ORBIT_STRICT_PREFLIGHT=1 orbitstack build
```

Optional generation mode writes build-time wiring artifacts to `dist/`:

```bash
orbitstack build --generate-wiring
# writes dist/orbit.generated.wrangler.toml
# writes dist/orbit.generated.worker-exports.ts
```

Optional apply mode merges generated wiring into source files and then runs build:

```bash
orbitstack build --apply-generated-wiring
# updates src/main.ts export const { ... } = worker
# updates wrangler.toml durable_objects bindings + migrations (if missing)

# env equivalent
ORBIT_APPLY_GENERATED_WIRING=1 orbitstack build
```

## See also

- [`@orbitstack/app`](../app) — what the scaffold imports
- [`@orbitstack/build`](../build) — the underlying build pipeline
