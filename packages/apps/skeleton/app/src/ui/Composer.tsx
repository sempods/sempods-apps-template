import type { ReactNode } from 'react';

/**
 * A bar fixed at the bottom of the screen, in thumb reach, for the input that
 * is always there (for example "add an item"). The page leaves room for it,
 * it sits above the home indicator, and with the skeleton's viewport setting
 * (interactive-widget=resizes-content) it stays above the on-screen keyboard
 * in browsers that support that. iOS Safari overlays the keyboard instead.
 * Render it in the frame, outside views that tabs switch: switching views
 * does not ask about an unsent creation draft, and unmounting loses it.
 */
export function Composer({ children }: { readonly children: ReactNode }) {
  return (
    <div className="composer">
      <div className="composer-content">{children}</div>
    </div>
  );
}
