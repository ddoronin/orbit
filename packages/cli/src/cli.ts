/**
 * CLI command router.
 */

import { newProject } from './commands/new.js';
import { generate } from './commands/generate.js';
import { dev } from './commands/dev.js';
import { build } from './commands/build.js';
import { deploy } from './commands/deploy.js';

const HELP = `
Orbit — Cloudflare-native distributed framework

Usage:
  orbit <command> [options]

Commands:
  new <name>         Create a new Orbit project
  generate <type>    Generate a module, actor, controller, or channel
  dev                Start development server
  build              Build for production
  deploy             Deploy to Cloudflare

Options:
  --help, -h         Show help
  --version, -v      Show version

Run 'orbit <command> --help' for more information on a command.
`;

export async function run(args: string[]): Promise<void> {
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    console.log(HELP);
    return;
  }

  if (command === '--version' || command === '-v') {
    console.log('orbit 0.1.0');
    return;
  }

  const subArgs = args.slice(1);

  switch (command) {
    case 'new':
      return newProject(subArgs);
    case 'generate':
    case 'g':
      return generate(subArgs);
    case 'dev':
      return dev(subArgs);
    case 'build':
      return build(subArgs);
    case 'deploy':
      return deploy(subArgs);
    default:
      console.error(`Unknown command: ${command}`);
      console.log(HELP);
      process.exit(1);
  }
}
