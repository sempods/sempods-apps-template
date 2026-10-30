// Probe: keyboard focus in the variant's calendar-date chooser (the
// base-nova calendar lacked ref={ref} on its day button).
import { chromium } from 'playwright';
import { signIn, startApp } from './lib.mjs';
const { server, origin } = await startApp(process.argv[2] ?? 'base', 'main');
const browser = await chromium.launch();
const page = await browser.newPage();
await signIn(page, origin);
await page.locator('.zen-title').click();
await page.getByRole('button', { name: /^Start considering:/ }).click();
await page.getByRole('grid').waitFor();
await page.waitForTimeout(300);
const f = () => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent?.slice(0, 20));
console.log('open', await f());
await page.locator('[role=grid] button').filter({ hasText: /^15$/ }).first().click();
await page.waitForTimeout(200);
console.log('click 15', await f());
await page.evaluate(() => {
  window.__log = [];
  for (const phase of [true, false]) document.addEventListener('keydown', (e) => window.__log.push(`${phase ? 'capture' : 'bubble'} prevented=${e.defaultPrevented} target=${e.target.getAttribute?.('aria-label')?.slice(0, 16)}`), phase);
});
for (const k of ['ArrowRight', 'ArrowDown', 'PageDown']) { await page.keyboard.press(k); await page.waitForTimeout(200); console.log(k, await f()); }

await browser.close(); await server.close();
