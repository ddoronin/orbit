# @orbit/build

Build-time helpers: codegen for app manifests and `wrangler.toml` bindings, plus an esbuild plugin.

This package is optional. `createWorker(App)` already does everything at runtime via decorator metadata — you only need `@orbit/build` if you want:

- Static DO export names (no `export const { ... } = worker` ceremony)
- Auto-generated `wrangler.toml` bindings from `@Actor` decorators
- A single-file bundled Worker for production deploys
- An `orbit dev` watcher that re-bundles on file change

## Codegen

```ts
import {
  generateWranglerBindings,
  generateDurableObjectClass,
  generateWorkerEntry,
  type AppManifest,
} from '@orbit/build';
```

- `generateWranglerBindings(manifest)` → TOML for DO classes, KV/D1/R2 namespaces, Queue producers/consumers.
- `generateDurableObjectClass(actorMeta)` → a DO class export string for one actor.
- `generateWorkerEntry(manifest)` → the Worker entry module string.

## esbuild plugin

```ts
import { orbitPlugin, createBuildConfig } from '@orbit/build';
import esbuild from 'esbuild';

await esbuild.build(createBuildConfig({
  entry: 'src/main.ts',
  outDir: 'dist',
  minify: true,
}));
```

`orbitPlugin` resolves the app graph at build time and emits the matching `wrangler.toml`.

## See also

- [`@orbit/cli`](../cli) — uses this internally for `orbit build` and `orbit dev`
- [`@orbit/app`](../app) — the runtime alternative
