/**
 * esbuild plugin for Orbit.
 *
 * Handles:
 * 1. Resolving @orbit/* imports
 * 2. Generating DO wrapper classes
 * 3. Bundling the worker entry point
 */

import type { Plugin, BuildOptions } from 'esbuild';
import { generateDurableObjectClass, type ActorMeta } from './codegen.js';

export interface OrbitPluginOptions {
  entry: string;
  outdir?: string;
  actors?: ActorMeta[];
  minify?: boolean;
}

export function orbitPlugin(options: OrbitPluginOptions): Plugin {
  return {
    name: 'orbit',
    setup(build) {
      // Generate DO wrapper modules on demand
      build.onResolve({ filter: /^__orbit_do_/ }, (args) => {
        return { path: args.path, namespace: 'orbit-do' };
      });

      build.onLoad({ filter: /.*/, namespace: 'orbit-do' }, (args) => {
        const className = args.path.replace('__orbit_do_', '').replace('__', '');
        const actor = options.actors?.find(a => a.className === className);
        if (!actor) {
          return { contents: '', loader: 'js' };
        }
        return {
          contents: generateDurableObjectClass(actor),
          loader: 'js',
        };
      });
    },
  };
}

export function createBuildConfig(options: OrbitPluginOptions): BuildOptions {
  return {
    entryPoints: [options.entry],
    bundle: true,
    outdir: options.outdir ?? 'dist',
    format: 'esm',
    target: 'es2022',
    platform: 'neutral',
    mainFields: ['module', 'main'],
    conditions: ['worker', 'import'],
    minify: options.minify ?? false,
    sourcemap: true,
    plugins: [orbitPlugin(options)],
    external: [
      'cloudflare:workers',
    ],
  };
}
