# Video Downloader Tizo

**Status:** 🚧 Phase 0 done — scaffold runs
**Created:** 2026-08-20
**One-liner:** A universal video downloader for Windows and Linux with a GUI,
self-updating,
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
- **Fixed in 0.0.13: the bundled KVS plugin was disabling every built-in
  extractor.** It declared its override with `_PLUGIN_NAME`, which yt-dlp does
  not read, so it registered as a *new* extractor — and new extractors are
  prepended to the lookup. Being a `GenericIE` subclass it inherited
  `_VALID_URL = r'.*'` and matched every URL first, so YouTube, Vimeo,
  Dailymotion and the other ~1745 sites all fell through to generic. Shipped in
  v0.0.11 and v0.0.12. The fix is the documented `plugin_name=` class keyword,
  which swaps the class in for generic *in place* and leaves the ordering alone.
  Guarded by `npm run test:plugins`, which fails 7 assertions on the old form.
- **Site support scales without a release:** extractor plugins ship with the
  app and can also arrive from the registry, sha256-verified, listed in
  Options. Walled pages are readable — a plain fetch falls back to an
  impersonating one. See [docs/site-support.md](docs/site-support.md).
- **Site chain:** pasting a page URL runs probe, then page scan, then the
  page's own embedded player. Only the browser rung is behind Settings >
  Experimental. Verified end to end on a site that shows Player 1 / Player 2
  instead of a video: page -> player -> plugin -> one downloadable row.
- **Linux is supported.** Builds as an AppImage; the component registry carries
  per-platform variants and both Essentials are published for Linux. The real
  installer was proven end to end in a container against the real published
  assets, and `yt-dlp_linux` was confirmed to ship curl_cffi so the bot-wall and
  plugin routes work. Not yet done: a tagged CI run producing the AppImage, and
  running it on a real desktop. See task.md.
- **Deployed:** the usage endpoint in `server/`, live at
  `https://tizo-stats.itemhunt-analytics.workers.dev` with `TIZO_STATS_ENDPOINT`
  set as a repo variable. Both upload routes verified against the real Worker.
  Takes effect from the next release; every shipped build so far carries an empty
  endpoint. See [server/README.md](server/README.md).
- **Dashboard sign-in is live:** Google OAuth gate deployed with all four
  secrets set. `GET` returns 401 and the sign-in page; the redirect to Google
  carries the right client, redirect URI and scopes; a forged `state` is
  rejected. Uploads unaffected. Not yet walked through in a browser end to end.
- **The dashboard can delete data** — per site row, or the whole site table,
  install table or both behind a typed `DELETE ALL`. Same sign-in gate as
  viewing; uploads stay open. 43 offline assertions in `npm run test:worker`.
  **Deployed 2026-08-25** and probed live: every ungated delete 401s and changes
  nothing, and an `/admin/` path carrying an upload-shaped body 401s instead of
  being counted. The buttons themselves are still unclicked — nobody has signed
  into the dashboard in a browser yet.
- **The usage database is not empty.** Real counts arrived from a real install,
  so the upload path is proven end to end. See the P1 note in task.md — the
  earlier "no download ever completed" reading was wrong.
- **Unsigned:** every Windows install shows a SmartScreen warning until a
  certificate exists. Linux has no equivalent gate.

## Stack

- **Electron** + **React** + **Tailwind** — main process in Node 24
- **yt-dlp** (bundled binary, self-updating) — the download engine
- **ffmpeg** — *not* in the installer; arrives in the first-run Essentials bundle
- **electron-builder** — Windows: NSIS installer + portable exe + zip.
  Linux: AppImage only (see the decision below)
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
npm run dist:linux   # AppImage (needs a Linux host; CI does this on ubuntu-latest)
npm run dist:dir     # unpacked build, no installers — much faster for smoke tests
npm test                # offline suite: typecheck + args, formats, embeds, manifest,
                        # stats, worker, plugins
npm run test:worker     # the stats Worker's delete routes, offline, stubbed D1
npm run test:plugins    # the bundled plugins leave the built-in extractors alone.
                        # Offline but needs a yt-dlp binary; FAILS without one.
                        # Set TIZO_YTDLP to point at a specific binary
npm run test:fetcher    # network: resume, integrity, corrupt-part discard
npm run test:essentials # network: real installer against real published assets
                        # ~92 MB on Windows, ~156 MB on Linux
TIZO_MANIFEST_URL=./components.json npm run test:essentials  # prove a candidate
                        # registry against the real assets BEFORE pushing it
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
src/main/engine/page.ts    fetches a page, falling back to an impersonating client
src/main/engine/scrape.ts  page scanner: last-resort media finder when no extractor matches
src/main/engine/embeds.ts  finds players stashed escaped in data-* attributes
src/main/engine/browser.ts EXPERIMENTAL: spawns a child that watches what a player fetches
src/main/engine/media.ts   pure: is an observed request downloadable media?
src/main/engine/deep.ts    EXPERIMENTAL: follow a page's embedded player
src/main/engine/plugins.ts installs plugins: bundled, then registry-delivered
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
scripts/test-manifest.ts   platform resolution + registry validation (28 assertions)
scripts/test-worker.mjs    runs the REAL server/worker.js against a stubbed D1:
                           the delete routes, their gate, and the fall-through guard
