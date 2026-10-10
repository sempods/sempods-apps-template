---
name: update
description:
  Update the tooling of a sempods apps repository created from the starter:
  install a newer @sempods/apps, migrate the shared files, review the result
  and open a pull request. Not for SDK-only updates.
---

# Update the tooling

Use this when the owner asks to update the tooling or the starter, or when a
pull request raises the `@sempods/apps` version in `package.json`. Read the
repository's `AGENTS.md` and the setup record in its `INIT.md` first. SDK
updates follow [Update the SDK](../../instructions/app-workflow.md#update-the-sdk)
instead.

1. **Start clean.** The working tree must have no uncommitted changes, so the
   update is one reviewable diff. Work on a new branch, for example
   `tooling-update-<version>`, or on the branch of the version pull request.
2. **Update.** `pnpm run update` installs the newest version and migrates;
   `pnpm run update <version>` a specific one. It first checks that Node and
   pnpm suit that version; if not, follow its numbered order, then run it
   again; nothing was changed. On the branch of a version pull request, run
   `pnpm run update <version>` with the version the pull request names, so
   the same check runs before anything is installed. If pnpm refuses to run
   it because the dependencies are out of date, start the installed tooling
   directly:
   `node node_modules/@sempods/apps/bin/sempods-apps.mjs update <version>`.
3. **Read the upgrade notes** for every version after the old one, including
   skipped ones, in `node_modules/@sempods/apps/CHANGELOG.md`. They name what
   the migration cannot do alone, such as changes the owner's apps need.
4. **Decide the manual cases.** The migration applies only unambiguous
   changes. It lists everything else in `.sempods-migration/migration.json`,
   each with a reason, and leaves those files exactly as they are. Next to
   the list are the old starter's version (`base/`), the new starter's
   version (`starter/`) and, where both are text, a merge suggestion
   (`suggestion/`) whose conflicts are marked. For each case:
   - Compare the repository's file with `base/` to see what the owner changed,
     and `base/` with `starter/` to see what the starter changed.
   - Keep the owner's changes. Keep the owner section of AGENTS.md and the
     setup record of INIT.md exactly as they are, including their marker
     lines.
   - Apply what the starter changed. Where both changed the same lines,
     follow the intent of each; when it is a matter of choice, ask the owner.
   - For a file the starter dropped, a file added on both sides or a
     file/directory collision, explain the case and decide with the owner.
     Keeping the owner's version or declining a starter change is a valid
     decision.
   - Write the decided result to the repository's file; never leave conflict
     markers from a suggestion in it.
   - Record each decision and its reason for the pull request.
5. **Finish.** Review the whole list again, the resulting diff and the owner
   section and setup record. Only when every listed case has a deliberate
   decision, run `pnpm run migrate --done`: it confirms those decisions,
   applies anything automatic still left, rewrites the apps' generated
   configuration, installs and advances the baseline in
   `.sempods-baseline.json`. It refuses while a file still contains an
   unresolved suggestion. If a step fails, fix the cause and run the same
   command again; the list and the decisions stay. Without manual cases,
   `pnpm run migrate` finishes on its own.
6. **Check.** Run `pnpm run check` until it passes.
7. **Hand over.** With a GitHub remote, open a pull request "Update the tooling
   to <version>" with the migration report, each manual case and how it was
   decided, and what to try. Tell the owner what changed in plain words and
   what they should try. App code, app notes and the owner's entries in
   `package.json` are never rewritten by the migration.
