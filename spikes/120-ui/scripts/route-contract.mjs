// Routing spike, generator side: what the template generates for an app's
// addresses today, and a proposal for declared resource and action patterns
// (#114). Both are tested against addresses that must open the app and
// addresses that must never (callback, assets, identity, other apps).
// Usage: node scripts/route-contract.mjs
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './lib.mjs';

const app = { path: '/focus/', routes: ['list'], resources: ['tasks/:id', 'tasks/:id/postpone'] };
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

// Today (packages/apps/scripts/lib/generate.mjs): static routes only, and
// the pattern ends at the path although Workbox tests pathname + search.
const today = new RegExp(`^${escape(app.path)}((${app.routes.join('|')})\\/?)?$`);

// Proposal: static routes and declared patterns, an optional query, and
// segments that cannot reach a file (no dot) or the callback.
const segment = '[A-Za-z0-9_-]+';
const pattern = (p) => p.split('/').map((part) => (part.startsWith(':') ? segment : escape(part))).join('\\/');
const alternatives = [...app.routes.map(escape), ...app.resources.map(pattern)].join('|');
const proposed = new RegExp(`^${escape(app.path)}(?:(?:${alternatives})\\/?)?(?:\\?[^#]*)?$`);
// The host rewrite for the declared patterns only (Netlify and Cloudflare
// Pages read the same _redirects syntax; static views keep their copies).
const redirects = app.resources.map((p) => `${app.path}${p} ${app.path}index.html 200`);
// returnTo: the address sign-in returns to, if the app owns it.
const returnTo = (address) => (proposed.test(address) && !address.startsWith(app.path + 'callback') ? address : app.path);

const opens = [
  '/focus/',
  '/focus/list',
  '/focus/list/',
  '/focus/list?from=menu',
  '/focus/?task=aHR0cHM6Ly9leGFtcGxlLm9yZy90YXNrcy8x',
  '/focus/tasks/aHR0cHM6Ly9leGFtcGxlLm9yZy90YXNrcy8x',
  '/focus/tasks/aHR0cHM6Ly9leGFtcGxlLm9yZy90YXNrcy8x/postpone',
  '/focus/tasks/aHR0cHM6Ly9leGFtcGxlLm9yZy90YXNrcy8x?context=https%3A%2F%2Fpod%2Fwork',
];
const never = [
  '/focus/callback?code=abc&state=def',
  '/focus/assets/index-abc123.js',
  '/focus/did.json',
  '/focus/favicon.svg',
  '/focus/tasks/abc/delete',
  '/focus/tasks/a/b/c',
  '/focus/tasks/abc.json',
  '/focus/unknown',
  '/konsum/',
  '/focus-other/',
];
const table = [...opens.map((a) => [a, true]), ...never.map((a) => [a, false])].map(([address, expected]) => ({
  address,
  expected,
  today: today.test(address),
  proposed: proposed.test(address),
}));
for (const row of table) assert.equal(row.proposed, row.expected, `proposed pattern, ${row.address}`);
const todayMisses = table.filter((r) => r.expected && !r.today).map((r) => r.address);
console.log('today misses (offline shell not served):', todayMisses);
console.log('proposed:', proposed.source);
console.log('_redirects:', redirects);
assert.equal(returnTo('/focus/tasks/abc?context=x'), '/focus/tasks/abc?context=x');
assert.equal(returnTo('/focus/callback?code=1'), '/focus/');
assert.equal(returnTo('/konsum/'), '/focus/');
writeFileSync(
  join(root, 'evidence', 'route-contract.json'),
  JSON.stringify({ app, today: today.source, proposed: proposed.source, redirects, table, todayMisses }, null, 2) + '\n',
);
console.log(`route contract: ${table.length} addresses as expected with the proposal; today misses ${todayMisses.length}`);
