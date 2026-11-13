# Publish the apps

All apps of the repository are published together as one static site. Each
app lives under its own path (`https://<host>/<id>/`), and an overview at `/`
shows them like an app store: a card per app and a detail view at `/#<id>`
with the app's detail text and how to install it, in the catalog's
languages. Read this guide before the first deployment, together with the
installed SDK's `deployment.md` and `pwa.md`
(`node_modules/@sempods/app-sdk/docs/`).

## 1. Choose the addresses once

Ask the owner for:

- **the published origin** (production), for example `https://apps.example.org`
  or `https://<site>.netlify.app`. It becomes part of every app's identity,
  `did:web:<host>:<id>`, with the callback `https://<host>/<id>/callback`.
  Changing it later changes every identity: every sign-in and Pod grant must be
  made again. Confirm that the owner controls this address;
- **a fixed preview address**, optional: an address that always shows the
  latest deploy of one branch, for example a branch named `preview`. It gets its
  own identity and should use a test Pod or a test context.

Record them with:

```sh
pnpm run configure-site --production https://apps.example.org \
  --preview https://preview--apps.netlify.app
```

The command writes `site` in `apps.json` and regenerates every app's
configuration. Local development is unchanged: `pnpm run dev <id>`, plain
builds and tests keep the local identity.

## 2. Build the site

```sh
pnpm run build-site                    # production
pnpm run build-site --profile preview  # the fixed preview address
```

It builds every app into `site-dist/<id>/` with the published identity and
writes the overview, `did.json` per app (`/<id>/did.json`, needed by some
Pods), the SDK's licence notices, `<id>/callback.html` for each callback,
`<id>/<route>.html` for each route an app lists in `apps.json` (in subfolders
for a route such as `tasks/add`), a top-level `404.html` for unknown paths,
and `_redirects` when an app declares resource patterns. It also publishes
what the app is, from its `app.json`: `<id>/app.jsonld` (its description for
the overview, the app store and other readers), `<id>/client.json` (its
client metadata for sign-in servers, not used for sign-in yet),
`<id>/build.json` (every published file of the app with its digest), the
site's list `apps.jsonld` and `_headers`, which lets other sites read the
descriptions. It stops when a text is missing in a language an app is shown
in, as `pnpm run check` reports it, and when an app's names make
`client.json` larger than 5,000 bytes, more than a sign-in server reads. The layout is the same for every host.
`site-dist/` is build output; do not commit it. `apps/<id>/dist` is not
touched, so `pnpm run build` and `pnpm run preview` in an app keep the local
identity.

A conforming sempods Pod checks the `did:web` identity against the callback
address and fetches no DID document. `did.json` serves Pods that also require
one (step 5 of the deployment check).

A build only works on the origin it was made for: opened anywhere else, the SDK
stops with a configuration error. Previews on other addresses, such as one per
pull request or per commit, therefore show no working sign-in. Turn them off
or treat them as unusable.

## 3. What the host must provide

Every host, whatever it is:

- serves `site-dist/` as static files over HTTPS, with Node from
  `.node-version` and pnpm from `packageManager` when it builds;
- answers `/<id>/`, each route `/<id>/<route>` and
  `/<id>/callback?code=…&state=…` with a first response of `200`, without a
  redirect (`Location` header), with path and query unchanged. The SDK
  recognises the callback only at its exact path;
- for an app with `resources` in `apps.json`, applies the rewrites in
  `site-dist/_redirects`: each resource address, such as
  `/<id>/tasks/<id>`, answers with the app's page and `200`, after the
  published files;
- answers `/<id>/did.json` with the JSON document, not with an app page;
- lets any site read `/apps.jsonld` and each `/<id>/app.jsonld` with the
  header `Access-Control-Allow-Origin: *`. GitHub Pages sends it for every
  file, and Netlify and Cloudflare Pages take it from the generated
  `_headers`; on another host, set it for these files only;
- does not rewrite every path to an `index.html`, which would also replace
  scripts, `sw.js` and `did.json`. Unknown paths show the not-found page;
- keeps the browser's default referrer policy or a stricter one, loads no
  third-party resources on the callback route, and keeps full callback URLs
  out of host and CDN logs;
- injects nothing into the pages, such as a badge or an analytics snippet:
  injected code runs in the origin that holds the Pod sessions. Turn it off
  before anyone opens the site, because an app's service worker keeps the
  pages as it first cached them, injection included, until the app's own
  files change.

Build command `pnpm run build-site`, publish directory `site-dist`.

Do not add rewrite rules of your own, and none for `/<id>/*`: the files
already answer every path, the generated `_redirects` answers exactly the
declared resource addresses, and a wider rule can replace scripts, `sw.js` and
`did.json`. The SDK's `deployment.md` shows such a rewrite for a single app on
its own site; this layout replaces it with a file per route and a rewrite per
resource pattern. Apps with routes only need no rewrite on any host; apps
with resource patterns need a host that reads `_redirects`: Netlify or
Cloudflare Pages.

### Netlify (tested)

