// Rendered check of the notes app an assistant built from a short owner brief
// (#111 exercise): create, edit, cancel, delete, and the empty, read-only,
// loading, error and recovery states against fake-Pod fixtures, with what
// the Pod stores. Screenshots at 375px and desktop, light and dark, and a
// contrast measurement of each state. Results: evidence/notes.json.
// Usage: node scripts/notes-check.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { root, startApp } from './lib.mjs';

const schema = 'https://schema.org/';
const out = join(root, 'evidence', 'notes');
const script = readFileSync(join(import.meta.dirname, 'contrast.js'), 'utf8');
const { server, origin } = await startApp('notes', 'main');
const browser = await chromium.launch();
const store = async () => (await (await fetch(origin + '/__store')).json());
const inContext = async (name) => (await store()).filter((n) => n.context.endsWith('/' + name));
const title = (n) => n.body[schema + 'name']?.[0]?.['@value'];

async function session(contextName, { width = 1280, scheme = 'light' } = {}) {
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 812 : 800 }, colorScheme: scheme, locale: 'en-GB' });
  await context.addInitScript(script + '\nwindow.spikeContrast = spikeContrast;');
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.goto(origin + '/');
  await page.getByLabel(/Pod address/).fill(origin + '/alice');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByLabel(/Data context/).selectOption({ label: contextName });
  await page.getByRole('region', { name: 'Notes' }).waitFor();
  await page.waitForTimeout(300);
  return { context, page };
}
const row = (page, name) => page.getByRole('button', { name: new RegExp('^' + name) });
const dialog = (page, name) => page.getByRole('dialog', { name });

const flows = {
  async 'list-sorted'(page) {
    const rows = await page.getByRole('region', { name: 'Notes' }).getByRole('listitem').allInnerTexts();
    return { pass: rows.length === 2 && /^Gift ideas/.test(rows[0]) && /^Recipe/.test(rows[1]), rows: rows.map((r) => r.split('\n')[0]) };
  },
  async create(page) {
    await page.getByRole('button', { name: 'New note' }).click();
    const d = dialog(page, 'New note');
    await d.getByLabel('Title').fill('Call grandma');
    await d.getByLabel('Text').fill('Sunday afternoon.');
    await d.getByRole('button', { name: 'Save', exact: true }).click();
    await d.waitFor({ state: 'detached', timeout: 5000 });
    await row(page, 'Call grandma').waitFor();
    const created = (await inContext('personal')).find((n) => title(n) === 'Call grandma');
    return { pass: !!created && created.body['@type']?.includes(schema + 'NoteDigitalDocument') && created.body[schema + 'text']?.[0]?.['@value'] === 'Sunday afternoon.', stored: created?.body };
  },
  async 'edit-save'(page) {
    await row(page, 'Gift ideas').click();
    const d = dialog(page, 'Note');
    await d.getByLabel('Title').fill('Gift ideas for Mia and Leo');
    await d.getByRole('button', { name: 'Save', exact: true }).click();
    await d.waitFor({ state: 'detached', timeout: 5000 });
    const names = (await inContext('personal')).map(title);
    return { pass: names.includes('Gift ideas for Mia and Leo') && !names.includes('Gift ideas for Mia'), names };
  },
  async 'edit-cancel'(page) {
    const before = JSON.stringify(await inContext('personal'));
    await row(page, 'Recipe').click();
    const d = dialog(page, 'Note');
    await d.getByLabel('Text').fill('Changed my mind.');
    await d.getByRole('button', { name: 'Cancel', exact: true }).click();
    await d.waitFor({ state: 'detached', timeout: 5000 });
    return { pass: JSON.stringify(await inContext('personal')) === before };
  },
  async 'close-dirty-asks'(page) {
    await row(page, 'Recipe').click();
    const d = dialog(page, 'Note');
    await d.getByLabel('Text').fill('Unsaved words.');
    await d.getByRole('button', { name: 'Close', exact: true }).click();
    const confirm = page.getByRole('alertdialog');
    const asked = await confirm.waitFor({ timeout: 3000 }).then(() => true, () => false);
    if (asked) await confirm.getByRole('button').first().click();
    await page.waitForTimeout(300);
    const kept = (await d.getByLabel('Text').inputValue().catch(() => '')) === 'Unsaved words.';
    return { pass: asked && kept, asked, draftKept: kept };
  },
  async 'delete-row'(page) {
    await page.getByRole('button', { name: /^(Delete|Remove): Recipe/ }).click();
    const confirm = page.getByRole('alertdialog');
    await confirm.waitFor({ timeout: 3000 });
    await confirm.getByRole('button').last().click();
    await page.waitForTimeout(800);
    const names = (await inContext('personal')).map(title);
    return { pass: !names.some((n) => n?.startsWith('Recipe')), names };
  },
  async 'back-with-open-note'(page) {
    // Observation: the app has no routes (no routing guidance for apps yet).
    const before = page.url();
    await row(page, 'Gift ideas').click();
    await dialog(page, 'Note').getByLabel('Text').fill('Typed, then Back.');
    const entries = await page.evaluate(() => history.length);
    await page.goBack().catch(() => {});
    await page.waitForTimeout(1200);
    const dialogOpen = await dialog(page, 'Note').isVisible().catch(() => false);
    const draftKept = dialogOpen && (await dialog(page, 'Note').getByLabel('Text').inputValue()) === 'Typed, then Back.';
    const signInShown = await page.getByLabel(/Pod address/).isVisible().catch(() => false);
    return { pass: null, before, after: page.url(), historyEntries: entries, dialogOpen, draftKept, signInShown };
  },
};

