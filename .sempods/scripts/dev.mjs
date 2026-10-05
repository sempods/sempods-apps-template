#!/usr/bin/env node
// Starts the development server of one app. Usage: npm run dev -- <id>
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readApps } from './lib/apps.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const id = process.argv[2];
const manifest = readApps(root);
const app = manifest.apps.find((entry) => entry.id === id);
if (!app) {
  const known = manifest.apps.map((entry) => entry.id).join(', ') || 'none yet';
  console.error(`Usage: npm run dev -- <id>. Apps: ${known}.`);
  process.exit(2);
}
console.log(`${app.title}: http://127.0.0.1:${app.devPort}${app.path}`);
const result = spawnSync(
  'npm',
  ['run', 'dev', '--workspace', `apps/${app.id}`],
  {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  },
);
process.exit(result.status ?? 1);
