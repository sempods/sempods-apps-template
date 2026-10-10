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
   `pnpm run update <version>` a specific one. If it reports that the version
   needs a newer Node or pnpm, follow its numbered order, then run it again;
   nothing was changed. On the branch of a version pull request, where the
   version is already in `package.json`, run `pnpm install` and then
   `pnpm run migrate`. If that install stops because Node or pnpm is too old,
   `npm view @sempods/apps@<version> engines` names what the version needs;
   install that first.
3. **Review the report.**
   - **Conflicts** are marked in the named files, between this repository's
     lines and the new starter's. Resolve them so the owner's changes and the
     starter's intent both hold, then run `pnpm run migrate` again until it
     reports no conflict. The baseline in `.sempods-baseline.json` advances
     only then.
   - **Review by hand** lists files the migration did not change on its own,
     for example a shared file the owner changed and the starter removed.
     Explain each to the owner and change it only with their decision.
   - The owner section of AGENTS.md, the setup record in INIT.md, app code,
     app notes and the owner's entries in `package.json` are never rewritten.
4. **Read the upgrade notes** for every version after the old one in
   `node_modules/@sempods/apps/CHANGELOG.md`. They name what the migration
   cannot do alone, such as changes the owner's apps need.
5. **Check.** Run `pnpm run check` and fix what it reports. An interrupted
   migration is safe to rerun: `pnpm run migrate` continues it.
6. **Hand over.** With a GitHub remote, open a pull request "Update the tooling
   to <version>" with the report, the resolved conflicts and what to try. Tell
   the owner what changed in plain words and what they should try.
