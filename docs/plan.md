# Build Plan — Video Downloader Tizo

Decisions locked 2026-08-20. See [CLAUDE.md](../CLAUDE.md) for the map.

## Locked decisions

| Question | Answer |
|---|---|
| Stack | Electron + React + Tailwind, main process in Node |
| Platform | Windows only (code stays cross-platform for later) |
| Update + addon hosting | GitHub Releases, repo `BKHornYT/tizo` |
| Installer size | ~99 MB — Electron's runtime is the floor; the ~50 MB estimate was wrong |
| First run | **Mandatory** Essentials download (~110 MB) before the app is usable |
| Bundle source | Hybrid — self-hosted zip + live yt-dlp from upstream |
| Distribution | NSIS installer **and** portable single-exe (USB) **and** zip |
| Code signing | None for now — unsigned, SmartScreen warning accepted |
| Supported-sites UI | None — minimal UI, paste and go |
| v1 features | Core + queue/playlists + audio/subtitles + clipboard/history |

## Architecture

```
tizo/
├─ src/main/              Electron main process (Node)
│   ├─ engine/
│   │   ├─ args.ts        pure yt-dlp argument builder — no electron, so testable
│   │   ├─ binaries.ts    resolve managed yt-dlp/ffmpeg (PATH fallback in dev only)
│   │   ├─ formats.ts     pure format shaping — no electron, so testable
│   │   ├─ probe.ts       -J metadata, playlist detection, bot-wall retry
│   │   ├─ scrape.ts      page scanner — last resort when no extractor matches
│   │   ├─ download.ts    spawn, JSON progress parsing, tree-kill cancel
│   │   └─ errors.ts      stderr -> 12 typed error codes
│   ├─ queue/             item state, probing, concurrency pump
│   ├─ components/        fetch (resumable) + verify + unzip — setup AND addons
│   ├─ setup/             first-run orchestration and on-disk state
│   ├─ update/            electron-updater + the weekly yt-dlp channel
│   ├─ stats/             local site tally + two keyless upload streams
│   ├─ feedback.ts        prefilled, sanitised GitHub issues
│   └─ store/             settings, terms acceptance (history lands in Phase 6)
├─ src/preload/           contextBridge — the only main↔renderer surface
├─ src/shared/types.ts    types shared by all three processes
├─ src/renderer/src/
│   ├─ views/             Queue (the main screen), SettingsView
│   ├─ components/        QueueRow, PlaylistPicker
│   └─ strings.ts         ALL user-visible copy
├─ server/                Cloudflare Worker for usage counts — live since 2026-08-21
└─ build/                 icon.ico + iconsrc, NSIS and portable config
```

The renderer never touches the filesystem or spawns processes. Everything goes
through typed IPC channels exposed in preload.

**The queue is the app.** Every URL becomes a queue item, including a single
link — there is no separate one-off download path. The first build had one, and
it made batch use impossible while looking nothing like the reference app this
is modelled on. See [features.md](features.md).

**There is no pause.** yt-dlp resumes from its `.part` file, so Stop + Retry
genuinely continues a transfer rather than restarting it. A separate pause
concept would be a second name for the same thing.

## First-run Essentials bundle

The installer is slim; on first launch the app **must** fetch Essentials before it
will do anything. Users cannot skip this.

### What's in it (~100 MB)

| Component | Size | Source | Why it's real |
|---|---|---|---|
| ffmpeg + ffprobe | ~82 MB | self-hosted zip | Muxing anything above 360p, MP3, subtitle embed |
| yt-dlp | ~18 MB | **live from `yt-dlp/yt-dlp` latest** | Current at setup time, not build time |

Plus a **site profile pack** — a few KB of JSON fetched from the registry, not part
of the zip. Per-site tuning: impersonation target, YouTube player clients, rate
limits, which sites need cookies, format preferences. It lives in the registry
precisely *because* it is tiny and changes often — that way a tuning fix ships
without an app release or a re-download.

> **Two things this bundle deliberately does NOT contain**, both cut after
> measurement rather than assumption:
>
> - **Impersonation libraries.** Verified 2026-08-20: the official `yt-dlp.exe`
>   already bundles curl_cffi and lists working impersonate targets. A separate
>   ~8 MB component would have downloaded nothing of value.
> - **Extractor code for the "top 50 sites".** yt-dlp already supports ~1800 sites.
>
> Never present either to users as "downloading site support", and never put a
> progress bar over a payload that does nothing.

### Failure handling — the part that matters

