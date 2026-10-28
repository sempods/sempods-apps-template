// An example, not mounted: the default screen of a list app, built from the
// SDK's quickstart screen with the kit. For a list app, copy it next to
// App.tsx, render <ListScreen /> in place of <Start />, and rename the type,
// fields, collection and texts to the app's own. Keep App.tsx's runtime,
// provider and frame; take behaviour from the SDK's examples, never their
// runtime, provider or styles.
import {
  LoadNotice,
  RemoveButton,
  ResourceEditor,
  UnresolvedNotices,
  UpdateNotice,
  useCreation,
  useFieldUpdate,
  useList,
  useMessages,
  useResourceEditor,
  useSelection,
} from '@sempods/app-sdk/react';
import { fields, flag, text } from '@sempods/client-sdk/edit';
import { Composer } from '../ui/Composer.tsx';
import { Dialog } from '../ui/Dialog.tsx';
import { AddIcon } from '../ui/icons.tsx';

const schema = 'https://schema.org/';

/** What one row is: a name and whether it is done. */
export const item = fields(
  {
    name: text(`${schema}name`, { language: null, trim: true }),
    done: flag(`${schema}actionStatus`, {
      on: `${schema}CompletedActionStatus`,
      off: `${schema}PotentialActionStatus`,
    }),
  },
  { type: `${schema}Action` },
);

// In an app these belong in src/texts.ts.
const en = {
  empty: 'Nothing here yet. Add the first item below.',
  done: (name: string) => `Done: ${name}`,
  remove: (name: string) => `Delete: ${name}`,
  edit: 'Edit item',
  close: 'Close',
  name: 'Name',
  newItem: 'New item',
  add: 'Add',
};
const listTexts: { readonly en: typeof en; readonly de: typeof en } = {
  en,
  de: {
    empty: 'Noch nichts hier. Füge unten den ersten Eintrag hinzu.',
    done: (name) => `Erledigt: ${name}`,
    remove: (name) => `Löschen: ${name}`,
    edit: 'Eintrag bearbeiten',
    close: 'Schließen',
    name: 'Name',
    newItem: 'Neuer Eintrag',
    add: 'Hinzufügen',
  },
};

export function ListScreen() {
  const t = useMessages(listTexts);
  const list = useList(item);
  const items = list.data?.items;
  // One hook for the list; each row gets its part with `mutate.for(row)`.
  const mutate = useFieldUpdate(item);
  const { selected, select } = useSelection();
  const editor = useResourceEditor(selected, item);
  const creation = useCreation(item, {
    initial: { name: '', done: false },
    collection: 'items',
  });

  return (
    <>
      {/* Loading, a failed read with "Try again", never a failure as empty. */}
      <LoadNotice {...list} />
      {(list.state.kind === 'ready' || list.state.kind === 'loading') &&
        items?.length === 0 &&
        list.data?.skipped === 0 && <p className="empty">{t.empty}</p>}
      <ul className="rows">
        {items?.map((entry) => {
          const row = mutate.for(entry);
          return (
            <li key={entry.iri} className="row">
              {/* The label is the checkbox's 44px touch target. */}
              <label>
                <input
                  type="checkbox"
                  checked={row.data.done}
                  disabled={!row.canMutate}
                  onChange={() => void row.update({ done: !row.data.done })}
                />
                <span className="visually-hidden">{t.done(row.data.name)}</span>
              </label>
              <button
                className="row-name"
                onClick={() => void select(entry.iri)}
              >
                {row.data.name}
              </button>
              {/* Asks in the SDK's dialog before it deletes. */}
              <RemoveButton
                disabled={!row.canMutate}
                onRemove={row.remove}
                label={t.remove(row.data.name)}
              />
              {/* The changed row is the confirmation; problems show here. */}
              <UpdateNotice {...row.notice} quiet />
            </li>
          );
        })}
      </ul>
      {/* Recovery for a row with an open write that is no longer listed. */}
      <UnresolvedNotices of={mutate} shown={items} />
      {/* Outside the rows, so the draft stays reachable if its row goes.
          The SDK's Escape in a field cancels like Cancel and discards the
          draft; × and a click beside the dialog ask first. */}
      {selected && (
        <Dialog
          label={t.edit}
          closeLabel={t.close}
          onClose={() => void select(null)}
        >
          <ResourceEditor editor={editor} onClose={() => select(null)}>
            {(draft, change) => (
              <label>
                {t.name}
                <input
                  value={draft.name}
                  onChange={(event) => change({ name: event.target.value })}
                />
              </label>
            )}
          </ResourceEditor>
        </Dialog>
      )}
      <UpdateNotice {...creation.notice} quiet />
      <Composer>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void creation.create();
          }}
        >
          <input
            aria-label={t.newItem}
            placeholder={t.newItem}
            value={creation.draft.name}
            disabled={!creation.canEdit}
            onChange={(event) => creation.change({ name: event.target.value })}
          />
          <button
            aria-label={t.add}
            title={t.add}
            disabled={!creation.canCreate}
          >
            <AddIcon />
          </button>
        </form>
      </Composer>
    </>
  );
}
