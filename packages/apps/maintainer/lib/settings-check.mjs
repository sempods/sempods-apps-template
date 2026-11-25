// The skeleton's Settings dialog example (PreferencesDialog.tsx, #187) in a
// browser: from the header's menu and from the sign-in gate, with the
// keyboard, at 375px light and dark, a change of language beside an unsaved
// draft, the app's own larger text, and the startup script that shows a
// stored appearance on the static splash before the app's module loads.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { extname, join } from 'node:path';

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
};

/** The <script> that step 3 of the example's first lines adds to index.html. */
export function startupScript(example) {
  const source = readFileSync(example, 'utf8');
  const lines = source.match(/^\/\/ +<script>$[\s\S]*?^\/\/ +<\/script>$/m);
  if (!lines) throw new Error('PreferencesDialog.tsx has no startup script');
  return lines[0].replace(/^\/\/ {4}/gm, '');
}

const page = (script) => ({
  'index.html': `<!doctype html>
<html lang="en" data-actions="inverted" data-secondary="text">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light dark" />
    ${script}
  </head>
  <body><div id="root"></div><script type="module" src="./main.tsx"></script></body>
</html>
`,
  'main.tsx': `import '../src/index.css';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRuntime } from '@sempods/app-sdk';
import { AppAccess, SempodsProvider, useMessages } from '@sempods/app-sdk/react';
import { HeaderMenu, I18nProvider, Input } from '@sempods/app-ui';
import { runtimeOptions } from '../src/sempods.generated.ts';
import { preferenceTexts, usePreferences } from '../src/examples/Preferences.tsx';
import { SettingsContent, SettingsDialog } from '../src/examples/PreferencesDialog.tsx';

const runtime = createBrowserRuntime(runtimeOptions);
const gate = new URLSearchParams(location.search).has('gate');

function App() {
  const preferences = usePreferences();
  return (
    <SempodsProvider runtime={runtime} language={preferences.language} locale={preferences.locale}>
      <I18nProvider locale={preferences.locale}>
        <Frame preferences={preferences} />
      </I18nProvider>
    </SempodsProvider>
  );
}

function Frame({ preferences }: { readonly preferences: ReturnType<typeof usePreferences> }) {
  // As the example's first lines wire it.
  const [open, setOpen] = useState(false);
  const label = useMessages(preferenceTexts).settings;
  const settings = { label, content: <SettingsContent {...preferences} /> };
  return (
    <main className="mx-auto grid max-w-3xl gap-4 p-4">
      <HeaderMenu label="Menu" items={[{ label, onSelect: () => setOpen(true) }]} />
      <Input aria-label="Draft" />
      <SettingsDialog settings={settings} isOpen={open} onOpenChange={setOpen} />
      {gate && <AppAccess appName="Self test" settings={settings} />}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
`,
  'vite.config.ts': `import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
export default defineConfig({
  root: here('..'),
  base: './',
  publicDir: false,
  logLevel: 'warn',
  build: {
    outDir: here('./dist'),
    cssTarget: 'esnext',
    chunkSizeWarningLimit: 2000,
    rollupOptions: { input: here('./index.html') },
  },
  plugins: [react(), tailwindcss()],
});
`,
});

async function serve(context, root) {
  await context.route('**/*', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const file = join(root, path.endsWith('/') ? path + 'index.html' : path);
    if (!existsSync(file)) return route.abort();
    await route.fulfill({
      body: readFileSync(file),
      contentType: MIME[extname(file)] ?? 'application/octet-stream',
    });
  });
}

// What the page shows: appearance, language, root size and the open dialog.
const shown = (page) =>
  page.evaluate(() => {
    // The settings' surface: the nearest box with a background of its own.
    let dialog = document.querySelector('[role=radiogroup]');
    while (dialog && getComputedStyle(dialog).backgroundColor === 'rgba(0, 0, 0, 0)')
      dialog = dialog.parentElement;
    const box = (el) => el.getBoundingClientRect();
    return {
      dark: getComputedStyle(document.documentElement).colorScheme === 'dark',
      lang: document.documentElement.lang,
      fontSize: getComputedStyle(document.documentElement).fontSize,
      overflow: document.documentElement.scrollWidth - innerWidth,
      background: dialog && getComputedStyle(dialog).backgroundColor,
      dialog: dialog && box(dialog).toJSON(),
      small: [...document.querySelectorAll('[role=radio], [aria-pressed]')]
        .filter((el) => dialog?.contains(el))
        .filter((el) => box(el).width < 44 || box(el).height < 44 || box(el).right > innerWidth)
        .map((el) => el.textContent),
    };
  });

