/**
 * `orbitstack generate <type> <name>` — Code generation.
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const GENERATORS: Record<string, (name: string, args: string[]) => void> = {
  actor: generateActor,
  controller: generateController,
  channel: generateChannel,
  service: generateService,
};

export async function generate(args: string[]): Promise<void> {
  const type = args[0];
  const name = args[1];

  if (!type || !name) {
    console.error(
      "Usage: orbitstack generate <actor|controller|channel|service> <Name>",
    );
    console.error("");
    console.error("Examples:");
    console.error("  orbitstack generate actor ChatRoom");
    console.error("  orbitstack generate controller Users");
    console.error("  orbitstack generate channel RoomChannel");
    console.error("  orbitstack generate service Auth");
    process.exit(1);
  }

  const generator = GENERATORS[type];
  if (!generator) {
    console.error(`Unknown generator: ${type}`);
    console.error(`Available: ${Object.keys(GENERATORS).join(", ")}`);
    process.exit(1);
  }

  generator(name, args.slice(2));
}

function toKebab(name: string): string {
  return name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function generateActor(name: string, _args: string[]): void {
  const kebab = toKebab(name);
  const dir = join(process.cwd(), "src");
  ensureDir(dir);

  writeFileSync(
    join(dir, `${kebab}.actor.ts`),
    `import { Actor, Handle, OrbitActor, defineActorMessages } from '@orbitstack/app';

const ${name.toUpperCase()}_MESSAGES = defineActorMessages({
  EXAMPLE: '${kebab}.example',
});

interface ${name}State {
  // Define your actor state here
}

@Actor('${name}')
export class ${name}Actor extends OrbitActor<${name}State> {
  initialState(): ${name}State {
    return {};
  }

  @Handle(${name.toUpperCase()}_MESSAGES.EXAMPLE)
  async onExample(msg: { data: string }) {
    return { received: msg.data };
  }
}
`,
  );

  console.log(`Generated actor: src/${kebab}.actor.ts`);
  console.log(
    `Don't forget to add ${name}Actor to @OrbitApp({ actors: [...] }).`,
  );
}

function generateController(name: string, _args: string[]): void {
  const kebab = toKebab(name);
  const dir = join(process.cwd(), "src");
  ensureDir(dir);

  writeFileSync(
    join(dir, `${kebab}.controller.ts`),
    `import { Resource, Get, Post, Param, Body } from '@orbitstack/app';

@Resource('/${kebab}')
export class ${name}Controller {
  // Example explicit DI pattern:
  // constructor(@Inject(${name}Service) private readonly service: ${name}Service) {}

  @Get('/')
  async list() {
    return { items: [] };
  }

  @Get('/:id')
  async show(@Param('id') id: string) {
    return { id };
  }

  @Post('/')
  async create(@Body() body: unknown) {
    return body;
  }
}
`,
  );

  console.log(`Generated controller: src/${kebab}.controller.ts`);
  console.log(
    `Don't forget to add ${name}Controller to @OrbitApp({ controllers: [...] }).`,
  );
}

function generateChannel(name: string, _args: string[]): void {
  const kebab = toKebab(name);
  const dir = join(process.cwd(), "src");
  ensureDir(dir);

  writeFileSync(
    join(dir, `${kebab}.channel.ts`),
    `import { Channel, On, OrbitChannel, type Socket } from '@orbitstack/app';

@Channel('${kebab}:*')
export class ${name}Channel extends OrbitChannel {
  async onJoin(topic: string, payload: unknown, socket: Socket): Promise<boolean> {
    return true;
  }

  @On('message')
  async onMessage(payload: unknown, socket: Socket): Promise<void> {
    socket.broadcastFrom('message', payload);
  }
}
`,
  );

  console.log(`Generated channel: src/${kebab}.channel.ts`);
}

function generateService(name: string, _args: string[]): void {
  const kebab = toKebab(name);
  const dir = join(process.cwd(), "src");
  ensureDir(dir);

  writeFileSync(
    join(dir, `${kebab}.service.ts`),
    `import { Injectable } from '@orbitstack/app';

@Injectable()
export class ${name}Service {
  // Example explicit DI pattern:
  // constructor(@Inject(DB) private readonly db: D1Database) {}

  // Add your service methods here
}
`,
  );

  console.log(`Generated service: src/${kebab}.service.ts`);
  console.log(
    `Don't forget to add ${name}Service to @OrbitApp({ providers: [...] }).`,
  );
}
