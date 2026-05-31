import { defineConfig } from "vitest/config";
import { webcrypto } from "node:crypto";

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto as Crypto;
}

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "src/**/*.test.ts"],
  },
});
