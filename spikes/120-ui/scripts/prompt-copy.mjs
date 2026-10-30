// Prepares an isolated copy of the spike for one prompt run: one variant
// app with the theme moved into the app (as in an owner repository), the
// shared harness, and a link to the vendored SDK.
// Usage: node scripts/prompt-copy.mjs <variant> <target dir>
import { cpSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { root } from './lib.mjs';

const [variant, target] = process.argv.slice(2);
const skip = (src) => !/node_modules|\/evidence|\/vendor|\/dist|\/probe/.test(src.slice(root.length));
rmSync(target, { recursive: true, force: true });
for (const part of ['package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml', 'harness', 'scripts', `apps/${variant}`])
  cpSync(join(root, part), join(target, part), { recursive: true, filter: skip });
symlinkSync(join(root, 'vendor'), join(target, 'vendor'));
// The theme belongs to the app in an owner repository.
cpSync(join(root, 'harness/src/theme.css'), join(target, `apps/${variant}/src/theme.css`));
writeFileSync(join(target, 'harness/src/theme.css'), '/* Moved into the app: src/theme.css. */\n');
const css = join(target, `apps/${variant}/src/index.css`);
writeFileSync(css, readFileSync(css, 'utf8').replace('@import "@spike/harness/theme.css";', '@import "./theme.css";'));
execFileSync('pnpm', ['install', '--offline', '--silent'], { cwd: target, stdio: 'inherit' });
console.log('ready', target);
