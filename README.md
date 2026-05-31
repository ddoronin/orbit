# Orbit

Orbit is a Cloudflare Workers framework where Durable Objects are actors, HTTP controllers orchestrate them, and `@OrbitApp` is the composition root.

## Demo

Try the live Notion-style example app: [Orbit Notion Demo](https://orbit-notion.doronindm.workers.dev/).

![Notion-style example app](notion-example.png)

## Start Here

- Build apps with `@orbit/app`.
- Use `packages/example-notion` as the canonical reference implementation.
- Keep app wiring centralized in one `@OrbitApp({ ... })` declaration.
- For tests, prefer `@orbit/testing` helpers (`createTestActor`, `createTestContainer`).

## Quick App Checklist

1. Create actor/controller/service classes.
2. Register them in `@OrbitApp({ actors, controllers, providers })`.
3. If you add an actor, also:
   - add wrangler Durable Object binding and migration
   - export DO class from worker entry (`export const { Name } = worker`)
4. Keep TypeScript ESM imports with `.js` suffix in source files.

## WebSocket Choice

- Use actor WebSockets (`{ type, payload }`) for simple actor message dispatch.
- Use `@orbit/channels` (Phoenix shape `{ event, topic, payload, ref }`) for topic/join/reply semantics.

## Package Guidance

Default rule: start with `@orbit/app` and add `@orbit/testing` for tests. Drop to lower-level packages only when your use case needs direct control.

### Package Decision Matrix

| If you are doing this                                        | Preferred package | Why                                                                                                      |
| ------------------------------------------------------------ | ----------------- | -------------------------------------------------------------------------------------------------------- |
| Building an Orbit app (actors + controllers + worker wiring) | `@orbit/app`      | Umbrella package with decorators, DI tokens, and `createWorker(App)` in one import surface.              |
| Writing tests for actors/controllers                         | `@orbit/testing`  | Purpose-built helpers like `createTestActor` and `createTestContainer` keep tests small and explicit.    |
| Implementing actor internals directly                        | `@orbit/actors`   | Direct access to `OrbitActor`, actor metadata, registry, and DO composition helpers.                     |
| Building custom HTTP router/controller behavior              | `@orbit/http`     | Router, middleware/guard/pipe pipeline, and controller decorators without app-level wrapper assumptions. |
| Using Phoenix-style channels over WebSocket                  | `@orbit/channels` | Event/topic/reply semantics for richer socket workflows than raw actor message frames.                   |
| Producing or consuming Cloudflare Queues                     | `@orbit/queues`   | Queue decorators, producer helpers, and queue handler wiring for Worker `queue()` entrypoints.           |
| Working with storage wrappers or storage token patterns      | `@orbit/storage`  | Storage-focused utilities for D1/KV/R2 integration patterns.                                             |
| Generating wrangler/worker wiring at build time              | `@orbit/build`    | Codegen for bindings and worker entry artifacts used by CLI/build flows.                                 |
| Scaffolding and validating projects from terminal commands   | `@orbit/cli`      | `orbit new`, `orbit build`, strict wiring checks, and optional generated wiring apply mode.              |
| Extending DI container or framework internals                | `@orbit/core`     | Lowest-level tokens/container/factory APIs for advanced extension work.                                  |

When unsure, copy the closest working pattern from `packages/example-notion` before adding lower-level package imports.

## AI Agents

- Repo guidance: see `AGENTS.md`.
- Cursor users: repo rules are in `.cursor/rules/`.
- Installable Orbit skill: copy `.cursor/skills/orbit/` into your project or into `~/.cursor/skills/orbit/`.
