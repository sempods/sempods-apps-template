// Shared helpers of the spike scripts: start a variant's dev server against
// an SDK baseline, sign in to the fake Pod and open the task dialog.
import { join } from 'node:path';
import { createServer } from 'vite';

export const variants = ['base', 'aria', 'radix'];
export const root = join(import.meta.dirname, '..');

/**
 * Starts the variant's Vite dev server; SDK selects the baseline. `apps`
 * points at another copy of the apps folder, for example a prompt run.
 */
export async function startApp(variant, sdk = '0.6.0', apps) {
  apps ??= join(root, 'apps');
  const previous = process.env.SDK;
  process.env.SDK = sdk === 'main' ? 'main' : '';
  const server = await createServer({
    root: join(apps, variant),
    configFile: join(apps, variant, 'vite.config.ts'),
    logLevel: 'error',
    server: { port: 0, strictPort: false },
  });
  await server.listen();
  process.env.SDK = previous;
  const address = server.httpServer.address();
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

/** Signs in to the fake Pod and chooses its "work" context. */
export async function signIn(page, origin, query = '') {
  await fetch(origin + '/__reset');
  await page.goto(origin + '/' + query);
  await page.getByLabel(/Pod address|Pod-Adresse/).fill(origin + '/alice');
  await page.getByRole('button', { name: /^(Sign in|Anmelden)$/ }).click();
  await page.getByLabel(/Data context|Datenkontext/).selectOption({ label: 'work' });
  await page.locator('.zen-title, .spike-list a').first().waitFor({ timeout: 15000 });
}
