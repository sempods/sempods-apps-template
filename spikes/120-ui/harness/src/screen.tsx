// The reference screen of the spike, composed once: Focus Zen with a header
// menu (View submenu with checked choices), a routed task dialog holding an
// SDK ResourceEditor, and a calendar-date chooser inside the editor fields.
// Each variant passes its own primitives (UiKit); everything else is equal,
// so the comparison measures the primitives and their styling only.
import { useEffect, useState, type ReactNode } from 'react';
import {
  AppAccess,
  LoadNotice,
  ResourceEditor,
  SempodsProvider,
  TargetScreen,
  useAppState,
  useContextEditor,
  useList,
  useMessages,
  useSdkLocale,
} from '@sempods/app-sdk/react';
import type { BrowserRuntime } from '@sempods/app-sdk';
import { createRuntime, sdkBaseline, taskFields, texts, useRoute, type TaskDraft } from './index.ts';

export type MenuEntry =
  | { readonly label: string; readonly onSelect: () => void }
  | {
      readonly label: string;
      readonly choices: readonly { readonly label: string; readonly checked: boolean; readonly onSelect: () => void }[];
    }
  | null;

export type Variant = 'primary' | 'secondary' | 'ghost';

export type UiKit = {
  readonly name: string;
  /** Routed, responsive: full screen on phones, roomy on desktop. */
  readonly ScreenDialog: (props: {
    readonly title: string;
    readonly closeLabel: string;
    readonly open: boolean;
    /** Asked to close; the dialog closes only when `open` turns false. */
    readonly onRequestClose: () => void;
    readonly actions?: ReactNode;
    readonly children: ReactNode;
  }) => ReactNode;
  readonly HeaderMenu: (props: {
    readonly label: string;
    readonly items: readonly MenuEntry[];
    readonly icon?: 'menu' | 'more';
  }) => ReactNode;
  /** A calendar-date chooser; values are day strings (YYYY-MM-DD) or ''. */
  readonly DateField: (props: {
    readonly label: string;
    readonly value: string;
    readonly onChange: (day: string) => void;
    readonly noneLabel: string;
    readonly applyLabel: string;
    readonly locale: string;
  }) => ReactNode;
  readonly Button: (props: {
    readonly variant: Variant;
    readonly shape?: 'pill' | 'round' | 'round-lg';
    readonly label?: string;
    readonly onPress: () => void;
    readonly disabled?: boolean;
    readonly children: ReactNode;
  }) => ReactNode;
  readonly Icon: (props: { readonly name: 'check' | 'left' | 'right' }) => ReactNode;
};

let runtime: BrowserRuntime | undefined;

export function SpikeApp({ ui }: { readonly ui: UiKit }) {
  runtime ??= createRuntime(`Spike ${ui.name}`);
  const query = new URLSearchParams(location.search);
  const language = query.get('lang') === 'de' ? 'de' : 'en';
  document.documentElement.lang = language;
  // Evidence runs pick the theme and the variants from the address.
  for (const key of ['theme', 'actions', 'secondary'])
    if (query.get(key)) document.documentElement.dataset[key] = query.get(key)!;
  return (
    <SempodsProvider runtime={runtime} language={language} locale={language === 'de' ? 'de-DE' : 'en-GB'}>
      <Frame ui={ui} />
    </SempodsProvider>
  );
}

function Frame({ ui }: { readonly ui: UiKit }) {
  const [managing, setManaging] = useState(false);
  const { connections } = useAppState();
  const { messages } = useSdkLocale();
  const t = useMessages(texts);
  const route = useRoute();
  const view = route.params.get('view') === 'list' ? 'list' : 'zen';
  const header = connections.length > 0;
  return (
    <main className="spike-main" data-view={view}>
      {header && (
        <header className="spike-header">
          <h1>
            Focus <small data-testid="baseline">{ui.name} · SDK {sdkBaseline}</small>
          </h1>
          <ui.HeaderMenu
            label={t.menu}
            items={[
              {
                label: t.view,
                choices: [
                  { label: t.zen, checked: view === 'zen', onSelect: () => route.go({ view: null }) },
                  { label: t.list, checked: view === 'list', onSelect: () => route.go({ view: 'list' }) },
                ],
              },
              null,
              { label: messages.controls.dataAccess, onSelect: () => setManaging(true) },
            ]}
          />
        </header>
      )}
      <AppAccess
        appName="Focus"
        description="Spike for #120"
        headingLevel={header ? 2 : 1}
        open={managing}
        onClose={() => setManaging(false)}
      />
      <TargetScreen>
        <Tasks ui={ui} view={view} />
      </TargetScreen>
      {/* Isolation probe: the variant's dialog without SDK content. */}
      {route.params.get('probe') === 'plain' && (
        <ui.ScreenDialog title={t.details} closeLabel={t.close} open onRequestClose={() => route.go({ probe: null })}>
          <button type="button">One</button> <button type="button">Two</button>
        </ui.ScreenDialog>
      )}
    </main>
  );
}

