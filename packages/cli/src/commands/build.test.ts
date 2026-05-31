import { describe, expect, it } from "vitest";

import {
  applyGeneratedWorkerExports,
  applyGeneratedWranglerBindings,
  getCodegenActorNames,
  isWiringApplyEnabled,
  isStrictWiringEnabled,
  isWiringGenerationEnabled,
} from "./build.js";

describe("isStrictWiringEnabled", () => {
  it("enables strict mode with --strict-wiring arg", () => {
    expect(isStrictWiringEnabled(["--strict-wiring"], {})).toBe(true);
  });

  it("enables strict mode with ORBIT_STRICT_PREFLIGHT=true", () => {
    expect(isStrictWiringEnabled([], { ORBIT_STRICT_PREFLIGHT: "true" })).toBe(
      true,
    );
  });

  it("disables strict mode by default", () => {
    expect(isStrictWiringEnabled([], {})).toBe(false);
  });
});

describe("isWiringGenerationEnabled", () => {
  it("enables generation mode with --generate-wiring arg", () => {
    expect(isWiringGenerationEnabled(["--generate-wiring"], {})).toBe(true);
  });

  it("enables generation mode with ORBIT_GENERATE_WIRING=true", () => {
    expect(
      isWiringGenerationEnabled([], { ORBIT_GENERATE_WIRING: "true" }),
    ).toBe(true);
  });

  it("disables generation mode by default", () => {
    expect(isWiringGenerationEnabled([], {})).toBe(false);
  });
});

describe("isWiringApplyEnabled", () => {
  it("enables apply mode with --apply-generated-wiring arg", () => {
    expect(isWiringApplyEnabled(["--apply-generated-wiring"], {})).toBe(true);
  });

  it("enables apply mode with ORBIT_APPLY_GENERATED_WIRING=true", () => {
    expect(
      isWiringApplyEnabled([], { ORBIT_APPLY_GENERATED_WIRING: "true" }),
    ).toBe(true);
  });

  it("disables apply mode by default", () => {
    expect(isWiringApplyEnabled([], {})).toBe(false);
  });
});

describe("getCodegenActorNames", () => {
  it("extracts unique actor names from preflight results", () => {
    const names = getCodegenActorNames({
      warnings: [],
      actors: [
        { identifier: "RoomActor", actorName: "Room" },
        { identifier: "RoomActor", actorName: "Room" },
        { identifier: "PageActor", actorName: "Page" },
        { identifier: "Unknown" },
      ],
    });

    expect(names).toEqual(["Page", "Room"]);
  });
});

describe("applyGeneratedWorkerExports", () => {
  it("adds worker export when none exists", () => {
    const source =
      "const worker = createWorker(App);\nexport default worker;\n";
    const applied = applyGeneratedWorkerExports(source, ["Page", "Room"]);

    expect(applied.changed).toBe(true);
    expect(applied.source).toContain("export const { Page, Room } = worker;");
  });

  it("merges missing actor names into existing worker export", () => {
    const source =
      "const worker = createWorker(App);\nexport const { Page } = worker;\n";
    const applied = applyGeneratedWorkerExports(source, ["Page", "Room"]);

    expect(applied.changed).toBe(true);
    expect(applied.source).toContain("export const { Page, Room } = worker;");
  });

  it("does not change source when export already includes all actor names", () => {
    const source =
      "const worker = createWorker(App);\nexport const { Page, Room } = worker;\n";
    const applied = applyGeneratedWorkerExports(source, ["Room", "Page"]);

    expect(applied.changed).toBe(false);
    expect(applied.source).toBe(source);
  });
});

describe("applyGeneratedWranglerBindings", () => {
  it("adds missing DO bindings and migration classes", () => {
    const source = `name = "demo"\n\n[durable_objects]\nbindings = [\n  { name = "Page", class_name = "Page" }\n]\n\n[[migrations]]\ntag = "v1"\nnew_classes = ["Page"]\n`;

    const applied = applyGeneratedWranglerBindings(
      source,
      ["Page", "Room"],
      "v2",
    );

    expect(applied.changed).toBe(true);
    expect(applied.source).toContain('{ name = "Room", class_name = "Room" }');
    expect(applied.source).toContain('tag = "v2"');
    expect(applied.source).toContain('new_classes = ["Room"]');
  });

  it("does not duplicate existing binding or migration class entries", () => {
    const source = `name = "demo"\n\n[durable_objects]\nbindings = [\n  { name = "Room", class_name = "Room" }\n]\n\n[[migrations]]\ntag = "v1"\nnew_classes = ["Room"]\n`;

    const applied = applyGeneratedWranglerBindings(source, ["Room"], "v2");

    expect(applied.changed).toBe(false);
    expect(applied.source).toBe(source);
  });
});
