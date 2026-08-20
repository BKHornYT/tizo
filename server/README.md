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

```bash
cd server
npx wrangler d1 create tizo-stats          # copy the id into wrangler.toml
npx wrangler d1 execute tizo-stats --remote --file=schema.sql
npx wrangler deploy
```

Then point the app at it by setting `TIZO_STATS_ENDPOINT` at build time:

```
TIZO_STATS_ENDPOINT=https://tizo-stats.<subdomain>.workers.dev
```

Without that variable the client short-circuits: `statsEnabled()` is false, the
Settings toggle explains that nothing can be sent, and no request is ever made.

## Reading the numbers

Open the Worker URL in a browser and you get a dashboard: installations, total
downloads, and the per-site table. It is public on purpose — data collected about
users should not be private to whoever collects it.

`GET` the base URL for the totals:

For the raw JSON, request it explicitly:

```bash
curl -H 'accept: application/json' https://tizo-stats.<subdomain>.workers.dev
# { "installs": 412, "downloads": 9377, "sites": [ { "domain": "youtube.com", "downloads": 6120 }, … ] }
```

**Nothing is collected until this is deployed** and `TIZO_STATS_ENDPOINT` is set as
a repository variable. Until then the client short-circuits and never makes a
request — the Settings toggle says as much.

It is public on purpose — data collected about users should not be private to
the collector.

## Legal note

Aggregate counts with no identifier are about as low-risk as telemetry gets, but
the user is in Norway and GDPR applies to the product regardless. Opt-in consent
plus a plain-language description in Settings is what keeps this straightforward.
If an install identifier is ever added, that calculus changes and the privacy
text has to change with it.
