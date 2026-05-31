/**
 * `orbitstack new <name>` — Scaffold a new Orbit project.
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const TEMPLATES = {
  api: "HTTP API template",
  realtime: "Realtime channels template",
  full: "Full-stack template",
};

const SCAFFOLD_AGENTS_MD = `# Orbit App - Guide for Coding Agents

## Start Here

- For first-chat bootstrap, use '.github/prompts/orbitstack-agent-setup.prompt.md' or read 'agent-setup/prompt.md'.
- Import from '@orbitstack/app' only.
- Use Node.js 23.x for installs, builds, tests, and dev servers.
- Run 'orbitstack build' after actor or wrangler changes.
- Use 'orbitstack build --strict-wiring' for fail-fast preflight checks.
- Canonical full-app reference: packages/example-notion in the Orbit monorepo.

## Adding an Actor

1. Create '@Actor("Name")' with '@Handle(...)' handlers.
2. Register in '@OrbitApp({ actors: [...] })'.
3. Add wrangler Durable Object binding and '[[migrations]]' entry.
4. Export DO class from worker entry: 'export const { Name } = worker;'.

## WebSockets

- Raw actor WS: '{ type, payload }' for simple actor dispatch.
- Phoenix channels: '@orbitstack/channels' with '{ event, topic, payload, ref }'.
- Do not mix the two wire formats.

## Agent Self-Check

- Run 'orbitstack build --strict-wiring' before deploy after actor or wrangler edits.
- Use 'orbitstack generate actor|controller|service|channel <Name>' for boilerplate.

## Common Failures

- Missing '@Inject(...)' on constructor params causes provider token errors.
- Actor name / wrangler class_name / worker export mismatch breaks DO resolution.
- Missing '.js' suffix on relative TS imports causes ESM resolution failures.
`;

const SCAFFOLD_RULE_ORBIT = `---
description: Orbit app checklist for coding agents.
alwaysApply: true
---

- Import app code from '@orbitstack/app'.
- Keep registrations centralized in one '@OrbitApp({ ... })'.
- After actor/wrangler/export edits, run 'orbitstack build --strict-wiring'.
- For new files, prefer 'orbitstack generate ...' commands.
- Copy complex wiring patterns from packages/example-notion.
`;

const SCAFFOLD_RULE_WRANGLER = `---
description: Durable Object wiring rules for wrangler.toml edits.
globs:
  - wrangler.toml
---

- For each '@Actor("Name")', ensure a matching wrangler 'class_name'.
- Keep Durable Object bindings and '[[migrations]]' entries in sync.
- Use 'orbitstack build --strict-wiring' to validate wiring changes.
`;

const SCAFFOLD_RULE_ACTORS = `---
description: Actor source conventions for Orbit apps.
globs:
  - "**/*.actor.ts"
---

- Use '@Actor("Name")' with stable, explicit names.
- Define a const message map (for example, 'const ROOM_MESSAGES = defineActorMessages(...)') and reference it from '@Handle(...)'.
- Keep actor DO names aligned with worker export and wrangler class_name.
- Prefer '.js' suffix for relative imports in TS ESM source.
`;

const SCAFFOLD_AGENT_SETUP_PROMPT = `These are official instructions from OrbitStack for AI agents working in this workspace.

Complete these steps yourself before writing code:

- Read 'AGENTS.md'.
- Inspect 'src/main.ts' to find the '@OrbitApp({ ... })' composition root.
- If you need the full framework reference, load these upstream docs:
  - https://raw.githubusercontent.com/ddoronin/orbit/refs/heads/main/README.md
  - https://raw.githubusercontent.com/ddoronin/orbit/refs/heads/main/AGENTS.md
  - https://raw.githubusercontent.com/ddoronin/orbit/refs/heads/main/packages/example-notion/README.md
  - https://raw.githubusercontent.com/ddoronin/orbit/refs/heads/main/packages/app/README.md
  - https://raw.githubusercontent.com/ddoronin/orbit/refs/heads/main/packages/cli/README.md

Required working rules:

- Prefer '@orbitstack/app' for application code.
- Copy working patterns from the Orbit example app before introducing a new abstraction.
- Keep registrations centralized in one '@OrbitApp({ ... })' declaration.
- Keep actor metadata, wrangler bindings, migrations, and worker exports aligned.
- Use '.js' suffixes on relative imports in TypeScript ESM source files.
- Use raw actor WebSocket frames as '{ type, payload }' and channels frames as '{ event, topic, payload, ref }'. Do not mix them.
- Use Node.js 23.x for installs, builds, tests, and dev servers.
- Do not invent OrbitStack MCP servers.

