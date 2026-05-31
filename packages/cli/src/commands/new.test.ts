import { existsSync, readFileSync, rmSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { newProject } from "./new.js";

const tempDirs: string[] = [];

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "orbit-cli-new-"));
  tempDirs.push(root);
  return root;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("newProject", () => {
  it("scaffolds agent setup assets for new projects", async () => {
    const root = createTempRoot();
    const originalCwd = process.cwd();

    try {
      process.chdir(root);
      await newProject(["demo-app"]);

      const projectDir = join(root, "demo-app");
      const setupPromptPath = join(projectDir, "agent-setup/prompt.md");
      const workspacePromptPath = join(
        projectDir,
        ".github/prompts/orbitstack-agent-setup.prompt.md",
      );
      const vscodeSettingsPath = join(projectDir, ".vscode/settings.json");

      expect(existsSync(setupPromptPath)).toBe(true);
      expect(existsSync(workspacePromptPath)).toBe(true);
      expect(existsSync(vscodeSettingsPath)).toBe(true);

      expect(readFileSync(setupPromptPath, "utf8")).toContain(
        "orbitstack build --strict-wiring",
      );
      expect(readFileSync(workspacePromptPath, "utf8")).toContain(
        "../../agent-setup/prompt.md",
      );
      expect(readFileSync(vscodeSettingsPath, "utf8")).toContain(
        '"promptFilesRecommendations": true',
      );
      expect(readFileSync(join(projectDir, "AGENTS.md"), "utf8")).toContain(
        ".github/prompts/orbitstack-agent-setup.prompt.md",
      );
    } finally {
      process.chdir(originalCwd);
    }
  });
});
