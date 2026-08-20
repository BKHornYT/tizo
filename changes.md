# Changes — Video Downloader Tizo

Newest first. One entry per change, using this format:

```
## YYYY-MM-DD — Short title
**What:** what actually changed
**Why:** the reason it changed
**Files:** the files touched
```

---

## 2026-08-20 — Phase 2: component manager and first-run setup
**What:** Built the download → verify → unzip → activate pipeline that powers both
first-run setup and later addons. `components/fetcher.ts` does resumable HTTP-range
transfers with backoff, sha256 verification, and discards a corrupt part rather than
resuming bad bytes forever. `components/manifest.ts` fetches the registry with a
three-step fallback (remote → cache → copy bundled into the app), so a registry
outage or a bad manifest push cannot brick a mandatory setup. `components/install.ts`
unpacks and then *executes* each binary to prove it runs — size and hash cannot catch
an AV quarantine. `setup/` orchestrates it behind one combined progress bar and only
records success after that execution check. Published the `essentials-v1` release
with a repackaged ffmpeg 9.0.1 + ffprobe (73.8 MB zipped). Added a real network test
for the resume path: 5/5 passing, confirmed resume continues mid-file rather than
restarting.
**Why:** Phase 2 of the plan. Setup is mandatory, so every failure mode here turns
into a dead app — hence resume, verification and the offline install path being
treated as requirements rather than polish.
**Files:** components.json, src/main/components/{fetcher,manifest,install}.ts,
src/main/setup/{index,state}.ts, src/main/ipc.ts, src/preload/index.ts,
src/shared/types.ts, src/renderer/src/{App.tsx,SetupWizard.tsx},
scripts/test-fetcher.ts, package.json, CLAUDE.md, docs/plan.md, task.md

**Cut a component before building it.** The plan listed ~8 MB of "impersonation
libs". Checked first: the official `yt-dlp.exe` already bundles curl_cffi and lists
working impersonate targets, so that download would have delivered nothing. Removed
from the plan. Essentials is now ffmpeg + yt-dlp only, ~92 MB. The site profile pack
moved into the registry JSON, where it belongs — a few KB that changes often should
not sit inside an 80 MB archive.

**Blocked:** end-to-end setup cannot be tested while `BKHornYT/tizo` is private —
both the release asset and the raw manifest 404 without auth.

## 2026-08-20 — Reference app reviewed, feature set expanded
**What:** Reviewed screenshots of "Videodownloader" and wrote `docs/features.md`
recording what we adopt, what we do differently, and what we skip. Added playlist
monitoring as new Phase 6.5, plus drag-and-drop, speed limiting, geo-bypass,
folder-per-download, file-exists rules, tray-on-close, and sortable queue columns to
existing phases. Logged i18n as an open question — English-only at launch, but UI
strings centralised from the start since retrofitting is far more expensive.
**Why:** User supplied it as inspiration and asked for something better. Several of
their ideas are genuinely good; several of their defaults are not, and the reasoning
for each divergence is worth recording so it is not re-litigated later.
**Files:** docs/features.md, task.md, CLAUDE.md

## 2026-08-20 — Phase 1: download engine
**What:** Built the yt-dlp engine behind a typed IPC surface. `engine/binaries.ts`
resolves yt-dlp and ffmpeg (managed binary first, PATH fallback in dev only — a
packaged build must run what setup verified, not whatever the user has lying
around). `engine/probe.ts` runs `-J` and collapses yt-dlp's 40+ near-duplicate
formats into a short pickable list, flagging which need muxing.
`engine/download.ts` spawns yt-dlp with a JSON progress template, parses progress
line-by-line, detects post-processing stages, and cancels by killing the whole
process tree. `engine/errors.ts` classifies stderr into 12 codes — UNSUPPORTED_SITE
and FFMPEG_REQUIRED are the two the addon gates will hang off. Renderer got a dev
panel: paste link → probe → pick quality → download with live speed/ETA → reveal in
folder. Verified end to end against YouTube, both the progressive and merge paths.
**Why:** Phase 1 of the plan. Everything above this is UI over these four modules.
**Files:** src/shared/types.ts, src/main/paths.ts, src/main/ipc.ts,
src/main/index.ts, src/main/engine/{binaries,errors,probe,download}.ts,
src/preload/index.ts, src/renderer/src/{App.tsx,format.ts}, CLAUDE.md, docs/plan.md,
task.md

**Two findings, both now in CLAUDE.md Gotchas:**
- **Without ffmpeg YouTube caps at 360p, not 720p as the plan assumed.** Measured on
  a real video: 37 video-only formats, exactly one progressive stream, at 360p.
  Corrected in `docs/plan.md` and `CLAUDE.md`. This strengthens the case for the
  mandatory Essentials download — without it the app is nearly useless on YouTube.