function Tasks({ ui, view }: { readonly ui: UiKit; readonly view: 'zen' | 'list' }) {
  const t = useMessages(texts);
  const list = useList(taskFields);
  const route = useRoute();
  const [index, setIndex] = useState(0);
  const { view: target } = useAppState();
  const items = (list.data?.items ?? []).filter((item) => !item.data.done);
  const active = items[index % Math.max(items.length, 1)];
  const open = (iri: string) => route.go({ task: iri });
  const subject = route.params.get('task');
  return (
    <>
      <LoadNotice {...list} />
      {view === 'list' ? (
        <ul className="spike-list">
          {items.map((item) => (
            <li key={item.iri}>
              <a href={`?task=${encodeURIComponent(item.iri)}&view=list`} onClick={(e) => { e.preventDefault(); open(item.iri); }}>
                {item.data.title}
              </a>
            </li>
          ))}
        </ul>
      ) : active ? (
        <section className="zen" aria-label={t.zen}>
          <div className="zen-task">
            <p className="zen-position" aria-live="polite">
              {index % items.length + 1}/{items.length}
            </p>
            <h2>
              <a className="zen-title" href={`?task=${encodeURIComponent(active.iri)}`} onClick={(e) => { e.preventDefault(); open(active.iri); }}>
                {active.data.title}
              </a>
            </h2>
          </div>
          <div className="zen-dock">
            <div className="zen-primary">
              <ui.Button variant="primary" shape="round-lg" label={t.complete} onPress={() => {}}>
                <ui.Icon name="check" />
              </ui.Button>
            </div>
            <div className="zen-actions">
              <ui.Button variant="secondary" shape="round" label={t.previous} onPress={() => setIndex((i: number) => (i + items.length - 1) % items.length)}>
                <ui.Icon name="left" />
              </ui.Button>
              <ui.Button variant="secondary" shape="pill" onPress={() => open(active.iri)}>
                {t.notToday}
              </ui.Button>
              <ui.Button variant="secondary" shape="round" label={t.next} onPress={() => setIndex((i: number) => (i + 1) % items.length)}>
                <ui.Icon name="right" />
              </ui.Button>
            </div>
          </div>
        </section>
      ) : (
        list.state.kind === 'ready' && <p className="zen-empty">{t.emptyZen}</p>
      )}
      {target && <TaskDialog ui={ui} subject={subject} context={target.contextIri} reload={list.reload} />}
    </>
  );
}

function TaskDialog({ ui, subject, context, reload }: {
  readonly ui: UiKit; readonly subject: string | null; readonly context: string; readonly reload: () => unknown;
}) {
  const t = useMessages(texts);
  const route = useRoute();
  const edit = useContextEditor(taskFields);
  const { open, close: closeEditor } = edit;
  const { changing } = useAppState();
  const [checked, setChecked] = useState(0);
  useEffect(() => {
    if (changing) return;
    if (subject) void open({ subject, context });
    else void closeEditor();
  }, [subject, context, changing, open, closeEditor]);
  const editor = subject && edit.target?.subject === subject ? edit.editor : null;
  // Guarded: the SDK asks before a dirty draft is discarded.
  const requestClose = async () => {
    if (await edit.close()) {
      route.go({ task: null });
      void reload();
    }
  };
  return (
    <ui.ScreenDialog
      title={t.details}
      closeLabel={t.close}
      open={!!subject}
      onRequestClose={() => void requestClose()}
      actions={<ui.HeaderMenu label={t.taskMenu} icon="more" items={[{ label: t.check, onSelect: () => setChecked((n: number) => n + 1) }]} />}
    >
      <output hidden data-testid="checked">{checked}</output>
      <ResourceEditor editor={editor} quiet onClose={() => void requestClose()} labels={{ title: t.title, description: t.description, planned: t.planned }}>
        {(draft, change) => <TaskInputs ui={ui} draft={draft} change={change} />}
      </ResourceEditor>
    </ui.ScreenDialog>
  );
}

function TaskInputs({ ui, draft, change }: {
  readonly ui: UiKit; readonly draft: TaskDraft; readonly change: (draft: TaskDraft) => void;
}) {
  const t = useMessages(texts);
  const { locale } = useSdkLocale();
  const update = (values: Partial<TaskDraft>) => change({ ...draft, ...values });
  return (
    <div className="task-fields">
      <label>
        {t.title}
        <input value={draft.title} onChange={(e) => update({ title: e.target.value })} required />
      </label>
      <label>
        {t.description}
        <textarea rows={2} value={draft.description ?? ''} onChange={(e) => update({ description: e.target.value })} />
      </label>
      <ui.DateField
        label={t.planned}
        value={draft.planned ?? ''}
        onChange={(planned) => update({ planned })}
        noneLabel={t.noPlanning}
        applyLabel={t.apply}
        locale={locale}
      />
    </div>
  );
}
