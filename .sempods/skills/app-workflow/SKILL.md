---
name: app-workflow
description:
  Create or change a sempods app in an owner's apps repository, guide first
  setup and SDK updates, and verify and record the result. For app work, not maintenance of the
  template or SDK itself.
---

# App workflow

Read the repository's [AGENTS.md](../../../AGENTS.md) and owner instructions,
then follow the [canonical workflow](../../instructions/app-workflow.md). Use
[INIT.md](../../../INIT.md) for first setup. Existing apps keep their code and
decisions in their own folder and `NOTES.md`.

The workflow owns commands, pinned SDK references, verification and handoff. It
works without skill discovery; this entry adds no separate rules.

For SDK updates, follow [Update the SDK](../../instructions/app-workflow.md#update-the-sdk).
A patch update is merged when checks pass. Before 1.0, a minor update may break
apps: follow the SDK migration guide, adapt the apps, run checks and list what
to try on the Pod before merging.