- **Caught a real bug from that measurement:** rows marked `needsFfmpeg: false` were
  still being given a `bv*+ba/b` selector, which always attempts a merge. yt-dlp
  hard-errors when ffmpeg is missing rather than falling back down the `/` chain, so
  every "no HQ pack needed" option would have failed for exactly the users who have
  no HQ pack. Those rows now use a progressive-only `b[height<=N]` selector.

## 2026-08-20 — Phase 0: scaffold runs
**What:** Created GitHub repo `BKHornYT/tizo` (private) and scaffolded the app —
Electron 43.4.1, Vite 7, React 19, Tailwind 4, TypeScript, built via electron-vite
into `out/{main,preload,renderer}`. Main process does window creation with
`ready-to-show` reveal, a single-instance lock, external links handed to the OS
browser, and one `app:versions` IPC handler. Preload exposes a single `window.tizo`
contextBridge surface. Renderer shows a placeholder reading versions over IPC, which
proves the bridge works end to end. `electron-builder.yml` configures all three
Windows targets (NSIS per-user installer, portable, zip) with GitHub publishing.
Typecheck clean, build clean, `npm run dev` opens the window.
**Why:** Phase 0 of the plan — everything downstream needs a running shell.
**Files:** package.json, package-lock.json, electron.vite.config.ts,
electron-builder.yml, tsconfig.json, .gitignore, src/main/index.ts,
src/preload/index.ts, src/renderer/index.html, src/renderer/src/{main.tsx,App.tsx,
index.css,env.d.ts}, CLAUDE.md, task.md

**Three things bit us, all now in CLAUDE.md Gotchas:**
- Vite 8 is too new — electron-vite 5 peers at Vite ≤7. Pinned to Vite 7 rather
  than forcing a knowingly broken dependency tree with `--legacy-peer-deps`.
- Electron's postinstall was skipped, so `npm run dev` died with the misleading
  `Error: Electron uninstall`. Fixed with `node node_modules/electron/install.js`.
- `src/preload/index.d.ts` shadowed `src/preload/index.ts` — `'./index'` resolved to
  the declaration file itself, silently voiding the `Window.tizo` type. Global
  declarations moved to `src/renderer/src/env.d.ts`. TypeScript 6 also removed
  `baseUrl`, so path aliases are now relative.

## 2026-08-20 — Plan revised: mandatory first-run Essentials bundle
**What:** Replaced the "slim base + on-demand addons" first-run model with a
mandatory ~110 MB Essentials download on first launch (ffmpeg, yt-dlp fetched live
from upstream, impersonation libs, site profile pack). Hybrid sourcing: self-hosted
versioned zip for the static parts, live upstream fetch for yt-dlp. Added a Site
Coverage section committing to broad unfiltered coverage (adult sites included, no
blocklist) and a concrete "request this site" pipeline via prefilled GitHub issues.
Dropped the supported-sites browser UI. Reordered phases — the component manager now
lands at Phase 2 because setup and addons share one download/verify/unzip pipeline;
optional addons moved to Phase 7. Now 10 phases.
**Why:** User wanted a single setup download rather than surprise popups mid-use, and
broad site coverage. Also recorded that a mandatory gate makes any download failure a
dead app, so resumable transfers, sha256 verification and a manual offline install
path are load-bearing requirements rather than polish.
**Files:** CLAUDE.md, task.md, changes.md, docs/plan.md

## 2026-08-20 — Planning: stack locked, build plan written
**What:** Gathered requirements and locked the design. Electron + React + Tailwind,
Windows-only, GitHub Releases (`BKHornYT/tizo`) for updates and addon hosting, slim
~50 MB base with ffmpeg and auth as on-demand addons, shipping as NSIS installer +
portable USB exe + zip, unsigned for now. Wrote the full architecture, addon manifest
schema, three-update-channel design and an 8-phase build breakdown to `docs/plan.md`;
replaced the scaffold `CLAUDE.md` with the real map and filled `task.md` with the
phase checklist. Verified the toolchain is present (Node 24.13.1, Python 3.12.12,
ffmpeg 9.0, yt-dlp 2026.08.18, gh authed as BKHornYT).
**Why:** Nothing was written down yet — the project was a bare scaffold with a
one-line idea. These are the decisions that are expensive to reverse later
(update mechanism, addon boundary, portable support), so they got settled first.
**Files:** CLAUDE.md, task.md, changes.md, docs/plan.md

## 2026-08-20 — Project created
**What:** Scaffolded `CLAUDE.md`, `task.md`, and `changes.md`.
**Why:** New project created from the launcher.
**Files:** CLAUDE.md, task.md, changes.md
