# Purpose and direction

The [SDK vision](https://github.com/sempods/sempods-typescript/blob/main/docs/vision.md)
says that people should be able to build a small, useful app around their own data
without building another backend. This template makes the second and the tenth app
as cheap as the first.

**Your own apps repository.** One person or team keeps all of their small sempods
apps in one repository, created from this template. The one-time work happens
once: instructions for the coding assistant, tooling, checks, hosting and one
domain. After that, a new app is a folder and a conversation: describe the idea,
let the assistant build it with the SDK, try it on your Pod.

**Same app, either way.** A single app built with the SDK's
[quickstart](https://github.com/sempods/sempods-typescript/blob/main/docs/quickstart.md)
remains a first-class path, and the SDK repository keeps owning instructions for
single apps and other modules. Each app in this repository has the quickstart's
layout, so it can move into its own repository and back. The repository only adds
what several apps share: a manifest, an overview page, one site build and shared
instructions.

**One repository, one trust boundary.** Apps of one repository trust each other's
JavaScript. Deployed under one site, they share a browser security boundary
([deployment guide](https://github.com/sempods/sempods-typescript/blob/main/docs/deployment.md)).
Apps of different people never share a site: at an event, every participant
creates their own repository from this template, not a folder in a shared one.

**Instructions are the product.** The value of this template lies in its agent
instructions and in a few deterministic scripts. Scripts own what must be right
(base paths, callback routes, identity configuration, the shared SDK version);
the assistant owns the conversation and the app itself. Instructions that change
with the SDK come from a snapshot pinned to the installed SDK version, not from
copied text that drifts.

**Default UI first.** Apps start with the SDK's default AppShell and components.
When the default gets in the way, the finding goes to the SDK, not into a local
workaround; a template that needs heavy customization signals an SDK gap.

**Success** means that someone with a Pod and a coding assistant goes from "Use
this template" to a first working app on their Pod in one session, and adds the
next app with one prompt. The reference exercise is a shopping list (Konsum) built
from a short prompt, with the time taken and every point of friction recorded.

**Not goals:** a framework or runtime of its own, a backend, shared hosting for
several people, AI features by default, or a second home for SDK documentation.

This is direction, not a feature checklist. The [plan](plan.md) owns the steps
and open decisions.
