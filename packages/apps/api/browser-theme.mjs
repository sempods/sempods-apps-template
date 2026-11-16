// @sempods/apps/browser-theme: keeps the browser's theme colour in step with
// the app's resolved background. Browser code without imports: it adds
// nothing of the tooling to an app's bundle.

const MARKED = 'meta[name="theme-color"][data-sempods-theme]';
const SYSTEM_DARK = '(prefers-color-scheme: dark)';

/**
 * Gives every marked `<meta name="theme-color">` the page's resolved
 * `--background`, including an explicit appearance and the page's own
 * overrides. Call it after changing the appearance. A meta element without
 * `data-sempods-theme` keeps its own colour.
 */
export function syncBrowserTheme() {
  const probe = document.createElement('span');
  probe.style.color = 'var(--background)';
  (document.body ?? document.documentElement).append(probe);
  const background = getComputedStyle(probe).color;
  probe.remove();
  for (const meta of document.querySelectorAll(MARKED))
    meta.content = background;
}

/**
 * Synchronizes now and whenever the system's appearance changes. Returns the
 * function that stops following, for example on hot module replacement.
 */
export function followBrowserTheme() {
  const system = matchMedia(SYSTEM_DARK);
  const sync = () => syncBrowserTheme();
  sync();
  system.addEventListener('change', sync);
  return () => system.removeEventListener('change', sync);
}
