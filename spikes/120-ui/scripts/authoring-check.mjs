// Routing authoring test: checks what an assistant built from AUTHORING.md
// and three owner requests (Notes screen, Settings page, Next task) in a copy
// of an authoring base (apps/authoring-own or apps/authoring-rr).
//
// - Declaration: the app's routes.json makes the host and the offline app
//   answer the new addresses (the generator rules of route-contract.mjs).
// - Behaviour: each request in the browser, against the fake Pod.
// - Guard bypass: history or location calls outside the provided router, and
//   whether the provided router was changed.
// The routing matrix (routing-gate.mjs --app) checks regressions separately.
// Usage: node scripts/authoring-check.mjs --app=<folder> --base=<base folder> --label=<name>
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { root, startApp } from './lib.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const app = resolve(args.app);
const base = resolve(args.base);
const label = args.label;
const EDIT = ' (edited)';
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64url');
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

// Declaration, as the generator would read it.
const declared = JSON.parse(readFileSync(join(app, 'routes.json'), 'utf8'));
const segment = '[A-Za-z0-9_-]+';
const pattern = (p) => p.split('/').map((part) => (part.startsWith(':') ? segment : escape(part))).join('\\/');
const alternatives = [...(declared.routes ?? []).map(escape), ...(declared.resources ?? []).map(pattern)].join('|');
const allowlist = new RegExp(`^\\/focus\\/(?:(?:${alternatives})\\/?)?(?:\\?[^#]*)?$`);
const host = (address) => {
  const path = new URL(address, 'https://apps.example').pathname.replace(/\/$/, '');
  if ((declared.routes ?? []).some((r) => path === '/focus/' + r)) return 'file';
  if ((declared.resources ?? []).some((p) => new RegExp(`^\\/focus\\/${p.split('/').map((x) => (x.startsWith(':') ? '[^/]+' : escape(x))).join('\\/')}$`).test(path))) return 'shell';
  return '404';
};
const sample = `/focus/tasks/${b64('https://pod.example/tasks/1')}`;
const source = `?context=${encodeURIComponent('https://pod.example/_system/contexts/work')}`;
const declaration = Object.fromEntries(
  [
    ['settings', '/focus/settings'],
    ['notes', `${sample}/notes${source}`],
    ['task', `${sample}${source}`],
    ['postpone', `${sample}/postpone${source}`],
    ['list', '/focus/list'],
  ].map(([id, address]) => [id, { address, host: host(address), offline: allowlist.test(address), pass: host(address) !== '404' && allowlist.test(address) }]),
);

// Guard bypass and changes to the provided router.
const grep = (...a) => {
  try {
    return execFileSync('grep', a, { encoding: 'utf8' });
  } catch {
    return '';
  }
};
const sources = grep('-rnE', 'history\\.(pushState|replaceState|back|go|forward)|location\\.(href|assign|replace)\\b|window\\.location\\s*=|useBlocker|useBeforeUnload', join(app, 'src'), '--include=*.ts', '--include=*.tsx').split('\n')
  .filter((line) => line && !line.includes('/src/sempods/') && !/returnAddress|const address = location/.test(line));
let routerChanged = false;
try {
  execFileSync('diff', ['-r', join(base, 'src', 'sempods'), join(app, 'src', 'sempods')]);
} catch {
  routerChanged = true;
}
let diffLines = 0;
try {
  execFileSync('diff', ['-ru', join(base, 'src'), join(app, 'src')], { encoding: 'utf8' });
} catch (error) {
  diffLines = String(error.stdout).split('\n').filter((l) => /^[+-][^+-]/.test(l)).length;
}
let routesJsonChanged = false;
try {
  execFileSync('diff', [join(base, 'routes.json'), join(app, 'routes.json')]);
} catch {
  routesJsonChanged = true;
}

