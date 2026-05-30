#!/usr/bin/env node

/**
 * Orbit CLI entry point.
 */

import { run } from './cli.js';

run(process.argv.slice(2)).catch((err: Error) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
