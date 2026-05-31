/**
 * `orbit build` — Build the Orbit application for production.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runActorWiringPreflight, type PreflightResult } from "./preflight.js";

export function isStrictWiringEnabled(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const argEnabled =
    args.includes("--strict-wiring") || args.includes("--strict-preflight");

  const envValue = (env.ORBIT_STRICT_PREFLIGHT ?? "").trim().toLowerCase();
  const envEnabled = ["1", "true", "yes", "on"].includes(envValue);

  return argEnabled || envEnabled;
}

export function isWiringGenerationEnabled(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const argEnabled =
    args.includes("--generate-wiring") ||
    args.includes("--emit-generated-wiring");

  const envValue = (env.ORBIT_GENERATE_WIRING ?? "").trim().toLowerCase();
  const envEnabled = ["1", "true", "yes", "on"].includes(envValue);

  return argEnabled || envEnabled;
}

export function isWiringApplyEnabled(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const argEnabled =
    args.includes("--apply-generated-wiring") ||
    args.includes("--apply-wiring") ||
    args.includes("--fix-wiring");

  const envValue = (env.ORBIT_APPLY_GENERATED_WIRING ?? "")
    .trim()
    .toLowerCase();
  const envEnabled = ["1", "true", "yes", "on"].includes(envValue);

  return argEnabled || envEnabled;
}

export function getCodegenActorNames(preflight: PreflightResult): string[] {
  return [
    ...new Set(preflight.actors.map((a) => a.actorName).filter(Boolean)),
  ].sort() as string[];
}

function createAutoMigrationTag(now: Date = new Date()): string {
  const timestamp = now
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 14);
  return `orbit-auto-${timestamp}`;
}

export function applyGeneratedWorkerExports(
  source: string,
  actorNames: string[],
): { source: string; changed: boolean } {
  const uniqueActorNames = [...new Set(actorNames.filter(Boolean))].sort();
  if (uniqueActorNames.length === 0) {
    return { source, changed: false };
  }

  const exportPattern = /export\s+const\s*\{([\s\S]*?)\}\s*=\s*worker\s*;?/m;
  const exportMatch = source.match(exportPattern);

  if (!exportMatch) {
    const merged = `export const { ${uniqueActorNames.join(", ")} } = worker;`;
    const updated = `${source.replace(/\s*$/u, "")}\n\n${merged}\n`;
    return { source: updated, changed: true };
  }

  const existingMembers = exportMatch[1]
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  const existingActorNames = new Set(
    existingMembers.map((part) =>
      part.includes(":") ? part.split(":")[0].trim() : part,
    ),
  );

  const missingActorNames = uniqueActorNames.filter(
    (name) => !existingActorNames.has(name),
  );

  if (missingActorNames.length === 0) {
    return { source, changed: false };
  }

  const merged = `export const { ${[...existingMembers, ...missingActorNames].join(", ")} } = worker;`;
  return { source: source.replace(exportPattern, merged), changed: true };
}

export function applyGeneratedWranglerBindings(
  source: string,
  actorNames: string[],
  migrationTag?: string,
): { source: string; changed: boolean } {
  const uniqueActorNames = [...new Set(actorNames.filter(Boolean))].sort();
  if (uniqueActorNames.length === 0) {
    return { source, changed: false };
  }

  let updated = source;
  let changed = false;

  const existingClassNames = new Set(
    [...updated.matchAll(/class_name\s*=\s*"([^"]+)"/g)].map((m) => m[1]),
  );

  const missingBindings = uniqueActorNames.filter(
    (name) => !existingClassNames.has(name),
  );

  if (missingBindings.length > 0) {
    const bindingEntries = missingBindings.map(
      (name) => `{ name = "${name}", class_name = "${name}" }`,
    );

    const bindingsBlockPattern =
      /(\[durable_objects\]\s*\nbindings\s*=\s*\[)([\s\S]*?)(\]\s*)/m;
    const bindingsBlockMatch = updated.match(bindingsBlockPattern);

    if (bindingsBlockMatch) {
      const [fullMatch, blockOpen, blockBody, blockClose] = bindingsBlockMatch;
      const bodyWithoutTrailingSpace = blockBody.replace(/\s+$/u, "");

      const mergedBody =
        bodyWithoutTrailingSpace.trim().length === 0
          ? `\n  ${bindingEntries.join(",\n  ")}\n`
          : `${bodyWithoutTrailingSpace}${bodyWithoutTrailingSpace.trimEnd().endsWith(",") ? "" : ","}\n  ${bindingEntries.join(",\n  ")}\n`;

      updated = updated.replace(
        fullMatch,
        `${blockOpen}${mergedBody}${blockClose}`,
      );
    } else {
      const appendedBlock = `[durable_objects]\nbindings = [\n  ${bindingEntries.join(",\n  ")}\n]\n`;
      updated = `${updated.replace(/\s*$/u, "")}\n\n${appendedBlock}`;
    }

    changed = true;
  }

  const existingMigrationClasses = new Set<string>();
  for (const migrationMatch of updated.matchAll(
    /new_classes\s*=\s*\[([\s\S]*?)\]/g,
  )) {
    for (const classMatch of migrationMatch[1].matchAll(/"([^"]+)"/g)) {
      existingMigrationClasses.add(classMatch[1]);
    }
  }

  const missingMigrationClasses = uniqueActorNames.filter(
    (name) => !existingMigrationClasses.has(name),
  );

  if (missingMigrationClasses.length > 0) {
    const tag = migrationTag ?? createAutoMigrationTag();
    const migrationBlock = `[[migrations]]\ntag = "${tag}"\nnew_classes = [${missingMigrationClasses.map((name) => `"${name}"`).join(", ")}]`;
    updated = `${updated.replace(/\s*$/u, "")}\n\n${migrationBlock}\n`;
    changed = true;
  }

  return { source: updated, changed };
}

async function emitGeneratedWiringArtifacts(
  cwd: string,
  outDir: string,
  preflight: PreflightResult,
): Promise<string[]> {
  const actorNames = getCodegenActorNames(preflight);
  if (actorNames.length === 0) {
    return [];
  }

  const { generateWranglerBindings, generateStaticWorkerExports } =
    await import("@orbit/build");

  const actorMeta = actorNames.map((name) => ({
    name,
    className: name,
    handlers: [],
    hasAlarm: false,
    hasWebSocket: false,
    persistence: "auto" as const,
  }));

  const generatedDir = join(cwd, outDir);
  mkdirSync(generatedDir, { recursive: true });

  const wranglerOutPath = join(generatedDir, "orbit.generated.wrangler.toml");
  const workerExportsOutPath = join(
    generatedDir,
    "orbit.generated.worker-exports.ts",
  );

  writeFileSync(
    wranglerOutPath,
    `${generateWranglerBindings(actorMeta).trimStart()}\n`,
  );

  writeFileSync(
    workerExportsOutPath,
    `// Generated by orbit build --generate-wiring\n${generateStaticWorkerExports(actorNames)}\n`,
  );

  return [wranglerOutPath, workerExportsOutPath];
}

async function applyGeneratedWiringToSources(
  cwd: string,
  entry: string,
  preflight: PreflightResult,
): Promise<string[]> {
  const actorNames = getCodegenActorNames(preflight);
  if (actorNames.length === 0) {
    return [];
  }

  const updatedPaths: string[] = [];

  const workerPath = join(cwd, entry);
  if (existsSync(workerPath)) {
    const workerSource = readFileSync(workerPath, "utf8");
    const workerApplied = applyGeneratedWorkerExports(workerSource, actorNames);
    if (workerApplied.changed) {
      writeFileSync(workerPath, workerApplied.source);
      updatedPaths.push(workerPath);
    }
  }

  const wranglerPath = join(cwd, "wrangler.toml");
  if (existsSync(wranglerPath)) {
    const wranglerSource = readFileSync(wranglerPath, "utf8");
    const wranglerApplied = applyGeneratedWranglerBindings(
      wranglerSource,
      actorNames,
    );
    if (wranglerApplied.changed) {
      writeFileSync(wranglerPath, wranglerApplied.source);
      updatedPaths.push(wranglerPath);
    }
  }

  return updatedPaths;
}

export async function build(args: string[]): Promise<void> {
  const cwd = process.cwd();
  const strictWiring = isStrictWiringEnabled(args);
  const applyWiring = isWiringApplyEnabled(args);
  const generateWiring = isWiringGenerationEnabled(args) || applyWiring;

  // Load orbit.config.ts (simplified: just read the file and extract config)
  let config = {
    entry: "src/main.ts",
    build: {
      outDir: "dist",
      minify: false,
    },
  };

  const configPath = join(cwd, "orbit.config.ts");
  if (existsSync(configPath)) {
    // In a real implementation, we'd use jiti or tsx to load the TS config
    console.log("Using orbit.config.ts");
  }

  let preflight = runActorWiringPreflight(cwd, config.entry);

  if (applyWiring) {
    const updatedPaths = await applyGeneratedWiringToSources(
      cwd,
      config.entry,
      preflight,
    );

    if (updatedPaths.length > 0) {
      console.log("Applied generated wiring updates:");
      for (const filePath of updatedPaths) {
        console.log(`  - ${filePath}`);
      }
    } else {
      console.log("No source changes were needed for generated wiring apply.");
    }

    preflight = runActorWiringPreflight(cwd, config.entry);
  }

  if (preflight.warnings.length > 0) {
    console.warn("Orbit preflight warnings:");
    for (const warning of preflight.warnings) {
      console.warn(`  - ${warning}`);
    }

    if (strictWiring) {
      console.error(
        "Preflight failed in strict mode. Fix actor wiring warnings or run without --strict-wiring.",
      );
      process.exit(1);
    }
  }

  if (generateWiring) {
    const generated = await emitGeneratedWiringArtifacts(
      cwd,
      config.build.outDir,
      preflight,
    );
    if (generated.length > 0) {
      console.log("Generated build-time wiring artifacts:");
      for (const filePath of generated) {
        console.log(`  - ${filePath}`);
      }
    } else {
      console.log("No actor metadata found for build-time wiring generation.");
    }
  }

  console.log("Building Orbit application...");

  // Use esbuild to bundle
  const esbuild = await import("esbuild");

  try {
    await esbuild.build({
      entryPoints: [join(cwd, config.entry)],
      bundle: true,
      outfile: join(cwd, config.build.outDir, "worker.js"),
      format: "esm",
      target: "es2022",
      platform: "neutral",
      mainFields: ["module", "main"],
      conditions: ["worker", "import"],
      minify: config.build.minify,
      sourcemap: true,
      external: ["cloudflare:workers", "node:*"],
      logLevel: "info",
    });

    console.log("Build complete.");
  } catch (err: any) {
    console.error("Build failed:", err.message);
    process.exit(1);
  }
}
