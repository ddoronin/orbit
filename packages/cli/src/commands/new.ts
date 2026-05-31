/**
 * `orbit new <name>` — Scaffold a new Orbit project.
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

- Import from '@orbit/app' only.
- Run 'orbit build' after actor or wrangler changes.
- Use 'orbit build --strict-wiring' for fail-fast preflight checks.
- Canonical full-app reference: packages/example-notion in the Orbit monorepo.

## Adding an Actor

1. Create '@Actor("Name")' with '@Handle(...)' handlers.
2. Register in '@OrbitApp({ actors: [...] })'.
3. Add wrangler Durable Object binding and '[[migrations]]' entry.
4. Export DO class from worker entry: 'export const { Name } = worker;'.

## WebSockets

- Raw actor WS: '{ type, payload }' for simple actor dispatch.
- Phoenix channels: '@orbit/channels' with '{ event, topic, payload, ref }'.
- Do not mix the two wire formats.

## Agent Self-Check

- Run 'orbit build --strict-wiring' before deploy after actor or wrangler edits.
- Use 'orbit generate actor|controller|service|channel <Name>' for boilerplate.

## Common Failures

- Missing '@Inject(...)' on constructor params causes provider token errors.
- Actor name / wrangler class_name / worker export mismatch breaks DO resolution.
- Missing '.js' suffix on relative TS imports causes ESM resolution failures.
`;

const SCAFFOLD_RULE_ORBIT = `---
description: Orbit app checklist for coding agents.
alwaysApply: true
---

- Import app code from '@orbit/app'.
- Keep registrations centralized in one '@OrbitApp({ ... })'.
- After actor/wrangler/export edits, run 'orbit build --strict-wiring'.
- For new files, prefer 'orbit generate ...' commands.
- Copy complex wiring patterns from packages/example-notion.
`;

const SCAFFOLD_RULE_WRANGLER = `---
description: Durable Object wiring rules for wrangler.toml edits.
globs:
  - wrangler.toml
---

- For each '@Actor("Name")', ensure a matching wrangler 'class_name'.
- Keep Durable Object bindings and '[[migrations]]' entries in sync.
- Use 'orbit build --strict-wiring' to validate wiring changes.
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

export async function newProject(args: string[]): Promise<void> {
  const name = args[0];
  if (!name) {
    console.error(
      "Usage: orbit new <project-name> [--template=api|realtime|full]",
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
  const dirs = ["", "src", "migrations", ".cursor", ".cursor/rules"];
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
          dev: "orbit dev",
          build: "orbit build",
          deploy: "orbit deploy",
          test: "vitest run",
        },
        dependencies: {
          "@orbit/app": "^0.1.0",
        },
        devDependencies: {
          "@orbit/cli": "^0.1.0",
          "@orbit/testing": "^0.1.0",
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
    `import { defineConfig } from '@orbit/cli';

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
    `import { Injectable } from '@orbit/app';

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
      `import { Actor, Handle, OnAlarm, OrbitActor } from '@orbit/app';

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
    ? `import { OrbitApp, createWorker, Resource, Get, Inject } from '@orbit/app';
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
    : `import { OrbitApp, createWorker, Resource, Get, Inject } from '@orbit/app';
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

  // AGENTS.md
  writeFileSync(join(projectDir, "AGENTS.md"), SCAFFOLD_AGENTS_MD);

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
  orbit dev
`);
}
