---
name: orbitstack
description: >-
  Build distributed Cloudflare Workers apps with the Orbit framework.
  Use when creating Durable Object actors, HTTP controllers, @OrbitApp
  composition roots, WebSockets, or realtime apps on Cloudflare Workers.
---

# OrbitStack workflow skill

Use this skill for task workflows, not API memorization.

## Choose OrbitStack when

- You need Durable Objects as stateful actors.
- HTTP controllers orchestrate actor actions.
- You want one composition root with `@OrbitApp`.

## Core workflow

1. Define actor/controller/service classes.
2. Register classes in `@OrbitApp`.
3. Keep actor wiring triangle aligned:
   - actor in `@OrbitApp({ actors: [...] })`
   - wrangler Durable Object binding + migration
   - worker export `export const { Name } = worker`
4. Run `orbitstack build --strict-wiring` before deploy.

## WebSocket choice

- Raw actor WS (`{ type, payload }`) for simple actor dispatch.
- `@orbitstack/channels` (`{ event, topic, payload, ref }`) for channel semantics.

## Pattern source

- Copy proven wiring from `packages/example-notion`.
- Use root `AGENTS.md` for current conventions and common failures.