// Behaviour.
const browser = await chromium.launch();
const { server, origin } = await startApp(basename(app), 'main', dirname(app));
const work = origin + '/alice/_system/contexts/work';
const task = (n) => `${origin}/alice/tasks/${n}`;
const path = (page) => decodeURIComponent(new URL(page.url()).pathname + new URL(page.url()).search);
const notesAt = (n) => `/focus/tasks/${b64(task(n))}/notes?context=${work}`;
const taskAt = (n) => `/focus/tasks/${b64(task(n))}?context=${work}`;
const store = async () => (await (await fetch(origin + '/__store')).json());
const stored = async (n, key) => (await store()).find((t) => t.context === work && t.body['@id'] === task(n))?.body[`https://schema.org/${key}`]?.[0]?.['@value'];
const notesDialog = (page) => page.getByRole('dialog', { name: 'Notes' });
// By role: a <textarea>'s value is part of its <label>'s text, so a label
// lookup misses a textarea with content.
const notesField = (page) => notesDialog(page).getByRole('textbox', { name: 'Notes', exact: true });
const details = (page) => page.getByRole('dialog', { name: 'Details' });
const titleField = (page) => details(page).getByLabel('Title', { exact: true });
const answer = async (page, choice) => {
  const confirm = page.getByRole('alertdialog');
  const asked = await confirm.waitFor({ timeout: 3000 }).then(() => true, () => false);
  if (asked) await confirm.getByRole('button')[choice === 'keep' ? 'first' : 'last']().click();
  await page.waitForTimeout(700);
  return asked;
};
const openTask1 = async (page) => {
  await page.goto(origin + '/focus/list');
  await page.getByRole('link', { name: /^Call the plumber/ }).click();
  await titleField(page).waitFor();
};

