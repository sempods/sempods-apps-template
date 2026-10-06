---
name: update-template
description:
  Update an owner's sempods apps repository to a newer template release with
  update-template, review the result and open a pull request. Not for SDK-only
  updates or maintenance of the template itself.
---

# Update the template

Use this when the owner asks to update the template, or to pick up a template
release. Read the repository's [AGENTS.md](../../../AGENTS.md) and the setup
record in [INIT.md](../../../INIT.md) first. The script follows
[the update policy](../../update-policy.json); this entry adds the review around
it.

1. **Start clean.** The working tree must have no uncommitted changes, so the
   update is one reviewable diff. Work on a new branch, for example
   `template-update-<version>`.
2. **Run the update.** `npm run update-template` applies the newest tagged
   release; `npm run update-template -- <version>` a specific one. It clones the
   template with the owner's existing Git access and runs that release's own
   script. Never ask for a token; if access fails, tell the owner.

   A repository with template 0.1.0 has no `update-template` script yet. Run
   the release copy directly:

   ```sh
   git clone https://github.com/sempods/sempods-apps-template.git <temp-dir>
   git -C <temp-dir> checkout v<version>
   node <temp-dir>/.sempods/scripts/update-template.mjs --instance .
   ```

3. **Work through the report.** The script prints it and exits with 3 when
   something needs a decision.
   - **Conflicts** are marked in the named files. Resolve them so the template
     change is applied and the owner's own wording stays.
   - **Review by hand** lists owner files the template cannot change. Explain
     each to the owner and edit app code or notes only with their agreement.
   - **Manifest entries kept** are versions the owner chose; keep them unless
     the owner wants the template's.
   - **Changelog** gives upgrade notes per release. Apply them in order; they
     include SDK migrations that may need app changes.
4. **Verify.** Run `npm ci` and `npm run check -- --standalone all`. Then list
   what the owner should try on the Pod for each app.
5. **Hand over.** With a GitHub remote, open a pull request "Update the template
   to <version>" whose description contains the report, the decisions made and
   the list of things to try. Without a remote, leave the change in the working
   tree and summarise it. Never merge on the owner's behalf.

Running the update again at the same version changes nothing. App code,
`apps.json`, app notes, the owner section of AGENTS.md and the setup record in
INIT.md are never rewritten by the script.
