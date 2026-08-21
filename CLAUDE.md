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
   downloads a mandatory ~100 MB Essentials bundle (ffmpeg + current yt-dlp).
   After that everything works, and optional addons install on demand.

Site coverage is deliberately **broad and unfiltered** — everything yt-dlp
supports, ~1800 sites including mainstream, social, and adult. No blocklist.

**Done looks like:** a person downloads the installer (or drops the portable exe
on a USB stick), runs setup once, pastes a link from more or less anywhere, gets a
file — and a week later gets a bugfix without doing anything.

## Current State

- **Works:** Electron shell, full yt-dlp engine (probe, download, progress,
  cancel, error classification), component manager with verified resume and
  integrity checking, first-run setup verified end to end against the published
  assets, setup wizard, and the core GUI — download and settings screens, format
  picker with an inline all-formats expander, speed limit, geo-bypass,
  folder-per-download, container choice and file-collision handling, MP3/M4A
  extraction with cover art and metadata, subtitle download and embedding, and a
  queue-centred UI with concurrency, drag-and-drop, batch paste, and playlist and
  channel expansion with a per-item picker, queue sorting, paste-anywhere input,
  the update system (app + engine channels, version in the toolbar), a first-run
  terms gate, GitHub-backed suggestions and site reports, opt-in usage counting,
  and a custom app icon
- **In progress:** Phase 6 — clipboard, history, tray. Phases 0–5 and 8–9 are
  done; auto-update is proven working against a real release. v0.0.5 is the first
  build that can actually upload usage counts
- **Known broken / not started:** no clipboard *watcher* or history or tray
  (Phase 6), no playlist monitoring (6.5), no optional addon gates or sign-in
  window (7 — reshaped by [docs/browser-engine.md](docs/browser-engine.md)).
- **Site chain:** pasting a page URL runs probe, then page scan, then the
  page's own embedded player. Only the browser rung is behind Settings >
  Experimental. Verified end to end on a site that shows Player 1 / Player 2
  instead of a video: page -> player -> plugin -> one downloadable row.
- **Deployed:** the usage endpoint in `server/`, live at
  `https://tizo-stats.itemhunt-analytics.workers.dev` with `TIZO_STATS_ENDPOINT`
  set as a repo variable. Both upload routes verified against the real Worker.
  Takes effect from the next release; every shipped build so far carries an empty
  endpoint. See [server/README.md](server/README.md).
- **Dashboard sign-in is live:** Google OAuth gate deployed with all four
  secrets set. `GET` returns 401 and the sign-in page; the redirect to Google
  carries the right client, redirect URI and scopes; a forged `state` is
  rejected. Uploads unaffected. Not yet walked through in a browser end to end.
- **Unsigned:** every install shows a SmartScreen warning until a certificate
  exists.

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
npm test                # offline suite: typecheck + args, formats and stats assertions
npm run test:fetcher    # network: resume, integrity, corrupt-part discard
npm run test:essentials # network, ~92 MB: real installer against real published assets
npm run test:stats      # stats upload against a local stub; part of `npm test`
TIZO_STATS_TEST_URL=<url> npm run test:stats   # same test against the real Worker
npm run icon            # regenerate build/icon.ico from build/iconsrc/
```

The network tests are deliberately not part of `npm test` — they pull ~92 MB and
depend on GitHub being up. Run them when touching the component pipeline.

No env vars or credentials needed yet. Publishing releases will need `GH_TOKEN`
(Phase 9).

## File Structure

```
components.json            runtime component registry — also bundled as offline fallback
electron.vite.config.ts    three build targets: main, preload, renderer
electron-builder.yml       NSIS + portable + zip, GitHub publish config
tsconfig.json              one config covering main, preload and renderer

