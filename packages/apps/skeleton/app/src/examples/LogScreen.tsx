// An example, not mounted: a log of entries grouped by day, newest first,
// built with the SDK and the UI kit (@sempods/app-ui). For a log or tracker
// app, copy it next to App.tsx, change its import of '../places.ts' to
// './places.ts', render <LogScreen nav={nav} /> in place of <Start />,
// declare the item address in apps.json (`"resources": ["items/:id"]`) and
// run pnpm run regenerate; then rename the type, fields, collection, address
// and texts to the app's own. Keep App.tsx's runtime, provider and frame.
import { useEffect, useRef } from 'react';
import {
  LoadNotice,
  RemoveButton,
  ResourceEditor,
  UnresolvedNotices,
  UpdateNotice,
  useAppState,
  useContextEditor,
  useCreation,
  useFieldUpdate,
  useList,
  useMessages,
  useSdkLocale,
  useWorkflowAccess,
} from '@sempods/app-sdk/react';
import { date, fields, text } from '@sempods/client-sdk/edit';
import {
  ActionButton,
  DateChooser,
  Input,
  ScreenDialog,
  type Nav,
} from '@sempods/app-ui';
import { PlusIcon } from 'lucide-react';
import type { Place } from '../places.ts';

const schema = 'https://schema.org/';

/** What one entry is: what happened and on which day. */
const entry = fields(
  {
    name: text(`${schema}name`, { language: null, trim: true }),
    // A calendar day, independent of the device's time zone.
    day: date(`${schema}startDate`),
  },
  { type: `${schema}Event` },
);

