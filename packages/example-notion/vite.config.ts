import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  root: "web",
  resolve: {
    alias: {
      shadcn: fileURLToPath(new URL("./web/src/shadcn", import.meta.url)),
    },
  },
  build: {
    outDir: "../public",
    emptyOutDir: true,
    target: "es2022",
  },
});