/** Checks one presentation: choices, keyboard, language, larger text. */
async function exercise(page, where, returnTo, settingsLabel) {
  const dialog = page.getByRole('dialog', { name: settingsLabel.en });
  await dialog.waitFor();
  const appearance = dialog.getByRole('radiogroup', { name: 'Appearance' });
  const language = dialog.getByRole('radiogroup', { name: 'Language' });
  assert.equal(await appearance.getByRole('radio').count(), 3, `${where}: appearance choices`);
  assert.equal(await language.getByRole('radio').count(), 3, `${where}: language choices`);
  assert.equal(await appearance.getByRole('radio', { name: 'System' }).isChecked(), true, `${where}: System first`);
  const before = await shown(page);
  assert.equal(before.overflow <= 0, true, `${where}: the page scrolls sideways`);
  assert.equal(before.dialog.x >= 0 && before.dialog.right <= 375, true, `${where}: the dialog leaves the screen`);
  assert.deepEqual(before.small, [], `${where}: targets below 44px or off screen`);
  // Arrow keys move within the group, Space chooses; a choice cannot be emptied.
  await appearance.getByRole('radio', { name: 'System' }).focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Space');
  assert.equal(await appearance.getByRole('radio', { name: 'Light' }).isChecked(), true, `${where}: Space chooses Light`);
  await page.keyboard.press('Space');
  assert.equal(await appearance.getByRole('radio', { name: 'Light' }).isChecked(), true, `${where}: the choice was emptied`);
  const light = await shown(page);
  assert.equal(light.dark, false, `${where}: Light`);
  await appearance.getByRole('radio', { name: 'Dark' }).click();
  const dark = await shown(page);
  assert.equal(dark.dark, true, `${where}: Dark`);
  assert.notEqual(dark.background, light.background, `${where}: the dialog keeps its colours in Dark`);
  // German at once, in place: the dialog stays open under its new title.
  await language.getByRole('radio', { name: 'Deutsch' }).click();
  const german = page.getByRole('dialog', { name: settingsLabel.de });
  await german.waitFor();
  assert.equal((await shown(page)).lang, 'de', `${where}: <html lang>`);
  await german.getByRole('radiogroup', { name: 'Darstellung' }).waitFor();
  // The app's own preference keeps its value across closing and reopening.
  const large = german.getByRole('button', { name: 'Größere Schrift' });
  await large.click();
  assert.equal(await large.getAttribute('aria-pressed'), 'true', `${where}: larger text pressed`);
  assert.equal((await shown(page)).fontSize, '18px', `${where}: larger text`);
  await page.keyboard.press('Escape');
  await german.waitFor({ state: 'hidden' });
  assert.equal(
    await returnTo().evaluate((el) => el === document.activeElement),
    true,
    `${where}: Escape returns the focus`,
  );
  return german;
}

