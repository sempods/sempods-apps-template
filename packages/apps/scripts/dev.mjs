#!/usr/bin/env node
// Starts the development server of one app; without an ID, lists every app
// with its development address. Usage: pnpm run dev [<id>]
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readApps } from './lib/apps.mjs';
import { describedApp } from './lib/describe.mjs';
import { repositoryRoot } from './lib/paths.mjs';
import { pnpm, scriptArgs } from './lib/pnpm.mjs';

/** The development address of a described app. */
const devAddress = (app) => `http://127.0.0.1:${app.devPort}${app.path}`;

/** Every app with its name and development address, and how to start one. */
export function appListing(root) {
  const { apps } = readApps(root);
  if (apps.length === 0)
    return 'There are no apps yet. Create one with pnpm run new-app <id>.';
  const described = apps.map((entry) => describedApp(root, entry));
  const width = Math.max(...described.map((app) => app.id.length));
  const lines = described.map(
    (app) => `  ${app.id.padEnd(width)}  ${app.title}  ${devAddress(app)}`,
  );
  return `Apps:\n${lines.join('\n')}\n\nStart one with pnpm run dev <id>, for example pnpm run dev ${described[0].id}.`;
}

function main() {
  const root = repositoryRoot();
  const [id] = scriptArgs();
  if (id === undefined) {
    console.log(appListing(root));
    return;
  }
  const entry = readApps(root).apps.find((candidate) => candidate.id === id);
  if (!entry) {
    console.error(`There is no app ${id}.\n\n${appListing(root)}`);
    process.exitCode = 2;
    return;
  }
  const app = describedApp(root, entry);
  console.log(`${app.title}: ${devAddress(app)}`);
  const result = pnpm(['run', 'dev'], { cwd: join(root, 'apps', app.id) });
  process.exitCode = result.status ?? 1;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main();