/** Today on this device as a calendar day, YYYY-MM-DD. */
function today(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Entries grouped by their calendar day, newest day first; within a day they
 * keep the list's order. A stored day may carry a time zone after the date.
 */
function byDay<T extends { readonly data: { readonly day: string } }>(
  items: readonly T[],
): { readonly day: string; readonly items: readonly T[] }[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const day = item.data.day.slice(0, 10);
    groups.set(day, [...(groups.get(day) ?? []), item]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([day, items]) => ({ day, items }));
}

// In an app these belong in src/texts.ts.
const en = {
  empty: 'Nothing logged yet. Add the first entry above.',
  emptyReadOnly: 'Nothing in this log.',
  remove: (name: string) => `Delete: ${name}`,
  edit: 'Edit entry',
  name: 'What',
  day: 'Day',
  newEntry: 'New entry',
  add: 'Add entry',
};
const logTexts: { readonly en: typeof en; readonly de: typeof en } = {
  en,
  de: {
    empty: 'Noch nichts eingetragen. Füge oben den ersten Eintrag hinzu.',
    emptyReadOnly: 'Nichts in diesem Log.',
    remove: (name) => `Löschen: ${name}`,
    edit: 'Eintrag bearbeiten',
    name: 'Was',
    day: 'Tag',
    newEntry: 'Neuer Eintrag',
    add: 'Eintrag hinzufügen',
  },
};

export function LogScreen({ nav }: { readonly nav: Nav<Place> }) {
  const t = useMessages(logTexts);
  const { format } = useSdkLocale();
  // A log that can only be read gets no input and no invitation to add.
  const { write } = useWorkflowAccess();
  const { view } = useAppState();
  const list = useList(entry);
  const items = list.data?.items;
  const mutate = useFieldUpdate(entry);
  // A new entry is for today unless the person picks another day.
  const creation = useCreation(entry, {
    initial: { name: '', day: today() },
    collection: 'entries',
  });
  const input = useRef<HTMLInputElement>(null);
  if (!view) return null;
  const { place } = nav;
  const entryPlace = (subject: string): Place => ({
    kind: 'item',
    subject,
    context: view.contextIri,
  });

  return (
    <div className="mt-4 grid gap-4">
      {write && (
        <form
          className="grid gap-2 sm:flex sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            input.current?.focus();
            if (creation.canCreate) void creation.create();
          }}
        >
          {/* Focus and pending typing as in ListScreen.tsx: not readOnly,
              which closes a phone's keyboard. */}
          <Input
            ref={input}
            className="h-11 sm:flex-1"
            aria-label={t.newEntry}
            placeholder={t.newEntry}
            value={creation.draft.name}
            disabled={!creation.canEdit && !creation.busy}
            onChange={(event) => {
              if (!creation.busy) creation.change({ name: event.target.value });
            }}
          />
          <div className="flex items-end gap-2">
            <DateChooser
              className="flex-1"
              label={t.day}
              value={creation.draft.day}
              onChange={(day) => day && creation.change({ day })}
              isDisabled={!creation.canEdit || creation.busy}
            />
            <ActionButton
              type="submit"
              shape="round-sm"
              label={t.add}
              isDisabled={!creation.canCreate}
              preventFocusOnPress
            >
              <PlusIcon />
            </ActionButton>
          </div>
        </form>
      )}
      <UpdateNotice {...creation.notice} quiet />
      <LoadNotice {...list} />
      {(list.state.kind === 'ready' || list.state.kind === 'loading') &&
        items?.length === 0 &&
        list.data?.skipped === 0 && (
          <p className="py-6 text-muted-foreground">
            {write ? t.empty : t.emptyReadOnly}
          </p>
        )}
      {byDay(items ?? []).map((group) => (
        <section key={group.day} className="grid gap-1">
          {/* Below the header's h1, each day is an h2. */}
          <h2 className="text-sm font-semibold text-muted-foreground">
            {format.dateOnly(group.day)}
          </h2>
          <ul className="divide-y">
            {group.items.map((item) => {
              const row = mutate.for(item);
              return (
                <li key={item.iri} className="flex min-h-12 items-center gap-1">
                  <a
                    {...nav.link(entryPlace(item.iri))}
                    className="flex min-h-11 flex-1 items-center rounded-md px-2 hover:bg-muted"
                  >
                    {row.data.name}
                  </a>
                  <RemoveButton
                    disabled={!row.canMutate}
                    onRemove={row.remove}
                    label={t.remove(row.data.name)}
                  />
                  <UpdateNotice {...row.notice} quiet />
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <UnresolvedNotices of={mutate} shown={items} />
      <EntryDialog
        subject={place.kind === 'item' ? place.subject : null}
        context={(place.kind === 'item' && place.context) || view.contextIri}
        texts={t}
        leave={() => {
          nav.close({ kind: 'start' });
          void list.reload();
        }}
      />
    </div>
  );
}

/**
 * The entry's screen: a dialog that follows the address, with the SDK's
 * editor for the Context the address names. Escape, Close and a press beside
 * it ask before an unsaved edit is discarded; Back does too.
 */
function EntryDialog({
  subject,
  context,
  texts,
  leave,
}: {
  readonly subject: string | null;
  readonly context: string;
  readonly texts: typeof en;
  readonly leave: () => void;
}) {
  const { messages } = useSdkLocale();
  const edit = useContextEditor(entry);
  const { open, close } = edit;
  const { changing } = useAppState();
  useEffect(() => {
    if (changing) return;
    if (subject) void open({ subject, context });
    else void close();
  }, [subject, context, changing, open, close]);
  const editor =
    subject &&
    edit.target?.subject === subject &&
    edit.target.context === context
      ? edit.editor
      : null;
  const requestClose = async () => {
    if (await edit.close()) leave();
  };
  return (
    <ScreenDialog
      title={texts.edit}
      open={subject !== null}
      onRequestClose={() => void requestClose()}
    >
      {edit.phase === 'unavailable' && edit.problem ? (
        <p role="alert">{messages.contextProblems?.[edit.problem]}</p>
      ) : (
        <ResourceEditor
          editor={editor}
          quiet
          onClose={() => void requestClose()}
          labels={{ name: texts.name, day: texts.day }}
        >
          {(draft, change) => (
            <div className="grid gap-4">
              <label className="grid gap-1.5">
                {texts.name}
                <Input
                  value={draft.name}
                  onChange={(event) =>
                    change({ ...draft, name: event.target.value })
                  }
                  required
                />
              </label>
              <DateChooser
                label={texts.day}
                value={draft.day}
                onChange={(day) => day && change({ ...draft, day })}
              />
            </div>
          )}
        </ResourceEditor>
      )}
    </ScreenDialog>
  );
}
