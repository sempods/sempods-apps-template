// pnpm runs every install and package script; packageManager in the root
// package.json pins its version.
import { spawnSync } from 'node:child_process';

// pnpm defaults to a frozen lockfile in CI. The commands that add an app or
// move a dependency must update it, and a standalone copy has none.
export const INSTALL = ['install', '--no-frozen-lockfile'];

// On Windows the shell finds pnpm.cmd but joins the arguments unquoted: pass
// directories through `cwd`, never as arguments.
export function pnpm(args, options = {}) {
  return spawnSync('pnpm', args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  });
}

/** Runs a pnpm command that prints JSON; throws with its error output. */
export function pnpmJson(cwd, args) {
  const result = pnpm(args, { cwd, stdio: 'pipe', encoding: 'utf8' });
  if (result.status !== 0)
    throw new Error(`pnpm ${args.join(' ')} failed: ${result.stderr.trim()}`);
  return JSON.parse(result.stdout);
}

/** Script arguments; pnpm passes a leading `--` (npm's habit) through as is. */
export function scriptArgs(argv = process.argv.slice(2)) {
  return argv[0] === '--' ? argv.slice(1) : argv;
}
