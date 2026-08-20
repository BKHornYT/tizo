# Video Downloader Tizo

**Status:** 🚧 Phase 0 done — scaffold runs
**Created:** 2026-08-20
**One-liner:** A universal Windows video downloader with a GUI, self-updating,
that installs extra capabilities on demand instead of shipping everything up front.

> ⚠ **The name "Tizo" is provisional.** It lives in `package.json` (`productName`,
> `name`) and the repo name. Changing it before the first public release costs
> about five minutes; after release it costs users their auto-update path, so
> decide before v1.0.0 ships.

## What This Is

A desktop app for Windows that downloads video and audio from ~1800 sites via
yt-dlp, wrapped in a GUI that a non-technical person can use. Two things make it
more than a yt-dlp skin:

1. **It updates itself** — the app, the yt-dlp engine, and the addon list all
   update on independent schedules, so the developer can push fixes to users.
2. **It sets itself up once** — the installer is slim; on first launch the app
   downloads a mandatory ~110 MB Essentials bundle (ffmpeg, current yt-dlp,
   impersonation libs, site profiles). After that everything works, and optional
   addons install on demand for the rest.

Site coverage is deliberately **broad and unfiltered** — everything yt-dlp
supports, ~1800 sites including mainstream, social, and adult. No blocklist.

**Done looks like:** a person downloads the installer (or drops the portable exe
on a USB stick), runs setup once, pastes a link from more or less anywhere, gets a
file — and a week later gets a bugfix without doing anything.

## Current State

- **Works:** Electron shell builds and runs (`npm run dev`), IPC bridge verified
  end to end, all three electron-builder targets configured, repo pushed
- **In progress:** Phase 1 — the download engine
- **Known broken / not started:** everything else. No yt-dlp wiring, no setup
  wizard, no real UI, no icons, no release pipeline

## Stack

- **Electron** + **React** + **Tailwind** — main process in Node 24
- **yt-dlp** (bundled binary, self-updating) — the download engine
- **ffmpeg** — *not* in the installer; arrives in the first-run Essentials bundle
- **electron-builder** — NSIS installer + portable exe + zip
- **electron-updater** → GitHub Releases (`BKHornYT/tizo`)

Installed and verified on this machine: Node 24.13.1, npm 11.8.0, Python 3.12.12,
git 2.53, ffmpeg 9.0, yt-dlp 2026.08.18, gh 2.88.1 (authed as BKHornYT).

## How To Run

```bash
npm install
node node_modules/electron/install.js   # only if the Electron binary is missing — see Gotchas
npm run dev          # Electron + Vite, hot reload, devtools detached
npm run typecheck    # tsc --noEmit
npm run build        # bundles main + preload + renderer into out/
npm run dist         # build + electron-builder → installer, portable, zip in dist/
npm run dist:dir     # unpacked build, no installers — much faster for smoke tests
```

No env vars or credentials needed yet. Publishing releases will need `GH_TOKEN`
(Phase 9).

## File Structure

```
electron.vite.config.ts   three build targets: main, preload, renderer
electron-builder.yml      NSIS + portable + zip, GitHub publish config
tsconfig.json             one config covering main, preload and renderer
src/main/index.ts         window creation, single-instance lock, IPC registration
src/preload/index.ts      contextBridge; the ONLY main↔renderer surface
src/renderer/src/         React + Tailwind GUI (App.tsx, index.css, env.d.ts)
build/                    installer icons and branding (empty until Phase 8)
resources/                files packed into the app; resources/bin is gitignored
docs/plan.md              the full build plan — phases, architecture, addon schema
```

See [docs/plan.md](docs/plan.md) for architecture, the addon manifest format,
portable-mode design, and the phase breakdown.

## Key Decisions

Newest first.

- **2026-08-20 — Mandatory first-run Essentials download (~110 MB).** Installer
  stays slim; the app is unusable until setup completes. *Why:* one honest setup
  step beats surprise popups mid-download. *Risk accepted:* a failed download
  means a dead app, so resumable transfers, sha256 verification, and a manual
  "install from file" path are required, not polish.
- **2026-08-20 — Hybrid bundle sourcing.** ffmpeg + impersonation + site profiles
  from a self-hosted versioned zip; yt-dlp pulled live from its own repo at setup
  so the engine is current at install time rather than build time.
