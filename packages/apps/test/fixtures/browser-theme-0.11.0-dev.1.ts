/** Browser/PWA chrome follows the resolved app background, including overrides.
 * Remove data-sempods-theme from a meta element to own its colour separately. */
export function syncBrowserTheme() {
  const probe = document.createElement('span');
  probe.style.color = 'var(--background)';
  document.body.append(probe);
  const background = getComputedStyle(probe).color;
  probe.remove();
  for (const meta of document.querySelectorAll<HTMLMetaElement>(
    'meta[name="theme-color"][data-sempods-theme]',
  ))
    meta.content = background;
}

syncBrowserTheme();
const system = matchMedia('(prefers-color-scheme: dark)');
system.addEventListener('change', syncBrowserTheme);
if (import.meta.hot)
  import.meta.hot.dispose(() =>
    system.removeEventListener('change', syncBrowserTheme),
  );