src/main/index.ts          window creation, single-instance lock, IPC registration
src/main/ipc.ts            every channel the renderer can reach
src/main/paths.ts          portable-aware data directory resolution
src/main/engine/args.ts    pure yt-dlp argument builder — no electron, so it is testable
src/main/engine/formats.ts pure format shaping — no electron, so it is testable
src/main/engine/scrape.ts  page scanner: last-resort media finder when no extractor matches
src/main/engine/embeds.ts  finds players stashed escaped in data-* attributes
src/main/engine/browser.ts EXPERIMENTAL: spawns a child that watches what a player fetches
src/main/engine/media.ts   pure: is an observed request downloadable media?
src/main/engine/deep.ts    EXPERIMENTAL: follow a page's embedded player
src/main/engine/plugins.ts installs the bundled yt-dlp extractor plugins
resources/plugins/         yt-dlp extractor plugins, packed and installed on launch
src/main/engine/           binaries, probe (incl. playlists), download, error classes
src/main/queue/            item state, probing, concurrency pump, playlist expansion
src/main/components/       fetch (resumable) + verify + unzip — powers setup AND addons
src/main/setup/            first-run orchestration and on-disk setup state
src/main/update/           electron-updater + the weekly yt-dlp engine channel
src/main/feedback.ts       builds prefilled GitHub issues; sanitises before sending
src/main/stats/            local site tally + the two opt-in upload streams
src/main/store/terms.ts    first-run terms acceptance state
src/main/store/settings.ts persisted settings, validated field-by-field on read

src/preload/index.ts       contextBridge; the ONLY main↔renderer surface
src/shared/types.ts        types shared across main, preload and renderer

src/renderer/src/App.tsx   shell: terms + setup gates, toolbar, update banner
src/renderer/src/SetupWizard.tsx  first-run Essentials download
src/renderer/src/views/    Queue (the main screen) and SettingsView
src/renderer/src/components/  QueueRow, PlaylistPicker, Icon, FeedbackDialog
src/renderer/src/TermsScreen.tsx  first-run terms gate
src/renderer/src/terms.ts     the terms copy itself
src/renderer/src/strings.ts   ALL user-visible copy; never hardcode text in a component
src/renderer/src/format.ts    byte, speed and duration formatting

