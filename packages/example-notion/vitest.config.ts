import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const orbitPackageAliases = [
  "actors",
  "app",
  "build",
  "channels",
  "cli",
  "client",
  "core",
  "http",
  "queues",
  "storage",
  "testing",
].map((name) => ({
  find: `@orbit/${name}`,
  replacement: fileURLToPath(
    new URL(`../${name}/src/index.ts`, import.meta.url),
  ),
}));

export default defineConfig({
  resolve: {
    alias: orbitPackageAliases,
  },
  test: {
    include: [
      "src/**/*.test.ts",
      "web/src/**/*.test.ts",
      "web/src/**/*.test.tsx",
    ],
  },
});