const checks = {
  async 'notes-link-from-list'(page) {
    await page.goto(origin + '/focus/list');
    await page.getByRole('link', { name: 'Notes', exact: true }).first().click();
    await notesField(page).waitFor({ timeout: 8000 });
    return { pass: path(page) === notesAt(1), path: path(page) };
  },
  async 'notes-direct-entry'(page) {
    await page.goto(origin + notesAt(2));
    await notesField(page).waitFor({ timeout: 8000 });
    return { pass: path(page) === notesAt(2), path: path(page) };
  },
  async 'notes-save'(page) {
    await page.goto(origin + notesAt(1));
    await notesField(page).waitFor({ timeout: 8000 });
    await notesField(page).fill('Ask about the washer');
    await notesDialog(page).getByRole('button', { name: 'Save' }).click();
    await page.waitForTimeout(1200);
    const description = await stored(1, 'description');
    return { pass: description === 'Ask about the washer', description };
  },
  async 'notes-back-dirty-keep'(page) {
    await page.goto(origin + '/focus/list');
    await page.getByRole('link', { name: 'Notes', exact: true }).first().click();
    await notesField(page).waitFor({ timeout: 8000 });
    await notesField(page).fill('draft' + EDIT);
    await page.goBack();
    const asked = await answer(page, 'keep');
    const value = await notesField(page).inputValue({ timeout: 3000 }).catch(() => null);
    const kept = value === 'draft' + EDIT;
    return { pass: asked && kept && path(page) === notesAt(1), asked, draftKept: kept, value, path: path(page) };
  },
  async 'notes-close-returns-to-list'(page) {
    await page.goto(origin + '/focus/list');
    await page.getByRole('link', { name: 'Notes', exact: true }).first().click();
    await notesField(page).waitFor({ timeout: 8000 });
    await notesDialog(page).getByRole('button', { name: 'Close', exact: true }).first().click();
    await notesDialog(page).waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
    return { pass: path(page) === '/focus/list', path: path(page) };
  },
  async 'settings-from-menu'(page) {
    await page.goto(origin + '/focus/');
    await page.locator('.zen-title').waitFor();
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Settings' }).click();
    await page.getByRole('heading', { name: 'Settings' }).waitFor({ timeout: 5000 });
    const at = path(page);
    await page.goBack();
    await page.waitForTimeout(500);
    const heading = await page.getByRole('heading', { name: 'Settings' }).isVisible();
    return { pass: at === '/focus/settings' && path(page) === '/focus/' && !heading, path: at, afterBack: path(page), headingAfterBack: heading };
  },
  async 'settings-direct-entry'(page) {
    await page.goto(origin + '/focus/settings');
    await page.getByRole('heading', { name: 'Settings' }).waitFor({ timeout: 8000 });
    const text = await page.getByText('Nothing to set yet.').isVisible();
    const notFound = await page.getByTestId('not-found').isVisible();
    return { pass: text && !notFound && path(page) === '/focus/settings', text, notFound };
  },
  async 'next-clean'(page) {
    await openTask1(page);
    await details(page).getByRole('button', { name: 'Next task' }).click();
    await page.waitForTimeout(800);
    const at = path(page);
    const title = await titleField(page).inputValue().catch(() => null);
    await page.goBack();
    await page.waitForTimeout(800);
    const back = path(page);
    const backTitle = await titleField(page).inputValue().catch(() => null);
    // The request does not say where Back goes after Next task (a new entry
    // or in place); that is recorded, not judged.
    return { pass: at === taskAt(2) && title === 'Draft the club newsletter', path: at, title, back, backTitle, backToPrevious: back === taskAt(1) };
  },
  async 'next-dirty-keep'(page) {
    await openTask1(page);
    await titleField(page).fill((await titleField(page).inputValue()) + EDIT);
    await details(page).getByRole('button', { name: 'Next task' }).click();
    const asked = await answer(page, 'keep');
    const kept = (await titleField(page).inputValue().catch(() => '')).endsWith(EDIT);
    return { pass: asked && kept && path(page) === taskAt(1), asked, draftKept: kept, path: path(page) };
  },
  async 'next-dirty-discard'(page) {
    await openTask1(page);
    await titleField(page).fill((await titleField(page).inputValue()) + EDIT);
    await details(page).getByRole('button', { name: 'Next task' }).click();
    const asked = await answer(page, 'discard');
    const title = await titleField(page).inputValue().catch(() => null);
    const saved = await stored(1, 'name');
    return { pass: asked && path(page) === taskAt(2) && title === 'Draft the club newsletter' && !saved?.endsWith(EDIT), asked, path: path(page), title };
  },
};

const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
await fetch(origin + '/__reset');
await page.goto(origin + '/focus/');
await page.getByLabel(/Pod address/).fill(origin + '/alice');
await page.getByRole('button', { name: 'Sign in', exact: true }).click();
const choose = page.getByLabel(/Data context/);
if (await choose.waitFor({ timeout: 8000 }).then(() => true, () => false)) await choose.selectOption({ label: 'work' });
await page.locator('.zen-title').waitFor();
const behaviour = [];
for (const [id, run] of Object.entries(checks)) {
  await fetch(origin + '/__reset');
  let result;
  try {
    result = { id, ...(await run(page)) };
  } catch (error) {
    result = { id, pass: false, note: error.message.split('\n')[0], path: path(page) };
  }
  behaviour.push(result);
  console.log(`${label} ${result.pass ? '✓' : '✗'} ${id} ${JSON.stringify(result)}`.slice(0, 260));
}
await context.close();
await server.close();
await browser.close();

const report = { label, routesJsonChanged, declaration, bypass: sources, routerChanged, diffLines, behaviour, pageErrors };
console.log(`${label} declaration ${JSON.stringify(Object.fromEntries(Object.entries(declaration).map(([k, v]) => [k, v.pass])))}`);
console.log(`${label} bypass ${sources.length} routerChanged ${routerChanged} diffLines ${diffLines}`);
mkdirSync(join(root, 'evidence', 'authoring'), { recursive: true });
writeFileSync(join(root, 'evidence', 'authoring', `${label}.json`), JSON.stringify(report, null, 2) + '\n');
