# Tasks — Video Downloader Tizo

Full phase breakdown in [docs/plan.md](docs/plan.md).

## Now

### Phase 4 — Queue + playlists ✅ complete
- [x] Job queue with concurrency cap, stop/retry, batch URL paste
- [x] Drag & drop links anywhere on the window
- [x] Download-all / stop-all / clear-finished
- [x] Per-item format dropdown (recommended + every raw format)
- [x] Playlist/channel expansion with a per-item picker
- [x] Sorting (order added / title / size / status) via the toolbar

> There is no "pause". yt-dlp resumes from its `.part` file, so Stop + Retry
> genuinely continues a transfer rather than restarting it — a separate pause
> concept would just be a second name for the same thing.

### Visual + updates pass (brought forward from Phases 8–9)
- [x] Visual language matched to the reference app — navy chrome, gradient,
      purple accents, icon-over-label toolbar
- [x] Paste anywhere to add links; no dedicated input field
- [x] App version shown in the toolbar, clickable to check for updates
- [x] `electron-updater` wired: launch + 6-hourly checks, install on quit
- [x] Weekly yt-dlp engine channel, independent of app releases
- [x] Self-update disabled with a stated reason in dev and portable builds
- [ ] **Unproven:** auto-update has never run against a real release — needs
      Phase 8 packaging first

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
- [ ] **Nothing has ever been packaged** — the app has only run under `npm run dev`

### Phase 9 — Release pipeline
- [ ] GitHub Actions: build + publish on tag push
- [ ] End-to-end proof: install v1.0.0 → push v1.0.1 → watch it self-update
- [ ] README with install instructions + SmartScreen note + legal disclaimer

## Blocked

_Nothing blocked._

## Open questions

- **Final app name.** "Tizo" is a working title. It lives in `package.json`
  (`name`, `productName`) and the repo name. Free to change until v1.0.0 ships;
  after that it breaks users' auto-update path.
- **i18n.** All copy is centralised in `src/renderer/src/strings.ts`, so adding a
  locale is a lookup swap rather than a rewrite. Whether to ship one is open.
- **Code signing.** Unsigned means a SmartScreen warning on every install.
  Revisit once real users start hitting it.

## Done

<details><summary>Completed phases</summary>

- [x] 2026-08-20 — Project created; requirements gathered, stack and architecture
      decided, plan written
- [x] 2026-08-20 — Reference app reviewed → `docs/features.md`; first-run Essentials
      bundle and broad site coverage folded into the plan
- [x] 2026-08-20 — **Phase 0** — repo `BKHornYT/tizo`, Electron 43 + Vite 7 +
      React 19 + Tailwind 4 scaffold, IPC bridge verified, electron-builder
      configured for installer + portable + zip
- [x] 2026-08-20 — **Phase 1** — yt-dlp wrapper with JSON progress parsing, format
      probing with ffmpeg flagging, 12-code error classification, tree-kill cancel.
      Verified against YouTube, both progressive and merge paths
- [x] 2026-08-20 — **Phase 2** — component manager (resumable, sha256-verified,
      execution-checked), registry with cache + bundled fallback, mandatory setup
      wizard, `essentials-v1` published. `test:fetcher` 5/5, `test:essentials` 10/10
- [x] 2026-08-20 — **Phase 3** — settings store and a pure `engine/args.ts` that
      carries them to the command line (29/29), file-collision handling, site
      profiles applied per download, settings screen, all copy in `strings.ts`
- [x] 2026-08-20 — **Phase 4 (bulk)** — UI rebuilt around the queue: concurrency
      pump, per-row format choice, drag-and-drop, batch paste, playlist expansion

</details>