export async function settingsCheck({ app, site, fixture, chromium }) {
  const script = startupScript(join(app, 'src/examples/PreferencesDialog.tsx'));
  const dir = join(app, 'settings-check');
  mkdirSync(dir);
  for (const [file, source] of Object.entries(page(script)))
    writeFileSync(join(dir, file), source);
  const browser = await chromium.launch();
  try {
    const built = spawnSync(
      'pnpm',
      ['exec', 'vite', 'build', '--config', 'settings-check/vite.config.ts'],
      { cwd: app, stdio: 'inherit', shell: process.platform === 'win32' },
    );
    if (built.status !== 0) throw new Error('the settings page does not build');
    const root = join(dir, 'dist');
    const url = 'http://localhost/settings-check/index.html';
    const open = async (colorScheme) => {
      const context = await browser.newContext({
        viewport: { width: 375, height: 812 },
        colorScheme,
        locale: 'en-US',
      });
      await serve(context, root);
      const tab = await context.newPage();
      tab.setDefaultTimeout(5000);
      const errors = [];
      tab.on('pageerror', (error) => errors.push(error.message));
      return { context, page: tab, errors };
    };
    const label = { en: 'Settings', de: 'Einstellungen' };
    for (const colorScheme of ['light', 'dark']) {
      // From the header's menu, with the keyboard.
      let where = `menu dialog, ${colorScheme}`;
      let { context, page: tab, errors } = await open(colorScheme);
      await tab.goto(url);
      const draft = tab.getByRole('textbox', { name: 'Draft' });
      await draft.fill('Unsaved milk');
      await tab.getByRole('button', { name: 'Menu' }).focus();
      await tab.keyboard.press('Enter');
      await tab.getByRole('menuitem', { name: label.en }).waitFor();
      await tab.keyboard.press('Enter');
      const menu = () => tab.getByRole('button', { name: 'Menu' });
      const reopened = await exercise(tab, where, menu, label);
      await tab.keyboard.press('Enter');
      await tab.getByRole('menuitem', { name: label.de }).click();
      await reopened.waitFor();
      assert.equal(await reopened.getByRole('button', { name: 'Größere Schrift' }).getAttribute('aria-pressed'), 'true', `${where}: larger text after reopening`);
      assert.equal(await reopened.getByRole('radio', { name: 'Deutsch' }).isChecked(), true, `${where}: German after reopening`);
      await reopened.getByRole('button', { name: 'Schließen' }).click();
      await reopened.waitFor({ state: 'hidden' });
      assert.equal(await draft.inputValue(), 'Unsaved milk', `${where}: the draft was lost`);
      // Stored: after a reload the page starts in the choices.
      await tab.reload();
      await draft.waitFor();
      const reloaded = await shown(tab);
      assert.deepEqual(
        [reloaded.dark, reloaded.lang, reloaded.fontSize],
        [true, 'de', '18px'],
        `${where}: the choices after a reload`,
      );
      if (errors.length) throw new Error(`${where}: ${errors.join('; ')}`);
      await context.close();

      // Above the sign-in gate: its settings button opens the same content.
      where = `gate settings, ${colorScheme}`;
      ({ context, page: tab, errors } = await open(colorScheme));
      await tab.goto(`${url}?gate`);
      const button = tab.getByRole('button', { name: label.en });
      await button.waitFor();
      await button.focus();
      await tab.keyboard.press('Enter');
      const gateButton = () => tab.getByRole('button', { name: label.de });
      const again = await exercise(tab, where, gateButton, label);
      await tab.keyboard.press('Enter');
      await again.waitFor();
      assert.equal(await again.getByRole('button', { name: 'Größere Schrift' }).getAttribute('aria-pressed'), 'true', `${where}: larger text after reopening`);
      await tab.keyboard.press('Escape');
      await again.waitFor({ state: 'hidden' });
      // The gate stays: its own Settings button, now in German.
      await tab.getByRole('button', { name: label.de }).waitFor();
      if (errors.length) throw new Error(`${where}: ${errors.join('; ')}`);
      await context.close();
    }

    // The static splash before the app's module loads: the startup script in
    // the published app's index.html, with the app's script blocked.
    const html = readFileSync(join(site, fixture, 'index.html'), 'utf8');
    assert.ok(html.includes('<style>'), 'the published index.html has no <style>');
    const splashRoot = join(dir, 'splash');
    mkdirSync(join(splashRoot, fixture), { recursive: true });
    writeFileSync(
      join(splashRoot, fixture, 'index.html'),
      html.replace('<style>', `${script}\n    <style>`),
    );
    const key = `${fixture}:preferences`;
    const cases = [
      ['dark stored, light system', 'light', { [key]: '{"appearance":"dark"}' }, true, '16px'],
      ['light stored, dark system', 'dark', { [key]: '{"appearance":"light","largeText":true}' }, false, '18px'],
      ['system stored, dark system', 'dark', { [key]: '{"appearance":"system"}' }, true, '16px'],
      ['invalid storage', 'dark', { [key]: '{"appearance":' }, true, '16px'],
      ['another app', 'light', { 'other:preferences': '{"appearance":"dark"}' }, false, '16px'],
      ['blocked storage', 'light', null, false, '16px'],
    ];
    for (const [where, colorScheme, stored, dark, fontSize] of cases) {
      const context = await browser.newContext({ colorScheme, serviceWorkers: 'block' });
      await context.addInitScript((stored) => {
        if (!stored)
          Object.defineProperty(window, 'localStorage', {
            get() {
              throw new DOMException('blocked', 'SecurityError');
            },
          });
        else for (const [key, value] of Object.entries(stored)) localStorage.setItem(key, value);
      }, stored);
      await serve(context, splashRoot);
      await context.route(/\.js$/, (route) => route.abort());
      const tab = await context.newPage();
      const errors = [];
      tab.on('pageerror', (error) => errors.push(error.message));
      await tab.goto(`http://localhost/${fixture}/`);
      const splash = await tab.locator('#splash').evaluate((node) => {
        const [r, g, b] = getComputedStyle(node).backgroundColor.match(/[\d.]+/g).map(Number);
        return {
          dark: r + g + b < 3 * 128,
          fontSize: getComputedStyle(document.documentElement).fontSize,
        };
      });
      assert.deepEqual(splash, { dark, fontSize }, `splash, ${where}`);
      if (errors.length) throw new Error(`splash, ${where}: ${errors.join('; ')}`);
      await context.close();
    }
    console.log(
      '✓ settings example: menu dialog and sign-in gate, keyboard and focus, 375px light and dark, language beside a draft, larger text, splash before the module',
    );
  } finally {
    await browser.close();
    rmSync(dir, { recursive: true, force: true });
  }
}
