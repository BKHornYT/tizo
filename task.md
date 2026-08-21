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
- [x] Proven end to end — an installed copy found, downloaded and applied a real
      release (confirmed by the user on 2026-08-20)

### Suggestions, reports and usage counting ✅
- [x] GitHub issue templates: site request, suggestion, bug
- [x] "Report site" on failed rows (only for UNSUPPORTED_SITE / UNKNOWN — a
      geo-block or missing login is not something an issue can fix)
- [x] Suggest button in the toolbar; all three kinds in Options
- [x] Payload sanitised (URLs and user paths stripped) and shown before sending
- [x] First-run terms gate; agree unlocks only after scrolling
- [x] Local per-site download tally, visible in Options
- [x] Two keyless upload streams: `/sites` (no id) and `/install` (no site data)
- [x] Cloudflare Worker + D1 schema + deploy docs in `server/`
- [x] **Deployed 2026-08-21** — Worker + D1 live at
      `https://tizo-stats.itemhunt-analytics.workers.dev`, both routes and the
      dashboard verified against the real endpoint, test rows deleted
- [x] `TIZO_STATS_ENDPOINT` set as a repo variable on `BKHornYT/tizo`
- [x] Fixed the wiring: the var was a runtime `process.env` lookup with no
      `define`, so it was inlined nowhere and the shipped app always read an
      empty endpoint. Now baked in at build time and verified in `out/`
- [x] **v0.0.5** is the first build carrying the endpoint. Every earlier release
      has an empty one and will never send anything
- [x] `npm run test:stats` — 15 assertions running the real stats module against
      a stub server; also run once against the live Worker, which accepted the
      real payloads and stored them correctly

### Dashboard sign-in (Google OAuth)
- [x] `GET` gated behind Google sign-in with an email allow list; `POST /sites`
      and `POST /install` deliberately left open — the app must never carry a
      credential
- [x] Signed-cookie session, no session table; allow list re-checked per request
- [x] Fails closed — 503 when the secrets are missing, never the data
- [x] `SESSION_SECRET` and `ALLOWED_EMAILS` set; deployed and verified closed
      while both upload routes still return 200
- [x] Google OAuth client created; all four secrets set and deployed
- [x] Verified: `GET` 401 + sign-in page, `/auth/login` 302s to Google with the
      right client / redirect URI / `openid email` scopes, forged `state`
      rejected, `POST /sites` still 200
- [ ] **Sign in once in a browser** to confirm the round trip and the allow list.
      Add `boysgunsmoke@gmail.com` under Audience → Test users first, or Google
      returns `access_denied` before the Worker is ever reached
- [ ] Publish the consent screen to Production — only `openid`/`email` are
      requested, both non-sensitive, so no Google verification is needed. Avoids
      Testing mode's 7-day consent expiry

## Next

### Page-scan fallback ✅
- [x] Scan a page for `<video>`, `<source>`, `og:video`, `contentUrl`, inline media
- [x] Resolve relative and protocol-relative URLs; ignore non-media
- [x] HEAD-verify candidates (content-type, and reject sub-100 KB placeholders)
- [x] Download the direct URL with the page sent as referer
- [x] Only after an extractor fails, and only for UNSUPPORTED_SITE / UNKNOWN
- [x] Clear message when both fail, with the report button beside it

### Bot-wall (Cloudflare) fix ✅ — v0.0.4
- [x] Detect a 403 / anti-bot challenge in stderr
- [x] Retry the probe once with `--extractor-args generic:impersonate`
- [x] Carry the finding to the download so the same route is used
- [x] A registry `impersonate` target still wins over the generic flag
- [x] Verified end to end against the reported URL: blocked → downloadable

### Generic-extractor fix ✅ — v0.0.3
- [x] Codec `null` (unknown) no longer treated as `'none'` (absent)
- [x] "Original quality" row when a site offers one file with no resolution
- [x] Pure `engine/formats.ts` split out so shaping is testable
- [x] `npm run test:formats` — 17 assertions across generic, YouTube and HLS shapes

### v0.0.5 — ship the usage endpoint
- [x] Build-time inlining fixed, verified in `out/`
- [x] Stats upload tested end to end against the real Worker
- [x] Version bumped, `test:stats` added to `npm test`
- [x] Tagged `v0.0.5`; CI published setup, portable, zip, blockmap and
      `latest.yml`, not a draft
- [x] Confirmed the endpoint is inside the shipped `app.asar` — the one check
      the original bug would have failed

