# Usage endpoint

Counts how many downloads happen per site, in aggregate. Optional, opt-in, and
off until an endpoint is configured.

## What is collected

**Two streams that share no key.** This is the whole design, and it is the
reason the numbers can be gathered without building something invasive.

`POST /sites` — how much gets downloaded, and from where:

```json
{ "schema": 1, "app": "0.1.0", "sites": { "youtube.com": 12, "vimeo.com": 3 } }
```

`POST /install` — how many machines exist:

```json
{ "schema": 1, "app": "0.1.0", "id": "b2f1…-random-uuid" }
```

They land in separate tables with no foreign key, no shared column, and no
timestamp precise enough to correlate them. The server can therefore answer
*"how many machines"* and *"how many downloads from youtube.com"*, and cannot
answer *"what does machine b2f1… download"*. Keep it that way: putting the
install id on a site-count row, or logging request IPs, collapses the whole
guarantee.

**Also absent:**

- **No URLs, video ids, titles or file paths.**
- **No IP retention.** Cloudflare only logs request IPs if Logpush is enabled;
  leave it off, or the two streams become linkable by IP.

The install id is a random UUID generated on the machine. It is not derived
from hardware, so it cannot be regenerated or matched to a device.

## Client behaviour

- Off unless the user turns it on in Settings. Never opt-out.
- Uploads at most once a day, batched.
- `pending` is only cleared once the server accepts the batch, so a dropped
  connection loses nothing.
- Every failure is silent. Telemetry must never affect downloading.
- The app shows the exact payload in Settings before anyone opts in.

## Deploy

**Deployed 2026-08-21** to `https://tizo-stats.itemhunt-analytics.workers.dev`, with the D1
id already filled into `wrangler.toml` and `TIZO_STATS_ENDPOINT` set as a repo
variable on `BKHornYT/tizo`. Redeploy after changing `worker.js` with
`cd server && npx wrangler deploy`.

The first-time steps, for reference or for a rebuild elsewhere:

```bash
cd server
npx wrangler d1 create tizo-stats          # copy the id into wrangler.toml
npx wrangler d1 execute tizo-stats --remote --file=schema.sql
npx wrangler deploy
gh variable set TIZO_STATS_ENDPOINT --repo BKHornYT/tizo --body <worker url>
```

The app is pointed at it by `TIZO_STATS_ENDPOINT` at **build** time:

```
TIZO_STATS_ENDPOINT=https://tizo-stats.itemhunt-analytics.workers.dev
```

**This is inlined into the bundle by `define` in `electron.vite.config.ts`, not
read at runtime.** A packaged app runs on a machine where the variable does not
exist, so a live `process.env` lookup is always empty — which is exactly the bug
that made the first wiring inert. The token in `src/main/stats/index.ts` must
stay dot-access (`process.env.TIZO_STATS_ENDPOINT`); bracket notation is not
matched by `define`.

Without that variable the client short-circuits: `statsEnabled()` is false, the
Settings toggle explains that nothing can be sent, and no request is ever made.

## Reading the numbers

Open the Worker URL in a browser, sign in with Google, and you get a dashboard:
installations, total downloads, and the per-site table. For the raw JSON, ask for
it explicitly — same gate, same session cookie:

```bash
curl -H 'accept: application/json' https://tizo-stats.itemhunt-analytics.workers.dev
# { "installs": 412, "downloads": 9377, "sites": [ … ], "email": "you@example.com" }
```

### Deleting data

The dashboard can delete what it shows. Each site row has a `×`, and a *Delete
data* panel at the bottom clears the site table, the install table, or both.

The same routes are scriptable — a signed-in session cookie, or nothing at all
from curl if you would rather use `wrangler d1 execute`:

```bash
POST /admin/delete  { "scope": "site",     "domain": "example.com" }
POST /admin/delete  { "scope": "sites",    "confirm": "DELETE ALL" }
POST /admin/delete  { "scope": "installs", "confirm": "DELETE ALL" }
POST /admin/delete  { "scope": "all",      "confirm": "DELETE ALL" }
# → { "ok": true, "scope": "sites", "deleted": 42 }
```

