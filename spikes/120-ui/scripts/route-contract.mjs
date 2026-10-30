// Routing spike, generator side: what the template generates for an app's
// addresses today, and a proposal from declared literal routes and resource
// patterns (#114). Three layers are checked on their own and together:
//
// - the host: static files first, then the generated _redirects rewrites,
//   with the placeholder semantics Netlify and Cloudflare Pages document
//   (one segment, dots included, query kept, trailing slash ignored);
// - the PWA worker's navigation allowlist (Workbox matches path and query);
// - the app's own parser (apps/routing/src/places.ts) and its sign-in return.
//
// Permitted difference: a host may hand the shell to an address the app
// does not know (a placeholder also matches "abc.json"); the app must then
// show an explicit page, never another screen.
// Usage: node scripts/route-contract.mjs
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './lib.mjs';
import { placeOf } from '../apps/routing/src/places.ts';

const app = {
  path: '/focus/',
  // Literal routes, each a static copy; tasks/new is the legacy creation path.
  routes: ['list', 'tasks/add', 'tasks/new'],
  resources: ['tasks/:id', 'tasks/:id/postpone'],
};
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

// Today (packages/apps/scripts/lib/generate.mjs): static routes only, and
// the pattern ends at the path although Workbox tests pathname + search.
const today = new RegExp(`^${escape(app.path)}((${['list'].join('|')})\\/?)?$`);

// Proposal. Validation: a literal route may share a prefix with a pattern and
// wins over it (files come first on the host, the parser checks literals
// first); the app's identifiers can never equal a literal (Focus encodes
// absolute IRIs, which always start with "aHR0c").
const segment = '[A-Za-z0-9_-]+';
const pattern = (p) => p.split('/').map((part) => (part.startsWith(':') ? segment : escape(part))).join('\\/');
const alternatives = [...app.routes.map(escape), ...app.resources.map(pattern)].join('|');
const allowlist = new RegExp(`^${escape(app.path)}(?:(?:${alternatives})\\/?)?(?:\\?[^#]*)?$`);
const redirects = app.resources.map((p) => `${app.path}${p} ${app.path}index.html 200`);

// The published files of the app (build-site): the shell, a copy per literal
// route, the callback page, the identity and assets.
const files = new Set(['', ...app.routes, 'callback', 'did.json', 'favicon.svg', 'assets/index-abc123.js'].map((f) => app.path + f));
/** What the host answers: a file, the shell through a rewrite, or 404. */
function host(address) {
  const url = new URL(address, 'https://apps.example');
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/$/, '') : url.pathname;
  if (files.has(path) || files.has(path + '/')) return 'file';
  for (const line of redirects) {
    const [from] = line.split(' ');
    const rule = new RegExp('^' + from.split('/').map((part) => (part.startsWith(':') ? '[^/]+' : escape(part))).join('\\/') + '$');
    if (rule.test(path)) return 'shell';
  }
  return '404';
}
const kind = (address) => {
  const url = new URL(address, 'https://apps.example');
  return placeOf(url.pathname, url.search).place.kind;
};
/** The app's sign-in return (places.ts returnAddress, for a given address). */
const returnTo = (address) => (address.startsWith(app.path) && !address.startsWith(app.path + 'callback') ? address : app.path);

const subject = 'aHR0cHM6Ly9leGFtcGxlLm9yZy90YXNrcy8x';
const source = encodeURIComponent('https://pod.example/_system/contexts/work');
// [address, host answer, offline shell, app place]
const cases = [
  ['/focus/', 'file', true, 'view'],
  ['/focus/list', 'file', true, 'view'],
  ['/focus/list/', 'file', true, 'view'],
  ['/focus/list?from=menu', 'file', true, 'view'],
  [`/focus/?task=${subject}`, 'file', true, 'task'],
  [`/focus/?task=${subject}&context=${source}`, 'file', true, 'task'],
  ['/focus/?task=!!!', 'file', true, 'not-found'],
  ['/focus/tasks/add', 'file', true, 'new'],
  ['/focus/tasks/new', 'file', true, 'new'],
  [`/focus/tasks/${subject}`, 'shell', true, 'task'],
  [`/focus/tasks/${subject}/`, 'shell', true, 'task'],
  [`/focus/tasks/${subject}?context=${source}`, 'shell', true, 'task'],
  [`/focus/tasks/${subject}/postpone?context=${source}`, 'shell', true, 'task'],
  // A host placeholder takes any one segment; the app shows an explicit page.
  ['/focus/tasks/abc.json', 'shell', false, 'not-found'],
  ['/focus/tasks/!!!', 'shell', false, 'not-found'],
  ['/focus/tasks/abc/delete', '404', false, 'not-found'],
  ['/focus/tasks/a/b/c', '404', false, 'not-found'],
  ['/focus/unknown', '404', false, 'not-found'],
  ['/focus/callback?code=abc&state=def', 'file', false, 'callback'],
  ['/focus/did.json', 'file', false, 'not-found'],
  ['/focus/favicon.svg', 'file', false, 'not-found'],
  ['/focus/assets/index-abc123.js', 'file', false, 'not-found'],
  ['/konsum/', '404', false, 'not-found'],
  ['/focus-other/', '404', false, 'not-found'],
];
const table = cases.map(([address, expectedHost, expectedOffline, expectedPlace]) => {
  const row = { address, host: host(address), offline: allowlist.test(address), today: today.test(address), place: kind(address), returnTo: returnTo(address) };
  assert.equal(row.host, expectedHost, `host, ${address}`);
  assert.equal(row.offline, expectedOffline, `allowlist, ${address}`);
  assert.equal(row.place, expectedPlace, `place, ${address}`);
  // Wherever the shell answers, online or offline, the app knows the address
  // or shows an explicit page; it never falls back to another screen.
  if (row.host === 'shell' || row.offline) assert.ok(['view', 'task', 'new', 'not-found'].includes(row.place));
  // Offline the worker serves the shell only for addresses the app knows.
  if (row.offline) assert.ok(row.host !== '404', `offline shell for a 404 address, ${address}`);
  // Sign-in returns only within the app, never to the callback.
  assert.ok(row.returnTo.startsWith(app.path) && !row.returnTo.startsWith(app.path + 'callback'));
  return row;
});
const todayMisses = table.filter((r) => r.offline && !r.today).map((r) => r.address);
console.log('allowlist:', allowlist.source);
console.log('_redirects:', redirects);
console.log('today misses (no offline shell):', todayMisses.length, 'of', table.filter((r) => r.offline).length);
writeFileSync(
  join(root, 'evidence', 'route-contract.json'),
  JSON.stringify({ app, today: today.source, allowlist: allowlist.source, redirects, table, todayMisses }, null, 2) + '\n',
);
console.log(`route contract: ${table.length} addresses agree across host, worker, parser and sign-in return`);
