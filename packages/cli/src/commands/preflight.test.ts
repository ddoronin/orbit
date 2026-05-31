import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { runActorWiringPreflight } from "./preflight.js";

const tempDirs: string[] = [];

function createProject(): string {
  const root = mkdtempSync(join(tmpdir(), "orbit-cli-preflight-"));
  tempDirs.push(root);
  mkdirSync(join(root, "src/chat"), { recursive: true });
  return root;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("runActorWiringPreflight", () => {
  it("returns no warnings for correctly wired actor", () => {
    const root = createProject();

    writeFileSync(
      join(root, "src/main.ts"),
      `import { OrbitApp, createWorker } from '@orbitstack/app';
import { ChatRoomActor } from './chat/chat.actor.js';

@OrbitApp({ actors: [ChatRoomActor] })
class App {}

const worker = createWorker(App);
export default worker;
export const { ChatRoom } = worker;
`,
    );

    writeFileSync(
      join(root, "src/chat/chat.actor.ts"),
      `import { Actor, OrbitActor } from '@orbitstack/app';

@Actor('ChatRoom')
export class ChatRoomActor extends OrbitActor<any> {}
`,
    );

    writeFileSync(
      join(root, "wrangler.toml"),
      `[durable_objects]
bindings = [
  { name = "ChatRoom", class_name = "ChatRoom" }
]
`,
    );

    const result = runActorWiringPreflight(root, "src/main.ts");
    expect(result.warnings).toEqual([]);
  });

  it("warns when worker export and wrangler binding are missing", () => {
    const root = createProject();

    writeFileSync(
      join(root, "src/main.ts"),
      `import { OrbitApp, createWorker } from '@orbitstack/app';
import { ChatRoomActor } from './chat/chat.actor.js';

@OrbitApp({ actors: [ChatRoomActor] })
class App {}

export default createWorker(App);
`,
    );

    writeFileSync(
      join(root, "src/chat/chat.actor.ts"),
      `import { Actor, OrbitActor } from '@orbitstack/app';

@Actor('ChatRoom')
export class ChatRoomActor extends OrbitActor<any> {}
`,
    );

    writeFileSync(join(root, "wrangler.toml"), 'name = "test"\n');

    const result = runActorWiringPreflight(root, "src/main.ts");

    expect(
      result.warnings.some((warning) =>
        warning.includes("missing it in export const { ... } = worker"),
      ),
    ).toBe(true);
    expect(
      result.warnings.some((warning) =>
        warning.includes('wrangler.toml has no class_name = "ChatRoom"'),
      ),
    ).toBe(true);
  });
});
