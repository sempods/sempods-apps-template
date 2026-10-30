// Builds the SDK at a pinned main revision into vendor/sdk-main, for the
// second baseline (SDK=main). The packages there are not released; the
// default baseline is the published @sempods/app-sdk 0.6.0.
// Usage: node scripts/vendor-sdk-main.mjs [path to a sempods-typescript clone]
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export const SDK_MAIN = 'addf6625acfd56d1482589255348b05850b72d28';
const source =
  process.argv[2] ?? join(homedir(), 'projects/dast/sempods-typescript');
const target = join(import.meta.dirname, '..', 'vendor', 'sdk-main');
const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, stdio: 'inherit' });

rmSync(target, { recursive: true, force: true });
run('git', ['clone', '--quiet', '--no-checkout', source, target]);
run('git', ['checkout', '--quiet', SDK_MAIN], target);
run('pnpm', ['install', '--frozen-lockfile', '--ignore-scripts'], target);
run('pnpm', ['exec', 'tsc', '-b'], target);
if (!existsSync(join(target, 'packages/app-sdk/dist/react/index.js')))
  throw new Error('SDK main build missing');
console.log(`SDK main ${SDK_MAIN.slice(0, 7)} built in vendor/sdk-main`);
