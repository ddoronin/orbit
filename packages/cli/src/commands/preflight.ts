import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

interface ActorRegistration {
  identifier: string;
  actorName?: string;
}

export interface PreflightResult {
  warnings: string[];
  actors: ActorRegistration[];
}

function parseActorIdentifiers(mainSource: string): string[] {
  const actorsMatch = mainSource.match(/actors\s*:\s*\[([\s\S]*?)\]/m);
  if (!actorsMatch) return [];

  return [...actorsMatch[1].matchAll(/\b[A-Za-z_]\w*\b/g)].map((m) => m[0]);
}

function parseNamedImports(mainSource: string): Map<string, string> {
  const imports = new Map<string, string>();

  for (const match of mainSource.matchAll(
    /import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"]/g,
  )) {
    const members = match[1]
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    const source = match[2];

    for (const member of members) {
      const aliasMatch = member.match(/^(\w+)\s+as\s+(\w+)$/);
      const localName = aliasMatch ? aliasMatch[2] : member;
      imports.set(localName, source);
    }
  }

  return imports;
}

function parseActorDecorators(actorSource: string): Map<string, string> {
  const actors = new Map<string, string>();

  for (const match of actorSource.matchAll(
    /@Actor\(\s*['"]([^'"]+)['"]\s*\)[\s\S]*?class\s+(\w+)/g,
  )) {
    actors.set(match[2], match[1]);
  }

  return actors;
}

function resolveImportPath(
  mainPath: string,
  rawImportPath: string,
): string | null {
  if (!rawImportPath.startsWith(".")) return null;

  const base = join(dirname(mainPath), rawImportPath);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    base.replace(/\.js$/u, ".ts"),
    base.replace(/\.js$/u, ".tsx"),
    join(base, "index.ts"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return null;
}

function parseWorkerExports(mainSource: string): Set<string> {
  const exports = new Set<string>();

  for (const match of mainSource.matchAll(
    /export\s+const\s*\{([\s\S]*?)\}\s*=\s*worker/g,
  )) {
    const names = match[1]
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => (part.includes(":") ? part.split(":")[0].trim() : part));

    for (const name of names) exports.add(name);
  }

  return exports;
}

function parseWranglerClassNames(wranglerSource: string): Set<string> {
  const classNames = new Set<string>();

  for (const match of wranglerSource.matchAll(/class_name\s*=\s*"([^"]+)"/g)) {
    classNames.add(match[1]);
  }

  return classNames;
}

export function runActorWiringPreflight(
  cwd: string,
  entry: string,
): PreflightResult {
  const warnings: string[] = [];
  const actors: ActorRegistration[] = [];

  const mainPath = join(cwd, entry);
  if (!existsSync(mainPath)) {
    warnings.push(`Preflight skipped: entry file not found at ${entry}.`);
    return { warnings, actors };
  }

  const mainSource = readFileSync(mainPath, "utf8");
  const actorIdentifiers = parseActorIdentifiers(mainSource);

  if (actorIdentifiers.length === 0) {
    return { warnings, actors };
  }

  const imports = parseNamedImports(mainSource);
  const exportedDoNames = parseWorkerExports(mainSource);

  for (const identifier of actorIdentifiers) {
    const importPath = imports.get(identifier);
    if (!importPath) {
      actors.push({ identifier });
      warnings.push(
        `Actor ${identifier} is registered in @OrbitApp.actors but has no import in ${entry}.`,
      );
      continue;
    }

    const resolvedPath = resolveImportPath(mainPath, importPath);
    if (!resolvedPath || !existsSync(resolvedPath)) {
      actors.push({ identifier });
      warnings.push(
        `Actor ${identifier} import path (${importPath}) could not be resolved from ${entry}.`,
      );
      continue;
    }

    const actorSource = readFileSync(resolvedPath, "utf8");
    const actorDecoratorMap = parseActorDecorators(actorSource);
    const actorName = actorDecoratorMap.get(identifier);

    if (!actorName) {
      actors.push({ identifier });
      warnings.push(
        `Actor ${identifier} is missing @Actor('Name') metadata in ${resolvedPath}.`,
      );
      continue;
    }

    actors.push({ identifier, actorName });

    if (!exportedDoNames.has(actorName)) {
      warnings.push(
        `Actor ${identifier} maps to Durable Object ${actorName} but ${entry} is missing it in export const { ... } = worker.`,
      );
    }
  }

  const wranglerPath = join(cwd, "wrangler.toml");
  if (!existsSync(wranglerPath)) {
    warnings.push(
      "wrangler.toml not found; unable to validate Durable Object bindings.",
    );
    return { warnings, actors };
  }

  const wranglerSource = readFileSync(wranglerPath, "utf8");
  const wranglerClassNames = parseWranglerClassNames(wranglerSource);

  for (const actor of actors) {
    if (!actor.actorName) continue;
    if (!wranglerClassNames.has(actor.actorName)) {
      warnings.push(
        `Actor ${actor.identifier} maps to Durable Object ${actor.actorName} but wrangler.toml has no class_name = "${actor.actorName}" binding.`,
      );
    }
  }

  return { warnings, actors };
}
