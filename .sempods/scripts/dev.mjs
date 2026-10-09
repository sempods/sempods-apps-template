#!/usr/bin/env node
// Starts the development server of one app. Usage: pnpm run dev <id>
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readApps } from './lib/apps.mjs';
import { pnpm, scriptArgs } from './lib/pnpm.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const [id] = scriptArgs();
const manifest = readApps(root);
const app = manifest.apps.find((entry) => entry.id === id);
if (!app) {
  const known = manifest.apps.map((entry) => entry.id).join(', ') || 'none yet';
  console.error(`Usage: pnpm run dev <id>. Apps: ${known}.`);
  process.exit(2);
}
console.log(`${app.title}: http://127.0.0.1:${app.devPort}${app.path}`);
const result = pnpm(['run', 'dev'], { cwd: join(root, 'apps', app.id) });
process.exit(result.status ?? 1);
