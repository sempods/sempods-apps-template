# Working in this apps repository

Scope: the whole repository. More specific app instructions can refine app work;
the owner's requests and recorded choices determine the task.

The owner describes what they need; you build small, usable steps for them to
try. Do not assume developer knowledge. Explain what to try and any choice in
everyday terms, in the owner's language. Make routine technical choices from
the workflow and installed SDK reference, and record them in app notes. Ask
only for the decisions that setup and the workflow leave to the owner, and use
answers already given.

The instructions you follow ship with the installed tooling package
`@sempods/apps` and the SDK. If `node_modules` is missing, follow the
bootstrap steps in [INIT.md](INIT.md) first.

1. On first setup, read [INIT.md](INIT.md). On later sessions, read its setup
   record and the target app's `apps/<id>/NOTES.md` first.
2. Follow the app workflow,
   `node_modules/@sempods/apps/instructions/app-workflow.md`, then the SDK's AI
   entry, `node_modules/@sempods/app-sdk/docs/ai-app-builder.md`, and the
   guides relevant to the change. They match the installed versions; use those
   versions' API.
3. Keep app-specific decisions in its notes and repository-wide choices in the
   owner section below. Do not place credentials or private Pod data there.

The app-workflow skill in `.claude/skills/` and `.agents/skills/` routes to the
same workflow; skill discovery is optional. To update the tooling, follow the
update skill there, `node_modules/@sempods/apps/skills/update/SKILL.md`.
[User steps](docs/start.md) describe the same journey for the owner.

## Owner instructions

Updates must preserve the delimited section below verbatim. Only change it to
record this owner's instructions or decisions.

<!-- BEGIN OWNER INSTRUCTIONS -->

No instance-specific instructions recorded yet.

<!-- END OWNER INSTRUCTIONS -->
