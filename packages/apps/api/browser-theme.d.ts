// Types of @sempods/apps/browser-theme.

/**
 * Gives every `<meta name="theme-color" data-sempods-theme>` the page's
 * resolved `--background`. Call it after applying an explicit appearance.
 */
export function syncBrowserTheme(): void;

/**
 * Synchronizes now and on every change of the system's appearance; the
 * returned function stops following.
 */
export function followBrowserTheme(): () => void;
