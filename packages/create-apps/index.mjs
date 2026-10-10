#!/usr/bin/env node
// pnpm create @sempods/apps <directory>: creates a sempods apps repository
// with the starter of the @sempods/apps version this package depends on.
import { main } from '@sempods/apps/create';

try {
  main(process.argv.slice(2));
} catch (error) {
  console.error(`create-apps: ${error.message}`);
  process.exitCode = 1;
}
