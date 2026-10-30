// Tab order in the variant's dialog without any SDK content.
import { chromium } from 'playwright';
import { startApp } from './lib.mjs';
const { server, origin } = await startApp(process.argv[2] ?? 'base', 'main');
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(origin + '/?probe=plain');
await page.getByRole('button', { name: 'Two' }).waitFor();
await page.waitForTimeout(300);
const seen = [];
for (let i = 0; i < 6; i++) {
  await page.keyboard.press('Tab');
  seen.push(await page.evaluate(() => (document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent ?? '').slice(0, 20) || document.activeElement?.tagName));
}
console.log(process.argv[2], seen.join(' → '));
await browser.close(); await server.close();
