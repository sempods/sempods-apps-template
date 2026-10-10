#!/usr/bin/env node
// The sempods-apps command. It runs one tooling command in the apps
// repository it is started in: sempods-apps <command> [arguments]
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const COMMANDS = {
  'new-app': 'create apps/<id> and add it to apps.json',
  dev: 'start the development server of one app',
  regenerate: "rewrite every app's generated configuration from apps.json",
  'configure-site': 'record where the apps are published',
  'build-site': 'build all apps and the overview into site-dist/',
  check: "check the repository's apps",
  'sdk-update': 'move all apps to one SDK release',
  'update-template': 'apply a newer template release',
};

const [command, ...args] = process.argv.slice(2);
if (!Object.hasOwn(COMMANDS, command ?? '')) {
  console.error('Usage: sempods-apps <command> [arguments]\n');
  for (const [name, summary] of Object.entries(COMMANDS))
    console.error(`  ${name.padEnd(16)}${summary}`);
  process.exit(command ? 2 : 0);
}
const script = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'scripts',
  `${command}.mjs`,
);
// Each command runs its own main when it is the started script, as it does
// when run directly with node.
process.argv = [process.argv[0], script, ...args];
await import(pathToFileURL(script).href);
