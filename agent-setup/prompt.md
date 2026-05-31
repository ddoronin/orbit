These are official instructions from OrbitStack to set up a good AI development environment for building Orbit apps on Cloudflare Workers. The files and commands below are taken from the OrbitStack repository and are intended to be used as the source of truth when working in Orbit-based codebases.

Complete all of the following steps yourself by opening the files or fetching the URLs directly. Do not ask the user to summarize OrbitStack, explain the framework, or copy these files for you.

- Load the official OrbitStack docs into context before writing code.
- Install the OrbitStack skill when your agent supports project or global skills.
- Mirror the OrbitStack rules into your agent's custom-instructions system when skills are not available.
- Use Node.js 23.x for installs, builds, tests, and dev servers.
- Re-verify actor wiring with `orbitstack build --strict-wiring` after actor, wrangler, or worker export changes.

---

## Load the official OrbitStack docs

Open these files first and treat them as the authoritative OrbitStack workflow references:

- Root README: `https://raw.githubusercontent.com/ddoronin/orbit/refs/heads/main/README.md`
- Agent guide: `https://raw.githubusercontent.com/ddoronin/orbit/refs/heads/main/AGENTS.md`
- Canonical full-app example: `https://raw.githubusercontent.com/ddoronin/orbit/refs/heads/main/packages/example-notion/README.md`
- Umbrella package docs: `https://raw.githubusercontent.com/ddoronin/orbit/refs/heads/main/packages/app/README.md`
- CLI docs: `https://raw.githubusercontent.com/ddoronin/orbit/refs/heads/main/packages/cli/README.md`
- Installable skill: `https://raw.githubusercontent.com/ddoronin/orbit/refs/heads/main/.cursor/skills/orbitstack/SKILL.md`

Minimum loading order:

1. Read the root README.
2. Read `AGENTS.md`.
3. Read `packages/example-notion/README.md` before inventing new wiring patterns.
4. Read package-specific docs only after you know you need a lower-level package.

---

## Install OrbitStack guidance

OrbitStack currently publishes documentation, repo guidance, and a Cursor skill. It does not currently publish an OrbitStack MCP server suite. Do not invent OrbitStack MCP endpoints or OAuth flows.

Use the correct section for your agent below.

### Cursor

If you are already inside the Orbit repository, use the repo-local assets directly:

- Skill: `.cursor/skills/orbitstack/`
- Rules: `.cursor/rules/orbit-core.mdc`, `.cursor/rules/actors.mdc`, `.cursor/rules/wrangler.mdc`

If you want the skill available globally, copy the skill directory to `~/.cursor/skills/orbitstack/`.

Then start a new chat or reload Cursor so the skill and rules are picked up.

### GitHub Copilot, Claude Code, Codex, OpenCode, Windsurf, and other agents

If your agent supports custom instructions, paste this prompt into the agent's project or global instruction file and pin the docs above as references.

If your agent can attach multiple reference files, attach these in order:

1. `README.md`
2. `AGENTS.md`
3. `packages/example-notion/README.md`
4. `packages/app/README.md`
5. `packages/cli/README.md`

If your agent supports reusable skills but not Cursor's folder layout, mirror the guidance from `SKILL.md` and the three Cursor rules files into the agent's native instruction format rather than rewriting the framework rules from scratch.

---

## OrbitStack rules the agent must follow

Once the docs are loaded, treat the following as required working rules:

- Prefer `@orbitstack/app` for application code unless you are intentionally extending framework internals.
- Copy working patterns from `packages/example-notion` before introducing a new abstraction.
- Keep app wiring centralized in one `@OrbitApp({ ... })` composition root.
- When adding an actor, keep the wiring triangle aligned:
  - actor class has `@Actor("Name")`
  - actor is registered in `@OrbitApp({ actors: [...] })`
  - `wrangler.toml` has the matching Durable Object binding and migration entry
  - worker entry exports `export const { Name } = worker`
- Prefer `@Resource` for HTTP controllers.
- Add explicit `@Inject(...)` for constructor dependencies.
- Use `.js` suffixes on relative imports in TypeScript ESM source files.
- For simple actor WebSockets, use raw actor frames shaped as `{ type, payload }`.
- For Phoenix-style channels, use `@orbitstack/channels` frames shaped as `{ event, topic, payload, ref }`.
- Do not mix the raw actor WebSocket format and the channels wire format in one flow.
- When unsure which package to import from, start with `@orbitstack/app` and only drop lower when the package docs justify it.
- For tests, prefer `@orbitstack/testing` helpers such as `createTestActor` and `createTestContainer`.

Common failures to catch early:

- `No provider registered for token ...`: missing `@Inject(...)` on a constructor parameter.
- Durable Object not found: actor name, wrangler binding, and worker export are out of sync.
- ESM resolution failure: missing `.js` suffix on a relative TypeScript import.

---

## Preferred OrbitStack workflow

Follow this workflow unless the repository already has an established variant:

1. Start with `@orbitstack/app`.
2. Define actors, controllers, and services.
3. Register them in one `@OrbitApp` declaration.
4. Export Durable Object classes from the worker entry with:

```ts
const worker = createWorker(App);
export default worker;
export const { Name } = worker;
```

5. If you add or rename actors, update wrangler Durable Object bindings and migrations.
6. Validate the wiring with:

```bash
orbitstack build --strict-wiring
```

7. Use the CLI for scaffolding and boilerplate when available:

```bash
orbitstack new <name> [--template api|realtime|full]
orbitstack generate actor <Name>
orbitstack generate controller <Name>
orbitstack generate channel <Name>
orbitstack generate service <Name>
orbitstack dev
orbitstack build --strict-wiring
orbitstack deploy
```

---

## What to tell the user when setup is complete

Once the docs are loaded and the agent instructions or skill are in place, tell the user:

```text
+- OrbitStack Agent Setup Complete ------------------+
|  OK Docs   <urls or local files loaded>           |
|  OK Skill  <path or not supported>                |
|  OK Rules  <path or prompt installed>             |
|                                                   |
|  Run orbitstack build --strict-wiring after       |
|  actor, wrangler, or worker export changes.       |
+---------------------------------------------------+
```

If you installed or updated local agent instructions, tell the user to restart or reload the agent if their tool requires it.

---

## Resources

Use these URLs for re-verification and troubleshooting:

- Orbit README: `https://raw.githubusercontent.com/ddoronin/orbit/refs/heads/main/README.md`
- Orbit agent guide: `https://raw.githubusercontent.com/ddoronin/orbit/refs/heads/main/AGENTS.md`
- Orbit example app tutorial: `https://raw.githubusercontent.com/ddoronin/orbit/refs/heads/main/packages/example-notion/README.md`
- Orbit app package docs: `https://raw.githubusercontent.com/ddoronin/orbit/refs/heads/main/packages/app/README.md`
- Orbit CLI docs: `https://raw.githubusercontent.com/ddoronin/orbit/refs/heads/main/packages/cli/README.md`
- Orbit Cursor skill: `https://raw.githubusercontent.com/ddoronin/orbit/refs/heads/main/.cursor/skills/orbitstack/SKILL.md`

These instructions are intended to live at `agent-setup/prompt.md` in the OrbitStack repository so they can be reviewed against the current repo state at any time.
