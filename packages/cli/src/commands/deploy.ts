/**
 * `orbit deploy` — Deploy to Cloudflare.
 * Runs build first, then delegates to wrangler deploy.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export async function deploy(args: string[]): Promise<void> {
  const cwd = process.cwd();

  if (!existsSync(join(cwd, 'wrangler.toml'))) {
    console.error('No wrangler.toml found. Are you in an Orbit project directory?');
    process.exit(1);
  }

  // Build first
  console.log('Building for production...');
  const { build } = await import('./build.js');
  await build(['--minify']);

  // Deploy
  console.log('Deploying to Cloudflare...');

  return new Promise<void>((resolve, reject) => {
    const wrangler = spawn('npx', ['wrangler', 'deploy', ...args], {
      cwd,
      stdio: 'inherit',
      shell: true,
    });

    wrangler.on('error', (err) => {
      console.error('Failed to deploy:', err.message);
      reject(err);
    });

    wrangler.on('exit', (code) => {
      if (code === 0) {
        console.log('Deploy complete!');
        resolve();
      } else {
        reject(new Error(`wrangler deploy exited with code ${code}`));
      }
    });
  });
}
