// Routing authoring test: one table over the runs (authoring-check.mjs and
// the routing matrix of each run), written to evidence/authoring/summary.json.
// Usage: node scripts/authoring-summary.mjs run-own-1 run-own-2 ...
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './lib.mjs';

const dir = join(root, 'evidence', 'authoring');
const rows = process.argv.slice(2).map((label) => {
  const check = JSON.parse(readFileSync(join(dir, `${label}.json`), 'utf8'));
  const matrix = JSON.parse(readFileSync(join(dir, `${label}-matrix.json`), 'utf8'));
  const by = (prefix) => check.behaviour.filter((b) => b.id.startsWith(prefix));
  const count = (list) => `${list.filter((b) => b.pass).length}/${list.length}`;
  return {
    label,
    notes: count(by('notes-')),
    settings: count(by('settings-')),
    next: count(by('next-')),
    declared: Object.entries(check.declaration).filter(([, v]) => !v.pass).map(([k]) => k).join(', ') || 'all',
    matrix: `${matrix.results.filter((r) => r.pass).length}/${matrix.results.filter((r) => r.pass !== null).length}`,
    nextBack: check.behaviour.find((b) => b.id === 'next-clean')?.backToPrevious ? 'previous task' : 'leaves',
    bypass: check.bypass.length,
    routerChanged: check.routerChanged,
    diffLines: check.diffLines,
    failed: check.behaviour.filter((b) => !b.pass).map((b) => b.id).concat(matrix.results.filter((r) => r.pass === false).map((r) => 'matrix:' + r.id)),
  };
});
console.table(rows.map(({ failed, ...row }) => row));
for (const row of rows) if (row.failed.length) console.log(row.label, 'failed:', row.failed.join(', '));
writeFileSync(join(dir, 'summary.json'), JSON.stringify(rows, null, 2) + '\n');
