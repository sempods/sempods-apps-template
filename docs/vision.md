# Purpose and direction

The
[SDK vision](https://github.com/sempods/sempods-typescript/blob/main/docs/vision.md)
says that people should be able to build a small, useful app around their own
data without building another backend. This template makes the second and the
tenth app as cheap as the first. Vibe-coding is the standard way to use it: a
person describes what they need, the assistant builds a small slice, and they
try it and decide what comes next. Users do not need to identify as developers.

**Your own apps repository.** One person or team keeps all of their small
sempods apps in one repository, created from this template. The one-time work
happens once: instructions for the coding assistant, tooling, checks, hosting
and one domain. After that, a new app is a folder and a conversation: describe
the idea, let the assistant build it with the SDK, try it on your Pod.

**Playground and foundation.** This template is everyone's personal
playground for coding apps quickly: short user introductions, starter prompts,
setup, agent instructions and skill entry points for creating, changing and
publishing small apps. The TypeScript SDK is the more deliberate foundation:
public APIs, contracts, technical guides and examples from which demanding apps,
modules and services are built, where the implementation needs some thought
first. Vibe-coding works there too, including its single-app AI app-builder
guide, but the project is set up more by hand. The template consumes the SDK's
contracts and pinned documentation rather than copying their explanations; the
SDK keeps its single-app guidance and points to this template as the quick
start for personal apps.

**Same app, either way.** A single app built with the SDK's
[quickstart](https://github.com/sempods/sempods-typescript/blob/main/docs/quickstart.md)
remains a first-class path. Each app in this repository has the quickstart's
layout, so it can move into its own repository and back. The repository only
adds what several apps share: a manifest, an overview page, one site build and
shared instructions.

**One repository, one trust boundary.** Apps of one repository trust each
other's JavaScript. Deployed under one site, they share a browser security
boundary
([deployment guide](https://github.com/sempods/sempods-typescript/blob/main/docs/deployment.md)).
Apps of different people never share a site: at an event, every participant
creates their own repository from this template, not a folder in a shared one.

**Two readers, two entrances.** The README answers "What can I make?", "What do
I need?" and "What do I tell my assistant?" in a few short paragraphs with a
copyable prompt. Linked user guides explain the next action in plain language.
AGENTS.md routes the assistant to the complete workflow, app decisions and
pinned SDK references; skill entries point to that same workflow. Users should
not need to read an API guide or an agent manual to begin.

**Instructions are the product.** The value of this template lies in its agent
instructions and in a few deterministic scripts. Scripts own what must be right
(base paths, callback routes, identity configuration, the shared SDK version);
the assistant owns the conversation and the app itself. Instructions that change
with the SDK come from the reference the installed SDK package ships at its own
version, not from copied text that drifts.

**Default UI first.** Apps start with the SDK's default access UI (`AppAccess`)
and components; the app owns its layout around them.
Ordinary visual and domain-specific customization is welcome. When an app needs
to recreate authentication, recovery or other SDK responsibilities, record an
SDK finding rather than adding a parallel implementation.

**PWA by default.** Generated production apps include the manifest, icons and
scoped worker configuration needed for installation. Each app can opt out. An
offline shell is not offline editing; sign-in, update behavior and
installed-device support keep the SDK's documented constraints and evidence
requirements.

**Success** means that someone with a Pod and a coding assistant goes from "Use
this template" to a first working app on their Pod in one session, and adds the
next app with one prompt. The user can follow the short introduction, see what
was tested and retain control over real data and publication. The reference
exercise is a shopping list (Konsum) built from a short prompt, with the time
taken and every point of friction recorded.

**Not goals:** a framework or runtime of its own, a backend, shared hosting for
several people, AI features by default, or a second home for SDK documentation.

This is direction, not a feature checklist. Issues hold the steps and open
decisions.
