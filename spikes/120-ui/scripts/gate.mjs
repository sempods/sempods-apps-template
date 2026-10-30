// Stage 1 interop gate: the variant's dialog around an SDK ResourceEditor,
// with SDK confirmations (native <dialog>) on top. Each check starts from a
// fresh page; results go to evidence/gate-<variant>-<sdk>.json.
// Usage: node scripts/gate.mjs [variant ...] [--sdk=0.6.0|main|both]
//        [--apps=<apps dir>] [--only=<check,...>] [--label=<file suffix>]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { root, signIn, startApp, variants } from './lib.mjs';

const args = process.argv.slice(2);
const chosen = args.filter((a) => !a.startsWith('--'));
const sdkArg = args.find((a) => a.startsWith('--sdk='))?.slice(6) ?? 'both';
const sdks = sdkArg === 'both' ? ['0.6.0', 'main'] : [sdkArg];
const appsArg = args.find((a) => a.startsWith('--apps='))?.slice(7);
const only = args.find((a) => a.startsWith('--only='))?.slice(7).split(',');
const label = args.find((a) => a.startsWith('--label='))?.slice(8);
const EDIT = ' (edited)';

/** A short description of the focused element and the layer it sits in. */
const focusInfo = (page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return 'body';
    const name = el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 24) || '';
    const layer = el.closest('[role=alertdialog]') ? 'sdk-confirm' : el.closest('[role=dialog]') ? 'dialog' : 'page';
    return `${el.tagName.toLowerCase()}${name ? `"${name}"` : ''}@${layer}`;
  });

async function check(page, origin, id, run) {
  await page.goto(origin + '/');
  await page.locator('.zen-title').waitFor();
  await fetch(origin + '/__reset');
  const ctx = {
    dialog: page.getByRole('dialog', { name: 'Details' }),
    confirm: page.getByRole('alertdialog'),
    title: page.getByLabel('Title', { exact: true }),
    async open() {
      await page.locator('.zen-title').click();
      await ctx.title.waitFor();
      await page.waitForTimeout(250); // opening animation
    },
    async dirty() {
      await ctx.title.click();
      await ctx.title.press('End');
      await page.keyboard.type(EDIT);
    },
    async state() {
      const dialogOpen = await ctx.dialog.isVisible();
      return {
        dialogOpen,
        confirmOpen: await ctx.confirm.isVisible(),
        draftKept: dialogOpen ? (await ctx.title.inputValue()).endsWith(EDIT) : false,
        focus: await focusInfo(page),
      };
    },
  };
  try {
    const result = await run(ctx);
    return { id, ...result };
  } catch (error) {
    return { id, pass: false, note: 'error: ' + error.message.split('\n')[0] };
  }
}