Validation:

- Run 'orbitstack build --strict-wiring' after actor, wrangler, or worker export changes.
`;

const SCAFFOLD_WORKSPACE_PROMPT = `---
description: "Set up OrbitStack context for this workspace before coding"
name: "OrbitStack Agent Setup"
agent: "agent"
---

Follow [the local OrbitStack setup prompt](../../agent-setup/prompt.md) before writing code in this workspace.

Complete the setup yourself:

- open the linked local files or upstream docs
- load local agent rules when supported
- use Node.js 23.x for installs, builds, tests, and dev servers
- do not invent OrbitStack MCP servers
- validate actor wiring with 'orbitstack build --strict-wiring'

When done, report:

- which docs you loaded
- which local AI assets you enabled
- anything this agent could not configure automatically
`;

const SCAFFOLD_VSCODE_SETTINGS = `${JSON.stringify(
  {
    chat: {
      promptFilesRecommendations: true,
    },
  },
  null,
  2,
)}
`;

export async function newProject(args: string[]): Promise<void> {
  const name = args[0];
  if (!name) {
    console.error(
      "Usage: orbitstack new <project-name> [--template=api|realtime|full]",
    );
    process.exit(1);
  }

  const templateArg = args.find((a) => a.startsWith("--template="));
  const template = (templateArg?.split("=")[1] ??
    "api") as keyof typeof TEMPLATES;
  if (!(template in TEMPLATES)) {
    console.error(`Unknown template: ${template}`);
    console.error(`Available templates: ${Object.keys(TEMPLATES).join(", ")}`);
    process.exit(1);
  }

  const hasRealtimeActor = template === "realtime" || template === "full";

  const projectDir = join(process.cwd(), name);
  if (existsSync(projectDir)) {
    console.error(`Directory "${name}" already exists.`);
    process.exit(1);
  }

  console.log(`Creating new Orbit project: ${name} (template: ${template})`);

  // Create directory structure
  const dirs = [
    "",
    "src",
    "migrations",
    "agent-setup",
    ".github",
    ".github/prompts",
    ".vscode",
    ".cursor",
    ".cursor/rules",
  ];
  for (const dir of dirs) {
    mkdirSync(join(projectDir, dir), { recursive: true });
  }

  // package.json
  writeFileSync(
    join(projectDir, "package.json"),
    JSON.stringify(
      {
        name,
        version: "0.1.0",
        private: true,
        type: "module",
        engines: {
          node: ">=23 <24",
        },
        scripts: {
          dev: "orbitstack dev",
          build: "orbitstack build",
          deploy: "orbitstack deploy",
          test: "vitest run",
        },
        dependencies: {
          "@orbitstack/app": "^0.1.0",
        },
        devDependencies: {
          "@orbitstack/cli": "^0.1.0",
          "@orbitstack/testing": "^0.1.0",
          typescript: "^5.7.0",
          vitest: "^3.0.0",
          wrangler: "^3.0.0",
          "@cloudflare/workers-types": "^4.0.0",
        },
      },
      null,
      2,
    ),
  );

  // tsconfig.json
  writeFileSync(
    join(projectDir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "ES2022",
          moduleResolution: "bundler",
          lib: ["ES2022"],
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          forceConsistentCasingInFileNames: true,
          outDir: "dist",
          rootDir: "src",
          declaration: true,
          experimentalDecorators: true,
          types: ["@cloudflare/workers-types"],
        },
        include: ["src"],
      },
      null,
      2,
    ),
  );

  // wrangler.toml
  const wranglerToml = `name = "${name}"
main = "dist/worker.js"
compatibility_date = "2024-12-01"
compatibility_flags = ["nodejs_compat"]

${
  hasRealtimeActor
    ? `[durable_objects]
bindings = [
  { name = "ChatRoom", class_name = "ChatRoom" }
]

[[migrations]]
tag = "v1"
new_classes = ["ChatRoom"]

`
    : ""
}# Add D1, KV, R2, Queue bindings as needed:
# [[d1_databases]]
# binding = "DB"
# database_name = "${name}-db"
# database_id = "<your-database-id>"
`;
  writeFileSync(join(projectDir, "wrangler.toml"), wranglerToml);

  // orbit.config.ts
  writeFileSync(
    join(projectDir, "orbit.config.ts"),
    `import { defineConfig } from '@orbitstack/cli';