scripts/test-args.ts       offline assertions that settings reach the command line
scripts/test-formats.ts    offline assertions on format shaping (generic/YouTube/HLS)
scripts/test-embeds.ts     offline assertions on embed finding and media classifying
scripts/test-stats.ts      runs the REAL stats module against a stub server
scripts/electron-stub*.mjs loader hooks that let src/main run under plain Node
scripts/test-fetcher.ts    network test for resume and integrity
scripts/test-essentials.ts real end-to-end install of the published components
scripts/install-essentials.ts dev convenience: skip the first-run wizard
scripts/build-icon.mjs     assembles build/iconsrc/*.png into build/icon.ico

build/icon.ico             app icon, 7 sizes; regenerate with `npm run icon`
build/iconsrc/             the PNGs it is built from — checked in on purpose
server/                    Cloudflare Worker for usage counts + its schema and docs
resources/                 files packed into the app; resources/bin is gitignored
docs/plan.md               phases, architecture, component schema, test matrix
docs/features.md           feature set vs. the reference app — taken, improved, skipped
docs/releasing.md          how to cut a release; what every release must contain
docs/browser-engine.md     proposal: embedded Chromium for login, discovery, capture
docs/site-support.md       how a reported site gets supported; the plugin route
.github/workflows/release.yml  builds and publishes all targets on a v* tag
```

See [docs/plan.md](docs/plan.md) for architecture, the addon manifest format,
portable-mode design, and the phase breakdown. See
[docs/releasing.md](docs/releasing.md) for the release process. See
[docs/features.md](docs/features.md) for the feature set and where we
deliberately differ from the reference app. See
[docs/browser-engine.md](docs/browser-engine.md) for the embedded-browser
proposal that reshapes Phase 7. See
[docs/site-support.md](docs/site-support.md) for how a reported site gets
supported, cheapest route first.

## Key Decisions

Newest first.

- **2026-08-21 — Extractor plugins ship with the app and install on launch.**
  `resources/plugins/` is packed by electron-builder and copied into
  `<binDir>/yt-dlp-plugins/` on every start, wholesale, so a plugin dropped from a
  release disappears from disk too. Proven end to end: a plugin for an embed-host
  family extracted a playable URL from a page that has no source in its HTML at
  all, where both the page scan and the browser sniffer had failed.
- **2026-08-21 — Impersonation targets are discovered, not listed.** The probe
  now retries a detected bot wall with `--impersonate <target>` after the generic
  flag fails, rather than naming hosts in `siteProfiles`. Two reasons: listing a
  host publishes which sites were reported, and a discovered target covers mirror
  domains that a list never catches.

- **2026-08-21 — Site support scales through yt-dlp extractor plugins, not our
  own extractors.** Verified that the bundled `yt-dlp.exe` loads plugins from
  `<binDir>/yt-dlp-plugins/<pkg>/yt_dlp_plugins/extractor/` even though it is a
  PyInstaller bundle. Adding a site becomes one small Python file shipped through
  the registry — no app release — and everything downstream (format picker, queue,
  progress, resume, error codes) keeps working because a plugin produces the same
  shape as a built-in extractor. *The catch:* a plugin is executable code on a
  user's machine, so it must be sha256-verified from our own registry exactly like
  ffmpeg, and never fetched from a user-supplied URL. See
  [docs/site-support.md](docs/site-support.md).
- **2026-08-21 — Reported sites are never named in the repo.** A changelog line
  named two embed hosts and the test fixtures carried a real page's video hashes.
  Those are traceable identifiers for whoever reported the site. Describe reported
  sites by their shape instead; this has already had to be cleaned up once.

- **2026-08-21 — The experimental browser runs in a child process, not in main.**
  Rendering a real aggregator page aborted the process with repeated
  `site_info.cc … origin.GetTupleOrPrecursorTupleIfOpaque().IsValid()` CHECK
  failures. A Chromium CHECK is an abort, not an exception — `try/catch` and
  `unhandledRejection` never see it — so the only containment is process
  boundary. `sniffMedia` spawns a child copy of the app; a child that dies for any
  reason is simply "found nothing", which the caller already handles. Without this
  one hostile page would take down the app and every queued download with it.

- **2026-08-21 — Experimental discovery is opt-in and last.** Following a page's
  embedded player, and running that player in a hidden window, sit behind
  Settings → Experimental and execute only after the extractor *and* the page scan
  have both failed. *Why:* they cost extra page loads, can pick the wrong mirror,
  and depend on how a site happens to be built — acceptable for something a person
  switched on, wrong as silent default behaviour, and it keeps working downloads
  exactly as fast as before.
- **2026-08-21 — Captured request headers never touch `QueueItem`.** They can
  include a session cookie, and `QueueItem` is serialised to the renderer and is
  what feedback payloads are built from. They live in a main-process-only map
  keyed by item id. Putting them on the item would leave credentials one careless
  line away from a public issue tracker — the same class of mistake as joining the
  install id to a site count.

- **2026-08-21 — A format row's identity is not always its selector.** `id` was
  doubling as the yt-dlp expression, which broke the moment two rows selected the
  same stream and differed only in what happened afterwards: "M4A" and "Audio
  only" both resolve `ba[ext=m4a]/ba/b`, so the queue's `find(f => f.id === …)`
  would have returned whichever came first and made the other unreachable.
  Extraction rows now carry a unique `id` plus an explicit `selector`. Guarded by
  a uniqueness assertion in `test:formats`.
- **2026-08-21 — Subtitle choice is per item, with three states not two.**
  `subLangs: null` means "no opinion, use the setting"; `[]` means "none for this
  one". Collapsing those would make it impossible to turn subtitles off for a
  single video without changing the global default and remembering to change it
  back — the same mistake as the Normal/Expert switch rejected for formats.

- **2026-08-21 — The dashboard is private; the upload routes are not.** Reverses
  the earlier "public on purpose". `GET` is behind Google sign-in with an email
  allow list; `POST /sites` and `POST /install` stay open and unauthenticated.
  *Why the split:* the app has no account and must never have one — a shipped
  credential would be a shared secret in every copy **and** would give the server
  a way to tell submissions apart, which is the linkability the two-stream design
  exists to prevent. *Why in-Worker OAuth and not Cloudflare Access:* Access
  cannot be applied to a `*.workers.dev` hostname, and no domain is owned. No
  user-facing copy ever promised the numbers were public, so nothing breaks.

- **2026-08-20 — Bot walls are handled by retry, not by default.** A Cloudflare
  403 is detected in stderr and the probe runs once more with
  `--extractor-args generic:impersonate`; the finding is then carried to the
  download so the same route is used. *Why retry:* impersonation is slower and
  some sites behave worse under it, so paying that cost on every request would be
  wrong — and yt-dlp names this exact flag in its own error message.
- **2026-08-20 — Page scanning is a fallback, never a first choice.** When yt-dlp
  has no extractor, the app fetches the page and looks for `<video>`, `<source>`,
  `og:video`, `contentUrl` and inline media URLs — what a person does with the
  inspector. It runs *only* after an extractor has failed, and only for
  `UNSUPPORTED_SITE`/`UNKNOWN`: scanning cannot solve a geo-block or a login wall.
  Candidates are HEAD-verified before being offered, because regex over HTML finds
  poster images and dead CDN paths that would otherwise become downloads which
  fail for reasons the user cannot act on.
- **2026-08-20 — Telemetry is two streams that share no key.** `/sites` carries
  `{domain: count}` with no identifier; `/install` carries a random UUID with no
  site data. Separate tables, no join. *Why:* the server can then answer "how many
  machines" and "which sites are popular" but **cannot** answer "what does this
  machine download" — which for a video downloader is the thing not to build.
  Putting the install id on a site row, or enabling Cloudflare Logpush (IPs),
  collapses the guarantee. See [server/README.md](server/README.md).
- **2026-08-20 — Terms gate on first run, before setup.** Accepting is the consent
  for the usage counts, and it stays switchable in Options — consent that cannot be
  withdrawn is not worth much. The agree button unlocks only after the text has
  been scrolled, so the telemetry section is actually seen.
- **2026-08-20 — Suggestions go to GitHub Issues, prefilled and sanitised.** yt-dlp
  stderr routinely contains the full URL, which for private or paid content must
  never reach a public tracker; URLs and user paths are stripped, and the exact
  payload is shown before anything opens.
- **2026-08-20 — Default download folder is Videos/Tizo, not Downloads/Tizo.**
  These are media files people keep, and Downloads is the folder everyone treats
  as a bin.
- **2026-08-20 — Visual language copied from the reference app.** Dark navy chrome
  top and bottom, an orange→violet→blue gradient behind the content, purple accents,
  icon-over-label toolbar. Structure alone was not enough — the user supplied
  screenshots for the *look*, and taking only the feature list missed the point.
- **2026-08-20 — No paste field; pasting anywhere adds links.** Ctrl+V is handled
  on the window, so there is no input to click into first. Matches the reference's
  "copy a URL and it appears" behaviour and is the shortest path from finding a
  video to queueing it.
- **2026-08-20 — Update system built before packaging.** Three channels as planned:
  app via electron-updater (launch + 6 h), yt-dlp weekly from its own repo, registry
  on demand. Self-update is explicitly disabled with a stated reason in dev and in
  portable builds, rather than silently doing nothing.
- **2026-08-20 — The queue IS the app, not a feature of it.** First build was a
  single-video form; the reference app is list-centred and that is the right
  shape. Everything is a queue item now, including a lone link. *Why it matters:*
  the single-item flow made batch use impossible and looked nothing like the
  reference the user asked to build on.
- **2026-08-20 — The queue never blocks on a modal.** A file collision inside a
  batch resolves to keep-both automatically rather than stopping everything to
  await a click. The prompt only appears for a deliberate single download.
- **2026-08-20 — All UI copy lives in `src/renderer/src/strings.ts`.** Tizo ships
  English-only, but retrofitting i18n means touching every component whereas
  swapping one module does not. Components must never hardcode user-visible text.
- **2026-08-20 — Format choice is progressive disclosure, not a global mode.** The
  reference app hides a Normal/Expert switch in settings; wanting one odd format
  for one video should not mean changing an app-wide preference and remembering to
  change it back. Short list inline, "All formats" expander beside it.
- **2026-08-20 — File collisions default to skip, never to asking.** Prompting on
  every collision punishes batch downloads, which is exactly when collisions
  happen. Ask-every-time remains available.
- **2026-08-20 — Mandatory first-run Essentials download (~110 MB).** Installer
  stays slim; the app is unusable until setup completes. *Why:* one honest setup
  step beats surprise popups mid-download. *Risk accepted:* a failed download
  means a dead app, so resumable transfers, sha256 verification, and a manual
  "install from file" path are required, not polish.
- **2026-08-20 — Hybrid bundle sourcing.** ffmpeg from a self-hosted versioned
  zip; yt-dlp pulled live from its own repo at setup so the engine is current at
  install time rather than build time; site profiles fetched from the registry as
  JSON so tuning fixes ship without a re-download.
- **2026-08-20 — Cut the impersonation component before building it.** Verified the
  official `yt-dlp.exe` already bundles curl_cffi with working impersonate targets,
  so the planned ~8 MB download would have delivered nothing.
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

- **`formats` is absent whenever an extractor returns a single URL.** Most
  plugins and plenty of built-ins describe one file at the top level instead of
  building a list, so `info.formats ?? []` yields nothing and the row renders with
  no download while the extractor has already found the file. `rawFormatsOf()`
  synthesises the single format; guarded by `npm run test:formats`. This is the
  v0.0.3 failure arriving by a second route — a working extraction can still
  produce an empty picker, so check the *shaped* rows, never just the probe.

- **`--extractor-args generic:impersonate` only reaches the *generic* extractor.**
  A named extractor — including one from a plugin — never sees it and keeps
  returning 403 behind a bot wall. `--impersonate <target>` applies to the
  requests themselves and is what gets those through. The probe tries the generic
  flag first and then a real target, because the second is slower.
- **The probe applies site profiles too, not just the download.** It did not
  originally, which was invisible while every profile was tuning — but a host
  served by a plugin can sit behind a wall, and the probe would fail before the
  plugin ever ran.
- **A plugin is executable code on a user's machine.** Install it only from the
  app's own resources, or from the registry after a sha256 check exactly as ffmpeg
  is handled. Never from a URL supplied by a user, a page or an issue report.

- **A Chromium CHECK failure cannot be caught.** It aborts the process, so no
  stack, no rejection, no `catch`. A silent exit with `Check failed:` lines in the
  output is this, not a bug in your JavaScript. The fix is always isolation, never
  error handling.
- **Electron quits when the last window closes — including a hidden one.** A
  hostile page that closes or crashes its own renderer made the sniff child exit
  before printing, which the parent read as "found nothing" on pages that were
  fine. The child registers an empty `window-all-closed` handler so it decides
  when it is done.
- **`process.stdout.write` then `app.exit()` truncates the write.** The child
  handed back nothing every time until the exit was moved into the write's flush
  callback. The same thing makes piped Electron output vanish — redirect to a file
  when debugging, or you will chase output that was produced correctly.
- **Site isolation is off in the sniff child, deliberately.** The abort came from
  site_info.cc itself, over ad frames with opaque origins. Blocking third-party
  sub-frames cut the failures from 14 to 6; disabling site isolation removed them.
  Safe *here* only because that child has no preload, no node integration, a
  sandboxed renderer, a throwaway in-memory session and nothing worth reaching —
  never copy the switch into the main app.

- **A media matcher built from a list of content types will be too narrow.** The
  first sniffer enumerated `video/mp4`, `video/webm` and friends and found nothing
  on a page that was visibly playing video: YouTube serves media as
  `application/vnd.yt-ump` from a URL with no extension. Match `^(video|audio)/`
  as a prefix, and exclude segments (`.ts`, `.m4s`, `video/mp2t`) explicitly — a
  player fetches hundreds of those and none of them is the video. Guarded by
  `npm run test:embeds`.
- **Some sites never render an `<iframe>`.** The player markup sits
  HTML-entity-encoded inside a `data-*` attribute and is injected on click, so the
  page shows "Player 1 / Player 2" and a poster. Scanning raw HTML for elements
  correctly finds nothing while the URL is sitting right there — `embeds.ts`
  decodes the attributes instead.

- **Any flag that runs a postprocessor breaks a no-ffmpeg row.** `--embed-metadata`,
  `--embed-subs`, `-x` and `--merge-output-format` all require ffmpeg, so emitting
  them on a row marked `needsFfmpeg: false` reproduces the `bv*+ba` failure: the
  row promises it works without the HQ pack and then hard-errors demanding it.
  Metadata is therefore gated on `needsFfmpeg || extractAudio`, and `test:args`
  asserts it stays off the no-ffmpeg path.
- **`--merge-output-format` on an audio job is rejected, not ignored.** There is
  no second stream to merge and yt-dlp refuses the combination, so extraction
  jobs must skip it — as must subtitles, since `--embed-subs` against an mp3
  fails rather than being dropped.

- **A wired-looking telemetry path can be inert.** Reading the call sites is not
  proof; `npm run test:stats` runs the real `src/main/stats` module (with
  `electron` stubbed by a loader hook, not copied) against a stub server and
  asserts what actually goes over the wire — including that the site batch
  carries no install id. Copying the module into a test would have reproduced the
  bug and passed.

- **`wrangler secret put` does not take effect on its own.** All four sign-in
  secrets uploaded successfully and the Worker still answered 503 as if none
  existed; an explicit `npx wrangler deploy` was needed before the running version
  picked them up. Nothing warns you — the secret list looks complete and the
  behaviour is unchanged, which reads exactly like a bug in the code.
- **Pipe secrets with `printf '%s'`, never `echo`.** `echo` appends a newline, and
  a trailing newline in `GOOGLE_CLIENT_ID` silently breaks the `aud` check and the
  token exchange. Values that are compared exactly must not be trimmed by luck.

- **Never gate the `POST` routes on the stats Worker.** Sign-in protects `GET`
  only. Requiring a credential to upload would mean shipping one in every copy of
  the app, and would hand the server a way to distinguish submitters — which
  collapses the same guarantee as putting the install id on a site row. If a
  change makes the app authenticate, the change is wrong.
- **The stats dashboard must fail closed.** Missing secrets return 503, not the
  data. The failure worth guarding against is a deploy that quietly reverts to
  public, and that one is invisible unless the default is "show nothing".

- **A build-time env var must be `define`d, or it is a runtime lookup that is
  always empty.** `TIZO_STATS_ENDPOINT` was read as `process.env[...]` in the main
  process with no `define` in `electron.vite.config.ts`, so the CI variable was
  inlined nowhere and the shipped app read a variable that cannot exist on a user's
  machine. Setting it in CI looked correct and did nothing. `define` matches the
  exact token, so the source must use **dot** access, not brackets. Check with
  `grep 'const ENDPOINT' out/main/index.js` — it must be a literal, not a lookup.

- **yt-dlp supports ~1800 sites already.** The addon system is *not* mainly about
  unsupported sites — it's about capabilities (ffmpeg, auth/cookies). Don't design
  it as "one addon per website"; that popup would almost never fire.
- **The site profile pack is tuning, not extractors.** It carries impersonation
  targets, player clients, rate limits and format preferences — never present it to
  users as "downloading site support", and never put a progress bar over an empty
  payload. Two planned components were cut after measurement for exactly this
  reason; measure before building any new one.
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
- **Screen capture of the window comes out black under GPU compositing.** Launch
  with `--disable-gpu` when a screenshot is needed, or the image is solid black
  with no error.
- **"Site not supported" usually means something else.** Two separate causes have
  already produced that message: a Cloudflare 403 blocking both yt-dlp *and* the
  page scan, and the codec-state bug below. Before touching the scraper, run the
  managed binary with the app's exact args and read stderr — the CLI on PATH can
  succeed where the app fails, because bot walls are inconsistent about who they
  challenge.
- **A codec field has three states, not two.** A named codec, `'none'` meaning the
  stream is genuinely absent, and `null`/absent meaning yt-dlp did not look. The
  Generic extractor returns the third for a plain file it finds on a page — a real,
  downloadable mp4 with `vcodec: null` and no `height`. Treating unknown as absent
  silently discarded every such result, leaving a queue row with nothing to
  download while yt-dlp had already found the file. Guarded by
  `npm run test:formats`.
- **`ffprobe` takes `-version`, not `--version`.** The ffmpeg family uses one
  dash, yt-dlp uses two. Guessing the flag from a filename prefix made every HQ
  Pack install fail at the final execution check with a message blaming
  antivirus. The verifier now tries both spellings. Caught only because the test
  runs the real installer — a mocked one would have shipped this.
- **No TS parameter properties in `src/main/components/fetcher.ts` or `install.ts`.** It is run
  directly by `node --experimental-strip-types` in the test scripts, and
  strip-only mode rejects `constructor(private readonly x)`. Write those fields
  longhand, and give their runtime imports explicit `.ts` extensions.
- **`electron-builder` does not bundle — it only packages `out/`.** CI must run
  `npm run build` first or it ships an `app.asar` with no entry file. `npm run dist`
  chains both, which is why this only ever appears in CI.
- **electron-builder publishes a DRAFT release by default.** Drafts are invisible
  to electron-updater, so a green CI run leaves a release that updates nobody until
  someone presses Publish. Fixed with `releaseType: release` in
  `electron-builder.yml`; v0.0.1 had to be published by hand.
- **A release without `latest.yml` breaks auto-update silently.** electron-builder
  uploads it automatically; never hand-curate a release by attaching only the
  exes. Installed copies simply stop finding updates, with no error anywhere.
- **The tag and `package.json` version must agree.** electron-updater reads the
  version *inside* the artifacts, not the tag, so a release tagged `v0.2.0`
  containing a 0.1.0 build looks correct on GitHub and updates nobody. The
  workflow fails the build rather than let that ship.
- **The installer is ~99 MB, not the ~50 MB the plan estimated.** Electron's
  runtime is the floor and there is little to trim. First-run total is therefore
  about 190 MB (99 MB installer + 92 MB Essentials), which is worth stating plainly
  on any download page rather than surprising people mid-setup.
- **Without ffmpeg, YouTube caps at 360p — not 720p.** Measured 2026-08-20: a
  YouTube video exposes 37 video-only formats and exactly *one* progressive
  (audio+video) stream, at 360p. Everything above that must be muxed. This is
  why the Essentials download is mandatory — without it the app is nearly
  useless on the single most important site.
- **A `bv*+ba` selector always demands ffmpeg.** yt-dlp hard-errors with
  "requested merging … ffmpeg is not installed" instead of falling back down the
  `/` chain. Format rows marked `needsFfmpeg: false` must therefore use a
  progressive-only selector (`b[height<=N]`), never a merge selector with a
  progressive fallback.

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
