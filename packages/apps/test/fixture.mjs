// Shared setup for the script tests.
import { cpSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const templateRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
);

/** A temporary repository with the template's root manifest and no apps. */
export function tempRepository(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  cpSync(join(templateRoot, 'package.json'), join(root, 'package.json'));
  writeFileSync(
    join(root, 'apps.json'),
    '{\n  "schemaVersion": 1,\n  "apps": []\n}\n',
  );
  return root;
}
