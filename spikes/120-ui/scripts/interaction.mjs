// Stage 2 interaction evidence, keyboard only: the header menu with its View
// submenu and checked choices, the calendar-date chooser in time zones far
// from UTC, and German. Results go to evidence/interaction-<variant>.json.
// Usage: node scripts/interaction.mjs [variant ...]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { root, signIn, startApp } from './lib.mjs';

const chosen = process.argv.slice(2);
const focused = (page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    return el && el !== document.body
      ? `${el.getAttribute('role') ?? el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}"`
      : 'body';
  });
const pause = (page) => page.waitForTimeout(200);

const checks = {
  async 'menu-keyboard'(page) {
    const steps = [];
    const step = async (label) => { steps.push(`${label}: ${await focused(page)}`); if (process.env.DEBUG) console.log(steps.at(-1)); };
    await page.getByRole('button', { name: 'Menu', exact: true }).focus();
    await page.keyboard.press('Enter');
    await pause(page);
    await step('Enter opens');
    // Move to View (first item) and open its submenu.
    await page.getByRole('menuitem', { name: 'View' }).waitFor();
    while (!/View/.test(await focused(page))) {
      await page.keyboard.press('ArrowDown');
      await pause(page);
      if (steps.length > 12) break;
    }
    await page.keyboard.press('ArrowRight');
    await pause(page);
    await step('ArrowRight opens submenu');
    const zenChecked = await page.getByRole('menuitemradio', { name: 'Zen' }).getAttribute('aria-checked');
    await page.keyboard.press('ArrowLeft');
    await pause(page);
    await step('ArrowLeft returns');
    const submenuClosedLeft = !(await page.getByRole('menuitemradio', { name: 'List' }).isVisible());
    await page.keyboard.press('ArrowRight');
    await pause(page);
    await page.keyboard.press('Escape');
    await pause(page);
    await step('Escape in submenu');
    const menuOpenAfterSubEscape = await page.getByRole('menuitem', { name: 'View' }).isVisible();
    if (menuOpenAfterSubEscape) {
      await page.keyboard.press('Escape');
      await pause(page);
      await step('second Escape');
    }
    const backOnTrigger = /Menu/.test(await focused(page));
    // Choose "List" by keyboard.
    await page.keyboard.press('Enter');
    await pause(page);
    while (!/View/.test(await focused(page)) && steps.length < 20) {
      await page.keyboard.press('ArrowDown');
      await pause(page);
    }
    await page.keyboard.press('ArrowRight');
    await pause(page);
    await page.keyboard.press('ArrowDown');
    await pause(page);
    await step('ArrowDown in submenu');
    await page.keyboard.press('Enter');
    await pause(page);
    await step('Enter chooses');
    const listShown = await page.locator('.spike-list').isVisible();
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await page.getByRole('menuitem', { name: 'View' }).hover();
    await page.keyboard.press('ArrowRight');
    await page.getByRole('menuitemradio', { name: 'List' }).waitFor();
    const listChecked = await page.getByRole('menuitemradio', { name: 'List' }).getAttribute('aria-checked');
    return {
      pass: zenChecked === 'true' && submenuClosedLeft && backOnTrigger && listShown && listChecked === 'true',
      zenChecked, submenuClosedLeft, menuOpenAfterSubEscape, backOnTrigger, listShown, listChecked, steps,
    };
  },
  async 'calendar-keyboard'(page) {
    await page.locator('.zen-title').click();
    const trigger = page.getByRole('button', { name: /^Start considering:/ });
    await trigger.focus();
    await page.keyboard.press('Enter');
    await page.getByRole('grid').waitFor();
    await pause(page);
    const start = await focused(page);
    await page.keyboard.press('ArrowRight');
    await pause(page);
    const right = await focused(page);
    await page.keyboard.press('PageDown');
    await pause(page);
    const nextMonth = await focused(page);
    await page.keyboard.press('Enter');
    await pause(page);
    // Reach Apply by keyboard.
    for (let i = 0; i < 6 && !/Apply/.test(await focused(page)); i++) {
      await page.keyboard.press('Tab');
      await pause(page);
    }
    await page.keyboard.press('Enter');
    await pause(page);
    const label = await trigger.getAttribute('aria-label');
    return {
      // The seed day is 28 Oct 2026: +1 day, +1 month = 29 Nov 2026.
      pass: /29 Nov 2026/.test(label ?? '') && /Start considering/.test(await focused(page)),
      start, right, nextMonth, label, focusAfter: await focused(page),
    };
  },
};

const results = {};
const browser = await chromium.launch();
for (const variant of chosen.length ? chosen : ['base', 'aria']) {
  const { server, origin } = await startApp(variant, 'main');
  results[variant] = [];
  // Far from UTC on both sides: a day must stay the same day.
  const zones = [
    ['Europe/Berlin', 'en-GB', 'en'],
    ['Pacific/Kiritimati', 'en-GB', 'en'],
    ['Pacific/Pago_Pago', 'en-GB', 'en'],
    ['Europe/Berlin', 'de-DE', 'de'],
  ];
  for (const [timezoneId, locale, lang] of process.env.ZONES ? zones.slice(0, Number(process.env.ZONES)) : zones) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, timezoneId, locale });
    const page = await context.newPage();
    await signIn(page, origin);
    for (const [id, run] of Object.entries(checks)) {
      if (lang === 'de' && id === 'menu-keyboard') continue;
      if (lang === 'de') {
        // German: the calendar's month and weekdays, not the check above.
        await page.goto(origin + '/?lang=de');
        await page.locator('.zen-title').click();
        await page.getByRole('button', { name: /^Vormerken ab:/ }).click();
        await page.getByRole('grid').waitFor();
        const { heading, firstDay } = await page.evaluate(() => {
          const popup = document.querySelector('[role=grid]')?.closest('[data-slot=popover-content], [role=dialog]');
          const header = popup?.querySelector('th, [role=columnheader]');
          return { heading: popup?.textContent?.slice(0, 40), firstDay: header?.getAttribute('aria-label') ?? header?.textContent };
        });
        const sdkSave = await page.getByRole('button', { name: 'Speichern' }).count();
        const r = { id: 'calendar-german', timezoneId, pass: /Oktober/.test(heading ?? '') && /^(Mo|M$)/.test(firstDay?.trim() ?? '') && sdkSave > 0, heading, firstDay, sdkSave };
        results[variant].push(r);
        console.log(variant, timezoneId, r.pass ? '✓' : '✗', JSON.stringify(r));
        continue;
      }
      await page.goto(origin + '/');
      await page.locator('.zen-title').waitFor();
      await fetch(origin + '/__reset');
      try {
        const r = { id, timezoneId, ...(await run(page)) };
        results[variant].push(r);
        console.log(variant, timezoneId, r.pass ? '✓' : '✗', JSON.stringify(r));
      } catch (error) {
        results[variant].push({ id, timezoneId, pass: false, note: error.message.split('\n')[0] });
        console.log(variant, timezoneId, '✗', id, error.message.split('\n')[0]);
      }
    }
    await context.close();
  }
  await server.close();
}
await browser.close();
mkdirSync(join(root, 'evidence'), { recursive: true });
writeFileSync(join(root, 'evidence', 'interaction.json'), JSON.stringify(results, null, 2) + '\n');
