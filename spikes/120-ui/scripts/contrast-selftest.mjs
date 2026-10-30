// Negative and positive controls for contrast.js: known failures must fail
// and readable cases must pass, or the checker's green result means nothing.
// Usage: node scripts/contrast-selftest.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { signIn, startApp } from './lib.mjs';

// [label, expected pass, kind, markup]
const fixtures = [
  ['text-white-on-white', false, 'text', '<p aria-label="fx" style="color:#fff">Invisible</p>'],
  ['text-readable', true, 'text', '<p aria-label="fx" style="color:#1f2933">Readable</p>'],
  ['text-transparent', false, 'text', '<p aria-label="fx" style="color:rgb(0 0 0 / .3)">Faint</p>'],
  ['text-oklch', true, 'text', '<p aria-label="fx" style="color:oklch(0.3 0.02 250)">Oklch</p>'],
  ['text-large-3to1', true, 'text-large', '<p aria-label="fx" style="color:#949494;font-size:24px">Large</p>'],
  ['text-small-3to1', false, 'text', '<p aria-label="fx" style="color:#949494;font-size:16px">Small</p>'],
  ['value-white-on-white', false, 'field-value', '<input aria-label="fx" value="Hidden" style="color:#fff !important;background:#fff !important;border:1px solid #767676">'],
  ['value-readable', true, 'field-value', '<input aria-label="fx" value="Shown" style="color:#1f2933;border:1px solid #767676">'],
  ['textarea-low', false, 'field-value', '<textarea aria-label="fx" style="color:#999;border:1px solid #767676">Grey</textarea>'],
  ['placeholder-low', false, 'placeholder', '<style>#ph1::placeholder{color:#ccc;opacity:1}</style><input id="ph1" aria-label="fx" placeholder="Hint" style="border:1px solid #767676">'],
  ['placeholder-readable', true, 'placeholder', '<style>#ph2::placeholder{color:#595959;opacity:1}</style><input id="ph2" aria-label="fx" placeholder="Hint" style="border:1px solid #767676">'],
  ['icon-low', false, 'icon', '<button aria-label="fx" style="border:0;background:#fff"><svg width="20" height="20" style="stroke:#ccc"><path d="M2 2L18 18" /></svg></button>'],
  ['icon-readable', true, 'icon', '<button aria-label="fx" style="border:0;background:#fff"><svg width="20" height="20" style="stroke:#333"><path d="M2 2L18 18" /></svg></button>'],
  ['boundary-low', false, 'field-boundary', '<input aria-label="fx" style="border:1px solid #eee;color:#000" value="x">'],
  ['boundary-readable', true, 'field-boundary', '<input aria-label="fx" style="border:1px solid #767676;color:#000" value="x">'],
];
const focusFixtures = [
  ['focus-ring-50-teal', false, '<button aria-label="fx" class="f" style="--c:rgb(10 102 128 / .5)">Teal ring</button>'],
  ['focus-outline-solid', true, '<button aria-label="fx" class="o">Solid</button>'],
  ['focus-outline-low', false, '<button aria-label="fx" class="l">Low</button>'],
];
const css = `<style>body{margin:16px;background:#fff;font:16px system-ui}
.f:focus-visible{outline:none;box-shadow:0 0 0 3px var(--c)}
.o:focus-visible{outline:2px solid #1f2933;outline-offset:2px}
.l:focus-visible{outline:2px solid #ddd;outline-offset:2px}</style>`;

const script = readFileSync(join(import.meta.dirname, 'contrast.js'), 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
const failures = [];
for (const [label, expected, kind, markup] of fixtures) {
  await page.setContent(`<!doctype html>${css}<body>${markup}</body>`);
  await page.addScriptTag({ content: script });
  const results = await page.evaluate(() => spikeContrast());
  const hit = results.find((r) => r.kind === kind && r.what.includes('"fx"'));
  const ok = !!hit && hit.pass === expected;
  if (!ok) failures.push(`${label}: expected ${expected ? 'pass' : 'fail'}, got ${JSON.stringify(hit)}`);
  console.log(`${ok ? '✓' : '✗'} ${label} ${hit ? `${hit.kind} ${hit.ratio}:1` : 'not measured'}`);
}
for (const [label, expected, markup] of focusFixtures) {
  await page.setContent(`<!doctype html>${css}<body><button>before</button>${markup}</body>`);
  await page.addScriptTag({ content: script });
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(50);
  const hit = await page.evaluate(() => spikeFocusIndicator());
  const ok = !!hit && hit.pass === expected;
  if (!ok) failures.push(`${label}: expected ${expected ? 'pass' : 'fail'}, got ${JSON.stringify(hit)}`);
  console.log(`${ok ? '✓' : '✗'} ${label} ${hit ? `${hit.ratio}:1` : 'not measured'}`);
}
// The reported blind spot, in the real app: the task title, white on white.
{
  const { server, origin } = await startApp('aria', 'main');
  const app = await browser.newPage();
  await app.addInitScript(script + '\nwindow.spikeContrast = spikeContrast;');
  await signIn(app, origin);
  await app.locator('.zen-title').click();
  const title = app.getByLabel('Title', { exact: true });
  await title.waitFor();
  await app.waitForTimeout(400); // opening animation
  if (process.env.DEBUG) console.log(await app.evaluate(() => spikeContrast().filter((r) => r.kind === 'field-value')));
  const before = await app.evaluate(() => spikeContrast().filter((r) => r.kind === 'field-value' && !r.pass).length);
  await title.evaluate((el) => el.style.setProperty('color', '#fff', 'important'));
  await title.evaluate((el) => el.style.setProperty('background-color', '#fff', 'important'));
  const after = await app.evaluate(() => spikeContrast().filter((r) => r.kind === 'field-value' && !r.pass).length);
  const ok = before === 0 && after === 1;
  if (!ok) failures.push(`app title white on white: failures before ${before}, after ${after}`);
  console.log(`${ok ? '✓' : '✗'} app-title-white-on-white: readable ${before === 0 ? 'passes' : 'fails'}, white on white ${after ? 'fails' : 'passes'}`);
  await server.close();
}
await browser.close();
assert.deepEqual(failures, []);
console.log(`contrast self-test: ${fixtures.length + focusFixtures.length + 1} controls behave as expected`);
