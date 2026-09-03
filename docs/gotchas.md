# Gotchas

Things that have already cost time on this project, each with the symptom that
made it hard to spot. Split out of `CLAUDE.md` on 2026-08-25 when that file
neared its 50 KB budget; `CLAUDE.md` keeps a one-line index of every entry here,
so a session sees the warning in context and comes here for the detail.

**Adding one:** put it in the group it belongs to, lead with the trap rather than
the fix, and say what it *looked* like — most of these were expensive precisely
because the symptom pointed somewhere else. Then add its line to the index in
`CLAUDE.md`.

The order below is grouped by area: registry and platform, processes and
binaries, plugins and page fetching, the experimental browser, yt-dlp arguments,
the stats Worker, product scope, toolchain, diagnosis, and build and release.

- **`components.json` is a live compatibility surface, not just a config file.**
  Clients from v0.0.5 onward fetch it and read the top-level component fields
  directly. Anything added must be additive and ignorable; moving or renaming a
  top-level field breaks first-run setup for installs already in the wild, and
  there is no way to reach them to fix it.
- **An AppImage must not be treated as portable.** `isPortable()` is what turns
  the updater off. AppImage is the only Linux target and it *can* self-update, so
  adding `APPIMAGE` to that check would disable self-updating for the entire
  platform while looking like a correct port of the Windows behaviour.
- **A component that is not published for a platform must resolve to null, and
  setup must say so.** `findComponent` returning nothing left `runSetup` with an
  empty plan, which it reads as "everything is already installed" and marks
  complete — an app that believes it is ready with no engine on disk.
- **Linux first-run is ~151 MB, not the ~92 MB Windows costs.** The Linux ffmpeg
  build is not UPX-packed (111 MB zip vs 77 MB), and `yt-dlp_linux` is 40 MB
  against 18 MB for the exe. State it on a download page rather than surprising
  people mid-setup.
- **Do not write regexes into this codebase through a shell one-liner.** Two bugs
  in one session: a replacement halved a doubled backslash so a path-separator guard
  silently checked only `/`, and perl's `$/` under `-0` interpolated a NUL byte
  into a test. Both looked right on screen. Use the editor for anything with a
  backslash, and prefer `includes()` over a character class where it reads the
  same.
- **A downloaded binary is not executable on Unix.** `installComponent` must
  `chmod 0o755` before `verifyRuns`, or the check fails with EACCES and setup
  reports "installed but will not run. Antivirus may have quarantined it." Setup
  is a mandatory gate, so that is a dead app with an error that points away from
  the cause. Windows is skipped — permissions do not work that way there.
- **`process.kill(-pid)` needs a process group, which needs `detached`.** The
  POSIX branch of `killTree` signals a group; the download spawn did not create
  one, so the call threw ESRCH into an empty catch and cancelling reported
  success while yt-dlp and its ffmpeg child kept writing the file. If a spawn is
  ever tree-killed, it must be `detached` on POSIX. Do not `unref` it — the job
  stays tracked and `before-quit` cancels everything.
- **Binary names are a contract with the registry, not a local detail.**
  `binaries.ts` resolves `yt-dlp.exe`/`yt-dlp` and `ffmpeg.exe`/`ffmpeg` by
  platform. A component spec's `binaries` array must put exactly those names on
  disk, or setup installs a working engine and the app then reports it missing.

- **Never clear the whole plugin root to refresh bundled plugins.** Registry
  plugins live in the same directory, so wiping it on launch deletes on every
  start exactly what the registry just installed. Replace bundled packages one by
  one instead.
- **`TIZO_MANIFEST_URL` moves the registry off the public repo** without an app
  change. Worth using: the default points at `raw.githubusercontent.com` in this
  repo, so anything the manifest names is public.

- **Node's `fetch` cannot get past a bot wall; yt-dlp can.** A walled page
  answers `fetch` with 403 while yt-dlp walks through, because it bundles
  curl_cffi and fakes the TLS handshake. `page.ts` tries the plain fetch first
  and falls back to `yt-dlp --write-pages` in a throwaway directory. Its exit code
  is ignored on purpose: "Unsupported URL" is a failure for yt-dlp and a success
  here, because the page still gets written — which is the whole point, since we
  want the HTML precisely because yt-dlp could not use the URL.

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

- **Never gate the *upload* routes on the stats Worker.** Sign-in protects `GET`
  and `/admin/*`. Requiring a credential to upload would mean shipping one in
  every copy of the app, and would hand the server a way to distinguish
  submitters — which collapses the same guarantee as putting the install id on a
  site row. If a change makes the app authenticate, the change is wrong.
- **Any new route on the stats Worker must be matched before the method checks.**
  A POST to *any* path other than `/install` falls through to the open
  site-counts handler, so a new gated route that misses its own branch does not
  404 — it gets read as an anonymous upload and written to the database. This is
  why `/auth/` and `/admin/` are both routed at the top of `fetch`.
- **Escapes inside the dashboard's inline `<script>` need doubling.** The page is
  built in a template literal, so `\n` there collapses to a real newline inside a
  JS string and the served page dies with "Invalid or unexpected token" — with
  nothing on the server reporting a problem. Write `\\n`. `test:worker` compiles
  the served script rather than trusting it.
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
