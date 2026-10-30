// Vite plugins shared by the spike apps: a loopback fake Pod on the dev
// server's own origin, and the SDK baseline switch.
import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import type { Plugin, UserConfig } from 'vite';

const schema = 'https://schema.org/';
type Task = { context: string; body: Record<string, unknown>; version: number };

const xsd = 'http://www.w3.org/2001/XMLSchema#';
/**
 * Seed tasks in the "work" context. With the SDK main baseline the start
 * dates are typed: two xsd:date days and one zoned xsd:dateTime that must
 * survive unchanged; SDK 0.6.0 has no date field and gets plain strings.
 */
function seed(base: string, typed: boolean): Map<string, Task> {
  const work = base + '/_system/contexts/work';
  const tasks = new Map<string, Task>();
  const titles = [
    ['Call the plumber about the kitchen tap', '2026-10-28'],
    ['Draft the club newsletter', ''],
    ['Book train tickets to Leipzig', typed ? '2026-10-30T09:30:00+02:00' : '2026-10-30'],
    ['Return the library books', ''],
  ] as const;
  const literal = (value: string) =>
    typed ? { '@value': value, '@type': xsd + (value.includes('T') ? 'dateTime' : 'date') } : { '@value': value };
  titles.forEach(([title, planned], i) => {
    const iri = `${base}/tasks/${i + 1}`;
    tasks.set(work + '|' + iri, {
      context: work,
      version: 1,
      body: {
        '@id': iri,
        '@type': [schema + 'Action'],
        [schema + 'name']: [{ '@value': title }],
        [schema + 'actionStatus']: [{ '@id': schema + 'PotentialActionStatus' }],
        ...(planned ? { [schema + 'startDate']: [literal(planned)] } : {}),
      },
    });
  });
  return tasks;
}

/**
 * The notes fixture: notes in "personal" (schema:NoteDigitalDocument with
 * name and text), an empty "work" and a read-only "shared" context.
 */
function seedNotes(base: string): Map<string, Task> {
  const notes = new Map<string, Task>();
  const note = (context: string, n: number, title: string, text: string) => {
    const iri = `${base}/notes/${context}-${n}`;
    const graph = `${base}/_system/contexts/${context}`;
    notes.set(graph + '|' + iri, {
      context: graph,
      version: 1,
      body: {
        '@id': iri,
        '@type': [schema + 'NoteDigitalDocument'],
        [schema + 'name']: [{ '@value': title }],
        [schema + 'text']: [{ '@value': text }],
      },
    });
  };
  note('personal', 1, 'Gift ideas for Mia', 'Watercolour set, the blue scarf from the market.');
  note('personal', 2, 'Recipe: lentil soup', 'Red lentils, carrots, cumin, a squeeze of lemon at the end.');
  note('shared', 1, 'Holiday packing list', 'Passport, chargers, rain jacket. Shared by Jonas.');
  return notes;
}

/**
 * A loopback Pod at /alice: OAuth with PKCE, contexts, list and edit. Test
 * fixtures: /__reset, /__store (what is stored), /__fail?count=n (the next n
 * data requests answer 503) and /__delay?ms=n (data requests wait).
 */
