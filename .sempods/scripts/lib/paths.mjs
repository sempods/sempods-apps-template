// The two places the tooling works with: the owner's repository, found from
// where a command runs, and the tooling's own files, found from this module.
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The tooling directory: scripts, skeleton, instructions and skills. */
export const TOOLING = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);

/** The skeleton a new app starts from. */
export const SKELETON = join(TOOLING, 'skeleton', 'app');

/**
 * The apps repository that contains `start`: the nearest directory with
 * apps.json and package.json. Throws when there is none.
 */
export function repositoryRoot(start = process.cwd()) {
  for (let dir = resolve(start); ; dir = dirname(dir)) {
    if (
      existsSync(join(dir, 'apps.json')) &&
      existsSync(join(dir, 'package.json'))
    )
      return dir;
    if (dirname(dir) === dir)
      throw new Error(
        `no apps repository here: no directory from ${resolve(start)} upward has apps.json and package.json`,
      );
  }
}
