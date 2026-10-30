// Routing spike: the same Focus-like app under /focus/ with three client
// routers (own, react-router, tanstack), against the client side of the
// route contract in #114. Results: evidence/routing-<router>[-<browser>].json.
// Usage: node scripts/routing-gate.mjs [router ...] [--browser=chromium|webkit]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, webkit } from 'playwright';
import { root, startApp } from './lib.mjs';

const args = process.argv.slice(2);
const routers = args.filter((a) => !a.startsWith('--'));
const engineName = args.find((a) => a.startsWith('--browser='))?.slice(10) ?? 'chromium';
const engine = { chromium, webkit }[engineName];
const EDIT = ' (edited)';
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64url');

async function signIn(page, origin, path = '/focus/') {
  await page.goto(origin + path);
  await page.getByLabel(/Pod address/).fill(origin + '/alice');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const choose = page.getByLabel(/Data context/);
  if (await choose.waitFor({ timeout: 8000 }).then(() => true, () => false)) await choose.selectOption({ label: 'work' });
}
const details = (page) => page.getByRole('dialog', { name: /^(Details|Not today)$/ });
const titleField = (page) => details(page).getByLabel('Title', { exact: true });
const path = (page) => new URL(page.url()).pathname + new URL(page.url()).search;

function checks(origin, task) {
  const id = b64(task);
  const at = `/focus/tasks/${id}`;
  return {
    async 'direct-entry-signed-in'(page) {
      await page.goto(origin + at);
      await titleField(page).waitFor();
      return { pass: (await titleField(page).inputValue()).startsWith('Call the plumber') && path(page) === at, path: path(page) };
    },
    async 'link-plain-click-in-place'(page) {
      await page.goto(origin + '/focus/');
      await page.locator('.zen-title').waitFor();
      await page.evaluate(() => (window.__marker = 'kept'));
      const href = await page.locator('.zen-title').getAttribute('href');
      await page.locator('.zen-title').click();
      await titleField(page).waitFor();
      const marker = await page.evaluate(() => window.__marker);
      return { pass: href === at && path(page) === at && marker === 'kept', href, path: path(page), noReload: marker === 'kept' };
    },
    async 'link-modified-click-new-tab'(page) {
      await page.goto(origin + '/focus/');
      await page.locator('.zen-title').waitFor();
      const opened = page.context().waitForEvent('page', { timeout: 5000 }).catch(() => null);
      await page.locator('.zen-title').click({ modifiers: ['ControlOrMeta'] });
      const tab = await opened;
      await page.waitForTimeout(300);
      const tabPath = tab ? new URL(tab.url()).pathname : null;
      await tab?.close();
      return { pass: !!tab && tabPath === at && path(page) === '/focus/' && !(await details(page).isVisible()), newTab: tabPath, stayed: path(page) };
    },
    async 'action-route'(page) {
      await page.goto(origin + '/focus/');
      await page.getByRole('button', { name: 'Not today' }).click();
      await page.getByRole('dialog', { name: 'Not today' }).waitFor();
      return { pass: path(page) === at + '/postpone', path: path(page) };
    },
    async 'close-returns-to-opener'(page) {
      await page.goto(origin + '/focus/list');
      await page.getByRole('link', { name: /^Call the plumber/ }).click();
      await titleField(page).waitFor();
      const before = await page.evaluate(() => history.length);
      await details(page).getByRole('button', { name: 'Close', exact: true }).click();
      await details(page).waitFor({ state: 'detached' });
      await page.waitForTimeout(300);
      return { pass: path(page) === '/focus/list', path: path(page), historyLength: [before, await page.evaluate(() => history.length)] };
    },
    async 'close-direct-entry-falls-back'(page) {
      await page.goto(origin + at);
      await titleField(page).waitFor();
      const before = await page.evaluate(() => history.length);
      await details(page).getByRole('button', { name: 'Close', exact: true }).click();
      await details(page).waitFor({ state: 'detached' });
      await page.waitForTimeout(300);
      const after = await page.evaluate(() => history.length);
      return { pass: path(page) === '/focus/' && after === before, path: path(page), historyLength: [before, after] };
    },
    async 'back-dirty-stay'(page) {
      await page.goto(origin + '/focus/');
      await page.locator('.zen-title').click();
      await titleField(page).waitFor();
      // fill, not End + typing: End does not reach the line's end in WebKit on macOS.
      await titleField(page).fill((await titleField(page).inputValue()) + EDIT);
      await page.goBack();
      const confirm = page.getByRole('alertdialog');
      const asked = await confirm.waitFor({ timeout: 3000 }).then(() => true, () => false);
      if (asked) await confirm.getByRole('button').first().click();
      await page.waitForTimeout(600);
      const kept = (await titleField(page).inputValue().catch(() => '')).endsWith(EDIT);
      return { pass: asked && kept && path(page) === at, asked, draftKept: kept, path: path(page) };
    },
    async 'back-dirty-discard'(page) {
      await page.goto(origin + '/focus/');
      await page.locator('.zen-title').click();
      await titleField(page).waitFor();
      // fill, not End + typing: End does not reach the line's end in WebKit on macOS.
      await titleField(page).fill((await titleField(page).inputValue()) + EDIT);
      await page.goBack();
      const confirm = page.getByRole('alertdialog');
      const asked = await confirm.waitFor({ timeout: 3000 }).then(() => true, () => false);
      if (asked) await confirm.getByRole('button').last().click();
      await page.waitForTimeout(600);
      return { pass: asked && path(page) === '/focus/' && !(await details(page).isVisible()), asked, path: path(page) };
    },
    async 'back-forward-clean'(page) {
      await page.goto(origin + '/focus/');
      await page.locator('.zen-title').click();
      await titleField(page).waitFor();
      await page.goBack();
      await page.waitForTimeout(500);
      const back = path(page);
      const closed = !(await details(page).isVisible());
      await page.goForward();
      await titleField(page).waitFor({ timeout: 5000 }).catch(() => {});
      return { pass: back === '/focus/' && closed && path(page) === at && (await titleField(page).isVisible()), back, forward: path(page) };
    },
    // The legacy link becomes the canonical path by replacement: one entry.
    async 'legacy-query-link'(page) {
      await page.goto(origin + '/focus/');
      await page.locator('.zen-title').waitFor();
      const before = await page.evaluate(() => history.length);
      await page.goto(origin + '/focus/?task=' + id);
      await titleField(page).waitFor();
      await page.waitForTimeout(300);
      const after = await page.evaluate(() => history.length);
      return { pass: path(page) === at && after === before + 1, path: path(page), historyLength: [before, after] };
    },
    async 'not-found-and-invalid'(page) {
      await page.goto(origin + '/focus/nowhere');
      const unknown = await page.getByTestId('not-found').textContent({ timeout: 5000 }).catch(() => null);
      await page.goto(origin + '/focus/tasks/!!!');
      const invalid = await page.getByTestId('not-found').textContent({ timeout: 5000 }).catch(() => null);
      return { pass: /does not lead/.test(unknown ?? '') && /not valid/.test(invalid ?? ''), unknown, invalid };
    },
    async 'reload-keeps-resource'(page) {
      await page.goto(origin + '/focus/');
      await page.locator('.zen-title').click();
      await titleField(page).waitFor();
      await page.reload();
      await titleField(page).waitFor({ timeout: 8000 }).catch(() => {});
      return { pass: path(page) === at && (await titleField(page).isVisible()), path: path(page) };
    },
    async 'menu-switches-view'(page) {
      await page.goto(origin + '/focus/');
      await page.getByRole('button', { name: 'Menu', exact: true }).click();
      await page.getByRole('menuitem', { name: 'View' }).hover();
      await page.keyboard.press('ArrowRight');
      await page.getByRole('menuitemradio', { name: 'List' }).click();
      await page.waitForTimeout(400);
      return { pass: path(page) === '/focus/list' && (await page.getByRole('link', { name: /^Call the plumber/ }).isVisible()), path: path(page) };
    },
  };
}