const results = [];
const record = (r) => {
  results.push(r);
  console.log(`${r.pass === null ? '·' : r.pass ? '✓' : '✗'} ${r.id} ${JSON.stringify(r)}`.slice(0, 300));
};
// Flows, each on a fresh fixture.
for (const [id, run] of Object.entries(flows)) {
  await fetch(origin + '/__reset');
  const { context, page } = await session('personal');
  try {
    record({ id, ...(await run(page)), pageErrors: page.errors });
  } catch (error) {
    record({ id, pass: false, note: error.message.split('\n')[0] });
  }
  await context.close();
}

// States at both widths and schemes, with screenshots and contrast.
const states = {
  async list(page) {},
  async note(page) {
    await row(page, 'Gift ideas').click();
    await dialog(page, 'Note').getByLabel('Title').waitFor();
  },
  async 'new-note'(page) {
    await page.getByRole('button', { name: 'New note' }).click();
    await dialog(page, 'New note').getByLabel('Title').waitFor();
  },
  async empty(page) {
    await page.getByText('No notes yet').waitFor();
  },
  async 'read-only'(page) {
    await row(page, 'Holiday packing').click();
    await dialog(page, 'Note').waitFor();
  },
  async loading(page) {
    await fetch(origin + '/__delay?ms=4000');
    await page.reload();
    await page.getByLabel(/Data context/).waitFor({ state: 'detached' }).catch(() => {});
    await page.waitForTimeout(1200);
  },
  async error(page) {
    await fetch(origin + '/__fail?count=20');
    await page.reload();
    await page.getByRole('alert').first().waitFor({ timeout: 15000 });
    await page.waitForTimeout(300);
  },
};
const contextOf = { empty: 'work', 'read-only': 'shared' };
const observed = {};
for (const scheme of ['light', 'dark'])
  for (const width of [375, 1280])
    for (const [state, reach] of Object.entries(states)) {
      await fetch(origin + '/__reset');
      const { context, page } = await session(contextOf[state] ?? 'personal', { width, scheme });
      try {
        await reach(page);
        await page.waitForTimeout(350);
        mkdirSync(join(out, 'shots'), { recursive: true });
        await page.screenshot({ path: join(out, 'shots', `${state}-${scheme}-${width}.png`) });
        const measured = await page.evaluate(() => spikeContrast());
        const failures = measured.filter((m) => !m.pass);
        observed[state] ??= {};
        if (state === 'read-only') observed[state] = { addButton: await page.getByRole('button', { name: 'New note' }).count(), editorFields: await page.getByLabel('Title').count() };
        if (state === 'loading' || state === 'error') observed[state] = { text: (await page.locator('main').innerText()).slice(0, 200) };
        record({ id: `state-${state}-${scheme}-${width}`, pass: failures.length === 0, checked: measured.length, failures, ...observed[state] });
        // Recovery: after the failures stop, the list comes back.
        if (state === 'error' && width === 1280 && scheme === 'light') {
          await fetch(origin + '/__fail?count=0');
          const retry = page.getByRole('button', { name: /try again|retry|reload/i }).first();
          const hasRetry = (await retry.count()) > 0;
          if (hasRetry) await retry.click();
          else await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
          const back = await row(page, 'Gift ideas').waitFor({ timeout: 10000 }).then(() => true, () => false);
          record({ id: 'recovery-after-error', pass: back, by: hasRetry ? 'retry button' : 'returning to the page' });
        }
      } catch (error) {
        record({ id: `state-${state}-${scheme}-${width}`, pass: false, note: error.message.split('\n')[0] });
      }
      await fetch(origin + '/__delay?ms=0');
      await fetch(origin + '/__fail?count=0');
      await context.close();
    }
await browser.close();
await server.close();
mkdirSync(out, { recursive: true });
writeFileSync(join(root, 'evidence', 'notes.json'), JSON.stringify(results, null, 2) + '\n');
