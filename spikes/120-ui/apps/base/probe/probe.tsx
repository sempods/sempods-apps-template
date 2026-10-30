// Minimal Base UI dialog (no shadcn, no SDK) to isolate the Tab trap.
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Dialog } from '@base-ui/react/dialog';

function Probe() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop />
          <Dialog.Popup>
            <Dialog.Title>Probe</Dialog.Title>
            <button>One</button>
            <button>Two</button>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
const strict = new URLSearchParams(location.search).has('strict');
createRoot(document.getElementById('root')!).render(strict ? <StrictMode><Probe /></StrictMode> : <Probe />);
