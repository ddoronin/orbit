/**
 * `orbit new <name>` — Scaffold a new Orbit project.
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const TEMPLATES = {
  api: 'HTTP API template',
  realtime: 'Realtime channels template',
  full: 'Full-stack template',
};

export async function newProject(args: string[]): Promise<void> {
  const name = args[0];
  if (!name) {
    console.error('Usage: orbit new <project-name> [--template=api|realtime|full]');
    process.exit(1);
  }

  const templateArg = args.find(a => a.startsWith('--template='));
  const template = (templateArg?.split('=')[1] ?? 'api') as keyof typeof TEMPLATES;

  const projectDir = join(process.cwd(), name);
  if (existsSync(projectDir)) {
    console.error(`Directory "${name}" already exists.`);
    process.exit(1);
  }

  console.log(`Creating new Orbit project: ${name} (template: ${template})`);

  // Create directory structure
  const dirs = [
    '',
    'src',
    'src/modules',
    'src/modules/app',
    'migrations',
  ];

  for (const dir of dirs) {
    mkdirSync(join(projectDir, dir), { recursive: true });
  }

  // package.json
  writeFileSync(join(projectDir, 'package.json'), JSON.stringify({
    name,
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'orbit dev',
      build: 'orbit build',
      deploy: 'orbit deploy',
      test: 'vitest run',
    },
    dependencies: {
      '@orbit/core': '^0.1.0',
      '@orbit/http': '^0.1.0',
      '@orbit/actors': '^0.1.0',
      '@orbit/channels': '^0.1.0',
      '@orbit/storage': '^0.1.0',
      '@orbit/queues': '^0.1.0',
      '@orbit/build': '^0.1.0',
    },
    devDependencies: {
      '@orbit/cli': '^0.1.0',
      '@orbit/testing': '^0.1.0',
      typescript: '^5.7.0',
      vitest: '^3.0.0',
      wrangler: '^3.0.0',
      '@cloudflare/workers-types': '^4.0.0',
    },
  }, null, 2));

  // tsconfig.json
  writeFileSync(join(projectDir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'ES2022',
      moduleResolution: 'bundler',
      lib: ['ES2022'],
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      outDir: 'dist',
      rootDir: 'src',
      declaration: true,
      experimentalDecorators: true,
      types: ['@cloudflare/workers-types'],
    },
    include: ['src'],
  }, null, 2));

  // wrangler.toml
  writeFileSync(join(projectDir, 'wrangler.toml'), `name = "${name}"
main = "dist/worker.js"
compatibility_date = "2024-12-01"
compatibility_flags = ["nodejs_compat"]

# Add D1, KV, R2, Queue bindings as needed:
# [[d1_databases]]
# binding = "DB"
# database_name = "${name}-db"
# database_id = "<your-database-id>"
`);

  // orbit.config.ts
  writeFileSync(join(projectDir, 'orbit.config.ts'), `import { defineConfig } from '@orbit/cli';

export default defineConfig({
  entry: 'src/main.ts',
  build: {
    outDir: 'dist',
    minify: false,
  },
});
`);

  // Main entry
  writeFileSync(join(projectDir, 'src/main.ts'), `import { OrbitApp, createWorker, Resource, Get, Inject } from '@orbit/app';
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
`);

  // App service
  writeFileSync(join(projectDir, 'src/app.service.ts'), `import { Injectable } from '@orbit/app';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello from Orbit!';
  }
}
`);

  // Add actor example for realtime/full templates
  if (template === 'realtime' || template === 'full') {
    mkdirSync(join(projectDir, 'src/chat'), { recursive: true });

    writeFileSync(join(projectDir, 'src/chat/chat.actor.ts'), `import { Actor, Handle, OnAlarm, OrbitActor } from '@orbit/app';

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
    this.updateState(s => { s.memberCount++; });
    this.broadcast('member_joined', { userId: msg.userId, count: this.state.memberCount });
    return { memberCount: this.state.memberCount };
  }

  @Handle('send')
  async onSend(msg: { text: string; userId: string }) {
    const entry = { text: msg.text, userId: msg.userId, ts: Date.now() };
    this.updateState(s => { s.messages.push(entry); });
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
`);

    // No chat.module.ts in the new API — actors are listed in @OrbitApp.actors
  }

  // .gitignore
  writeFileSync(join(projectDir, '.gitignore'), `node_modules/
dist/
.wrangler/
.dev.vars
*.tsbuildinfo
`);

  console.log(`
Project created successfully!

  cd ${name}
  npm install
  orbit dev
`);
}
