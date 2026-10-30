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

// Touch targets of the calendar-date chooser on a phone, also on a short
// screen: 44 x 44px days and month buttons without overlapping hit areas, no
// horizontal overflow, Apply reachable, keyboard and focus return intact.
async function calendarTargets(page, height) {
  await page.setViewportSize({ width: 375, height });
  await page.goto(page.url().split('?')[0]);
  await page.locator('.zen-title').click();
  const trigger = page.getByRole('button', { name: /^Start considering:/ });
  await trigger.scrollIntoViewIfNeeded();
  await trigger.focus();
  await page.keyboard.press('Enter');
  const grid = page.getByRole('grid');
  await grid.waitFor();
  await page.waitForTimeout(300);
  const boxes = await page.evaluate(() => {
    const grid = document.querySelector('[role=grid]');
    const popup = grid.closest('[data-slot=popover-content], [role=dialog]');
    const days = [...grid.querySelectorAll('[role=gridcell] > *')].map((el) => el.getBoundingClientRect());
    const nav = [...popup.querySelectorAll('button, [role=button]')].filter((b) => !b.closest('[role=grid]') && /month|previous|next/i.test(b.getAttribute('aria-label') ?? '')).map((el) => el.getBoundingClientRect()).filter((r) => r.width > 0);
    const box = (r) => ({ x: r.x, y: r.y, w: r.width, h: r.height });
    const overlap = (a, b) => a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;
    let overlaps = 0;
    for (let i = 0; i < days.length; i++) for (let j = i + 1; j < days.length; j++) if (overlap(days[i], days[j])) overlaps++;
    const p = popup.getBoundingClientRect();
    return {
      dayMin: Math.min(...days.map((r) => Math.min(r.width, r.height))),
      navMin: Math.min(...nav.map((r) => Math.min(r.width, r.height))),
      navCount: nav.length,
      overlaps,
      popup: box(p),
      horizontalOverflow: document.scrollingElement.scrollWidth > innerWidth || p.left < 0 || p.right > innerWidth,
    };
  });
  // Keyboard: next day, choose, reach Apply, confirm.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  const apply = page.getByRole('button', { name: 'Apply', exact: true });
  let reached = false;
  for (let i = 0; i < 6 && !reached; i++) {
    await page.keyboard.press('Tab');
    reached = await apply.evaluate((el) => el === document.activeElement);
  }
  const applyBox = await apply.boundingBox();
  const applyVisible = !!applyBox && applyBox.y >= 0 && applyBox.y + applyBox.height <= height;
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  const label = await trigger.getAttribute('aria-label');
  const focusBack = await trigger.evaluate((el) => el === document.activeElement);
  await page.setViewportSize({ width: 1280, height: 800 });
  return {
    pass: boxes.dayMin >= 44 && boxes.navMin >= 44 && boxes.navCount === 2 && boxes.overlaps === 0 && !boxes.horizontalOverflow && reached && applyVisible && /29 Oct 2026/.test(label ?? '') && focusBack,
    ...boxes, applyReachedByTab: reached, applyVisible, applyBox, label, focusBack,
  };
}
checks['calendar-targets-375x812'] = (page) => calendarTargets(page, 812);
checks['calendar-targets-375x560'] = (page) => calendarTargets(page, 560);

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
