// Shared setup for the script tests.
import { cpSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const templateRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
);

// Some tests guard the template itself and skip in a copy, which may adapt the
// files they check. CI names the repository; locally, the maintainer guide
// marks the template (setup removes it from a copy and updates do not restore
// it).
export const isTemplate =
  process.env.GITHUB_REPOSITORY === 'sempods/sempods-apps-template' ||
  existsSync(join(templateRoot, 'docs', 'maintaining.md'));

/** A temporary repository with the template's tooling and no apps. */
export function tempRepository(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  cpSync(join(templateRoot, '.sempods'), join(root, '.sempods'), {
    recursive: true,
  });
  writeFileSync(
    join(root, 'apps.json'),
    '{\n  "schemaVersion": 1,\n  "apps": []\n}\n',
  );
  return root;
}
