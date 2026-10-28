import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CloseIcon } from './icons.tsx';

/**
 * A modal dialog, a bottom sheet on phones, for example around an item's
 * `ResourceEditor`. Escape and the × button ask the owner to close it; it
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
        opener.focus();
    };
  }, [opener]);
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
