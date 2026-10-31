// Routing spike: the same Focus-like app under /focus/ with three client
// routers (own, react-router, tanstack), against the client side of the
// route contract in #114. Results: evidence/routing-<router>[-<browser>].json.
// Usage: node scripts/routing-gate.mjs [router ...] [--browser=chromium|webkit]
//        node scripts/routing-gate.mjs --app=<app folder> --label=<name>
//        (another copy of the app, e.g. an authoring run; results go to
//        evidence/authoring/<name>-matrix.json)
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { chromium, webkit } from 'playwright';
import { root, startApp } from './lib.mjs';

const args = process.argv.slice(2);
const routers = args.filter((a) => !a.startsWith('--'));
const engineName = args.find((a) => a.startsWith('--browser='))?.slice(10) ?? 'chromium';
const engine = { chromium, webkit }[engineName];
const app = args.find((a) => a.startsWith('--app='))?.slice(6);
const label = args.find((a) => a.startsWith('--label='))?.slice(8);
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
// Decoded, so a router's own percent-encoding of the same address compares equal.
const path = (page) => decodeURIComponent(new URL(page.url()).pathname + new URL(page.url()).search);
const pathname = (page) => new URL(page.url()).pathname;
/** Whether what is shown matches the address: a task dialog exactly on task addresses. */
const consistent = async (page) => (await details(page).isVisible()) === pathname(page).startsWith('/focus/tasks/');