- **2026-08-20 — Broad, unfiltered site coverage.** Everything yt-dlp supports,
  adult sites included. Excluding categories would mean deliberately adding a
  blocklist; we aren't. New sites arrive via the registry, not app releases.
- **2026-08-20 — No supported-sites browser in the UI.** Keep it minimal: paste a
  URL, and if it downloads, it's supported.
- **2026-08-20 — Ship unsigned for now.** No code-signing cert, so Windows
  SmartScreen shows an "unrecognized app" warning. Accepted to get moving; a cert
  can be added later without reworking anything.
- **2026-08-20 — Three separate update channels.** App (electron-updater, 6 h),
  yt-dlp binary (weekly, direct from its GitHub releases), addon registry (JSON
  fetch). *Why:* yt-dlp breaks every few weeks when YouTube changes; forcing a
  full app release for each of those would be unmaintainable.
- **2026-08-20 — Slim base + on-demand addons.** ffmpeg is 80 MB of the ~130 MB
  a full bundle would cost, and most users only need it for 1080p+/MP3. Making it
  an addon is what gives the "install to unlock" flow something real to do.
- **2026-08-20 — Electron over Tauri/Python.** Best Windows auto-update story;
  Rust toolchain isn't installed and PyInstaller self-update is hand-rolled pain.
- **2026-08-20 — Windows only.** One installer, one release story. Nothing in the
  stack blocks adding macOS/Linux later.

## Gotchas

- **yt-dlp supports ~1800 sites already.** The addon system is *not* mainly about
  unsupported sites — it's about capabilities (ffmpeg, auth/cookies). Don't design
  it as "one addon per website"; that popup would almost never fire.
- **The site profile pack is tuning, not extractors.** It carries headers, player
  clients, rate limits and format preferences — never present it to users as
  "downloading site support", and never put a progress bar over an empty payload.
- **A mandatory setup gate turns any download failure into a dead app.** Resume,
  verify, and the manual install path are load-bearing. Write setup state only
  after verification, or an interrupted run leaves an app that wrongly believes
  it's ready.
- **Portable exes cannot self-update.** A running portable `.exe` can't replace
  itself on disk. Portable builds must disable electron-updater and show a
  download banner instead, or the updater will fail confusingly.
- **`Error: Electron uninstall` means the binary never downloaded.** npm can skip
  Electron's postinstall (which fetches the ~120 MB runtime), leaving a package
  with no `path.txt` and no `dist/`. Fix: `node node_modules/electron/install.js`.
  The error message is badly worded — nothing is being uninstalled.
- **electron-vite 5 caps at Vite 7.** Vite 8 installs fine and then fails peer
  resolution. Don't bump Vite past 7 until electron-vite widens its peer range.
- **A `.d.ts` next to its source shadows it.** `src/preload/index.d.ts` importing
  from `'./index'` resolved to *itself*, silently killing the `Window.tizo` type.
  Global declarations live in `src/renderer/src/env.d.ts` instead.
- **TypeScript 6 removed `baseUrl`.** Path aliases must be relative (`./src/...`).
- **1080p+ needs ffmpeg.** YouTube serves video and audio as separate streams
  above 720p. Without ffmpeg to mux them the app can only offer ≤720p — this is
  the whole reason the HQ Pack gate exists, not an arbitrary limitation.

## Deploy / Where It Lives

GitHub repo `BKHornYT/tizo`. Releases carry the installer, the portable exe, the
zip, and the `latest.yml` feed that electron-updater reads. GitHub Actions builds
and publishes on tag push.

## Rules

**Keep the docs current — always.**
- Update this `CLAUDE.md` whenever purpose, stack, structure, or a key decision
  changes. A future session should be able to resume from this file alone.
- Update `task.md` while working — what's active, what's next, what's blocked.
- Update `changes.md` after every change — what changed and why. Not at the end
  of the session; right after the change.

**Keep this file under 50 KB.** It loads into context every session. When it grows,
move detail into its own `.md` and leave a one-line pointer here. This file is the
map; the other files are the territory.

**Organize freely.** Extra `.md` files and folders are encouraged the moment a flat
layout starts hurting — just record the layout in File Structure above.
