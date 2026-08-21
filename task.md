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

### Experimental discovery (opt-in) — in progress
> Settings → Experimental → "Follow embedded players". Off by default; runs only
> after the extractor and the page scan have both failed.

- [x] `embeds.ts` — finds players escaped inside `data-*` attributes, filters out
      consent frames and share widgets, keeps document order and reads the label
- [x] `deep.ts` — tries each player in the site's own order
- [x] `browser.ts` — hidden sandboxed window on a throwaway in-memory partition,
      watches `webRequest`, nudges `preload:"none"` players into starting
- [x] `media.ts` — pure classifier, split out so it is testable without Electron
- [x] Captured headers replayed via `--add-header`, kept out of `QueueItem`
- [x] 28 offline assertions (`npm run test:embeds`)
- [x] **Sniffer proven live**: on a YouTube page it captured 5 media URLs with
      the `Referer`/`Origin`/`User-Agent` the player actually sent
- [x] Run end to end against a real reported page — **it crashed.**
- [x] **FIXED — the crash no longer reaches the app.** `sniffMedia` now spawns a
      child copy of the app (`--tizo-sniff-url=`); the window lives there and a
      child that dies for any reason is read as "found nothing". Verified: the
      child takes 14 CHECK aborts on the reported page while the parent returns
      cleanly and keeps running. `utilityProcess` was not an option — it is
      Node-only and cannot create a window.
- [x] Crash cause removed too: blocking third-party sub-frames cut the aborts
      from 14 to 6, and disabling site isolation *in that child only* took it to 0
- [x] Child lifecycle fixed: an empty `window-all-closed` handler stops a page
      closing its own renderer from ending the child early, and
      `render-process-gone` reports what was seen instead of waiting out the clock
- [x] Output fixed: `app.exit()` after `process.stdout.write` truncated the
      result, so the exit now waits for the flush callback
- [x] No regression — a YouTube page through the child still returns a media URL
      with `Referer`/`Origin`/`User-Agent`, zero aborts
- [ ] **The reported host still yields nothing.** No crash, clean `[]`: that
      player sits behind a Cloudflare Turnstile widget and never requests media
      inside the budget. That is a per-host anti-bot problem, not a mechanism
      problem — decide separately whether it is worth solving
- [ ] Still unproven: the full queue path (probe → scan → embed → sniff →
      download) as one run inside the running app
- [x] Tried allowing bot-challenge frames through the third-party frame block
      (the block that stopped the crash also stopped the challenge loading, and a
      challenge that cannot load can never pass). **Did not help** — the guarded
      host still returns nothing with zero aborts, so something other than the
      challenge is stopping that player. Kept anyway: it is correct in principle
      and costs nothing
- [x] `kick()` improved anyway: the window now renders off-screen instead of
      `show: false` (a window that never paints often never starts a player), and
      a real `sendInputEvent` click is sent as well as the scripted one, because
      Chromium treats a trusted gesture differently from `element.click()`
- [x] **Diagnosed the guarded host properly.** With request logging: 37 requests,
      the player script and its CDN assets load, Turnstile
      loads — and *zero* media content-types. The player is waiting on the bot
      challenge before it requests anything. Not the window, not the click, not
      the matcher.
- [ ] **Not pursuing challenge-solving.** Getting past Turnstile means building
      bot-detection evasion, which is a different activity from downloading media
      a site serves. Hosts behind an interactive challenge are handled by the
      plugin route instead, where an extractor talks to the host's own API rather
      than pretending to be a browser.

- [x] **Pasting the page URL is enough.** Embed-following was gated behind the
      experimental switch along with the browser, so a site that shows
      Player 1 / Player 2 did nothing unless the user found the toggle. It is
      one fetch and one probe and cannot crash anything, so it now always
      runs; only the browser rung stays experimental
- [x] Verified end to end from the page URL with the toggle off: probe fails,
      scan finds nothing, the embed is followed, the plugin extracts, one row
      is offered. 8.5s

### KVS-platform sites ✅ supported
> Off-the-shelf tube software behind a large number of sites, so worth solving
> once at the platform level rather than per site.

- [x] Diagnosed: the page carries `kt_player`, `license_code` and
      `video_url: 'function/0/...'`, which is everything yt-dlp needs — it already
      implements the whole thing in `GenericIE._extract_kvs`
