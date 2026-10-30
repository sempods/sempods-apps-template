// Composes screenshot folders into one contact sheet each: rows are the
// screen states, columns 375px and desktop in light and dark.
// Usage: node scripts/sheets.mjs <shots dir> <out.png> <title>
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const [dir, out, title] = process.argv.slice(2);
const states = ['zen', 'menu', 'dialog', 'date', 'confirm'];
const columns = [['light', 375], ['dark', 375], ['light', 1280], ['dark', 1280]];
const cell = (state, scheme, width) => {
  const file = resolve(join(dir, `${state}-${scheme}-${width}.png`));
  return existsSync(file) ? `<img src="${pathToFileURL(file)}" style="width:${width < 600 ? 188 : 400}px">` : '';
};
const html = `<!doctype html><meta charset=utf-8><body style="margin:0;padding:16px;font:14px system-ui;background:#fff">
<h1 style="font-size:16px;margin:0 0 12px">${title}</h1>
<table style="border-spacing:8px"><tr><th></th>${columns.map(([s, w]) => `<th>${w}px ${s}</th>`).join('')}</tr>
${states.map((state) => `<tr><th style="writing-mode:vertical-rl">${state}</th>${columns.map(([s, w]) => `<td style="vertical-align:top">${cell(state, s, w)}</td>`).join('')}</tr>`).join('')}
</table></body>`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1300, height: 800 } });
// A file page may load file images; about:blank may not.
const sheet = resolve(out + '.html');
writeFileSync(sheet, html);
await page.goto(pathToFileURL(sheet).href, { waitUntil: 'load' });
rmSync(sheet);
await page.screenshot({ path: out, fullPage: true, type: out.endsWith('.jpg') ? 'jpeg' : 'png', ...(out.endsWith('.jpg') ? { quality: 80 } : {}) });
await browser.close();
