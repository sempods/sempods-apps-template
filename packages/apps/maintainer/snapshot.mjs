#!/usr/bin/env node
// Writes the shared-file snapshot into the package before it is packed
// (prepack): shared/files/ and shared/snapshot.json, from this template
// checkout. Not an install hook: it runs only where the package is packed.
import { join } from 'node:path';
import { readJson } from '../scripts/lib/json.mjs';
import { TOOLING } from '../scripts/lib/paths.mjs';
import { writeSnapshot } from '../scripts/lib/shared.mjs';

const root = join(TOOLING, '..', '..');
const policy = readJson(join(TOOLING, 'update-policy.json'));
const { revision, files } = writeSnapshot(
  root,
  policy,
  join(TOOLING, 'shared'),
);
console.log(
  `Shared-file snapshot ${revision}: ${Object.keys(files).length} files.`,
);
