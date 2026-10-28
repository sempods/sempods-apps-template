import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { useDismiss } from './dismiss.ts';

export type MenuItem = {
  readonly label: string;
  /** A second, muted line, for example the access to a context. */
  readonly hint?: string;
  /** For a choice among several: marks the current one. */
  readonly checked?: boolean;
  readonly onSelect: () => void;
};

/**
 * A button that opens a short list of actions or choices. It closes on a
 * choice, Escape or a press outside; a choice and Escape return focus to the
 * button.
 * `null` in `items` draws a separator.
 */
export function Menu({
  label,
  trigger,
  items,
  align = 'end',
  button,
  className,
}: {
  /** The button's name for screen readers; also its tooltip. */
  readonly label: string;
  /** The button's content, usually an icon. */
  readonly trigger: ReactNode;
  readonly items: readonly (MenuItem | null)[];
  /** Which edge of the button the list lines up with. */
  readonly align?: 'start' | 'end';
  /** The button, for example to return focus to it later. */
  readonly button?: RefObject<HTMLButtonElement | null>;
  readonly className?: string;
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const own = useRef<HTMLButtonElement>(null);
  const ref = button ?? own;
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, container, ref);
  const list = useRef<HTMLDivElement>(null);
  const choice = items.some((item) => item?.checked !== undefined);
  // Focus moves into the list on opening; the arrow keys move within it.
  useEffect(() => {
    if (open) list.current?.querySelector('button')?.focus();
  }, [open]);
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const entries = [...(list.current?.querySelectorAll('button') ?? [])];
    const at = entries.indexOf(document.activeElement as HTMLButtonElement);
    const step = event.key === 'ArrowDown' ? 1 : -1;
    entries[(at + step + entries.length) % entries.length]?.focus();
  };

  return (
    <div className={`menu ${className ?? ''}`} ref={container}>
      <button
        ref={ref}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {trigger}
      </button>
      {open && (
        <div
          role="menu"
          ref={list}
          className={`menu-items menu-${align}`}
          onKeyDown={onKeyDown}
        >
          {items.map((item, i) =>
            item ? (
              <button
                key={i}
                role={item.checked === undefined ? 'menuitem' : 'menuitemradio'}
                aria-checked={item.checked}
                onClick={() => {
                  close();
                  // Focus goes back to the button before the action, which
                  // may move it on, for example into a dialog it opens.
                  ref.current?.focus();
                  item.onSelect();
                }}
              >
                {choice && (
                  <span className="menu-check" aria-hidden="true">
                    {item.checked ? '✓' : ''}
                  </span>
                )}
                <span>
                  {item.label}
                  {item.hint && <small>{item.hint}</small>}
                </span>
              </button>
            ) : (
              <hr key={i} />
            ),
          )}
        </div>
      )}
    </div>
  );
}
