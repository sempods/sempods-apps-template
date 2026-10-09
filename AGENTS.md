# Working in this apps repository

Scope: the whole repository. More specific app instructions can refine app work;
the owner's requests and recorded choices determine the task.

The owner describes what they need; you build small, usable steps for them to
try. Do not assume developer knowledge. Explain what to try in the owner's
language. Make routine technical choices from the workflow and installed SDK
reference, recording them in app notes. Ask only when a
missing answer affects the next useful step, access to data or publication; use
existing answers and explain choices in everyday terms.

For creating or changing an app:

1. On first setup, read [INIT.md](INIT.md). On later sessions, read its setup
   record and the target app's `apps/<id>/NOTES.md` first.
2. Follow the [app workflow](.sempods/instructions/app-workflow.md), then the
   SDK's AI entry, shipped with the installed package at
   `node_modules/@sempods/app-sdk/docs/ai-app-builder.md` (run `pnpm install`
   first if `node_modules` is missing), and the guides relevant to the change. They
   match the installed version; use that version's API.
3. Keep app-specific decisions in its notes and repository-wide choices in the
   owner section below. Do not place credentials or private Pod data there.

The [skill](.sempods/skills/app-workflow/SKILL.md) routes to the same workflow;
skill discovery is optional. To pick up a newer template release, follow the
[update-template skill](.sempods/skills/update-template/SKILL.md).
[User steps](docs/start.md) describe the same journey for the owner.

## Owner instructions

Template updates must preserve the delimited section below verbatim. Only change
it to record this owner's instructions or decisions, not template defaults.

<!-- BEGIN OWNER INSTRUCTIONS -->

No instance-specific instructions recorded yet.

<!-- END OWNER INSTRUCTIONS -->