**Gated exactly like `GET`, and for the same reason** — this is the operator
acting, not the app. Missing secrets return 503, an unsigned or expired or
forged cookie returns 401, and an address off the allow list returns 401. All of
them delete nothing.

Three things about this are load-bearing:

- **`/admin/*` is routed before the method checks.** Every POST whose path is
  not `/install` falls through to the open site-counts handler, so an admin path
  that missed its own branch would be *counted as an upload* rather than
  rejected. `npm run test:worker` asserts it never is.
- **Bulk deletes require the exact phrase `DELETE ALL`.** These tables hold
  running sums, not submissions — there is no history to rebuild a wiped total
  from, so the phrase is the only thing standing between a mis-click and
  permanent loss. Deleting a single site row does not need it: that site simply
  starts counting from zero again.
- **Clearing installs forgets machines, it does not remove them.** Every install
  still running reappears on its next ping and the count climbs back. Worth
  knowing before reading the recovery as a failed delete.

Cross-origin requests are refused outright. The session cookie is `SameSite=Lax`
so a cross-site form never carries it anyway, but the `Origin` check is one
comparison and curl sends no `Origin` at all, so scripting is unaffected.

### Who can see it

**`GET` and `/admin/*` are gated. The two upload routes are not, and must never
be.** The app has no account and must never have one: shipping a credential would
put a shared secret in every copy *and* give the server a way to tell submissions
apart, which is the exact linkability this whole design exists to avoid. So
sign-in protects what the operator does — reading the numbers and deleting them —
and never what the app does.

Sign-in is Google OAuth implemented inside the Worker — Cloudflare Access cannot
be applied to a `*.workers.dev` hostname, and this needs no domain.

- `/auth/login` → Google, scope `openid email`, random `state` in a short-lived
  cookie
- `/auth/callback` → exchanges the code, checks `iss`/`aud`/`email_verified`,
  checks the email against `ALLOWED_EMAILS`, sets a signed session cookie
- `/auth/logout` → clears it

The session is an HMAC-signed cookie, not a row. There is deliberately **no
session table**: adding one would put a timestamped record of the operator next
to the usage tables, and the point of this database is that it holds nothing
per-person. The allow list is re-checked on every request, so removing an address
takes effect immediately rather than whenever a cookie expires.

**It fails closed.** If any of the four secrets is missing, `GET` returns 503 and
shows nothing. A missing secret must never mean "everyone can see it".

### Setting sign-in up

Create an OAuth client in Google Cloud Console → APIs & Services → Credentials →
*Create credentials* → *OAuth client ID* → **Web application**, with:

```
Authorised redirect URI:  https://tizo-stats.itemhunt-analytics.workers.dev/auth/callback
```

Then set the four secrets (never commit them — `wrangler secret` keeps them
server-side):

```bash
cd server
echo <client-id>     | npx wrangler secret put GOOGLE_CLIENT_ID
echo <client-secret> | npx wrangler secret put GOOGLE_CLIENT_SECRET
echo you@gmail.com   | npx wrangler secret put ALLOWED_EMAILS   # comma-separated
node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64url'))" \
                     | npx wrangler secret put SESSION_SECRET
npx wrangler deploy
```

`SESSION_SECRET` and `ALLOWED_EMAILS` are already set. Rotating `SESSION_SECRET`
signs everyone out, which is the way to revoke a session early.

While the app is in *Testing* in Google's consent screen, only accounts listed as
test users can sign in, and consent expires every 7 days. For a dashboard with
one user that is fine; publishing the consent screen avoids the re-consent.

The endpoint is live and the repo variable is set, so **builds from v0.0.5
onward carry it**. Every release before that shipped with an empty endpoint and
sends nothing, permanently. Even with the endpoint present nothing is collected
until a user opts in — the client short-circuits on the setting first.

## Legal note

Aggregate counts with no identifier are about as low-risk as telemetry gets, but
the user is in Norway and GDPR applies to the product regardless. Opt-in consent
plus a plain-language description in Settings is what keeps this straightforward.
If an install identifier is ever added, that calculus changes and the privacy
text has to change with it.
