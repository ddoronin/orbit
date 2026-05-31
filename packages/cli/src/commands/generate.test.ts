import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { generate } from "./generate.js";

const tempDirs: string[] = [];

function createTempProject(): string {
  const root = mkdtempSync(join(tmpdir(), "orbit-cli-generate-"));
  tempDirs.push(root);
  return root;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("generate", () => {
  it("uses defineActorMessages in generated actor", async () => {
    const root = createTempProject();
    const originalCwd = process.cwd();

    try {
      process.chdir(root);
      await generate(["actor", "ChatRoom"]);

      const content = readFileSync(
        join(root, "src/chat-room.actor.ts"),
        "utf8",
      );
      expect(content).toContain("defineActorMessages");
      expect(content).toContain("const CHATROOM_MESSAGES");
      expect(content).toContain("@Handle(CHATROOM_MESSAGES.EXAMPLE)");
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("includes explicit @Inject example in generated controller", async () => {
    const root = createTempProject();
    const originalCwd = process.cwd();

    try {
      process.chdir(root);
      await generate(["controller", "Users"]);

      const content = readFileSync(
        join(root, "src/users.controller.ts"),
        "utf8",
      );
      expect(content).toContain("constructor(@Inject(UsersService)");
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("includes explicit @Inject example in generated service", async () => {
    const root = createTempProject();
    const originalCwd = process.cwd();

    try {
      process.chdir(root);
      await generate(["service", "Users"]);

      const content = readFileSync(join(root, "src/users.service.ts"), "utf8");
      expect(content).toContain("constructor(@Inject(DB)");
    } finally {
      process.chdir(originalCwd);
    }
  });
});