scripts/test-plugins.mjs   runs the REAL yt-dlp against the REAL resources/plugins,
                           copied into a temp tree: the built-ins survive the
                           plugins, and the KVS widening still works
scripts/fixtures/          synthetic pages for the tests; invented, never a real site
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
docs/gotchas.md            every trap that has cost time here — indexed below
docs/features.md           feature set vs. the reference app — taken, improved, skipped
docs/releasing.md          how to cut a release; what every release must contain
docs/browser-engine.md     proposal: embedded Chromium for login, discovery, capture
docs/site-support.md       how a reported site gets supported; the plugin route
.github/workflows/release.yml  builds and publishes all targets on a v* tag
```

See [docs/gotchas.md](docs/gotchas.md) for the traps — the Gotchas section below
is only an index of it, and the detail is where the symptom is described. See
[docs/plan.md](docs/plan.md) for architecture, the addon manifest format,
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

- **2026-09-03 — A plugin may override a built-in only through yt-dlp's own
  override keyword, and a test must prove the other extractors survived.**
  `plugin_name=` is not decoration: it is what makes `__init_subclass__` swap
  the class in for `GenericIE` inside generic's own module, preserving an
  extractor order that puts generic last on purpose. Anything else registers a
  new extractor, and new extractors are prepended. *Why the test matters more
  than the fix:* the override kept extracting from its target site perfectly
  while every other extractor was unreachable, so no existing check could go
  red. `test:plugins` therefore asserts both halves — the widening still works,
  **and** three mainstream hosts still reach their own extractors — and it runs
  in `npm test` rather than beside it, because a test that has to be remembered
  is how this reached two releases. *The sharp edge:* it needs a real yt-dlp
  binary and **fails rather than skips** without one, so CI fetches one; a
  silent skip would restore the exact hole it was written to close.

- **2026-08-25 — The dashboard can delete what it shows, behind the same gate
  that shows it.** `POST /admin/delete` removes one site row, the site table,
  the install table, or both. *Why gated like `GET` and not like the uploads:*
  this is the operator acting, not the app — the split has always been "what the
  app does is open, what the operator does needs sign-in", and deleting is
  squarely the second. *Why bulk deletes demand a typed `DELETE ALL`:* the tables
  hold running sums with no per-submission history, so a wiped total cannot be
  rebuilt from anything; a single row is exempt because that site just starts
  from zero again. *The sharp edge:* every POST whose path is not `/install`
  falls through to the open site-counts handler, so `/admin/*` is matched before
  the method checks — an admin path that missed its branch would be counted as an
  anonymous upload instead of refused. Guarded by `npm run test:worker`, which
  fails 20 assertions if that one routing line is removed.

- **2026-08-24 — Linux ships as an AppImage, and the registry grew a platform
  axis to carry it.** Three choices, each with a sharp edge:

  *The registry change is additive and must stay that way.* Every client shipped
  since v0.0.5 fetches `components.json` and reads `url`/`size`/`sha256`/
  `binaries` off the top level, so the top level **is** the Windows variant and
  Linux lives in an optional `platforms` key those clients ignore. Restructuring
  the file into a platform map would break first-run setup — a mandatory gate —
  for every Windows install already out there.

  *An unpublished platform resolves to `null`, never to the Windows spec.* A
  fallback would put `ffmpeg.exe` on a Linux box, fail the execute check and
  blame the user's antivirus.

  *AppImage only, because electron-updater can self-update an AppImage and cannot
  update a deb, rpm or snap.* Any other format would ship the self-updating
  promise without the mechanism. Note the trap in `paths.ts`: `isPortable()` is
  what **disables** the updater, so adding `APPIMAGE` to it — the obvious-looking
  move — would silently switch self-updating off for the whole platform.

  Verified in a container rather than assumed: `yt-dlp_linux` ships curl_cffi
  with the full impersonate target list (so the bot-wall retry, the impersonating
  page fetch and the plugin route all work), and the real installer completes end
  to end against the real published assets. Cost stated plainly: Linux first-run
  is ~151 MB against 92 MB on Windows.

- **2026-08-22 — Plugins arrive from the registry, verified, and are visible in
  Options.** Each spec carries an https url and a sha256 that `fetchFile` checks
  before the file reaches the directory yt-dlp loads from — the same treatment
  ffmpeg gets, because a plugin is executable code on someone's machine and not
  configuration. A registry entry may never replace a bundled package, so a
  compromised registry cannot swap out code we shipped. Adding a site is now a
  verified file, not a release.
- **2026-08-22 — Registry entries describe mechanisms, never sites.** Plugin ids
  and site profiles both live in a public file, so a name there says which sites
  were asked for. Ids describe what the plugin does; anything that only needs
  impersonation gets nothing at all, because the probe discovers that at runtime.

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
- **2026-08-20 — Windows only.** *Superseded 2026-08-24 by the Linux entry at the
  top of this list.* macOS remains unbuilt; nothing in the stack blocks it.

## Gotchas

**Full detail — symptom, cause and fix for each — in [docs/gotchas.md](docs/gotchas.md).**
This is the index: enough to recognise you are about to hit one. Every line
below is a trap that has already cost time here, and most of them were expensive
because the symptom pointed somewhere other than the cause. When you add one,
add it there and add its line here.

**Registry and platform**
- `components.json` is a live compatibility surface — additive changes only, or first-run setup breaks for installs already in the wild
- An AppImage must not be treated as portable — `isPortable()` is what disables the updater
- A component unpublished for a platform must resolve to null, never to the Windows spec
- Linux first-run is ~151 MB, not the ~92 MB Windows costs
- Binary names are a contract with the registry, not a local detail

**Processes, binaries and the shell**
- Do not write regexes into this codebase through a shell one-liner — two bugs in one session
- A downloaded binary is not executable on Unix — `chmod` before the run check
- `process.kill(-pid)` needs a process group, which needs `detached`
- Pipe secrets with `printf '%s'`, never `echo` — a trailing newline breaks exact comparisons

**Plugins and fetching pages**
- A plugin overriding a built-in needs the `plugin_name=` class keyword — without it, it is prepended as a new extractor and a `GenericIE` subclass swallows every URL
- A plugin test that only checks its own target site cannot see that the plugin broke the other 1800
- Flags cannot isolate yt-dlp's plugin search — copy the binary next to a temp plugin tree
- Never clear the whole plugin root to refresh bundled plugins — it deletes registry plugins every launch
- A plugin is executable code on a user's machine — bundled or sha256-verified from our registry, never a user URL
- `TIZO_MANIFEST_URL` moves the registry off the public repo without an app change
- Node's `fetch` cannot get past a bot wall; yt-dlp can
- `--extractor-args generic:impersonate` only reaches the *generic* extractor; `--impersonate <target>` reaches the request
- The probe applies site profiles too, not just the download
- `formats` is absent whenever an extractor returns a single URL — check the *shaped* rows, not the probe

**The experimental browser**
- A Chromium CHECK failure cannot be caught — the fix is isolation, never error handling
- Electron quits when the last window closes, including a hidden one
- `process.stdout.write` then `app.exit()` truncates the write
- Site isolation is off in the sniff child, deliberately — never copy that switch into the main app
- A media matcher built from a list of content types will be too narrow
- Some sites never render an `<iframe>` — the player hides escaped in a `data-*` attribute

**yt-dlp arguments**
- Any flag that runs a postprocessor breaks a no-ffmpeg row
- `--merge-output-format` on an audio job is rejected, not ignored
- A `bv*+ba` selector always demands ffmpeg — it does not fall back down the `/` chain
- Without ffmpeg, YouTube caps at 360p — not 720p

**The stats Worker**
- Never gate the *upload* routes — if a change makes the app authenticate, the change is wrong
- Any new route must be matched before the method checks, or its body is counted as an upload
- The dashboard must fail closed — missing secrets return 503, never the data
- Escapes inside the dashboard's inline `<script>` need doubling
- `wrangler secret put` does not take effect on its own — deploy after it
- A wired-looking telemetry path can be inert — `test:stats` runs the real module
- A build-time env var must be `define`d, and the source must use dot access

**Product scope**
- yt-dlp supports ~1800 sites already — addons are about capabilities, not websites
- The site profile pack is tuning, not extractors — never a progress bar over an empty payload
- A mandatory setup gate turns any download failure into a dead app
- Portable exes cannot self-update

**Toolchain**
- `Error: Electron uninstall` means the binary never downloaded
- electron-vite 5 caps at Vite 7
- A `.d.ts` next to its source shadows it
- TypeScript 6 removed `baseUrl`
- No TS parameter properties in `components/fetcher.ts` or `install.ts` — strip-only mode rejects them
- Screen capture comes out black under GPU compositing — launch with `--disable-gpu`

**Diagnosing a broken site**
- "Site not supported" usually means something else — reproduce with the managed binary first
- A codec field has three states, not two — unknown is not absent
- `ffprobe` takes `-version`, not `--version`

**Build and release**
- `electron-builder` does not bundle — it only packages `out/`
- electron-builder publishes a DRAFT release by default, invisible to the updater
- A release without `latest.yml` breaks auto-update silently
- The tag and `package.json` version must agree
- The installer is ~99 MB, not the ~50 MB the plan estimated

## Deploy / Where It Lives

GitHub repo `BKHornYT/tizo`. Releases carry the Windows installer, portable exe
and zip, the Linux AppImage, and the two update feeds electron-updater reads —
`latest.yml` for Windows and `latest-linux.yml` for Linux. GitHub Actions builds
on both `windows-latest` and `ubuntu-latest` and publishes on tag push.

The usage endpoint is a separate deploy: a Cloudflare Worker plus D1, live at
`https://tizo-stats.itemhunt-analytics.workers.dev`, updated with
`cd server && npx wrangler deploy`. It is not touched by an app release, and an
app release does not touch it.

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
