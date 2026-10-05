# Maintain the template

This guide applies to work on `sempods/sempods-apps-template` itself. For work
in an owner's copy, use [AGENTS.md](../AGENTS.md) and the
[app workflow](../.sempods/instructions/app-workflow.md). Do not execute INIT's
instance adaptations in the upstream template: retain its CODEOWNERS and DCO.

Read the [vision](vision.md), [plan](plan.md), owning issue and current
discussion. Claim the issue with the matching `claimed:*` label and a signed
agent comment (for example `[Codex]`); use an isolated branch from
`origin/main`. Coordinate file ownership before editing. The owner merges;
implementation is not approval or permission to publish, change visibility or
release packages.

## Parallel M1a work

[#2](https://github.com/sempods/sempods-apps-template/issues/2) owns the
skeleton, root package/configuration, scripts, snapshot and CI. Its paths,
commands and `apps.json` fields are the integration contract.
[#3](https://github.com/sempods/sempods-apps-template/issues/3) owns user
guides, agent instructions and skills. Propose interface changes in #2 first; do
not change its files from the instructions branch. Keep user-facing prose short;
link to the pinned snapshot instead of copying SDK manuals.

Review #2 and #3 together before the independent
[#4 authoring exercise](https://github.com/sempods/sempods-apps-template/issues/4).
Until #2 lands, validate local Markdown links and check SDK-reference targets
against the pinned SDK revision, reporting the missing integration dependency.
Do not add placeholder scripts or a fabricated snapshot to make checks pass.
Once the skeleton is integrated, use its `npm ci` and `npm run check` commands.
Record the exact commit and distinguish document/fixture checks from an actual
user starting an app against a Pod. Skills and link checks do not prove that
exercise was completed.

## Keep one instruction source

The canonical workflow lives in `.sempods/instructions/app-workflow.md`, and
`.sempods/skills/app-workflow/SKILL.md` is its canonical skill entry. Root/tool
adapters only route to it. When changing a command or path, check README, INIT,
AGENTS, user steps and all adapters together. Verify skill frontmatter and links
as well as whether the instructions lead to a usable outcome.

In an instance, preserve the delimited owner section in AGENTS.md, the instance
setup record in INIT, app code, `apps.json` and app notes. Updates must respect
the [plan's file ownership](plan.md#updates). In this template repository those
initial records remain unfilled. Do not remove records from a user's copy to
make it resemble a fresh template. SDK snapshots keep their source revision and
own licence/NOTICE files; template MIT-0 does not replace them.

## Handoff

Sign off every commit using the configured contributor identity
(`git commit -s`) and honestly attribute AI assistance. Prefix GitHub text with
the acting agent's name in brackets. Open a PR linked to the issue, record
checks and remaining integration work, and request independent review of its
exact head SHA. Keep a claim until the work is handed off or explicitly
released. Do not count review of an earlier head, or the author's own checks, as
independent approval.