function checks(origin, task) {
  const id = b64(task);
  const at = `/focus/tasks/${id}`;
  const work = origin + '/alice/_system/contexts/work';
  const personal = origin + '/alice/_system/contexts/personal';
  const withSource = (context) => `${at}?context=${encodeURIComponent(context)}`;
  const store = async () => (await (await fetch(origin + '/__store')).json());
  const stored = async (context) => (await store()).find((t) => t.context === context && t.body['@id'] === task)?.body['https://schema.org/name']?.[0]?.['@value'];
  const dirty = async (page) => titleField(page).fill((await titleField(page).inputValue()) + EDIT);
  const openFromOverview = async (page) => {
    await page.goto(origin + '/focus/');
    await page.locator('.zen-title').click();
    await titleField(page).waitFor();
  };
  // Zen, then List through the menu: two entries of the same document.
  const toListInApp = async (page) => {
    await page.goto(origin + '/focus/');
    await page.locator('.zen-title').waitFor();
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await page.getByRole('menuitem', { name: 'View' }).hover();
    await page.keyboard.press('ArrowRight');
    await page.getByRole('menuitemradio', { name: 'List' }).click();
    await page.getByRole('link', { name: /^Call the plumber/ }).waitFor();
  };
  const answer = async (page, choice) => {
    const confirm = page.getByRole('alertdialog');
    const asked = await confirm.waitFor({ timeout: 3000 }).then(() => true, () => false);
    if (asked) await confirm.getByRole('button')[choice === 'keep' ? 'first' : 'last']().click();
    await page.waitForTimeout(700);
    return asked;
  };
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
      return { pass: href === withSource(work) && path(page) === decodeURIComponent(withSource(work)) && marker === 'kept', href, path: path(page), noReload: marker === 'kept' };
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
      return { pass: pathname(page) === at + '/postpone', path: path(page) };
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
      return { pass: asked && kept && pathname(page) === at, asked, draftKept: kept, path: path(page) };
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
      return { pass: back === '/focus/' && closed && pathname(page) === at && (await titleField(page).isVisible()), back, forward: path(page) };
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
      return { pass: path(page) === decodeURIComponent(withSource(work)) && (await titleField(page).isVisible()), path: path(page) };
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

    // History moves while the SDK's question is open (Codex, #121).
    async 'pending-back-forward-discard'(page) {
      await openFromOverview(page);
      await dirty(page);
      await page.goBack();
      await page.getByRole('alertdialog').waitFor({ timeout: 3000 });
      await page.goForward();
      await page.waitForTimeout(400);
      const asked = await answer(page, 'discard');
      const shown = { path: pathname(page), dialog: await details(page).isVisible(), consistent: await consistent(page) };
      const draft = shown.dialog ? await titleField(page).inputValue() : null;
      await page.goBack();
      await page.waitForTimeout(700);
      const after = { path: pathname(page), consistent: await consistent(page), asked: await page.getByRole('alertdialog').isVisible() };
      return { pass: asked && shown.consistent && !(draft ?? '').endsWith(EDIT) && after.consistent && !after.asked, shown, draft, afterBack: after };
    },
    async 'pending-back-forward-keep'(page) {
      await openFromOverview(page);
      await dirty(page);
      await page.goBack();
      await page.getByRole('alertdialog').waitFor({ timeout: 3000 });
      await page.goForward();
      await page.waitForTimeout(400);
      const asked = await answer(page, 'keep');
      const kept = (await titleField(page).inputValue().catch(() => '')).endsWith(EDIT);
      const shown = { path: pathname(page), consistent: await consistent(page) };
      // The history still works: Back asks again.
      await page.goBack();
      const again = await answer(page, 'keep');
      return { pass: asked && kept && shown.path === at && shown.consistent && again && pathname(page) === at, draftKept: kept, shown, asksAgain: again, path: path(page) };
    },
    async 'repeated-back-keep'(page) {
      await toListInApp(page);
      await page.getByRole('link', { name: /^Call the plumber/ }).click();
      await titleField(page).waitFor();
      await dirty(page);
      await page.goBack();
      await page.getByRole('alertdialog').waitFor({ timeout: 3000 });
      await page.goBack();
      await page.waitForTimeout(400);
      const asked = await answer(page, 'keep');
      const kept = (await titleField(page).inputValue().catch(() => '')).endsWith(EDIT);
      return { pass: asked && kept && pathname(page) === at && (await consistent(page)), draftKept: kept, path: path(page) };
    },
    async 'repeated-back-discard'(page) {
      await toListInApp(page);
      await page.getByRole('link', { name: /^Call the plumber/ }).click();
      await titleField(page).waitFor();
      await dirty(page);
      await page.goBack();
      await page.getByRole('alertdialog').waitFor({ timeout: 3000 });
      await page.goBack();
      await page.waitForTimeout(400);
      const asked = await answer(page, 'discard');
      const shown = { path: pathname(page), consistent: await consistent(page) };
      await page.goForward();
      await page.waitForTimeout(700);
      const forward = { path: pathname(page), consistent: await consistent(page) };
      return { pass: asked && shown.consistent && !shown.path.startsWith('/focus/tasks/') && forward.consistent, shown, forward };
    },
    async 'multi-entry-traversal'(page) {
      await page.goto(origin + '/focus/');
      await page.locator('.zen-title').waitFor();
      await page.getByRole('button', { name: 'Menu', exact: true }).click();
      await page.getByRole('menuitem', { name: 'View' }).hover();
      await page.keyboard.press('ArrowRight');
      await page.getByRole('menuitemradio', { name: 'List' }).click();
      await page.getByRole('link', { name: /^Call the plumber/ }).click();
      await titleField(page).waitFor();
      await page.evaluate(() => history.go(-2));
      await page.waitForTimeout(800);
      const back = { path: pathname(page), consistent: await consistent(page) };
      await page.evaluate(() => history.go(2));
      await page.waitForTimeout(800);
      const forward = { path: pathname(page), consistent: await consistent(page) };
      return { pass: back.path === '/focus/' && back.consistent && forward.path === at && forward.consistent, back, forward };
    },
    async 'reload-then-back'(page) {
      await openFromOverview(page);
      await page.reload();
      await titleField(page).waitFor({ timeout: 8000 });
      await page.goBack();
      await page.waitForTimeout(800);
      const back = { path: pathname(page), consistent: await consistent(page) };
      await page.goForward();
      await page.waitForTimeout(800);
      return { pass: back.path === '/focus/' && back.consistent && pathname(page) === at && (await consistent(page)), back, forward: path(page) };
    },
    // Observation: Back past the document's first entry leaves the page; no
    // router intercepts that. Records whether the browser asked first.
    async 'back-out-of-document-observe'(page) {
      // The resource is the document's first entry; Back leaves the document.
      await page.goto(origin + '/focus/');
      await page.goto(origin + withSource(work));
      await titleField(page).waitFor();
      await dirty(page);
      let prompted = false;
      const onDialog = async (d) => {
        prompted = d.type() === 'beforeunload';
        await d.dismiss();
      };
      page.on('dialog', onDialog);
      await page.goBack().catch(() => {});
      await page.waitForTimeout(1500);
      page.off('dialog', onDialog);
      const after = path(page);
      // Coming back to the resource: does the SDK restore the draft?
      await page.goForward().catch(() => {});
      await titleField(page).waitFor({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(800);
      const restored = ((await titleField(page).inputValue().catch(() => '')) ?? '').endsWith(EDIT);
      return { pass: null, beforeunloadPrompt: prompted, pathAfterBack: after, draftRestoredOnReturn: restored };
    },
    async 'invalid-legacy-stays'(page) {
      await page.goto(origin + '/focus/?task=!!!');
      await page.waitForTimeout(1000);
      const text = await page.getByTestId('not-found').textContent().catch(() => null);
      return { pass: /not valid/.test(text ?? '') && path(page) === '/focus/?task=!!!', text, path: path(page) };
    },
    async 'creation-route-wins'(page) {
      await page.goto(origin + '/focus/tasks/add');
      const add = await page.getByTestId('new-task').waitFor({ timeout: 5000 }).then(() => true, () => false);
      await page.goto(origin + '/focus/tasks/new');
      await page.getByTestId('new-task').waitFor({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(300);
      return { pass: add && path(page) === '/focus/tasks/add' && (await page.getByTestId('new-task').isVisible()), legacyBecomes: path(page) };
    },

    // The source Context in the address (Codex, #121): two Contexts hold the
    // same subject; reads and writes go to the one the address names.
    async 'source-named-in-links'(page) {
      await page.goto(origin + '/focus/');
      const href = await page.locator('.zen-title').getAttribute('href');
      return { pass: href === withSource(work), href };
    },
    async 'source-signed-in-read-and-write'(page) {
      await page.goto(origin + withSource(personal));
      await titleField(page).waitFor();
      const read = await titleField(page).inputValue();
      await titleField(page).fill('Personal copy, edited');
      await details(page).getByRole('button', { name: 'Save', exact: true }).click();
      await details(page).waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
      const personalNow = await stored(personal);
      const workNow = await stored(work);
      return {
        pass: read === 'Call the plumber (personal copy)' && personalNow === 'Personal copy, edited' && workNow === 'Call the plumber about the kitchen tap',
        read, personalNow, workNow,
      };
    },
    async 'source-action-route'(page) {
      await page.goto(origin + `${at}/postpone?context=${encodeURIComponent(personal)}`);
      await page.getByRole('dialog', { name: 'Not today' }).waitFor();
      return { pass: (await titleField(page).inputValue()) === 'Call the plumber (personal copy)', read: await titleField(page).inputValue() };
    },
    async 'source-reload'(page) {
      await page.goto(origin + withSource(personal));
      await titleField(page).waitFor();
      await page.reload();
      await titleField(page).waitFor({ timeout: 8000 });
      return { pass: path(page) === decodeURIComponent(withSource(personal)) && (await titleField(page).inputValue()) === 'Call the plumber (personal copy)', path: path(page) };
    },
    async 'source-unavailable'(page) {
      await page.goto(origin + withSource(origin + '/alice/_system/contexts/nope'));
      const alert = await page.getByTestId('source-missing').waitFor({ timeout: 5000 }).then(() => true, () => false);
      await page.waitForTimeout(500);
      const editor = await titleField(page).count();
      return { pass: alert && editor === 0, alert, editorShown: editor > 0 };
    },
  };
}

const browser = await engine.launch();
const out = join(root, 'evidence', app ? 'authoring' : '');
mkdirSync(out, { recursive: true });
for (const name of app ? [label] : routers.length ? routers : ['own', 'react-router', 'tanstack']) {
  process.env.ROUTER = name;
  const { server, origin } = app ? await startApp(basename(resolve(app)), 'main', dirname(resolve(app))) : await startApp('routing', 'main');
  const results = [];
  const record = (r) => {
    results.push(r);
    console.log(`${name} ${engineName} ${r.pass === null ? '·' : r.pass ? '✓' : '✗'} ${r.id} ${JSON.stringify(r)}`.slice(0, 240));
  };
  const task = origin + '/alice/tasks/1';
  // Signed out, an address keeps itself through sign-in: a resource, a
  // resource in a named source Context, and an invalid legacy link.
  const personal = origin + '/alice/_system/contexts/personal';
  const signedOut = [
    ['direct-entry-signed-out', `/focus/tasks/${b64(task)}`, async (page) => (await titleField(page).inputValue()) === 'Call the plumber about the kitchen tap'],
    ['source-signed-out', `/focus/tasks/${b64(task)}?context=${encodeURIComponent(personal)}`, async (page) => (await titleField(page).inputValue()) === 'Call the plumber (personal copy)'],
    ['invalid-legacy-signed-out', '/focus/?task=!!!', async (page) => /not valid/.test((await page.getByTestId('not-found').textContent()) ?? '')],
  ];
  for (const [id, at, shows] of signedOut) {
    await fetch(origin + '/__reset');
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    try {
      await signIn(page, origin, at);
      if (id === 'invalid-legacy-signed-out') await page.getByTestId('not-found').waitFor({ timeout: 10000 });
      else await titleField(page).waitFor({ timeout: 10000 });
      await page.waitForTimeout(500);
      record({ id, pass: path(page) === decodeURIComponent(at) && (await shows(page)), path: path(page), pageErrors: errors });
    } catch (error) {
      record({ id, pass: false, path: path(page), note: error.message.split('\n')[0] });
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
  writeFileSync(join(out, `${app ? name + '-matrix' : 'routing-' + name}${engineName === 'chromium' ? '' : '-' + engineName}.json`), JSON.stringify({ router: name, browser: `${engineName} ${browser.version()}`, results, pageErrors: errors }, null, 2) + '\n');
  await context.close();
  await server.close();
}
await browser.close();
