# Orbit - Guide for Coding Agents

## Start Here

- Prefer `@orbitstack/app` for application code.
- Copy working patterns from `packages/example-notion`.
- Treat this file and the root README as source of truth for app wiring.
- For first-chat bootstrap, use `agent-setup/prompt.md` or `.github/prompts/orbitstack-agent-setup.prompt.md` when your agent supports workspace prompt files.
- Use Node.js 23.x for installs, builds, tests, and dev servers.

## Adding an Actor

1. Create an `@Actor('Name')` class with `@Handle(...)` handlers.
2. Register it in `@OrbitApp({ actors: [...] })`.
3. Add wrangler Durable Object binding and migration entry.
4. Export DO class from worker entry:

```ts
const worker = createWorker(App);
export default worker;
export const { Name } = worker;
```

## Controller and DI Rules

- Prefer `@Resource` for HTTP controllers.
- Add explicit `@Inject(...)` for constructor dependencies.
- For class providers use class tokens; for env bindings use framework tokens.

## WebSockets Decision

- Raw actor WS: use `{ type, payload }` with actor handlers.
- Phoenix channels: use `@orbitstack/channels` (`event/topic/payload/ref`).
- Do not mix the two wire formats.

## Common Failures

- `No provider registered for token ...`: missing `@Inject(...)` on constructor param.
- Durable Object not found: actor name, wrangler binding, and worker export are not aligned.
- ESM resolution failures: missing `.js` import suffix in TS source.

## Agent Self-Check

After editing actors, wrangler bindings, or worker exports, run:

```bash
orbitstack build --strict-wiring
```

## Repo Conventions

- Application imports should come from `@orbitstack/app` unless extending framework internals.
- Keep all app registrations in one `@OrbitApp` composition root.
