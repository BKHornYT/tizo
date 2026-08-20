# Tasks — Video Downloader Tizo

Full phase breakdown in [docs/plan.md](docs/plan.md).

## Now

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
- [ ] **Blocked:** end-to-end setup run — needs the repo public (see Blocked)

## Next

### Phase 3 — Core GUI
- [ ] URL bar with paste + validation, video info card (title, thumb, duration)
- [ ] Quality picker: short list inline + "All formats" expander (no global mode)
- [ ] Save-location picker, progress cards w/ speed + ETA
- [ ] Open-file / open-folder actions, settings screen
- [ ] Settings: max speed (`-r`), folder-per-download, geo-bypass, file-exists rule
- [ ] UI strings in one module from the start — i18n is cheap now, costly later

### Phase 4 — Queue + playlists
- [ ] Job queue with concurrency cap, pause/resume/retry, batch URL paste
- [ ] Playlist/channel expansion with per-item selection
- [ ] Drag & drop links onto the window
- [ ] Download-all / clear-list, sortable queue columns

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

- **End-to-end first-run setup.** The ffmpeg asset lives in a private repo, so
  both the release download and the raw `components.json` fetch return 404
  without auth. Everything else in Phase 2 is verified; this last step needs
  `BKHornYT/tizo` to be public. Awaiting the user's call — the plan always had
  it going public before release, this only changes the timing.

## Open questions

- Final app name — "Tizo" is a working title, must be settled before v1.0.0
- i18n — ship English-only, but keep strings centralised so locales can be added
  without a rewrite. Decide before Phase 3 UI work hardens.
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
