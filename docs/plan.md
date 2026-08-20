# Build Plan — Video Downloader Tizo

Decisions locked 2026-08-20. See [CLAUDE.md](../CLAUDE.md) for the map.

## Locked decisions

| Question | Answer |
|---|---|
| Stack | Electron + React + Tailwind, main process in Node |
| Platform | Windows only (code stays cross-platform for later) |
| Update + addon hosting | GitHub Releases, repo `BKHornYT/tizo` |
| Installer size | Slim (~50 MB) |
| First run | **Mandatory** Essentials download (~110 MB) before the app is usable |
| Bundle source | Hybrid — self-hosted zip + live yt-dlp from upstream |
| Distribution | NSIS installer **and** portable single-exe (USB) **and** zip |
| Code signing | None for now — unsigned, SmartScreen warning accepted |
| Supported-sites UI | None — minimal UI, paste and go |
| v1 features | Core + queue/playlists + audio/subtitles + clipboard/history |

## Architecture

```
tizo/
├─ src/main/          Electron main process (Node)
│   ├─ engine/        yt-dlp process wrapper, progress parsing
│   ├─ queue/         job queue, concurrency, pause/resume/retry
│   ├─ components/    download/verify/unzip manager — powers setup AND addons
│   ├─ setup/         first-run wizard orchestration
│   ├─ update/        electron-updater + yt-dlp self-update
│   └─ store/         settings + history (portable-aware paths)
├─ src/preload/       contextBridge — the only main↔renderer surface
├─ src/renderer/      React + Tailwind GUI
└─ build/             icons, NSIS config, portable config
```

The renderer never touches the filesystem or spawns processes. Everything goes
through typed IPC channels exposed in preload.

## First-run Essentials bundle

The installer is slim; on first launch the app **must** fetch Essentials before it
will do anything. Users cannot skip this.

### What's in it (~110 MB)

| Component | Size | Source | Why it's real |
|---|---|---|---|
| ffmpeg | ~82 MB | self-hosted zip | Muxing anything above 360p, MP3, subtitle embed |
| yt-dlp | ~17 MB | **live from `yt-dlp/yt-dlp` latest** | Current at setup time, not build time |
| Impersonation libs | ~8 MB | self-hosted zip | TLS fingerprint spoofing — Instagram and several CDNs hard-block default clients |
| Site profile pack | ~2 MB | self-hosted zip | Per-site tuning: headers/UA, YouTube player clients + PO-token config, rate limits, auth requirements, format preferences |

> **The site profile pack is NOT extractor code.** yt-dlp already supports ~1800
> sites. This pack is per-site *tuning* that makes the top 50 work better than raw
> defaults do. Never present it to users as "downloading site support" — and never
> build a progress bar over a payload that does nothing.

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

| # | Phase | Ends with |
|---|---|---|
| 0 | Repo + scaffold | `npm run dev` opens an empty Electron window; repo on GitHub |
| 1 | Download engine | Paste a URL in a dev panel, file lands on disk with live progress |
| 2 | Component manager + setup wizard | Fresh install downloads Essentials, verifies, resumes after a killed connection, and refuses to proceed without them |
| 3 | Core GUI | URL bar, format picker, progress cards, save location, settings |
| 4 | Queue + playlists | Multiple/batch/playlist downloads, concurrency cap, pause/resume/retry |
| 5 | Audio + subtitles | MP3/M4A with metadata + thumbnail, subtitle download/embed |
| 6 | Clipboard + history | Clipboard watcher with toast, searchable history, re-download |
| 7 | Optional addons | Registry-driven capability + domain gates on top of Phase 2's manager |
| 8 | Build targets | NSIS installer + portable exe + zip, all three produced locally |
| 9 | Release pipeline | GitHub Actions builds and publishes on tag; auto-update verified live |

Phase 9 is the real proof: install v1.0.0, push v1.0.1, watch it update itself.

## Legal note

yt-dlp is a legitimate tool and this is a legitimate app, but downloading
copyrighted material can violate a site's terms of service or local law depending
on what and where. Distributing it publicly puts that on your name — worth a short
disclaimer in the README and an about-box line. Not a blocker.
