import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { CloseIcon } from './icons.tsx';

/**
 * A modal dialog, a bottom sheet on phones, for example around an item's
 * `ResourceEditor`. Escape, the × button and a press beside the dialog (on
 * its backdrop) ask the owner to close it; it
 * only goes away when the owner unmounts it, so a declined close (unsaved
 * changes) keeps it open. The SDK's leave confirmation shows above it.
 * "Pods & sharing" needs none: `AppAccess` with `onClose` brings its own.
 */
export function Dialog({
  label,
  closeLabel,
  onClose,
  children,
}: {
  readonly label: string;
  readonly closeLabel: string;
  /** Asked to close; unmount the dialog to close it, keep it to decline. */
  readonly onClose: () => void | Promise<void>;
  readonly children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  // What had focus before the dialog opened, for example the item it shows.
  const [opener] = useState(() => document.activeElement);
  // Open as a modal once mounted; unmounting removes it. (Closing it in an
  // effect cleanup would fire `close` under React's StrictMode re-run.)
  // Removing an open dialog does not restore focus as close() would, so the
  // cleanup returns it to the opener unless it has moved on elsewhere.
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    return () => {
      const focused = document.activeElement;
      if (
        opener instanceof HTMLElement &&
        opener.isConnected &&
        (!focused || focused === document.body || element?.contains(focused))
      )
        restoreFocus(opener);
    };
  }, [opener]);
  // A press on the backdrop targets the dialog element outside its box. Both
  // ends of the press count, so selecting text inside and releasing beside it
  // does not close.
  const beside = (event: MouseEvent) => {
    const box = dialog.current?.getBoundingClientRect();
    return (
      event.target === dialog.current &&
      !!box &&
      (event.clientX < box.left ||
        event.clientX > box.right ||
        event.clientY < box.top ||
        event.clientY > box.bottom)
    );
  };
  const pressedBeside = useRef(false);
  // Ask the owner; if it keeps the dialog, make sure it is open again.
  const request = async () => {
    await onClose();
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  };
  return (
    <dialog
      ref={dialog}
      className="dialog"
      aria-label={label}
      onCancel={(event) => {
        // Escape: the browser would close the dialog before the owner decides.
        event.preventDefault();
        void request();
      }}
      // Browsers may still close it (a repeated Escape without a user
      // activation); then the owner decides as well.
      onClose={() => void request()}
      onPointerDown={(event) => {
        pressedBeside.current = beside(event);
      }}
      onClick={(event) => {
        if (pressedBeside.current && beside(event)) void request();
        pressedBeside.current = false;
      }}
    >
      <button
        className="dialog-close"
        aria-label={closeLabel}
        title={closeLabel}
        onClick={() => void request()}
      >
        <CloseIcon />
      </button>
      <div className="dialog-body">{children}</div>
    </dialog>
  );
}

// The SDK keeps the page inert for a moment while a guarded change settles,
// for example clearing the selection that closed the dialog. Focus waits for
// it a few frames; each frame gives up once focus has moved on meanwhile.
function restoreFocus(opener: HTMLElement, frames = 10) {
  if (!opener.isConnected) return;
  if (!opener.closest('[inert]')) {
    opener.focus();
    return;
  }
  if (frames > 0)
    requestAnimationFrame(() => {
      const focused = document.activeElement;
      if (!focused || focused === document.body)
        restoreFocus(opener, frames - 1);
    });
}