A mandatory gate means a failed download is a dead app. Three mitigations, all
required, not optional polish:

1. **Resumable** — HTTP range requests, partial file kept, retry with backoff.
2. **Verified** — sha256 per component; mismatch discards and re-fetches once,
   then surfaces a real error rather than installing corrupt files.
3. **Manual offline path** — an "Install from file" option accepting a
   hand-downloaded `essentials-v<n>.zip`. This is the support escape hatch for
   corporate proxies, dead upstreams, and locked-down machines.

Setup state is written only after verification, so an interrupted setup restarts
cleanly instead of leaving a half-installed app that thinks it's ready.

### Portable interaction

A portable exe on a USB stick runs setup once per stick, into
`<exe-dir>/tizo-data/`. The stick then carries the full ~160 MB working app.

## Site coverage

**Goal: as broad as possible. No blocklist, no category filtering.** yt-dlp ships
~1800 extractors covering mainstream video (YouTube, Vimeo, Dailymotion), social
(Instagram, TikTok, X, Facebook, Reddit, Snapchat), streaming/live (Twitch,
Kick), audio (SoundCloud, Bandcamp), news and broadcaster sites, and adult sites
(Pornhub, XVideos, XHamster and similar). All of that works on day one with zero
per-site work from us.

Practical notes:
- Age-gated and login-gated pages may need cookies — that's the optional **Auth
  Pack**, not a per-site problem.
- Broad coverage is the default. Excluding categories would require deliberately
  adding a blocklist; we are not adding one.

### "Add more if people request" — the request pipeline

The domain gate must never dead-end. When a URL fails as `Unsupported URL`:

1. Check the registry `domains` map → if a plugin exists, offer to install it.
2. Otherwise show **"Request this site"**, which opens a prefilled GitHub issue
   carrying the domain, the yt-dlp version, and the sanitised error — no URL path,
   no personal data.
3. On your side, three possible resolutions, in increasing cost:
   - **Already works** — usually a stale engine; the weekly yt-dlp channel fixes it.
   - **Needs tuning** — add a site profile entry, publish a registry revision.
     Users pick it up with no app update.
   - **Needs an extractor** — write a yt-dlp plugin, publish as an optional
     component, and map the domain to it in the registry.

Only the third case is real work, and it still ships without an app release.

## The three update channels

Three independent things update on different cadences:

