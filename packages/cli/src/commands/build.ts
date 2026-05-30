/**
 * `orbit build` — Build the Orbit application for production.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export async function build(args: string[]): Promise<void> {
  const cwd = process.cwd();

  // Load orbit.config.ts (simplified: just read the file and extract config)
  let config = {
    entry: 'src/main.ts',
    build: {
      outDir: 'dist',
      minify: false,
    },
  };

  const configPath = join(cwd, 'orbit.config.ts');
  if (existsSync(configPath)) {
    // In a real implementation, we'd use jiti or tsx to load the TS config
    console.log('Using orbit.config.ts');
  }

  console.log('Building Orbit application...');

  // Use esbuild to bundle
  const esbuild = await import('esbuild');

  try {
    await esbuild.build({
      entryPoints: [join(cwd, config.entry)],
      bundle: true,
      outfile: join(cwd, config.build.outDir, 'worker.js'),
      format: 'esm',
      target: 'es2022',
      platform: 'neutral',
      mainFields: ['module', 'main'],
      conditions: ['worker', 'import'],
      minify: config.build.minify,
      sourcemap: true,
      external: [
        'cloudflare:workers',
        'node:*',
      ],
      logLevel: 'info',
    });

    console.log('Build complete.');
  } catch (err: any) {
    console.error('Build failed:', err.message);
    process.exit(1);
  }
}
