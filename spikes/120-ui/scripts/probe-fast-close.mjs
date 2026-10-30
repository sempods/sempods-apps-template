// Probe: closing the variant's dialog right after it opened (during its
// entry animation). React Aria's modal stays mounted in WebKit.
import { chromium, webkit } from 'playwright';
import { signIn, startApp } from './lib.mjs';
const [variant = 'aria', engineName = 'webkit'] = process.argv.slice(2);
const { server, origin } = await startApp(variant, 'main');
const browser = await { chromium, webkit }[engineName].launch();
const page = await browser.newPage();
await signIn(page, origin);
const results = [];
for (const wait of [0, 400]) {
  await page.goto(origin + '/');
  await page.locator('.zen-title').click();
  await page.getByLabel('Title', { exact: true }).waitFor();
  await page.waitForTimeout(wait);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.waitForTimeout(1500);
  results.push(`close after ${wait}ms: dialog ${(await page.getByRole('dialog', { name: 'Details' }).count()) ? 'STUCK' : 'gone'}`);
}
console.log(variant, engineName, browser.version(), results.join('; '));
await browser.close(); await server.close();
