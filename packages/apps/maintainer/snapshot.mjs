#!/usr/bin/env node
// Writes the starter snapshot into the package before it is packed
// (prepack): shared/files/ and shared/snapshot.json, from starter/. Not an
// install hook: it runs only where the package is packed.
import { join } from 'node:path';
import { TOOLING } from '../scripts/lib/paths.mjs';
import { writeSnapshot } from '../scripts/lib/shared.mjs';

const { revision, files } = writeSnapshot(
  join(TOOLING, 'starter'),
  join(TOOLING, 'shared'),
);
console.log(
  `Starter snapshot ${revision}: ${Object.keys(files).length} files.`,
);
