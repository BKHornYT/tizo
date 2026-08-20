# Tasks — Video Downloader Tizo

Full phase breakdown in [docs/plan.md](docs/plan.md).

## Now

### Phase 1 — Download engine
- [ ] Resolve yt-dlp path across dev / installed / portable modes
- [ ] Spawn wrapper with `--newline --progress-template` JSON progress parsing
- [ ] Format probing (`-J`) → available qualities, flagging which need ffmpeg
- [ ] Cancel, error classification (unsupported URL / geo / auth / network)
- [ ] Dev panel in the renderer to drive it end to end

## Next

### Phase 2 — Component manager + first-run setup
- [ ] Component manager: download → sha256 verify → unzip → activate → remove
- [ ] Resumable transfers (HTTP range), retry with backoff, corrupt-file re-fetch
- [ ] Setup wizard UI — mandatory, single progress bar across all components
- [ ] Build + publish `essentials-v1` release assets (ffmpeg, impersonation, profiles)
- [ ] Live yt-dlp fetch from upstream latest
- [ ] Manual "install from file" offline path
- [ ] Setup state written only after verification; interrupted setup restarts clean

### Phase 3 — Core GUI
- [ ] URL bar with paste + validation, video info card (title, thumb, duration)
- [ ] Quality/format picker, save-location picker, progress cards w/ speed + ETA
- [ ] Open-file / open-folder actions, settings screen

### Phase 4 — Queue + playlists
- [ ] Job queue with concurrency cap, pause/resume/retry, batch URL paste
- [ ] Playlist/channel expansion with per-item selection

### Phase 5 — Audio + subtitles
- [ ] MP3/M4A extraction w/ bitrate picker, thumbnail + metadata embed
- [ ] Subtitle language picker, download and/or embed

### Phase 6 — Clipboard + history
- [ ] Clipboard watcher with toast prompt (opt-out in settings)
- [ ] Persistent searchable history, re-download, clear

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
- Code signing — revisit once real users start hitting the SmartScreen warning

## Done

<details><summary>Completed tasks</summary>

- [x] 2026-08-20 — Project created
- [x] 2026-08-20 — Requirements gathered, stack and architecture decided, plan written
- [x] 2026-08-20 — First-run Essentials bundle + broad site coverage folded into plan
- [x] 2026-08-20 — **Phase 0 complete** — repo `BKHornYT/tizo` created, Electron 43 +
      Vite 7 + React 19 + Tailwind 4 scaffold builds and runs, IPC bridge verified,
      electron-builder configured for installer + portable + zip

</details>
