# Tasks — Video Downloader Tizo

Full phase breakdown in [docs/plan.md](docs/plan.md).

## Now

### Phase 4 — Queue + playlists
- [x] Job queue with concurrency cap, stop/retry, batch URL paste
- [x] Drag & drop links anywhere on the window
- [x] Download-all / stop-all / clear-finished
- [x] Per-item format dropdown (recommended + all formats)
- [ ] Playlist/channel expansion with per-item selection
- [ ] Sortable queue columns

Note: "pause" is stop + retry — yt-dlp resumes from its `.part` file, so a
stopped download genuinely continues rather than restarting.

## Done this session

### Phase 3 — Core GUI
- [x] URL bar, video info card, empty state
- [x] Quality picker: curated list + inline "All formats" expander
- [x] Save-location picker, progress card w/ speed + ETA, reveal in folder
- [x] Settings screen — speed limit, container, file-exists rule, concurrency,
      folder-per-download, geo-bypass, component status, reset
- [x] Settings reach yt-dlp via a pure `engine/args.ts` (29/29 assertions passing)
- [x] File-collision handling — predict the name via yt-dlp, then skip/rename/ask
- [x] Site profiles from the registry applied per download (impersonate, fragments)
- [x] All UI copy centralised in `strings.ts`

### Phase 2 — Component manager + first-run setup
- [x] Component manager: download → sha256 verify → unzip → activate
- [x] Resumable transfers (HTTP range), retry with backoff, corrupt-part discard
- [x] Setup wizard UI — mandatory, single progress bar across all components
- [x] Build + publish `essentials-v1` release asset (ffmpeg 9.0.1 + ffprobe, 73.8 MB)
- [x] Live yt-dlp fetch from upstream latest
- [x] Manual "install from file" offline path
- [x] Setup state written only after the binary verifiably *executes*
- [x] Registry manifest with cache + bundled fallback so an outage cannot brick setup
- [x] Network test for resume/integrity (`npm run test:fetcher`) — 5/5 passing
- [x] End-to-end install verified against the live registry and published assets
      (`npm run test:essentials`, 10/10)

## Next

### Phase 5 — Audio + subtitles
- [ ] MP3/M4A extraction w/ bitrate picker, thumbnail + metadata embed
- [ ] Subtitle language picker, download and/or embed

### Phase 6 — Clipboard + history
- [ ] Clipboard watcher with toast prompt (opt-out in settings)
- [ ] Persistent searchable history, re-download, clear
- [ ] Minimize to tray instead of closing

### Phase 6.5 — Playlist monitoring
- [ ] Watch a playlist/channel for new uploads
- [ ] Per-watch mode: notify (default) or auto-download — never auto by default

### Phase 7 — Optional addons + site requests
- [ ] Registry `domains` map + capability gate popups
- [ ] Auth Pack (cookies-from-browser, login) for age/login-gated sites
- [ ] "Request this site" → prefilled GitHub issue (domain + version + sanitised
      error only; no URL path, no personal data)
- [ ] Site profile revisions publishable without an app release

### Phase 8 — Build targets
- [ ] NSIS installer (per-user, no admin needed)
- [ ] Portable single exe — data dir next to exe, updater disabled + banner
- [ ] Zip target; icons and installer branding

### Phase 9 — Release pipeline
- [ ] GitHub Actions: build + publish on tag push
- [ ] End-to-end proof: install v1.0.0 → push v1.0.1 → watch it self-update
- [ ] README with install instructions + SmartScreen note + legal disclaimer

## Blocked

_Nothing blocked._

## Open questions

- Final app name — "Tizo" is a working title, must be settled before v1.0.0
- i18n — strings are now centralised in `src/renderer/src/strings.ts`, so adding a
  locale is a lookup swap rather than a rewrite. Whether to actually ship one is
  still open.
- Code signing — revisit once real users start hitting the SmartScreen warning

## Done

<details><summary>Completed tasks</summary>

- [x] 2026-08-20 — Project created
- [x] 2026-08-20 — Requirements gathered, stack and architecture decided, plan written
- [x] 2026-08-20 — First-run Essentials bundle + broad site coverage folded into plan
- [x] 2026-08-20 — **Phase 0 complete** — repo `BKHornYT/tizo` created, Electron 43 +
      Vite 7 + React 19 + Tailwind 4 scaffold builds and runs, IPC bridge verified,
      electron-builder configured for installer + portable + zip
- [x] 2026-08-20 — **Phase 1 complete** — yt-dlp wrapper with JSON progress parsing,
      format probing with ffmpeg flagging, 12-code error classification, tree-kill
      cancel, and a working dev panel. Verified end to end against YouTube.

</details>
