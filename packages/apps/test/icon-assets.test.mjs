import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { it } from 'node:test';
import { createApp } from '../scripts/new-app.mjs';
import { drawIcon } from '../scripts/icon.mjs';
import { regenerate } from '../scripts/regenerate.mjs';
import { iconAssets } from '../scripts/lib/generate.mjs';
import { tempRepository } from './fixture.mjs';

it('keeps icon pixels and URLs stable across regenerations, and versions actual changes only', async () => {
  const root = tempRepository('sempods-icons-');
  try {
    createApp(root, { id: 'demo', title: 'Demo', language: 'en' });
    const dir = join(root, 'apps/demo');
    const assets = iconAssets(dir);
    const original = Object.fromEntries(Object.keys(assets).map(file => [file, readFileSync(join(dir, 'public', file))]));
    for (let i = 0; i < 3; i++) {
      await drawIcon(root, 'demo');
      assert.deepEqual(regenerate(root), []);
      assert.deepEqual(iconAssets(dir), assets);
      for (const [file, bytes] of Object.entries(original))
        assert.deepEqual(readFileSync(join(dir, 'public', file)), bytes);
    }
    const file = join(dir, 'vite.sempods.generated.ts');
    const config = await import(pathToFileURL(file).href);
    const emitted = [];
    config.pageTitle.generateBundle.call({ emitFile: asset => emitted.push(asset) });
    for (const asset of emitted) {
      const digest = createHash('sha256').update(asset.source).digest('hex').slice(0, 16);
      assert.ok(asset.fileName.endsWith(`-${digest}.png`));
      assert.ok(Object.values(original).some(bytes => bytes.equals(asset.source)));
    }
    assert.equal(config.pwa.manifest.id, '/demo/');
    assert.deepEqual(config.pwa.manifest.icons.map(icon => icon.purpose), ['any', 'any', 'maskable']);
    for (const icon of config.pwa.manifest.icons)
      assert.ok(emitted.some(asset => '/demo/' + asset.fileName === icon.src));
    const touch = config.pageTitle.transformIndexHtml('<head></head>').tags.find(tag => tag.attrs?.rel === 'apple-touch-icon');
    assert.equal(touch.attrs.sizes, '180x180');
    assert.ok(touch.attrs.href.includes(assets['apple-touch-icon.png']));
    for (const html of [
      '<link rel="apple-touch-icon" href="/own.png">',
      '<link rel=apple-touch-icon href=/own.png>',
      '<link rel = "apple-touch-icon" href="/own.png">',
      '<link rel="alternate apple-touch-icon" href="/own.png">',
      "<LINK HREF='/own.png' REL='apple-touch-icon'>",
    ]) assert.equal(config.pageTitle.transformIndexHtml(html).tags.some(tag => tag.attrs?.rel === 'apple-touch-icon'), false);

    for (const html of [
      '<!-- <link rel="apple-touch-icon" href="/old.png"> -->',
      '<!-- unfinished comment <link rel="apple-touch-icon" href="/old.png">',
      '<link data-rel="apple-touch-icon" href="/own.png">',
      '<link rel="not-apple-touch-icon" href="/own.png">',
    ]) assert.equal(config.pageTitle.transformIndexHtml(html).tags.some(tag => tag.attrs?.rel === 'apple-touch-icon'), true);

    // Dev serves the exact same bytes at the exact same URL, including on routes.
    let handler;
    config.pageTitle.configureServer({ middlewares: { use: fn => { handler = fn; } } });
    let response;
    handler({ url: touch.attrs.href }, { setHeader() {}, end(bytes) { response = bytes; } }, () => assert.fail('known icon went to next'));
    assert.deepEqual(response, original['apple-touch-icon.png']);
    let next = false;
    handler({ url: '/other/sempods-icons/no.png' }, {}, () => { next = true; });
    assert.equal(next, true);

    // A stale generated URL must never emit different bytes under its old hash.
    writeFileSync(join(dir, 'public/icon-192.png'), original['icon-512.png']);
    assert.throws(() => config.pageTitle.generateBundle.call({ emitFile() {} }), /regenerate/);
    const changed = iconAssets(dir);
    assert.notEqual(changed['icon-192.png'], assets['icon-192.png']);
    for (const file of ['icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'])
      assert.equal(changed[file], assets[file]);
    // Missing inputs get a recovery command, not an opaque filesystem error.
    rmSync(join(dir, 'public/icon-192.png'));
    assert.throws(
      () => config.pageTitle.generateBundle.call({ emitFile() {} }),
      /Icon missing: public\/icon-192\.png.*pnpm run icon demo.*pnpm run regenerate/,
    );
  } finally { rmSync(root, { recursive: true, force: true }); }
});
