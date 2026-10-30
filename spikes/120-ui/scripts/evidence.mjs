// Stage 2 evidence: screenshots (375px and desktop, light and dark) and
// contrast of the rendered states, per variant, theme and component variant.
// Usage: node scripts/evidence.mjs [variant ...] [--shots] [--contrast]
//        [--apps=<dir>] [--label=<name>] [--combos=calm/solid/tonal,...]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { root, signIn, startApp } from './lib.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.includes('--' + name);
const option = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const chosen = args.filter((a) => !a.startsWith('--'));
const label = option('label') ?? 'contract';
const appsDir = option('apps');
const combos = (option('combos') ?? 'calm/solid/tonal,calm/inverted/tonal,calm/solid/outline,calm/solid/text,fresh/solid/tonal,fresh/inverted/outline')
  .split(',')
  .map((c) => c.split('/'));
const out = join(root, 'evidence', label);
const script = readFileSync(join(import.meta.dirname, 'contrast.js'), 'utf8');

const states = {
  async zen(page) {
    await page.locator('.zen-title').waitFor();
  },
  async menu(page) {
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await page.getByRole('menuitem', { name: 'View' }).focus();
    await page.keyboard.press('ArrowRight');
    await page.getByRole('menuitemradio', { name: 'List' }).waitFor();
  },
  async dialog(page) {
    await page.locator('.zen-title').click();
    await page.getByLabel('Title', { exact: true }).waitFor();
  },
  async date(page) {
    await states.dialog(page);
    await page.getByRole('button', { name: /^Start considering:/ }).click();
    await page.getByRole('grid').waitFor();
  },
  async confirm(page) {
    await states.dialog(page);
    await page.getByLabel('Title', { exact: true }).fill('Changed title');
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('alertdialog').waitFor();
  },
};

const browser = await chromium.launch();
for (const variant of chosen.length ? chosen : ['base', 'aria']) {
  const { server, origin } = await startApp(variant, 'main', appsDir);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en-GB' });
  await context.addInitScript(script);
  const page = await context.newPage();
  await signIn(page, origin);
  const report = [];
  for (const [theme, actions, secondary] of combos) {
    // "-" leaves a setting as the app defines it (for prompt runs).
    const query = '?' + Object.entries({ theme, actions, secondary }).filter(([, v]) => v !== '-').map(([k, v]) => `${k}=${v}`).join('&');
    for (const scheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: scheme });
      for (const [state, reach] of Object.entries(states)) {
        for (const width of flag('contrast') || combos.length === 1 ? [375, 1280] : [1280]) {
          await page.setViewportSize({ width, height: width < 600 ? 812 : 800 });
          await page.goto(origin + '/' + query);
          await reach(page);
          await page.waitForTimeout(350); // let entry animations finish
          if (flag('shots')) {
            const name = [theme, actions, secondary].every((v) => v === '-') ? 'app-defaults' : `${theme}-${actions}-${secondary}`;
            const dir = join(out, 'shots', variant, name);
            mkdirSync(dir, { recursive: true });
            await page.screenshot({ path: join(dir, `${state}-${scheme}-${width}.png`) });
          }
          if (flag('contrast')) {
            const measured = await page.evaluate(() => spikeContrast());
            const tagged = (list, suffix) => list.map((m) => ({ ...m, what: `${m.what} ${suffix}` }));
            // The Zen actions in their interaction states: hover, and pressed
            // (released away from the button, so nothing is triggered).
            if (state === 'zen')
              for (const name of ['Complete', 'Not today', 'Previous task']) {
                const target = page.getByRole('button', { name, exact: true });
                await target.hover();
                await page.waitForTimeout(200);
                measured.push(...tagged(await target.evaluate((el) => spikeContrast(el)), ':hover'));
                await page.mouse.down();
                await page.waitForTimeout(120);
                measured.push(...tagged(await target.evaluate((el) => spikeContrast(el)), ':active'));
                await page.mouse.move(1, 1);
                await page.mouse.up();
              }
            // Focus: walk the state's focus order by keyboard, measuring each
            // control's indicator and its own content while focused.
            const focus = [];
            for (let i = 0; i < 8; i++) {
              await page.keyboard.press('Tab');
              await page.waitForTimeout(250); // ring transition
              const f = await page.evaluate(() => spikeFocusIndicator());
              if (f && !focus.some((x) => x.what === f.what)) {
                focus.push(f);
                measured.push(...tagged(await page.evaluate(() => spikeContrast(document.activeElement)), ':focus'));
              }
            }
            const failures = measured.filter((m) => !m.pass);
            const min = (kind) => Math.min(...measured.filter((m) => m.kind === kind).map((m) => m.ratio));
            report.push({
              theme, actions, secondary, scheme, state, width,
              checked: measured.length,
              minText: min('text'), minValue: Math.min(min('field-value'), min('placeholder')),
              minIcon: min('icon'), minField: min('field-boundary'),
              focusMin: Math.min(...focus.map((f) => f.ratio)),
              failures: [...new Map(failures.map((f) => [f.kind + f.what + f.fg + f.bg, f])).values()],
              focusFailures: focus.filter((f) => !f.pass),
            });
            console.log(variant, theme, actions, secondary, scheme, state, width, 'checked', measured.length, 'fail', failures.length, 'focus-fail', focus.filter((f) => !f.pass).length);
          }
          await page.keyboard.press('Escape').catch(() => {});
        }
      }
    }
  }
  if (flag('contrast')) {
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, `contrast-${variant}.json`), JSON.stringify(report, null, 2) + '\n');
  }
  await context.close();
  await server.close();
}
await browser.close();
