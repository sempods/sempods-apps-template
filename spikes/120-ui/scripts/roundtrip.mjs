// Calendar-date persistence on SDK main: choose a day, Apply, explicit SDK
// Save and a fresh read; cancelling the chooser or the edit; and a stored
// zoned xsd:dateTime that must keep its lexical value and datatype. Checks
// what the fake Pod stores, not only what the trigger shows. Three time
// zones, as in interaction.mjs. Results go to evidence/roundtrip.json.
// Usage: node scripts/roundtrip.mjs [variant ...]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { root, signIn, startApp } from './lib.mjs';

const xsd = 'http://www.w3.org/2001/XMLSchema#';
const startDate = 'https://schema.org/startDate';
const chosen = process.argv.slice(2);

/** The stored start date of a task, as the fake Pod holds it. */
async function stored(origin, title) {
  const tasks = await (await fetch(origin + '/__store')).json();
  const task = tasks.find((t) => t.body['https://schema.org/name']?.[0]?.['@value'] === title);
  return { value: task?.body[startDate]?.[0] ?? null, version: task?.version };
}
const PLUMBER = 'Call the plumber about the kitchen tap';
const TRAIN = 'Book train tickets to Leipzig';

async function openTask(page, origin, title) {
  await page.goto(origin + '/?view=list');
  await page.getByRole('link', { name: title }).click();
  await page.getByLabel('Title', { exact: true }).waitFor();
  await page.waitForTimeout(300);
}
const trigger = (page) => page.getByRole('button', { name: /^Start considering:/ });
/** Opens the chooser, moves one day on and applies it, by keyboard. */
async function chooseNextDay(page) {
  await trigger(page).click();
  await page.getByRole('grid').waitFor();
  await page.waitForTimeout(200);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await page.waitForTimeout(200);
}
const closed = (page) => page.getByRole('dialog', { name: 'Details' }).waitFor({ state: 'detached', timeout: 5000 }).then(() => true, () => false);

const checks = {
  // Select, Apply, Save, then a fresh page reads the stored day back.
  async 'save-and-reread'(page, origin) {
    const before = await stored(origin, PLUMBER);
    await openTask(page, origin, PLUMBER);
    await chooseNextDay(page);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const saved = await closed(page);
    const after = await stored(origin, PLUMBER);
    await page.reload();
    await openTask(page, origin, PLUMBER);
    const shown = await trigger(page).getAttribute('aria-label');
    return {
      pass: saved && before.value?.['@value'] === '2026-10-28' && after.value?.['@value'] === '2026-10-29' && after.value?.['@type'] === xsd + 'date' && /29 Oct 2026$/.test(shown ?? ''),
      before: before.value, after: after.value, shownAfterReload: shown,
    };
  },
  // A chooser closed without Apply changes neither the draft nor the data.
  async 'cancel-chooser'(page, origin) {
    const before = await stored(origin, PLUMBER);
    await openTask(page, origin, PLUMBER);
    await trigger(page).click();
    await page.getByRole('grid').waitFor();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const shown = await trigger(page).getAttribute('aria-label');
    const saveEnabled = await page.getByRole('button', { name: 'Save', exact: true }).isEnabled();
    const after = await stored(origin, PLUMBER);
    return {
      pass: /28 Oct 2026$/.test(shown ?? '') && !saveEnabled && after.version === before.version && after.value?.['@value'] === '2026-10-28',
      shown, saveEnabled, before: before.value, after: after.value,
    };
  },
  // A day applied in the chooser, then the edit cancelled: nothing is written.
  async 'cancel-edit'(page, origin) {
    const before = await stored(origin, PLUMBER);
    await openTask(page, origin, PLUMBER);
    await chooseNextDay(page);
    const changed = /29 Oct 2026$/.test((await trigger(page).getAttribute('aria-label')) ?? '');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    const gone = await closed(page);
    const after = await stored(origin, PLUMBER);
    return { pass: changed && gone && after.version === before.version && after.value?.['@value'] === '2026-10-28', before: before.value, after: after.value };
  },
  // An existing zoned xsd:dateTime: a title edit and a cancelled chooser
  // keep its lexical value and datatype; applying a day replaces it with
  // an xsd:date of that day.
  async 'zoned-datetime'(page, origin) {
    const before = await stored(origin, TRAIN);
    await openTask(page, origin, TRAIN);
    const shownBefore = await trigger(page).getAttribute('aria-label');
    await trigger(page).click();
    await page.getByRole('grid').waitFor();
    const startDay = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
    await page.keyboard.press('Escape');
    const title = page.getByLabel('Title', { exact: true });
    await title.fill(TRAIN + ' (edited)');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await closed(page);
    const kept = await stored(origin, TRAIN + ' (edited)');
    await openTask(page, origin, TRAIN + ' (edited)');
    await chooseNextDay(page);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await closed(page);
    const replaced = await stored(origin, TRAIN + ' (edited)');
    return {
      pass:
        before.value?.['@value'] === '2026-10-30T09:30:00+02:00' && before.value?.['@type'] === xsd + 'dateTime' &&
        kept.value?.['@value'] === before.value['@value'] && kept.value?.['@type'] === before.value['@type'] &&
        /30 October 2026/.test(startDay ?? '') &&
        replaced.value?.['@value'] === '2026-10-31' && replaced.value?.['@type'] === xsd + 'date',
      before: before.value, shownBefore, chooserStartsAt: startDay, afterTitleEdit: kept.value, afterApplyingADay: replaced.value,
    };
  },
};

const results = {};
const browser = await chromium.launch();
for (const variant of chosen.length ? chosen : ['aria']) {
  const { server, origin } = await startApp(variant, 'main');
  results[variant] = [];
  for (const timezoneId of ['Europe/Berlin', 'Pacific/Kiritimati', 'Pacific/Pago_Pago']) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, timezoneId, locale: 'en-GB' });
    const page = await context.newPage();
    await signIn(page, origin);
    for (const [id, run] of Object.entries(checks)) {
      await fetch(origin + '/__reset');
      let r;
      try {
        r = { id, timezoneId, ...(await run(page, origin)) };
      } catch (error) {
        r = { id, timezoneId, pass: false, note: error.message.split('\n')[0] };
      }
      results[variant].push(r);
      console.log(variant, timezoneId, r.pass ? '✓' : '✗', JSON.stringify(r));
    }
    await context.close();
  }
  await server.close();
}
await browser.close();
mkdirSync(join(root, 'evidence'), { recursive: true });
writeFileSync(join(root, 'evidence', 'roundtrip.json'), JSON.stringify(results, null, 2) + '\n');