export function fakePod({
  typed = process.env.SDK === 'main',
  fixture = 'tasks',
}: { readonly typed?: boolean; readonly fixture?: 'tasks' | 'notes' } = {}): Plugin {
  const fresh = (base: string) => (fixture === 'notes' ? seedNotes(base) : seed(base, typed));
  const names = fixture === 'notes' ? ['personal', 'work', 'shared'] : ['work', 'personal'];
  const writableNames = fixture === 'notes' ? ['personal', 'work'] : names;
  let failing = 0;
  let delay = 0;
  const codes = new Map<string, { client: string; challenge: string }>();
  let tasks: Map<string, Task> | undefined;
  let version = 10;
  let registrations = 0;
  return {
    name: 'spike-fake-pod',
    configureServer(server) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next) => {
        const origin = 'http://' + req.headers.host;
        const url = new URL(req.url ?? '/', origin);
        if (!url.pathname.startsWith('/alice') && !url.pathname.startsWith('/__')) return next();
        const base = origin + '/alice';
        tasks ??= fresh(base);
        const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => {
          res.writeHead(status, { 'content-type': 'application/json', ...headers });
          res.end(JSON.stringify(body));
        };
        if (url.pathname === '/__reset') {
          tasks = fresh(base);
          failing = 0;
          delay = 0;
          return json({ ok: true });
        }
        if (url.pathname === '/__fail') {
          failing = Number(url.searchParams.get('count') ?? 1);
          return json({ failing });
        }
        if (url.pathname === '/__delay') {
          delay = Number(url.searchParams.get('ms') ?? 0);
          return json({ delay });
        }
        // Test inspection: the stored bodies and versions, as written.
        if (url.pathname === '/__store') return json([...tasks.values()]);
        if (url.pathname.endsWith('/.well-known/oauth-protected-resource'))
          return json({ resource: base, authorization_servers: [base], bearer_methods_supported: ['header'] });
        if (url.pathname.endsWith('/.well-known/oauth-authorization-server'))
          return json({
            issuer: base,
            authorization_response_iss_parameter_supported: true,
            authorization_endpoint: base + '/_system/auth/authorize',
            token_endpoint: base + '/_system/auth/token',
            registration_endpoint: base + '/_system/auth/register',
            jwks_uri: base + '/_system/auth/jwks.json',
            response_types_supported: ['code'],
            grant_types_supported: ['authorization_code', 'refresh_token'],
            token_endpoint_auth_methods_supported: ['none'],
            code_challenge_methods_supported: ['S256'],
          });
        if (url.pathname.endsWith('/authorize')) {
          const code = 'code-' + codes.size + '-' + Date.now();
          codes.set(code, {
            client: url.searchParams.get('client_id') ?? '',
            challenge: url.searchParams.get('code_challenge') ?? '',
          });
          const redirect = new URL(url.searchParams.get('redirect_uri') ?? origin);
          redirect.searchParams.set('code', code);
          redirect.searchParams.set('state', url.searchParams.get('state') ?? '');
          redirect.searchParams.set('iss', base);
          res.writeHead(302, { location: redirect.href });
          return res.end();
        }
        let body = '';
        for await (const chunk of req) body += chunk;
        if (url.pathname.endsWith('/register'))
          return json({ ...JSON.parse(body), client_id: 'dyn:' + ++registrations }, 201);
        if (url.pathname.endsWith('/token')) {
          const params = new URLSearchParams(body);
          const code = codes.get(params.get('code') ?? '');
          if (!code) return json({ error: 'invalid_grant' }, 400);
          const verifier = createHash('sha256').update(params.get('code_verifier') ?? '').digest('base64url');
          if (verifier !== code.challenge) return json({ error: 'invalid_grant' }, 400);
          const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
          const now = Math.floor(Date.now() / 1000);
          const token = `${enc({ alg: 'RS256' })}.${enc({ iss: base, client_id: code.client, sub: base + '/person', iat: now, exp: now + 3600, scope: '' })}.c2lnbmF0dXJl`;
          return json({ access_token: token, token_type: 'Bearer', refresh_token: 'fixture-refresh' });
        }
        const contexts = names.map((s) => base + '/_system/contexts/' + s);
        const writable = writableNames.map((s) => base + '/_system/contexts/' + s);
        if (url.pathname.endsWith('/_system/contexts')) {
          const refs = contexts.map((iri) => ({ '@id': iri }));
          return json({
            '@id': base + '/_system/contexts',
            '@type': ['http://www.w3.org/ns/sparql-service-description#GraphCollection'],
            'http://www.w3.org/ns/sparql-service-description#namedGraph': refs,
            'https://schema.sempods.org/readableContext': refs,
            'https://schema.sempods.org/writableContext': writable.map((iri) => ({ '@id': iri })),
          });
        }
        if (url.pathname.endsWith('/sparql/query') || url.pathname.includes('/_system/resources/')) {
          if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
          if (failing > 0) {
            failing--;
            return json({ error: 'unavailable' }, 503);
          }
        }
        if (url.pathname.endsWith('/sparql/query')) {
          const target = url.searchParams.get('default-graph-uri');
          return json([...tasks.values()].filter((t) => t.context === target).map((t) => t.body));
        }
        if (url.pathname.includes('/_system/resources/')) {
          const iri = Buffer.from(url.pathname.split('/').at(-1) ?? '', 'base64url').toString();
          const context = url.searchParams.get('context') ?? '';
          if (!contexts.includes(context)) return json({}, 400);
          const key = context + '|' + iri;
          const task = tasks.get(key);
          if (req.method !== 'GET' && !writable.includes(context)) return json({}, 403);
          if (req.method === 'GET')
            return task ? json(task.body, 200, { etag: `"v${task.version}"` }) : json({}, 404);
          if (req.method === 'PUT') {
            if (task) return json({}, 412);
            tasks.set(key, { context, body: JSON.parse(body), version: ++version });
            res.writeHead(201);
            return res.end();
          }
          if (!task) return json({}, 404);
          if (req.headers['if-match'] !== `"v${task.version}"`) return json({}, 412);
          if (req.method === 'PATCH')
            tasks.set(key, { ...task, body: { ...task.body, ...JSON.parse(body) }, version: ++version });
          else if (req.method === 'DELETE') tasks.delete(key);
          else return json({}, 405);
          res.writeHead(204);
          return res.end();
        }
        res.writeHead(404);
        res.end();
      });
    },
  };
}

/**
 * SDK=main resolves @sempods/app-sdk and @sempods/client-sdk to the build in
 * vendor/sdk-main (scripts/vendor-sdk-main.mjs); otherwise the installed
 * release (0.6.0) is used.
 */
export function sdkBaseline(): Plugin {
  const main = process.env.SDK === 'main';
  const vendor = join(import.meta.dirname, '..', '..', 'vendor', 'sdk-main', 'packages');
  return {
    name: 'spike-sdk-baseline',
    config(): UserConfig {
      return {
        define: { __SDK_BASELINE__: JSON.stringify(main ? 'main@addf662' : '0.6.0') },
        resolve: {
          dedupe: ['react', 'react-dom'],
          alias: main
            ? [
                { find: /^@sempods\/app-sdk$/, replacement: join(vendor, 'app-sdk/dist/index.js') },
                { find: /^@sempods\/app-sdk\/react$/, replacement: join(vendor, 'app-sdk/dist/react/index.js') },
                { find: /^@sempods\/client-sdk$/, replacement: join(vendor, 'client-sdk/dist/index.js') },
                { find: /^@sempods\/client-sdk\/oauth\/host$/, replacement: join(vendor, 'client-sdk/dist/oauth/host.js') },
                { find: /^@sempods\/client-sdk\/(edit|oauth)$/, replacement: join(vendor, 'client-sdk/dist/$1/index.js') },
              ]
            : [],
        },
        server: { fs: { allow: [join(import.meta.dirname, '..', '..')] } },
      };
    },
  };
}

export const harness = (options?: Parameters<typeof fakePod>[0]) => [fakePod(options), sdkBaseline()];