Netlify serves `/<id>/callback` from `callback.html` with `200` and the query
intact, and `404.html` for unknown paths, and applies the generated
`_redirects`; write no rules of your own. Write this
`netlify.toml` in the repository root when the owner asks for Netlify (the
starter ships none); without a preview address, leave out
`[context.preview]`:

```toml
[build]
  command = "pnpm run build-site"
  publish = "site-dist"

# The branch whose deploys form the fixed preview address.
[context.preview]
  command = "pnpm run build-site --profile preview"

# Pull request previews have their own addresses and no identity.
[context.deploy-preview]
  command = "echo 'Deploy previews cannot sign in; push to the preview branch.' && exit 1"
```

The owner sets up the project in Netlify; walk them through it in this
order:

1. Agree the project name: the published origin is
   `https://<name>.netlify.app`. Check that the name is free (`curl` answers
   `404` for that address), run `configure-site` with it and push
   `netlify.toml` and the regenerated files to the branch Netlify will build.
2. In Netlify: Add new project → Import an existing project → the Git
   provider and this repository, with that branch. Netlify detects the
   workspace and offers an app folder (`apps/<id>`) under "Project to
   deploy": choose "Other (configure manually)", so the base directory stays
   the repository root, then enter build command `pnpm run build-site` and
   publish directory `site-dist`. Functions directory and environment
   variables stay empty.
3. The new project takes the repository's name. If it differs from the
   agreed name, rename it under Project configuration → General → Project
   details before anyone signs in; another name is another origin, where the
   SDK stops with a configuration error.
4. Before anyone opens the site, turn off Project configuration → General →
   "Powered by Netlify" badge (on by default for newer free projects): it
   injects a script into every page, the callback included. Check that no
   page still contains `/.netlify/scripts/hud`.
5. In the first deploy's log, Node comes from `.node-version` and pnpm from
   `packageManager` (through Corepack); nothing needs setting. Deploy previews
   of pull requests fail on purpose, as `netlify.toml` says; the owner may
   turn them off under Build & deploy → Branches and deploy contexts.

For a preview, enable branch deploys for the `preview` branch: its address is
`https://preview--<name>.netlify.app`.

### Cloudflare Pages (not tested by sempods apps)

Pages serves `<id>/callback.html` at `/<id>/callback` and reads the generated
`_redirects`. Without the top-level `404.html` it would serve the overview
for every unknown path.

In the project's build settings: build command `pnpm run build-site`, build
output directory `site-dist`. For the fixed preview address, set the variable
`SEMPODS_SITE_PROFILE=preview` for the Preview environment. The branch alias
`https://preview.<project>.pages.dev` then shows the `preview` branch. Commit
addresses (`https://<hash>.<project>.pages.dev`) have no working sign-in.

### Cloudflare Workers and other hosts

The layout suits hosts that serve `/<path>` from `<path>.html`. Cloudflare
Workers static assets do this by default, but the tooling has no recipe yet
for their asset and deploy configuration. A host without `_redirects`
support, such as GitHub Pages, serves apps with routes only; resource
addresses there show the not-found page. For any other host, check the requirements above before
the first sign-in.

### Secrets

The apps need no secret: their identity and callback are public. Keep hosting
and deployment credentials, such as a Netlify or Cloudflare token, in the
host's or CI's secret store. Everything a build puts into an app is public,
including `VITE_*` variables and values from `.env.local`; never put a token or
key there. See "Keep public configuration and credentials separate" in the
SDK's `deployment.md`.

## 4. Check the deployment

1. For each app and both addresses:
   - `curl -s -o /dev/null -D - 'https://<host>/<id>/callback?code=x&state=y'`
     (a GET, as the browser sends it) returns `200` and no `Location`;
   - `curl -s 'https://<host>/<id>/did.json'` returns the JSON with
     `"id": "did:web:<host>:<id>"`;
   - `curl -s -D - 'https://<host>/<id>/app.jsonld'` returns the JSON with
     `"@id": "https://<host>/<id>/"` and the header
     `access-control-allow-origin: *`;
   - each route, `curl -s -o /dev/null -D - 'https://<host>/<id>/<route>'`,
     returns `200` and no `Location`;
   - for each resource pattern, one address with an identifier, for example
     `curl -s -o /dev/null -D - 'https://<host>/<id>/tasks/abc?context=x'`,
     returns `200` and no `Location`, and `/<id>/did.json` still returns the
     JSON;
   - the callback page, `curl -s 'https://<host>/<id>/callback?code=x&state=y'`,
     loads no script but the app's own (`/<id>/assets/…`).
2. In a fresh browser profile, the owner signs in to each app on the
   published site, grants only the intended context, saves something and
   reloads. Never ask for credentials or tokens.
3. On the preview address, sign in with its own identity against a test
   context.
4. In the host's and any CDN's settings, turn off or redact query strings and
   `Referer` headers in request logs, so callback queries are not kept.
5. If the Pod rejects the app before or at its consent screen, read
   `deployment.md` on Pods that require a DID document or an allow-list.
   Falling back to another identity is not a fix.

Record the published addresses, identities, what was checked and what was not
in each app's `NOTES.md`.