### Phase 5 — Audio + subtitles ✅ complete
- [x] MP3 and M4A extraction rows, bitrate picker in Options (320/256/192/128)
- [x] Cover art and metadata embedding, both switchable
- [x] Subtitle languages parsed from the probe, authored tracks before automatic
- [x] Per-item language picker on the queue row; global default in Options
- [x] Embed / sidecar .srt / both, with `--convert-subs srt` for the sidecar
- [x] Subtitles skipped entirely on audio jobs — `--embed-subs` fails on an mp3
- [x] Fixed: the stream check tested `protocol` against a file extension and so
      could never match, leaving DASH and plain m3u8 claiming they need no ffmpeg
- [x] Fixed: format rows needed a unique identity separate from their selector
- [x] 95 offline assertions across args, formats and stats
- [x] **Verified against real downloads**, not just asserted: an MP3 came out
      with cover art and tags confirmed by ffprobe, and a video came out with an
      `.en.srt` beside it and a `mov_text` track embedded and tagged `eng`

### Phase 6 — Clipboard + history  ← NEXT

- [ ] Clipboard watcher with toast prompt (opt-out in settings)
- [ ] Persistent searchable history, re-download, clear
- [ ] Minimize to tray instead of closing

### Phase 6.5 — Playlist monitoring
- [ ] Watch a playlist/channel for new uploads
- [ ] Per-watch mode: notify (default) or auto-download — never auto by default

### Phase 7 — Optional addons + site requests
> **Reshaped by [docs/browser-engine.md](docs/browser-engine.md).** The Auth Pack
> was planned around `--cookies-from-browser`, which cannot read Chrome on
> Windows any more and, from an unsigned exe, looks exactly like an infostealer.
> Electron's own Chromium removes all of that — and since Chromium is already in
> the binary there is nothing to download, so the "addon" framing collapses into
> a UI affordance. Not decided yet.

- [ ] Registry `domains` map + capability gate popups
- [ ] Sign-in window on its own partition, cookies exported to `--cookies`
      (replaces cookies-from-browser)
- [ ] "Request this site" → prefilled GitHub issue (domain + version + sanitised
      error only; no URL path, no personal data)
- [ ] Site profile revisions publishable without an app release

### Phase 8 — Build targets
- [x] Custom app icon — 7 sizes, generated by `npm run icon` from `build/iconsrc/`
- [x] NSIS installer — `dist/tizo-0.0.1-setup.exe`, 99.1 MB
- [x] Portable single exe — `dist/tizo-0.0.1-portable.exe`, 98.9 MB
- [x] Zip — `dist/tizo-0.0.1-x64.zip`, 138.7 MB
- [ ] Run the installer and confirm terms → setup → download works when packaged
- [ ] Run the portable exe from a USB stick; confirm `tizo-data/` lands beside it
      and that the updater shows its banner instead of trying to self-replace

### Phase 9 — Release pipeline
- [x] GitHub Actions workflow: build + publish setup, portable, zip and
      `latest.yml` on every `v*` tag, with a tag/version mismatch guard
- [x] `docs/releasing.md` — the process and what every release must contain
- [x] v0.0.1 published — setup, portable, zip and `latest.yml` all live
- [x] `releaseType: release` set so future tags skip the draft state
- [x] v0.0.2 published directly from CI — `releaseType: release` confirmed working
- [x] **Auto-update proven end to end** — user installed 0.0.1 and it updated
      itself. The whole chain works: tag → CI → release → banner → restart.
- [ ] README with install instructions + SmartScreen note + legal disclaimer

## Blocked

_Nothing blocked._

## Where things stand (2026-08-20)

Released through **v0.0.4**. Phases 0–4 and 8–9 are done; Phase 5 is next.

The app works end to end: terms → Essentials download → paste a link → queue →
download, with auto-update proven against a real release. Not yet built: audio
extraction, subtitles, clipboard watching, history, tray, playlist monitoring,
and the optional addon gates.

**The stats endpoint is deployed** (2026-08-21) and the repo variable is set, so
builds from v0.0.5 onward carry it. Nothing is collected from any existing
install — they shipped with an empty endpoint — and nothing is collected from new
ones until the user opts in. See [server/README.md](server/README.md).

## Open questions

- **Final app name.** "Tizo" is a working title. It lives in `package.json`
  (`name`, `productName`) and the repo name. Free to change until v1.0.0 ships;
  after that it breaks users' auto-update path.
- **i18n.** All copy is centralised in `src/renderer/src/strings.ts`, so adding a
  locale is a lookup swap rather than a rewrite. Whether to ship one is open.
- **Code signing.** Unsigned means a SmartScreen warning on every install.
  Revisit once real users start hitting it.
- **Stats endpoint.** Deployed and wired. The dashboard is now private (Google
  sign-in, allow list) — resolved 2026-08-21.

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