- [x] Cause found: yt-dlp looks for a `flashvars = {` assignment, and these
      deployments declare the same config differently, so detection fails with
      "Unable to extract flashvars" while the data is sitting right there
- [x] A plugin hooking `_extract_from_webpage` did **not** work: generic spots
      the KVS markers and raises before webpage extractors run, so the hook never
      fires. Claiming the URL was rejected as too risky — a plugin taking
      `/video/<id>` on every host turns pages generic handles into hard failures
- [x] **Fixed by overriding generic's `_extract_kvs`.** When the standard
      declaration is missing, the config object is located by walking outwards
      from `license_code` to its enclosing braces and appended in the shape
      yt-dlp expects; yt-dlp's own decoder does everything else. One method
      changed, nothing else touched, no decoding reimplemented
- [x] Verified on two reported sites: both give 2 raw formats → three curated
      rows (Best available, 720p, 480p)
- [ ] Worth reporting upstream: yt-dlp has the decoder and only the detection is
      too narrow, which is a small fix that would help every KVS site

### Two reported sites still unsupported — diagnosed
- [ ] **Walled aggregator + unknown player.** The page 403s a plain request and
      only opens to an impersonating client; behind it is a normal `<iframe>` to
      a separate player host. That host's page carries none of the usual markers
      — no kt_player, no jwplayer, no videojs, no sources — so it builds its media
      URL at runtime. That is the browser-sniffer case, i.e. rung 6
- [ ] **BLOCKER for it: `fetchHtml` cannot read a walled page.** The embed finder
      uses plain `fetch`, which takes the 403, while yt-dlp gets through with
      `--impersonate`. So the app cannot even see the iframe it would need to
      follow. Fixing this unlocks every walled aggregator, not just this one, and
      is worth more than either site
- [x] **The other site needs nothing.** First read of it was wrong: the `file:`
      and `source:` hits were CSS icon class names (`.el-icon-file`,
      `.el-icon-opensource`) and the lone `videojs` was an HTML comment naming a
      WordPress plugin. There is no player config — the page carries a plain
      download link with an `.mp4` href.
- [x] `findCandidates` already finds it: one candidate, `/download/...`, ext mp4.
      So the existing page-scan rung should handle that site as-is
- [ ] Confirm it in the running app. The one thing that could still stop it is
      `verify()`, which HEAD-checks candidates and rejects sub-100 KB responses
      and wrong content types — a `/download/` endpoint may answer a HEAD
      differently from a GET

### Site support at scale — the plugin route
> Full write-up in [docs/site-support.md](docs/site-support.md).

- [x] **Verified: the bundled `yt-dlp.exe` loads extractor plugins**, despite
      being a PyInstaller bundle. A throwaway extractor next to the managed binary
      was picked up and used
- [x] **Proven end to end.** A plugin for an embed-host family extracted a
      playable URL from a page whose HTML contains no source at all — the case
      that defeated both the page scan and the browser sniffer. Metadata only, no
      download, to confirm extraction rather than fetch anything
- [x] Plugins ship in `resources/plugins/`, packed by electron-builder and copied
      into `<binDir>/yt-dlp-plugins/` on launch, replaced wholesale each time
- [x] Probe now applies site profiles, and retries a bot wall with a real
      `--impersonate` target — `generic:impersonate` never reaches a named
      extractor, so a plugin behind a wall could not have worked without it
- [x] No host names added to the registry: the impersonation target is discovered
      generically, so nothing publishes which sites were reported
- [x] Fixed the gap that would have made all of it look broken: an extractor
      returning a single top-level `url` has no `formats` array, so shaping
      produced zero rows and the queue showed nothing to download even though
      extraction had succeeded. Verified against the real payload — one
      "Original quality" row
- [ ] Registry carries plugins too; component pipeline fetches and
      **sha256-verifies** them exactly like ffmpeg — a plugin is executable code,
      not config. Until then plugins only arrive with an app release
- [ ] Never fetch a plugin from a user-supplied URL, an issue, or a page
- [ ] Options shows installed plugins alongside components, and can remove them
- [ ] A route from a GitHub issue to a shipped plugin without an app release
- [ ] Ranking is crude: manifest over file, then first seen. No bitrate/duration
      signal, so a preroll ad could outrank the feature on some sites
- [ ] No UI for choosing between Player 1 and Player 2 — the first that works wins

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