1. **The app** — `electron-updater` against GitHub Releases. Launch + every 6 h.
   Background download, install on quit. *Disabled in portable mode* (a running
   portable exe can't replace itself) — shows a download banner instead.
2. **The yt-dlp binary** — separate, weekly, straight from its own repo. YouTube
   breaks yt-dlp every few weeks; shipping a full app release for each would be
   unmaintainable.
3. **The component/addon registry** — a JSON manifest fetched from the repo, so
   new components and site-profile revisions land without an app update.

## Component + addon system

One manager handles both the Essentials bundle and later optional addons — same
download → verify → unzip → activate pipeline, driven by a manifest:

```jsonc
{
  "schema": 1,
  "essentials": { "version": 1, "components": ["ffmpeg", "impersonation", "site-profiles"] },
  "components": [
    { "id": "ffmpeg", "version": "9.0", "size": 82000000, "sha256": "…",
      "url": "https://github.com/BKHornYT/tizo/releases/download/essentials-v1/ffmpeg-win64.zip",
      "provides": ["merge", "convert", "audio-extract", "embed-subs"] },
    { "id": "auth", "name": "Auth Pack", "optional": true, "provides": ["cookies", "login"] }
  ],
  "domains": { "example.com": "some-plugin-id" }
}
```

Components are just folders on disk; deleting one uninstalls it. Optional addons
install later via two triggers:

- **Capability gate** — a job needs something not installed → offer it. Measured
  2026-08-20: YouTube exposes exactly one progressive stream (360p), so this
  fires on essentially every meaningful quality choice.
- **Domain gate** — yt-dlp returns `Unsupported URL` → look the domain up in
  `domains` → offer the plugin, or a "Report this site" button that opens a
  prefilled GitHub issue.

## Phases

Each phase ends in something runnable.

| # | Phase | Status | Ends with |
|---|---|---|---|
| 0 | Repo + scaffold | ✅ | `npm run dev` opens an Electron window; repo on GitHub |
| 1 | Download engine | ✅ | Paste a URL, file lands on disk with live progress |
| 2 | Component manager + setup | ✅ | Fresh install downloads Essentials, verifies, resumes after a killed connection, and refuses to proceed without them |
| 3 | Core GUI | ✅ | Format picker, save location, settings that reach the command line |
| 4 | Queue + playlists | ✅ | Batch, concurrency, drag-drop, playlist expansion, sorting |
| 5 | Audio + subtitles | ☐ ← next | MP3/M4A with metadata + thumbnail, subtitle download/embed |
| 6 | Clipboard + history | ☐ | Clipboard watcher, searchable history, tray on close |
| 6.5 | Playlist monitoring | ☐ | Watch a playlist/channel; notify by default, auto-download opt-in |
| 7 | Optional addons | ☐ | Registry-driven capability + domain gates on Phase 2's manager |
| 8 | Build targets | ✅ | Installer, portable and zip all build and run |
| 9 | Release pipeline | ✅ | Tag → CI → release. Auto-update **proven** against a real release |

Phase 9 is the real proof: install v1.0.0, push v1.0.1, watch it update itself.

## Usage counting

Optional, opt-in via the terms, and off entirely until an endpoint is configured.
The design constraint is that counting machines requires an identifier while a
privacy-respecting tally must not have one. Both are satisfied by splitting into
**two streams that share no key**:

| Route | Carries | Never carries | Gated |
|---|---|---|---|
| `POST /sites` | `{domain: count}`, app version | any identifier | no, and never |
| `POST /install` | random UUID, app version | any site data | no, and never |
| `GET /` | the dashboard | — | Google sign-in |
| `POST /admin/delete` | a scope, and a phrase for bulk | — | Google sign-in |

Separate tables, no foreign key, no IP logging. The server can answer *how many
machines* and *which sites are popular*; it cannot answer *what does this machine
download*. Adding the install id to a site row, or turning on Cloudflare Logpush,
destroys that property — do neither.

The gating splits on **who is acting, not on what the method is**: everything the
app does is open, everything the operator does needs sign-in. Requiring a
credential to upload would ship a shared secret in every copy *and* let the
server tell submitters apart, which is the same linkability the two streams
exist to prevent.

One structural trap lives here: a POST to any path other than `/install` falls
through to the site-counts handler, so **every new route must be matched before
the method checks** or its body gets counted as an upload. Full detail in
[../server/README.md](../server/README.md).

## When a site "does not work"

Three distinct causes produce the same symptom, and they are fixed in different
places. Diagnose before touching code — reproduce with the **managed** binary
(`%APPDATA%/tizo/bin/yt-dlp.exe`) using the app's exact args, and read stderr.

| Cause | Looks like | Fix |
|---|---|---|
| Bot wall (Cloudflare) | `HTTP Error 403`, `anti-bot`, `generic:impersonate` | Probe retries with impersonation, carried to the download |
| No extractor | `Unsupported URL` | Page scan finds the file, or a registry plugin |
| Extractor worked, shaping dropped it | Row appears with no quality options | `formats.ts` — see the three-state codec rule |

The CLI on PATH can succeed where the app fails: bot walls are inconsistent
about who they challenge, and a stale PATH copy is a different build entirely.

## Suggestions and site reports

The domain gate must never dead-end. A failed download offers **Report site**,
which opens a prefilled GitHub issue carrying the domain, versions and the
failure code — with URLs and user paths stripped, because yt-dlp stderr routinely
contains the full link. The payload is shown before anything opens.

Only `UNSUPPORTED_SITE` and `UNKNOWN` failures offer it. A geo-block, a missing
login or a dead connection is not something an issue can fix, and inviting
reports for those would bury the real cases.

## Tests

No framework — the scripts are plain TypeScript run by node's type stripping,
which is why `engine/args.ts` and `components/install.ts` deliberately import
nothing from electron.

| Command | Network | Covers |
|---|---|---|
| `npm test` | no | typecheck + 29 assertions that settings reach the yt-dlp command line |
| `npm run test:fetcher` | yes | resume, integrity rejection, corrupt-part discard |
| `npm run test:essentials` | yes, ~92 MB | the real installer against the real published components |

`scripts/install-essentials.ts` is a developer convenience that installs the
components straight into the app data folder, so a dev machine can skip the
first-run wizard. It is not part of the shipped app.

## Legal note

yt-dlp is a legitimate tool and this is a legitimate app, but downloading
copyrighted material can violate a site's terms of service or local law depending
on what and where. Distributing it publicly puts that on your name — worth a short
disclaimer in the README and an about-box line. Not a blocker.
