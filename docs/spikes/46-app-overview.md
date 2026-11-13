# Spike: the app overview, the app's public description and the app store

[Claude] First written on 2026-11-03 as a decision paper for the overview
(sempods/sempods-apps-template#46), then deferred until the app's public
description was settled as a whole. Revised on 2026-11-12 at the owner's
request with that question answered: one description per app, written once,
published in the formats that browsers, authorization servers, the site's
overview and a later app store read. Checked against template 0.10.0 (d5c98fa),
SDK 0.8.0, the
[CIMD draft -03](https://datatracker.ietf.org/doc/draft-ietf-oauth-client-id-metadata-document/)
of 2026-11-02 and sempods/sempods-kotlin#437. No prototype was built.
**Decided on 2026-11-12** by the owner, decision by decision; see
[Decisions](#decisions) at the end. **Revised on 2026-11-13**: the store
starts as a static page that reads one central list of app addresses
([Phase 0](#phase-0-a-static-page)); the Pod store follows later.

## Answer

1. **Each app describes itself in one owner file, `apps/<id>/app.json`.** Its
   fields follow the Web App Manifest (`name`, `short_name`, `description`,
   `categories`, `*_localized`); a longer detail text is Markdown in
   `details.md` beside it. `apps.json` stays the registry of IDs, paths,
   ports, routes and the site; it loses `title` and `description` to
   `app.json`.
2. **Every published format is generated from it in one build** and checked
   against the others: the PWA manifest for browsers, a Client ID Metadata
   Document for authorization servers, the minimal `did.json` some Pods
   require, the overview page for people and a JSON-LD description for
   machines. Consistency comes from generation, not from signatures.
3. **The app's IRI is its address**, for example
   `https://danilo.apps.sempods.org/konsum/`. It is the manifest's `id` and
   `start_url`, the subject of the JSON-LD description, the CIMD's
   `client_uri`, and the `did:web` identity is derived from it. A store entry
   points to this IRI.
4. **The overview becomes a store-like, localized page** with cards, a detail
   view per app at `/#<id>`, an install hint and a language switch. It stays
   static: no SDK runtime and no sign-in, only a few lines of inline script
   for the language.
5. **Host anywhere, list centrally.** Anyone vibe-codes their apps with this
   template and publishes them for free on a host of their choice, for
   example `my-apps.netlify.app`. Good apps can be submitted to the store at
   `apps.sempods.org`, which lists and checks them but never hosts them:
   decentralised, yet trusted.
6. **Trust comes from the origin and the publisher, not from app keys.** HTTPS
   and DNS prove who serves an app; the store re-fetches what it lists; the
   publisher confirms each published build in their own Pod, which listing
   requires once the store has its Pod; a review vouches for the publisher,
   not for every build. Apps hold no signing keys. The Pod's consent stays
   the safety boundary, so the store shows which data an app asks for.
7. **The store at `apps.sempods.org` starts as a static page.** One central
   file lists the address of each registered app's `app.jsonld`; the page
   loads name, texts and icon in the browser from the app's own origin.
   Later the store becomes a Pod plus a sempods app: it imports each site's
   catalog `/apps.jsonld`, keeps one record per app IRI with its provenance
   in a public Context, and its UI reads that Context without sign-in. It is
   a project of its own; this template only publishes what it needs.

## Baseline

What exists in 0.10.0:

- **`apps.json`** records per app `id`, `title`, `language` (`en`, `de` or
  `auto`), `path`, `devPort`, `pwa`, optionally `description` (one sentence,
  at most 120 characters), `routes` and `resources`. `site` records the
  production and preview origins.
- **Generated per app** (`regenerate`): the runtime profiles with the
  `did:web` identity, and the Vite configuration with the page title and the
  PWA manifest (`id`, `name`, `short_name`, `description`, `lang`,
  `start_url`, `scope`, two PNG icons, fixed white colours).
- **Icons**: `new-app` and `icon` draw a monogram from the title's first
  letter in the theme's accent, as `favicon.svg` and PNG 192/512, without an
  image tool. An owner cannot supply an icon of their own.
- **`build-site`** writes per app `did.json` (`@context` and `id` only) and
  the callback page, and at the root the overview `index.html` and
  `404.html`: one card per app with icon, title and description, system
  colours, `lang` per card, no script. The page language is the apps' shared
  language, else English.
- **Sign-in identity**: `did:web:<host>:<id>` with the callback
  `<origin>/<id>/callback`. Under SPS-AUTH-003 a Pod fetches neither a DID
  document nor client metadata; it binds the DID's host and path to the
  callback. Only some Pods require the DID document
  ([deployment guide](https://github.com/sempods/sempods-typescript/blob/v0.8.0/docs/deployment.md)).
  Locally, a dynamic client registers with the title as `client_name`.

So name, description and icon already appear in four places (manifest,
overview, sign-in screen in development, page title), all from `apps.json`.
CIMD and a store add two more, and those are read by others: that is why the
source has to be settled first.

## One app, one IRI

Every format describes the same app and must name it the same way. The anchor
is the HTTPS address of the app's start page:

| What                         | Value for Konsum on `danilo.apps.sempods.org`                   |
| ---------------------------- | ---------------------------------------------------------------- |
| App IRI (`@id`, `client_uri`) | `https://danilo.apps.sempods.org/konsum/`                        |
| Manifest `id`, `start_url`   | `/konsum/`, which resolves to the app IRI                        |
| `did:web` client ID (today)  | `did:web:danilo.apps.sempods.org:konsum`                         |
| DID document                 | `https://danilo.apps.sempods.org/konsum/did.json`                |
| CIMD client ID (later)       | `https://danilo.apps.sempods.org/konsum/client.json`             |
| Callback                     | `https://danilo.apps.sempods.org/konsum/callback`                |
| JSON-LD description          | `https://danilo.apps.sempods.org/konsum/app.jsonld`              |
| Site catalog                 | `https://danilo.apps.sempods.org/apps.jsonld`                    |

Any HTTPS origin works the same way, for example
`https://my-apps.netlify.app/konsum/`. Everything lives below the app's path,
and the IRI cannot drift from the identity: both derive from
`site.production` and the ID. Changing either still changes the identity and
loses sessions and grants, as today.

The path separates the apps' identities, callbacks and PWA scopes on a shared
origin. It does not separate their code: apps of one origin share the
browser's [security boundary](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy)
and trust each other's JavaScript, as the vision's "one repository, one trust
boundary" says. The store therefore lists apps one by one but trusts a site
as a whole: a publisher confirmation, a build check or a review of one app
says nothing in its favour against another app of the same site.

## The source: `apps/<id>/app.json`

### Why a file per app

| Option                                   | For                                                                                                      | Against                                                                                  |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **`apps/<id>/app.json`** (chosen)        | Travels with the app ("same app, either way"); long localized texts stay out of the registry; one owner file per app | A second file per app; `apps.json` schema version 2 and a migration                    |
| Everything in `apps.json`                | One file, one validation                                                                                 | Grows with every language and detail text; the description leaves with the app's folder |
| The PWA manifest itself as the source    | No mapping for browsers                                                                                  | Exists only with `pwa: true`; has no place for detail text or publisher; Vite generates it |

`app.json` borrows the manifest's field names and its localization model, so
the PWA manifest is close to a copy and the assistant writes fields that
already have documented meanings. Fields the manifest does not have are few
and marked below.

### Shape

```json
{
  "lang": "de",
  "name": "Konsum",
  "short_name": "Konsum",
  "description": "Was im Haushalt fehlt, für alle.",
  "categories": ["shopping", "lifestyle"],
  "name_localized": { "en": "Konsum" },
  "description_localized": { "en": "What the household needs, for everyone." }
}
```

Beside it, the detail text in Markdown, one file per language:

```text
apps/konsum/app.json
apps/konsum/details.md       (the language of "lang", here German)
apps/konsum/details.en.md
```

- `lang` is the language of the base values. It is required, because a
  manifest's base values carry no language of their own.
- `name` replaces `apps.json`'s `title`; `description` keeps today's rule
  (one sentence, at most 120 characters).
- The detail text (not in the manifest) is Markdown in `details.md` and
  `details.<lang>.md`, not a JSON field, so the assistant and the owner write
  it as prose. It is optional; without it, the detail view shows the
  description only. See [Markdown](#markdown) for the allowed subset.
- `categories` uses the manifest's
  [known categories](https://github.com/w3c/manifest/wiki/Categories); it
  drives grouping on the overview and in the store.
- `*_localized` follows the manifest's localization members, which Chrome and
  Edge ship since version 148
  ([MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Localize_an_app_manifest)):
  a map from language tag to value. Browsers without support use the base
  values.
- The app's UI languages stay in `apps.json` (`language`). `check` requires
  texts for each of them: an `auto` app needs `de` and `en`, a `de` app only
  `de`. A missing translation is an error, not a silent fallback, because the
  overview would otherwise show one language mixed into another.

### Markdown

Prose increasingly arrives as Markdown, from assistants, wikis and notes, and
a sempod will have to handle Markdown sources well in general. The detail
text is a small, early case of it, so it uses Markdown rather than a format to
be replaced later. The template restricts what an owner writes, so that its
own rendering stays simple:

- CommonMark without raw HTML; `check` rejects HTML blocks and inline HTML.
- Links only with `https:`; images only from below the app's own path.
- Headings from level 2, because the detail view supplies the level-1
  heading.

`build-site` renders it with [micromark](https://github.com/micromark/micromark),
which is CommonMark-compliant and drops raw HTML by default; that is one new
runtime dependency of the tooling.

`check` runs in the owner's repository and proves nothing to anyone else: a
publisher can skip it and still confirm their build. Every other reader of
`app.jsonld` (the store, another site, a Pod) treats the text as untrusted
and enforces the rules again when it imports or renders it: raw HTML off,
its own URL rules for links and images, and a size limit (proposal: 16 KB
per language). A renderer that is safe by default, such as micromark, covers
the first; the URL rules and the limit stay the reader's job
([micromark on security](https://github.com/micromark/micromark#security)). In `app.jsonld` the text stays Markdown,
so the store and a Pod receive the original. An RDF literal carries either a
language or a datatype, never both, so each language becomes its own
`schema:TextObject` with `inLanguage` and the media type `text/markdown`
([RFC 7763](https://www.rfc-editor.org/rfc/rfc7763)) as `encodingFormat`. How a Pod turns Markdown into RDF structure (sections,
links as edges) is a question for the Pod and the spec, not for this
template, and this choice does not preclude it.

Later, without a new model: `screenshots` (manifest field; the visual check
already takes them at 375px) and `icon` for an owner icon (below). The kinds
of data an app reads and writes (schema.org types and whether it writes) are
needed before the store opens to other owners: the store shows them next to
the trust level, because consent in the Pod is what actually limits an app
(see [Trust is not safety](#trust-is-not-safety)). They also let the store
say which vocabularies an app shares with others.

### Icons

The store needs better icons than letters. Proposal: an optional owner file
`apps/<id>/icon.svg` (square, content inside the maskable safe zone). When it
exists, `icon` renders the PNG sizes and a maskable variant from it; without
it, the monogram stays. Rendering an arbitrary SVG needs a rasterizer: the
tooling already depends on Playwright, whose Chromium can render it, so no
new dependency is needed. Every published icon keeps a fixed address
(`/<id>/icon-512.png`), because CIMD's `logo_uri` and store records point to
it.

### Site level

`apps.json` gains a `catalog` object for the overview and the store, separate
from `site`, which stays the published origins:

```json
"catalog": {
  "lang": "de",
  "name": "Danilos Apps",
  "description": "Kleine Apps für den Alltag, mit den Daten im eigenen Pod.",
  "name_localized": { "en": "Danilo's apps" },
  "description_localized": { "en": "Small everyday apps, with the data in your own Pod." },
  "publisher": "https://danilo.example-pod.org/profile/card#me"
}
```

`publisher` is optional: the WebID of the person or team behind the site. The
store trusts it only for builds the publisher confirmed in their own Pod (see
[Trust](#trust)); the overview shows it as stated.

## The generated formats

One `build-site` run writes all of them from `app.json`, `apps.json` and the
profile's origin. A check in `build-site` compares the identifiers across the
outputs before anything is published.

### PWA manifest (browsers)

As today, plus `*_localized`, `categories`, the maskable icon and the theme's
colours instead of fixed white. Only for apps with `pwa: true`.

### Client ID Metadata Document (authorization servers)

`/<id>/client.json`, small enough for the draft's suggested 5 KB limit:

```json
{
  "client_id": "https://danilo.apps.sempods.org/konsum/client.json",
  "client_name": "Konsum",
  "client_name#en": "Konsum",
  "client_uri": "https://danilo.apps.sempods.org/konsum/",
  "logo_uri": "https://danilo.apps.sempods.org/konsum/icon-512.png",
  "redirect_uris": ["https://danilo.apps.sempods.org/konsum/callback"],
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "token_endpoint_auth_methods_supported": ["none"],
  "application_type": "web"
}
```

- Language variants use RFC 7591's `#<tag>` suffix; the base value is in the
  app's `lang`.
- No secrets, no keys: a browser app is a public client, and the draft forbids
  shared secrets.
- RFC 7591 has no description field; the description stays in the JSON-LD
  description, which `client_uri` leads to.
- A preview build writes its own `client.json` with the preview origin.

**Published from phase 1**, before any Pod reads it. The document is
harmless while the runtime signs in as `did:web`, and it lets
sempods-kotlin#437 test against real documents. Switching the runtime to it
is a separate step (below).

**Input for #437.** The draft does not require redirect URIs to share the
client ID's origin or path. For apps sharing an origin, the sempods spec
must require what `did:web` gives today: same origin, and the redirect
inside the directory of the client ID URL (`/konsum/client.json` allows
`/konsum/…` only). Otherwise one app on a site could name another's
callback. The consent screen should show the verified host and path next to
the self-asserted name and logo, as the draft advises.

### DID document (Pods that require it)

Unchanged: `@context` and `id`. Adding services or `alsoKnownAs` would help
nobody today, since a conforming Pod does not fetch it; the JSON-LD
description links the identifiers instead.

### JSON-LD description (overview, store, any RDF reader)

`/<id>/app.jsonld`, schema.org terms, language maps for the localized fields:

```json
{
  "@context": [
    "https://schema.org/",
    {
      "name": { "@container": "@language" },
      "description": { "@container": "@language" }
    }
  ],
  "@id": "https://danilo.apps.sempods.org/konsum/",
  "@type": "WebApplication",
  "name": { "de": "Konsum", "en": "Konsum" },
  "description": {
    "de": "Was im Haushalt fehlt, für alle.",
    "en": "What the household needs, for everyone."
  },
  "subjectOf": [
    {
      "@type": "TextObject",
      "inLanguage": "de",
      "encodingFormat": "text/markdown",
      "text": "Konsum hält die gemeinsame Einkaufsliste …"
    },
    {
      "@type": "TextObject",
      "inLanguage": "en",
      "encodingFormat": "text/markdown",
      "text": "Konsum keeps a household's shared shopping list …"
    }
  ],
  "applicationCategory": ["shopping", "lifestyle"],
  "inLanguage": ["de", "en"],
  "url": "https://danilo.apps.sempods.org/konsum/",
  "image": "https://danilo.apps.sempods.org/konsum/icon-512.png",
  "isPartOf": { "@id": "https://danilo.apps.sempods.org/" },
  "identifier": [
    "did:web:danilo.apps.sempods.org:konsum",
    "https://danilo.apps.sempods.org/konsum/client.json"
  ]
}
```

`app.jsonld` must be readable from other origins, because the store's page
loads it in the browser ([Phase 0](#phase-0-a-static-page)). It is served
with `Access-Control-Allow-Origin: *`: GitHub Pages sends that header for
every file; for Netlify and Cloudflare Pages, which both read a `_headers`
file, `build-site` writes one that adds it for each `app.jsonld` and for
`/apps.jsonld`. The files are public and the request carries no
credentials, so the header exposes nothing new. Icons need no header: a
page may show an image from another origin.

The app's `index.html` links it with
`<link rel="alternate" type="application/ld+json" href="/konsum/app.jsonld">`,
an absolute path built from the app's `path`. A relative `href` would break:
`build-site` serves the same page at the app's routes and resource
addresses, where `app.jsonld` would resolve to, for example,
`/konsum/tasks/app.jsonld`. The
mapping is small: `name`, `description`, the detail files → `subjectOf`,
`categories` → `applicationCategory`, the UI languages → `inLanguage`.
`publisher` comes from the catalog. The `did:web` identity and the client ID
are plain `identifier` values; their scheme tells them apart. A term of our
own is added only when the store needs one that schema.org lacks, as the
vision asks.

### Site catalog

`/apps.jsonld` at the site root: a `schema:ItemList` with the catalog's name,
description and publisher and one item per app, each with its IRI and its
card fields, so the store needs one request for the list. The overview links
it with `href="/apps.jsonld"`. File names with a dot cannot collide with app IDs.

`build-site` adds `client.json`, `app.jsonld` and `build.json` to the paths it
reserves in an app's output, as it does for `did.json`.

## The overview

### Look

A store front, not a list of links:

- A header with the catalog's name and description and a language switch.
- Cards in a grid: the icon as a rounded square with a soft shadow, the name,
  the short description, the first category as a small chip, an "Open"
  action, and "Can be installed" for PWAs.
- Grouping by category once there are enough apps (proposal: from eight),
  otherwise the order of `apps.json`.
- A detail view at `/#<id>`: large icon, name, the rendered detail text,
  categories, languages, publisher, "Open", and the install hint. It uses
  CSS `:target`, so it works without script and every app has a shareable
  link without a reserved path.
- Colours from the theme tokens of `@sempods/app-ui` (one of the skeleton's
  themes, chosen with `catalog.theme` later), light and dark mode, visible
  focus, contrast of at least 4.5:1 also on the icon placeholder.
- An empty state for a site without apps, and the 404 page in the same look.

Search waits until a site has many apps; the store has it from the start.

### Languages

The page holds all catalog languages; each text carries its `lang`. Without
script it shows `catalog.lang`. A few lines of inline script choose the best
match from `navigator.languages`, set `<html lang>` and remember a choice from
the switch. This keeps one static page and one URL. Per-language pages would
need reserved paths or host-specific language redirects, which Cloudflare
Pages lacks. An app's card always shows the app's own texts; an app in German
only stays German on an English page, marked `lang="de"`.

The overview's own words ("Open", "Can be installed", the install help) come
from the tooling in English and German, as today.

### Install hint

Unchanged from the first version of this paper: the overview cannot install
another page's app, since the browser offers installation only inside the
app's scope. A card says "Can be installed", and the detail view explains the
three browser cases (Chromium's install icon, "Add to Home Screen" on iOS,
little in desktop Firefox) with the SDK's caveat that installed apps are
experimental.

### Local overview

`pnpm run dev` without an ID lists every app with its name and development
address and says how to start one. A served local overview follows only if
owners run several apps at once.

## Trust

The question for the store: how can a visitor of `apps.sempods.org` trust an
entry that is only a record in a Pod, when everything comes from the app's
own domain? The formats in the request answer different parts of it:

| Mechanism                                    | What it proves                                                     | Fit here                                                                                                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTPS origin (DNS and TLS)                   | Who serves the app and its callback                                | **The basis.** It is what `did:web` and CIMD rest on today                                                                                                |
| `did:web` per app                            | Nothing beyond the origin: the DID resolves through that domain    | Stays as the sign-in identity; no keys needed                                                                                                             |
| CIMD                                         | The same origin, plus name and logo for the consent screen         | The coming sign-in identity; name and logo are self-asserted                                                                                              |
| Signed web bundles (Isolated Web Apps)       | The code was signed by a key, independent of hosting                | **Does not fit**: requires the `isolated-app://` scheme and offline bundles, not a hosted PWA                                                             |
| An app signing its JSON (JWS, Data Integrity) | The same as the origin, unless the key is independent of hosting  | **Not now**: a key in the owner's CI adds a secret to manage and proves little more. Only useful if records travel without being re-fetched              |
| DID Configuration (`did-configuration.json`) | Links a key-based DID to a domain                                  | Not needed: a `did:web` already is the domain                                                                                                            |
| WebID ↔ site link                            | A known person or team once claimed the site                       | Not enough alone: after a takeover, the old catalog and the unchanged link can be replayed                                                               |
| Build confirmation in the publisher's Pod    | Whoever controls the WebID's Pod confirmed this build at this site | **Yes**, as "publisher confirmed", without keys: a Pod sign-in is the proof of control                                                                   |
| A store-signed attestation                   | The store reviewed this app at this state                          | **Yes**, as the "certificate": signed by `did:web:apps.sempods.org`, not by the app                                                                       |

In [phase 0](#phase-0-a-static-page) the store fetches nothing itself: the
visitor's browser loads each description from the app's origin over HTTPS,
so what the page shows comes from that origin, and an app is listed when a
maintainer of the store accepts it into the central file. The levels below
need the Pod store and come with it.

The resulting levels a store entry can show:

1. **Domain verified** (automatic). The store fetched `apps.jsonld`,
   `app.jsonld` and `client.json` over HTTPS from the app's origin, every
   `@id` lies below the catalog's origin, and the identifiers agree with each
   other and with the manifest. The store re-fetches on a schedule and
   removes an entry that fails repeatedly. Alone, this is not enough to be
   listed (see [Takeover and moves](#takeover-and-moves)).
2. **Publisher confirmed** (automatic, **required for listing**). The
   catalog names a WebID as `publisher`. The publisher's Pod holds, in a
   public Context only they can write to, one record per app IRI with the
   fingerprint of the build they published (see [The build
   fingerprint](#the-build-fingerprint)). The store computes the same
   fingerprint from what the site serves and lists the build only when it
   matches a confirmed one. Where the store finds the records from the WebID,
   and their terms, are chosen with the store. A static link from the profile to the
   site is not enough: it proves an earlier claim, and after a takeover the
   old catalog can be served again with the link unchanged.
3. **Build checked** (automatic, per build). The store inspects the published
   build as far as a static look allows: no scripts or styles from other
   origins, no network targets other than the Pod and the app's own origin
   in the bundle, the manifest and callback as generated. A failed check is
   shown on the entry; it is evidence, not a guarantee.
4. **Reviewed publisher** (manual). Someone at the store looked at the
   publisher and their apps. The store signs a statement about the WebID and
   the site with `did:web:apps.sempods.org`. A vibe-coded app changes with
   every prompt, so a review of one build would almost always be stale; a
   review of who publishes stays meaningful. For an app it looked at
   closely, the store may still show "changed since review" when the
   fingerprint changes.

Apps never hold keys; the only signing key is the store's. Name and logo stay
self-asserted at every level, so the store, like a consent screen, shows the
host next to them.

Optional, a stronger signal without an owner key: a site built by GitHub
Actions can carry an
[artifact attestation](https://docs.github.com/en/actions/concepts/security/artifact-attestations)
(Sigstore, keyless) that names the commit it was built from, and
`app.jsonld` can name a `codeRepository`. The store can then show "built from
public source". This needs a deploy through Actions rather than the host's
own build, so it stays optional.

### The build fingerprint

A hash in a file name is a naming convention, not an integrity check: a host
can serve other JavaScript under an unchanged `index.html` and unchanged
asset names. The fingerprint therefore covers the contents of the whole
build:

- `build-site` writes `/<id>/build.json`: every published file of the app
  with its path and SHA-256 digest, the service worker, its precache
  manifest, every chunk a dynamic `import()` can load, the manifest and the
  icons included. The fingerprint is the digest of that list.
- The store fetches `build.json` and **every file it lists**, compares each
  digest with the content it received, and fails the check when a file
  differs, is missing, or when `index.html`, the service worker or a script
  references a same-origin file that the list lacks. It never trusts a file
  name.
- `store-check` computes the fingerprint from the local build and from the
  published site, and confirms it only when both agree.

### Limits of what the store can promise

Whoever controls an app's origin decides what its visitors run. The web
platform has no way to authenticate a hosted page against its publisher:
[Subresource Integrity](https://www.w3.org/TR/sri/) checks resources against
hashes in the enclosing HTML, so a host that replaces the HTML replaces the
hashes too. Only signed bundles authenticate code independently of the host,
and they do not fit a hosted PWA (see the table above). The template
therefore adds no integrity attributes; for same-origin assets they would
protect against nothing the host cannot also change.

So the store promises only this: it lists a build that the publisher
confirmed and that the store itself fetched with matching contents, and it
stops listing it when the confirmation is withdrawn or the contents it
fetches change. It cannot see what a host serves to anyone else. A host that
serves the confirmed build to the store and other code to visitors defeats
every check here; the defences are the owner withdrawing the confirmation,
the consent in the Pod, and reports from visitors.

### Trust is not safety

A trust level says who publishes an app and what the store saw; it does not
make the app's code safe. The app runs with the person's Pod tokens, and a
publisher can change it at any time. What limits the damage is the consent
the person gives in their Pod: which Contexts, read or write. The store
therefore shows the kinds of data an app reads and writes beside its trust
level, and its texts say plainly that a listing is no security guarantee.

### Takeover and moves

**Takeover.** An owner deletes their Netlify site, and someone else registers
the free name `my-apps.netlify.app`. The newcomer serves a valid catalog, so
"domain verified" would pass. Worse, they get the same `did:web` identity,
and later the same CIMD client ID, so a Pod may take them for the client a
person already consented to. The answers:

- The store lists a build only when the publisher confirmed its fingerprint
  in their Pod. Replaying the old catalog and the old profile link does not
  help a newcomer: any file of the build they change, including JavaScript
  behind an unchanged name, changes a fingerprint nobody confirmed, and
  they cannot write to the original owner's Pod. A build that
  is not confirmed loses its trust levels at once, "Open" shows a warning,
  and the entry is hidden after a short grace period (proposal: seven days)
  that lets an owner who forgot to confirm catch up.
- A newcomer who serves the owner's last confirmed build unchanged to the
  store passes, and may serve any code to visitors (see
  [Limits](#limits-of-what-the-store-can-promise)). Only the owner can end
  the listing: by withdrawing the confirmation in their Pod, which the
  publish instructions tell them to do whenever they give up a host or a
  domain.
- On the Pod side, sempods-kotlin#437 should consider how long consent to a
  client ID lasts and whether a changed client document (another `logo_uri`,
  other `redirect_uris`) asks again. This is input for the spec, not for
  this template.

**Moves.** An owner who starts on `my-apps.netlify.app` and later takes their
own domain gets new app IRIs and new identities. People lose sessions and
grants, and a store entry would point to the old address. The store supports
"moved": the old site's catalog names the new one, the new one names the same
WebID, and the store carries the entry over. People still sign in again. The
publish instructions therefore advise choosing a durable domain before
submitting to the store.

### Where owners publish

Owners publish on their host's subdomain, such as `my-apps.netlify.app`, on
Cloudflare Pages or GitHub Pages, or on a domain of their own. These hosts
are on the [Public Suffix List](https://publicsuffix.org/) (`netlify.app`,
`pages.dev`, `github.io`), so each owner's site is a site of its own for
browsers: cookies, `SameSite` and storage partitioning stay separate.

sempods offers no subdomains to other publishers. `*.apps.sempods.org` is
used only by the sempods operator for their own apps, for example
`danilo.apps.sempods.org`. Those sites share the registrable domain
`sempods.org` with every other host there, the store included. That is one
owner and one trust boundary, so no Public Suffix List entry is needed; the
list's [submission rules](https://publicsuffix.org/submit/) would also
hardly admit it. Two precautions keep a compromised dependency of one of
those apps from reaching other services under `sempods.org`:

- services there that sign in with cookies use `__Host-` cookies, which no
  subdomain can set or overwrite;
- their CSRF protection does not rely on `SameSite` alone.

If sempods ever offered subdomains to other publishers, their sites would
share one site with each other, against "apps of different people never
share a site", and an entry `apps.sempods.org` on the Public Suffix List
would have to come first. The DNS for such subdomains would be a sempods
operation, not template tooling: the template only needs the origin in
`site.production`.

## The store at `apps.sempods.org`

The store is its own project. It starts as a static page and grows into a
Pod store; this section says enough of both for this template to publish
the right things.

### Phase 0: a static page

As static as it gets, decided on 2026-11-13:

- **One central file** in the store's repository lists the address of each
  registered app's `app.jsonld`, nothing else. An app is registered by a pull
  request that adds its address; a maintainer merges it.
- **One static page** reads that file and, in the visitor's browser, each
  listed `app.jsonld` from the app's origin. It shows the store front of
  [The overview](#the-overview): cards with icon, name, short description
  and category, a detail view with the Markdown text, the visitor's
  language where the app has it, and "Open" on the app's own address.
- **What the page checks**: the description's `@id` lies at the origin it
  was loaded from, and its `image` too; an entry that does not load or does
  not pass is left out. Names and texts are untrusted: the page escapes them
  and renders the Markdown in the restricted subset, as every reader must.
- **Nothing else.** No build job, no copies of the descriptions, no Pod, no
  importer and no `store-check`. They would be stopgaps that the Pod store
  replaces, so they are not built.

### Later: the Pod store

- **A Pod** holds one record per app IRI in a public Context: the imported
  JSON-LD description, plus provenance (`prov:wasDerivedFrom` the fetched
  URL, the fetch time, the fingerprint) and the trust level.
- **An importer** takes a site origin (first by a pull request or an issue to
  the store, later a form), fetches `/apps.jsonld`, checks it as in
  [Trust](#trust) and writes the records. It re-checks on a schedule.
- **The UI** is a sempods app with `signIn: 'none'`: it reads the public
  Context without a token
  ([SDK decision](https://github.com/sempods/sempods-typescript/blob/v0.8.0/docs/decisions.md#public-data-without-a-token-sign-in-only-when-the-app-needs-it)),
  searches with SPARQL and links every entry to its app IRI. It can be built
  with this template, which makes it the first test of the formats.
- **The store never serves an app.** "Open" and installation happen on the
  app's own origin, so sessions, grants and the PWA stay there.
- **Operation.** As a curator, the store needs terms of use, a way to report
  an app, and a delisting procedure. That belongs to the store project.

### Getting listed

In phase 0, an owner gets listed by a pull request to the store's central
file. With the Pod store, submitting should be easy for someone who has never published anything:

1. The owner publishes their site as today (`configure-site`, `build-site`,
   their host) on a durable HTTPS origin.
2. `pnpm run store-check` in their repository checks locally what the store
   requires: the catalog and every `app.jsonld` on the published site, texts
   and detail files in every UI language, an icon, a `publisher` WebID, and
   that the published files match the local build. It explains each failure
   in plain language.
3. It then asks the owner to sign in to their Pod in the browser and writes
   the fingerprints of the published builds to the confirmation records. The
   same step runs after every later deploy, so it belongs to the publish
   routine, not only to the first submission.
4. When everything passes, it prints a prefilled link to submit the site,
   first as an issue in the store's repository, later a form.
5. The store's importer then checks the same things itself and lists the
   site. Nothing in the owner's repository needs a key or a stored token,
   and nobody needs an account at the store.

The assistant's publish instructions mention the store only after a working
publication, as an optional step.

## Phases

This paper reaches well beyond #46, which asked for an overview of one
repository and left hosting out. The work therefore splits into separate
packages, each with its own issue: **metadata and overview** (phase 1, steps
1 to 4; this is #46), **store trust and submission** (phase 1, step 5, and
phase 3; sempods/sempods-apps-template#158) and **sign-in by metadata
document** (phase 2; sempods/sempods-apps-template#159).

1. **Template, no protocol change** (#46 and follow-ups):
   1. `app.json` with migration (`apps.json` schema 2), validation and the
      assistant instructions; `regenerate` reads it.
   2. Manifest with `*_localized`, categories, theme colours and the owner
      icon.
   3. `app.jsonld` and `apps.jsonld`, the identifier check in `build-site`,
      and `build.json`.
   4. The overview: look, detail view, languages, install hint; `dev`
      without an ID.
   5. The declared kinds of data in `app.json`, and `store-check` with the
      build confirmation in the owner's Pod and the submission link, once
      the Pod store's import format is fixed; phase 0 of the store needs
      none of it. A Pod sign-in after every deploy
      must not cost the next app its ease: try the routine with a real owner
      who publishes several times before fixing it.
2. **Sign-in by metadata document**, after sempods-kotlin#437 and the spec
   companion: `client.json` (may ship in phase 1), an identity kind in the
   SDK runtime, and a `configure-site` choice between `did:web` and the
   document. Switching changes the client identity, so it needs fresh sign-in
   and consent, and goes into the changelog as such.
3. **The store**, its own repository: first the static page of
   [phase 0](#phase-0-a-static-page), once step 3 publishes `app.jsonld`;
   then Pod, importer and UI with publisher confirmation required for
   listing; then build checks, moves, publisher reviews, terms and a report
   path.

## Decisions

Taken by the owner on 2026-11-12:

1. **Source**: `apps/<id>/app.json` per app; `title` and `description` move
   out of `apps.json` (schema 2 with a migration).
2. **Detail text**: Markdown in `details.md` and `details.<lang>.md`, in the
   restricted subset under [Markdown](#markdown). The owner expects Markdown
   to become a common source of Pod data; how a Pod structures it is a
   separate question for the Pod and the spec.
3. **Translations**: required for every UI language of an app; `check`
   fails when one is missing.
4. **`client.json`**: published from phase 1, before any Pod reads it.
5. **CIMD redirect rule**: same origin and inside the client ID's directory,
   proposed for sempods-kotlin#437.
6. **Trust**: the three levels under [Trust](#trust); apps hold no keys, the
   store's key is the only one.
7. **Public Suffix List**: no entry. Owners publish on their host's
   subdomain or their own domain; `*.apps.sempods.org` is only for the
   sempods operator's own apps, and cookie-based services under
   `sempods.org` use `__Host-` cookies. Revised on 2026-11-12 from "apply
   now" after the review, once it was clear that sempods offers no
   subdomains to other publishers.
8. **Vocabulary**: schema.org `WebApplication`; the `did:web` identity and
   the client ID as `identifier` values; own terms only when the store needs
   them.
9. **Model**: anyone hosts their apps for free wherever they like; good apps
   can be submitted to the store, which lists but never hosts them. Listing
   requires the publisher to confirm each build in their own Pod, reviews are
   per publisher, build checks are automatic, and the store shows the kinds
   of data an app uses. The store supports moves; after a takeover, a
   changed build loses the listing, and the owner withdraws the
   confirmation for the unchanged one.

Taken by the owner on 2026-11-13:

10. **Store phase 0**: a static page and one central file with the address
    of each registered app's `app.jsonld`, read in the browser. Listing is a
    merged pull request; the Pod, the importer, `store-check` and the build
    confirmation wait for the Pod store, and no stopgap is built for them.
    `app.jsonld` and `/apps.jsonld` are therefore served with
    `Access-Control-Allow-Origin: *`.
