#!/usr/bin/env node
// Writes the starter snapshot into the package before it is packed
// (prepack): shared/files/ and shared/snapshot.json, from starter/. With
// --clean (postpack) it removes them again, so the source tree never looks
// like a packed package. Not an install hook: it runs only where the package
// is packed.
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { TOOLING } from '../scripts/lib/paths.mjs';
import { writeSnapshot } from '../scripts/lib/shared.mjs';

if (process.argv.includes('--clean')) {
  rmSync(join(TOOLING, 'shared'), { recursive: true, force: true });
  process.exit(0);
}
const { revision, files } = writeSnapshot(
  join(TOOLING, 'starter'),
  join(TOOLING, 'shared'),
);
console.log(
  `Starter snapshot ${revision}: ${Object.keys(files).length} files.`,
);
