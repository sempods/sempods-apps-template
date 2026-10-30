// Probe: a bare Base UI dialog (apps/base/probe) and how many milliseconds
// between Tab presses its focus guard needs (DELAY=0 escapes, DELAY=16 stays).
import { chromium } from 'playwright';
import { startApp } from './lib.mjs';
const { server, origin } = await startApp('base', 'main');
const browser = await chromium.launch({ channel: process.env.CHANNEL || undefined });
for (const q of ['', '?strict']) {
  const page = await browser.newPage();
  await page.goto(origin + '/probe/index.html' + q);
  await page.getByRole('button', { name: 'Open' }).click();
  await page.getByRole('button', { name: 'Two' }).waitFor();
  await page.waitForTimeout(300);
  const seen = [];
  for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); await page.waitForTimeout(Number(process.env.DELAY ?? 0)); seen.push(await page.evaluate(() => document.activeElement?.textContent?.slice(0, 12) || document.activeElement?.tagName)); }
  console.log(q || 'no-strict', seen.join(' → '));
  await page.close();
}
await browser.close(); await server.close();
