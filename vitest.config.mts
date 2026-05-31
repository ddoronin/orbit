import { defineConfig } from "vitest/config";
import { webcrypto } from "node:crypto";
import { fileURLToPath } from "node:url";

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto as Crypto;
}

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
    new URL(`./packages/${name}/src/index.ts`, import.meta.url),
  ),
}));

export default defineConfig({
  resolve: {
    alias: orbitPackageAliases,
  },
  test: {
    include: ["packages/*/src/**/*.test.ts", "src/**/*.test.ts"],
  },
});