const checks = {
  // Escape in a dirty field asks first; the library dialog and draft stay.
  'escape-field-dirty': async (c, page) => {
    await c.open();
    await c.dirty();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const s = await c.state();
    return { pass: s.dialogOpen && s.confirmOpen && s.draftKept, ...s };
  },
  // Escape in the SDK confirmation closes only the confirmation.
  'escape-in-sdk-confirm': async (c, page) => {
    await c.open();
    await c.dirty();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await c.confirm.waitFor({ timeout: 3000 });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const s = await c.state();
    return { pass: s.dialogOpen && !s.confirmOpen && s.draftKept && s.focus.endsWith('@dialog'), ...s };
  },
  // Escape with focus on the heading's Close asks via the guard.
  'escape-on-close-button': async (c, page) => {
    await c.open();
    await c.dirty();
    await page.getByRole('button', { name: 'Close', exact: true }).focus();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const asked = await c.state();
    if (asked.confirmOpen) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }
    const s = await c.state();
    return { pass: asked.confirmOpen && s.dialogOpen && s.draftKept && !s.confirmOpen, asked: asked.confirmOpen, ...s };
  },
  // Close by pointer, Cancel in the SDK confirmation: everything stays.
  'close-click-cancel': async (c, page) => {
    await c.open();
    await c.dirty();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await c.confirm.waitFor({ timeout: 3000 });
    const top = await c.confirm.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return !!hit && el.contains(hit);
    });
    for (let i = 0; i < 4; i++) await page.keyboard.press('Tab');
    const trapped = (await focusInfo(page)).endsWith('@sdk-confirm');
    // Centred in the viewport, not pushed to a corner by a CSS reset.
    const centred = await c.confirm.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return Math.abs(r.left + r.width / 2 - innerWidth / 2) < 4;
    });
    await c.confirm.getByRole('button').first().click();
    await page.waitForTimeout(300);
    const s = await c.state();
    return { pass: top && trapped && centred && s.dialogOpen && s.draftKept && !s.confirmOpen, confirmOnTop: top, confirmCentred: centred, tabTrappedInConfirm: trapped, ...s };
  },
  // Escape in the heading's menu closes only the menu.
  'escape-heading-menu': async (c, page) => {
    await c.open();
    await c.dirty();
    await page.getByRole('button', { name: 'Task menu' }).click();
    await page.getByRole('menu').waitFor();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const s = await c.state();
    const menuOpen = await page.getByRole('menu').isVisible();
    return { pass: !menuOpen && s.dialogOpen && s.draftKept && /Task menu/.test(s.focus), menuOpen, ...s };
  },
  // Escape in the date chooser inside the editor fields closes only it.
  'escape-date-chooser': async (c, page) => {
    await c.open();
    await c.dirty();
    await page.getByRole('button', { name: /^Start considering:/ }).click();
    await page.getByRole('grid').waitFor();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const s = await c.state();
    const gridOpen = await page.getByRole('grid').isVisible();
    return { pass: !gridOpen && s.dialogOpen && s.draftKept && !s.confirmOpen && /Start considering/.test(s.focus), gridOpen, ...s };
  },
  // Escape in the SDK delete confirmation closes only that question.
  'escape-delete-confirm': async (c, page) => {
    await c.open();
    await c.dirty();
    await c.dialog.getByRole('button', { name: 'Delete', exact: true }).click();
    const asked = await c.confirm.isVisible();
    if (asked) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }
    const s = await c.state();
    return { pass: asked && s.dialogOpen && !s.confirmOpen, asked, ...s, note: asked ? undefined : 'delete asks nothing while the draft is dirty' };
  },
  // Background stays out of reach while the dialog is open.
  'focus-trapped-in-dialog': async (c, page) => {
    await c.open();
    const seen = new Set();
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab');
      // Base UI moves focus from its guard one frame later; people type
      // slower than one key per frame.
      await page.waitForTimeout(50);
      seen.add(await focusInfo(page));
    }
    const inert = await page.evaluate(() => {
      const header = document.querySelector('.spike-header');
      return !!header && (!!header.closest('[inert]') || !!header.closest('[aria-hidden=true]'));
    });
    const layers = new Set([...seen].map((f) => f.split('@')[1] ?? f));
    return { pass: !layers.has('page') && !layers.has('body') && inert, focused: [...seen].join(' | '), backgroundInertOrHidden: inert };
  },
  // A clean dialog closes on Escape and returns focus to its opener.
  'escape-clean-restores-focus': async (c, page) => {
    await c.open();
    await c.title.focus();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    const s = await c.state();
    return { pass: !s.dialogOpen && /zen-title|^a"/.test(s.focus) && s.focus.endsWith('@page'), ...s };
  },
  // After all the cancelled closes, an explicit Save still works.
  'save-after-cancels': async (c, page) => {
    await c.open();
    await c.dirty();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await c.confirm.waitFor({ timeout: 3000 });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await c.dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForTimeout(800);
    const s = await c.state();
    const saved = await page.locator('.zen-title').first().textContent();
    return { pass: !s.dialogOpen && !!saved?.endsWith(EDIT), savedTitle: saved, ...s };
  },
  // Phone <-> desktop while editing: no remount, the draft stays.
  'resize-keeps-draft': async (c, page) => {
    await c.open();
    await c.dirty();
    await page.setViewportSize({ width: 375, height: 760 });
    await page.waitForTimeout(300);
    const phone = await c.dialog.boundingBox();
    const s1 = await c.state();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(300);
    const s = await c.state();
    return { pass: s1.draftKept && s.draftKept && !!phone && phone.width >= 370, phoneWidth: phone?.width, ...s };
  },
  // Browser Back closes the routed dialog; Forward opens it again.
  'back-forward': async (c, page) => {
    await c.open();
    await page.goBack();
    await page.waitForTimeout(500);
    const back = await c.dialog.isVisible();
    await page.goForward();
    await page.waitForTimeout(500);
    const forward = await c.title.isVisible();
    return { pass: !back && forward, openAfterBack: back, openAfterForward: forward };
  },
  // Back with a dirty draft asks through the SDK's navigate; staying keeps
  // the dialog, the draft and the address.
  'back-dirty-stay': async (c, page) => {
    await c.open();
    await c.dirty();
    const address = new URL(page.url()).search;
    await page.goBack();
    const asked = await c.confirm.waitFor({ timeout: 3000 }).then(() => true, () => false);
    if (asked) await c.confirm.getByRole('button').first().click();
    await page.waitForTimeout(600);
    const s = await c.state();
    const kept = new URL(page.url()).search === address;
    return { pass: asked && s.dialogOpen && s.draftKept && !s.confirmOpen && kept, asked, addressKept: kept, ...s };
  },
  // Back with a dirty draft, then discard: the dialog closes, the step stays.
  'back-dirty-discard': async (c, page) => {
    await c.open();
    await c.dirty();
    await page.goBack();
    const asked = await c.confirm.waitFor({ timeout: 3000 }).then(() => true, () => false);
    if (asked) await c.confirm.getByRole('button').last().click();
    await page.waitForTimeout(600);
    const s = await c.state();
    const left = !new URL(page.url()).searchParams.has('task');
    return { pass: asked && !s.dialogOpen && !s.confirmOpen && left, asked, left, ...s };
  },
};

const browser = await chromium.launch();
const out = join(root, 'evidence');
mkdirSync(out, { recursive: true });
for (const variant of chosen.length ? chosen : variants)
  for (const sdk of sdks) {
    const { server, origin } = await startApp(variant, sdk, appsArg);
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en-GB' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await signIn(page, origin);
    const results = [];
    for (const [id, run] of Object.entries(checks).filter(([id]) => !only || only.includes(id))) {
      const r = await check(page, origin, id, (c) => run(c, page));
      results.push(r);
      console.log(`${variant} sdk=${sdk} ${r.pass ? '✓' : '✗'} ${id} ${JSON.stringify(r)}`);
    }
    writeFileSync(join(out, `gate-${variant}-${sdk}${label ? '-' + label : ''}.json`), JSON.stringify({ variant, sdk, results, pageErrors: errors }, null, 2) + '\n');
    await context.close();
    await server.close();
  }
await browser.close();