export default defineConfig({
  entry: 'src/main.ts',
  build: {
    outDir: 'dist',
    minify: false,
  },
});
`,
  );

  // App service
  writeFileSync(
    join(projectDir, "src/app.service.ts"),
    `import { Injectable } from '@orbitstack/app';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello from Orbit!';
  }
}
`,
  );

  // Add actor example for realtime/full templates
  if (hasRealtimeActor) {
    mkdirSync(join(projectDir, "src/chat"), { recursive: true });

    writeFileSync(
      join(projectDir, "src/chat/chat.actor.ts"),
      `import { Actor, Handle, OnAlarm, OrbitActor } from '@orbitstack/app';

interface ChatState {
  messages: { text: string; userId: string; ts: number }[];
  memberCount: number;
}

@Actor('ChatRoom')
export class ChatRoomActor extends OrbitActor<ChatState> {
  initialState(): ChatState {
    return { messages: [], memberCount: 0 };
  }

  @Handle('join')
  async onJoin(msg: { userId: string }) {
    this.updateState(s => {
      s.memberCount++;
    });
    this.broadcast('member_joined', { userId: msg.userId, count: this.state.memberCount });
    return { memberCount: this.state.memberCount };
  }

  @Handle('send')
  async onSend(msg: { text: string; userId: string }) {
    const entry = { text: msg.text, userId: msg.userId, ts: Date.now() };
    this.updateState(s => {
      s.messages.push(entry);
    });
    this.broadcast('new_message', entry);
  }

  @Handle('get_messages')
  async onGetMessages() {
    return this.state.messages.slice(-50);
  }

  @OnAlarm()
  async cleanup() {
    this.updateState(s => {
      s.messages = s.messages.slice(-100);
    });
  }
}
`,
    );
  }

  // Main entry
  const mainSource = hasRealtimeActor
    ? `import { OrbitApp, createWorker, Resource, Get, Inject } from '@orbitstack/app';
import { ChatRoomActor } from './chat/chat.actor.js';
import { AppService } from './app.service.js';

@Resource('/')
export class AppController {
  constructor(@Inject(AppService) private app: AppService) {}

  @Get('/')
  index() {
    return { message: this.app.getHello() };
  }
}

@OrbitApp({
  providers: [AppService],
  controllers: [AppController],
  actors: [ChatRoomActor],
})
class App {}

const worker = createWorker(App);
export default worker;
export const { ChatRoom } = worker;
`
    : `import { OrbitApp, createWorker, Resource, Get, Inject } from '@orbitstack/app';
import { AppService } from './app.service.js';

@Resource('/')
export class AppController {
  constructor(@Inject(AppService) private app: AppService) {}

  @Get('/')
  index() {
    return { message: this.app.getHello() };
  }
}

@OrbitApp({
  providers: [AppService],
  controllers: [AppController],
})
class App {}

export default createWorker(App);
`;
  writeFileSync(join(projectDir, "src/main.ts"), mainSource);

  // .gitignore
  writeFileSync(
    join(projectDir, ".gitignore"),
    `node_modules/
dist/
.wrangler/
.dev.vars
*.tsbuildinfo
`,
  );

  // .npmrc
  writeFileSync(join(projectDir, ".npmrc"), "engine-strict=true\n");

  // VS Code settings
  writeFileSync(
    join(projectDir, ".vscode/settings.json"),
    SCAFFOLD_VSCODE_SETTINGS,
  );

  // AGENTS.md
  writeFileSync(join(projectDir, "AGENTS.md"), SCAFFOLD_AGENTS_MD);

  // Agent setup prompt
  writeFileSync(
    join(projectDir, "agent-setup/prompt.md"),
    SCAFFOLD_AGENT_SETUP_PROMPT,
  );

  // Workspace prompt for prompt-aware agents
  writeFileSync(
    join(projectDir, ".github/prompts/orbitstack-agent-setup.prompt.md"),
    SCAFFOLD_WORKSPACE_PROMPT,
  );

  // Cursor rules
  writeFileSync(
    join(projectDir, ".cursor/rules/orbit.mdc"),
    SCAFFOLD_RULE_ORBIT,
  );
  writeFileSync(
    join(projectDir, ".cursor/rules/wrangler.mdc"),
    SCAFFOLD_RULE_WRANGLER,
  );
  writeFileSync(
    join(projectDir, ".cursor/rules/actors.mdc"),
    SCAFFOLD_RULE_ACTORS,
  );

  console.log(`
Project created successfully!

  cd ${name}
  npm install
  orbitstack dev
`);
}
