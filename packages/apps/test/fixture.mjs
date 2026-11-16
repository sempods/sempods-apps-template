// Shared setup for the script tests.
import { cpSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const templateRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
);

/** A temporary repository with the starter's root manifest and no apps. */
export function tempRepository(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  cpSync(
    join(templateRoot, 'packages', 'apps', 'starter', 'package.json'),
    join(root, 'package.json'),
  );
  writeFileSync(
    join(root, 'apps.json'),
    '{\n  "schemaVersion": 2,\n  "apps": []\n}\n',
  );
  return root;
}

/**
 * Makes this tooling resolvable as @sempods/apps from `dir`, so generated
 * configuration written there can be imported. Only where a test imports
 * it: an installed tooling also changes what update and migrate see.
 */
export function linkTooling(dir) {
  mkdirSync(join(dir, 'node_modules', '@sempods'), { recursive: true });
  symlinkSync(
    join(templateRoot, 'packages', 'apps'),
    join(dir, 'node_modules', '@sempods', 'apps'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  return dir;
}