const browser = await engine.launch();
const out = join(root, 'evidence');
mkdirSync(out, { recursive: true });
for (const name of routers.length ? routers : ['own', 'react-router', 'tanstack']) {
  process.env.ROUTER = name;
  const { server, origin } = await startApp('routing', 'main');
  const results = [];
  const record = (r) => {
    results.push(r);
    console.log(`${name} ${engineName} ${r.pass ? '✓' : '✗'} ${r.id} ${JSON.stringify(r)}`.slice(0, 240));
  };
  const task = origin + '/alice/tasks/1';
  // Signed out, a resource link keeps its address through sign-in.
  {
    await fetch(origin + '/__reset');
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    let sawNotFound = false;
    page.on('framenavigated', () => {});
    const at = `/focus/tasks/${b64(task)}`;
    try {
      await signIn(page, origin, at);
      await titleField(page).waitFor({ timeout: 10000 });
      sawNotFound = await page.getByTestId('not-found').isVisible();
      record({ id: 'direct-entry-signed-out', pass: path(page) === at && !sawNotFound, path: path(page), pageErrors: errors });
    } catch (error) {
      record({ id: 'direct-entry-signed-out', pass: false, path: path(page), note: error.message.split('\n')[0] });
    }
    await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await signIn(page, origin);
  await page.locator('.zen-title').waitFor();
  for (const [id, run] of Object.entries(checks(origin, task))) {
    await fetch(origin + '/__reset');
    try {
      record({ id, ...(await run(page)) });
    } catch (error) {
      record({ id, pass: false, note: error.message.split('\n')[0], path: path(page) });
    }
  }
  writeFileSync(join(out, `routing-${name}${engineName === 'chromium' ? '' : '-' + engineName}.json`), JSON.stringify({ router: name, browser: `${engineName} ${browser.version()}`, results, pageErrors: errors }, null, 2) + '\n');
  await context.close();
  await server.close();
}
await browser.close();
