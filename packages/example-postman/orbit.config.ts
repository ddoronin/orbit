import { defineConfig } from "@orbitstack/cli";

export default defineConfig({
  entry: "src/index.ts",
  build: {
    outDir: "dist",
    minify: false,
  },
});
