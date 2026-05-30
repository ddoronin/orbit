/**
 * `orbit dev` — Start development server.
 * Wraps wrangler dev with Orbit build integration.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export async function dev(args: string[]): Promise<void> {
  const cwd = process.cwd();

  // Check for wrangler.toml
  if (!existsSync(join(cwd, 'wrangler.toml'))) {
    console.error('No wrangler.toml found. Are you in an Orbit project directory?');
    process.exit(1);
  }

  console.log('Starting Orbit dev server...');

  // First build
  const { build } = await import('./build.js');
  await build(['--watch=false']);

  // Start wrangler dev
  const wrangler = spawn('npx', ['wrangler', 'dev', ...args], {
    cwd,
    stdio: 'inherit',
    shell: true,
  });

  wrangler.on('error', (err) => {
    console.error('Failed to start wrangler:', err.message);
    process.exit(1);
  });

  wrangler.on('exit', (code) => {
    process.exit(code ?? 0);
  });

  // Handle SIGINT
  process.on('SIGINT', () => {
    wrangler.kill('SIGINT');
  });
}
