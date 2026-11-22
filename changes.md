# Changes — Video Downloader Tizo

Newest first. One entry per change, using this format:

```
## YYYY-MM-DD — Short title
**What:** what actually changed
**Why:** the reason it changed
**Files:** the files touched
```

---

## 2026-11-22 — Owner's v0.0.14 test: Google sign-in on X fails, sensitive /video/1 link gave a bare "failed" (fixed, not released)
**What:** two bugs from the owner's first try of v0.0.14. (1) **"Continue with Google" in the X sign-in window → "An unexpected error occurred".** Offscreen repro (hidden window, never shown): username + Continue reaches X's real "couldn't find an account" answer with the app's exact window settings, so the window itself works. The Google button loads with `is_fedcm_supported=true` and the page sees `'IdentityCredential' in window === true`, but Electron ships no FedCM prompt. Fix: `app.commandLine.appendSwitch('disable-blink-features', 'FedCm')` in the main-app branch of `src/main/index.ts` (verified: `IdentityCredential` becomes false), so Google's script falls back to its popup. Synthetic clicks do not reach Google's cross-origin iframe in a hidden window, so the popup path itself is unverified, and Google may still refuse embedded browsers. Owner chose (picker) to add a fallback as well: **import a cookies.txt** exported from their own browser. The dialog offers it while the sign-in window is open. `importCookieFile` keeps only the chosen site's cookies (`cookiesForSite`), drops expired ones, checks the login marker, stores them encrypted like a window sign-in, and retries failed rows. New `fromNetscape` parser in `src/shared/sites.ts`. (2) **`https://x.com/<user>/status/<id>/video/1` on a sensitive post** failed with yt-dlp's "Video #1 is unavailable" (the `/video/N` branch), which was not classified → UNKNOWN → page scan → generic failure, no sign-in button. Now NO_MEDIA (`[twitter] … Video #N is unavailable | Media #N is not a video`). +3 checks in `test:items`, +11 in `test:auth` (now 48); full `npm test` + build green.
**Why:** owner's report with screenshot, 2026-11-22.
**Release:** first attempt blocked by the permission classifier pending the owner's fresh go; on the owner's "publish" it shipped as **v0.0.15**: commit `efdca82`, tag `v0.0.15`, Release run 45055821970 green on windows + linux, not a draft, all 7 assets, `latest.yml` reports 0.0.15.
**Files:** src/main/index.ts, src/main/auth/index.ts, src/main/ipc.ts, src/main/engine/errors.ts, src/preload/index.ts, src/shared/sites.ts, src/shared/types.ts, src/renderer/src/components/SignInDialog.tsx, src/renderer/src/strings.ts, scripts/test-auth.ts, scripts/test-items.ts, task.md, changes.md

## 2026-11-22 — v0.0.14 released (sign in to sites + X multi-video)
**What:** version bumped to 0.0.14, committed `d1d4a53` ("Release 0.0.14 …"), tagged `v0.0.14`, pushed. The Release workflow (run 45053402450) went green on windows and linux. https://github.com/BKHornYT/tizo/releases/tag/v0.0.14 is a full release, not a draft, with setup.exe (+ blockmap), portable.exe, x64.zip, x86_64.AppImage, `latest.yml` and `latest-linux.yml`. `releases/latest/download/latest.yml` reports `version: 0.0.14`, so installed copies will update. The PC working tree showed `build/icon.ico` + `build/iconsrc/*` as deleted (the Zima sync does not carry them); those deletions were deliberately **not** committed, and neither was `.split-snapshots/`.
**Why:** owner said "just publish, i will test published version". The sign-in round trip with a real account is therefore first tried on the release.
**Files:** package.json, package-lock.json, CLAUDE.md, task.md, changes.md

## 2026-11-22 — Sign in to sites (Phase 7 rung 1): sign-in window, encrypted sessions, per-site cookies
**What:** the app can now sign in to sites. A visible, sandboxed sign-in window runs on a fresh in-memory partition; on Done its cookies are read and (for the six one-click sites) checked for a signed-in marker. They are stored in `signins.bin`, encrypted with `safeStorage`, and sign-in is refused when only the plain-text fallback exists. Probes and downloads for that site only (`siteKeyOf`, twitter.com → x.com) get a temporary `--cookies` file that is deleted after each run. UI: "Sign in to <site>" on rows failing `AUTH_REQUIRED`/`AGE_RESTRICTED`/`NO_MEDIA`, with that site's failed rows retried automatically on success. New Settings → Signed-in sites (one-click X, Instagram, Facebook, TikTok, YouTube, Reddit, any other site, sign in again, sign out). One-time notice before the first sign-in. New terms section without a version bump (owner's choice). Updated `AUTH_REQUIRED`/`AGE_RESTRICTED` messages. Report scrubbing moved to `src/main/sanitise.ts` and now strips cookie-file paths and cookie/header-shaped lines. New `npm run test:auth` (37 checks). Full `npm test` and `electron-vite build` green. yt-dlp verified to read the app-written cookie file (incl. `#HttpOnly_` and session lines) on a live X probe.
**Why:** owner asked for sign-in so sensitive X posts and other login-walled videos work. Chose an in-memory partition + own encrypted store over a `persist:` partition because Electron leaves Chromium cookie encryption off without the `EnableCookieEncryption` fuse (plain SQLite otherwise).
**Not verified:** the full round trip with a real account in a real app window. That needs the owner's login and must not be auto-opened on the PC.
**Files:** src/main/auth/index.ts (new), src/shared/sites.ts (new), src/main/sanitise.ts (new), src/renderer/src/components/SignInDialog.tsx (new), scripts/test-auth.ts (new), src/main/engine/probe.ts, src/main/engine/args.ts, src/main/engine/download.ts, src/main/engine/errors.ts, src/main/queue/index.ts, src/main/ipc.ts, src/main/feedback.ts, src/preload/index.ts, src/shared/types.ts, src/renderer/src/components/QueueRow.tsx, src/renderer/src/views/Queue.tsx, src/renderer/src/views/SettingsView.tsx, src/renderer/src/strings.ts, src/renderer/src/terms.ts, package.json, docs/browser-engine.md, docs/site-support.md, CLAUDE.md, task.md

## 2026-11-22 — X / Twitter: multi-video posts reach the picker, "no video" is explained
**What:** checked X support against real posts first. Stock yt-dlp (2026.10.26) with the existing `impersonate: chrome` profile already downloads public X videos, with every URL form tested. Two app-side gaps fixed. (1) A post with several videos comes back as a playlist whose entries have no `url`, so `shapePlaylist()` dropped them all and the post never reached the picker; X also ignores `--no-playlist` here. Each URL-less entry now gets `<post>#tizo-item=N`; new `engine/item.ts` strips the marker and selects with `--yes-playlist --playlist-items N` in the probe and the download. The probe unwraps the one-entry result, so `raw`/`--load-info-json` replays hold the video itself, and a marked URL skips the playlist check. X's `/video/N` was rejected because it counts photos too. (2) "No video could be found in this tweet" is now a new `NO_MEDIA` code saying the post may be sensitive (sign-in needed), so it no longer counts as `UNKNOWN` and triggers a page scan. New `npm run test:items` (22 checks, part of `npm test`). Full suite green. End to end on the real engine code via the electron stub: a 4-video post gives 4 entries, each probes to its own media id, and #3 downloads correctly by both routes. A text-only post gives `NO_MEDIA`.
**Why:** owner asked for X/Twitter video support.
**Files:** src/main/engine/item.ts (new), src/main/engine/probe.ts, src/main/engine/args.ts, src/main/engine/errors.ts, src/shared/types.ts, scripts/test-items.ts (new), package.json, docs/site-support.md, CLAUDE.md, task.md

## 2026-10-16 — Changes log rolled under the 50,000 B cap (lucy, estate keeper · OpenCode)
**What:** moved the 2026-08-21 → 2026-08-24 entries (18 entries) into `docs/changes-archive-2.md`; `changes.md` went 49,047 → 13,934 B. Reconstructed byte-exact (kept part + moved block + footer == the original sha256) before writing.
**Why:** `changes.md` sat 953 B under the owner's 50,000 B cap and the project is still active, so the next entry would have breached it.
**Files:** changes.md, docs/changes-archive-2.md

## 2026-10-12 — PC/Zima sync conflicts resolved (ceo, T-719)
**What:** merged the PC's `probeRaw / inspectLink / infoJson` entry (dev) into this file, which already carried the Zima's newer `task.md` and `CLAUDE.md`-header entries; the oldest entry (`v0.0.5`) moved to `docs/changes-archive.md` to keep this file under the 50,000-byte cap. Byte-exact before/after proofs on T-719.
**Why:** this file and its PC copy both changed after the last sync; the sync kept one side, so the other side's entry had to be merged in.
**Files:** changes.md, docs/changes-archive.md

---

## 2026-10-12 — task.md: the 08-22 "Where things stand" block still said v0.0.11 and "Not yet built: audio extraction, subtitles" (lucy, estate keeper)
**What:** marked that dated block `Superseded` (the file's own convention); its text kept verbatim.
**Why:** it contradicted this file's own body (v0.0.13 shipped; `Phase 5 — Audio + subtitles` ✅), so a skimmer would take shipped work for not-built. task.md is frozen at 2026-09-03 while CLAUDE.md/changes.md moved on 10-12.
**Files:** task.md


---

## 2026-10-12 — probeRaw / inspectLink / infoJson (for Tizo Vault), number-safe progress
**What:** `probe.ts`: `probeRaw()` (probe + yt-dlp's raw JSON; `probe()` wraps it, unchanged), `inspectLink()` (one
`--flat-playlist -J` run answers playlist or single video, with the full info for a single one), shaping split into
`shapeInfo`/`shapePlaylist`. `DownloadRequest.infoJson` / `ArgContext.infoJson`: download from a saved JSON with
`--load-info-json=<file>` (one argument, ignored with directUrl). `download.ts`: progress fields are only passed
on when they are finite numbers (yt-dlp sent `_percent: false`, which crashed the Vault's database write).
**Why:** the Vault read every link 4-5 times; this app's own behaviour is unchanged (all additions are optional).
**Files:** `src/main/engine/{probe,args,download}.ts`
## 2026-10-12 — CLAUDE.md header status was four phases stale (lucy, estate keeper)
**What:** The one-line `**Status:**` at the top of `CLAUDE.md` still read "🚧 Phase 0 done — scaffold
runs" (written at project creation, 2026-08-20) while the file's own `## Current State` section — and
`changes.md` — have said "In progress: Phase 6 … Phases 0–5 and 8–9 are done" for weeks, with v0.0.13
the latest release. The header now reads `🚧 v0.0.13 shipped (Windows + Linux) — Phases 0–5, 8–9
done; Phase 6 (clipboard, history, tray) next`.
**Why:** the header is the first thing a session reads; it contradicted line 47 of the same file, so a
skimmer would take the project for a scaffold that barely runs.
**Files:** CLAUDE.md

## 2026-10-07 — Output template caps the id too ("File name too long")
**What:** `%(id)s` → `%(id).40B` in both output templates in `buildDownloadArgs` (the title was already capped at
150/100 bytes). `npm run test:args` passes.
**Why:** found by Tizo Vault, which compiles this engine in: on xfree.com the generic extractor made the id from
the whole URL (`video?id=…&title=…`), the name passed 255 bytes and yt-dlp failed with Errno 36. The same would
hit this app (and Windows' path limit sooner).
**Files:** src/main/engine/args.ts

## 2026-09-03 — The bundled plugin was disabling every yt-dlp extractor

**What:** `resources/plugins/tizo-hosts/.../kvsplayer.py` now declares its
override of generic with yt-dlp's `plugin_name=` **class keyword** instead of a
`_PLUGIN_NAME` attribute. Added `scripts/test-plugins.mjs` (13 assertions) and
`scripts/fixtures/kvs-page.html`, wired `test:plugins` into `npm test`, and gave
both CI jobs a step that fetches a yt-dlp for it. Version 0.0.13.

**Why:** `_PLUGIN_NAME` is not an API — yt-dlp never reads it. Without the real
keyword the class was collected as an ordinary *new* plugin extractor, and
`load_plugins` prepends those to the lookup. Being a `GenericIE` subclass it
inherited `_VALID_URL = r'.*'`, so it sat at the front of the list matching every
URL in existence and no named extractor was ever reached. This shipped in
v0.0.11 and v0.0.12.

**Files:** resources/plugins/tizo-hosts/yt_dlp_plugins/extractor/kvsplayer.py,
scripts/test-plugins.mjs, scripts/fixtures/kvs-page.html, package.json,
.github/workflows/release.yml, .gitignore, CLAUDE.md, docs/gotchas.md, task.md,
changes.md

**It was never a YouTube bug.** The ticket described YouTube dying, and that
framing nearly scoped the fix too small. Vimeo and Dailymotion were checked
before touching anything and both fell through to generic identically — all
~1745 built-in extractors were unreachable, and YouTube was simply the one
somebody tried. Two releases of the app were running on the generic extractor
alone.

**The mechanism was read out of yt-dlp's source, not inferred from behaviour.**
`InfoExtractor.__init_subclass__` acts only on the `plugin_name` keyword; it sets
`PLUGIN_NAME`, which is precisely what `get_regular_classes()` filters on to
decide something is an override rather than an addition, and it does
`setattr(sys.modules[super_class.__module__], 'GenericIE', cls)` so the class is
substituted *in place*. That leaves untouched the order `extractors.py` builds
on purpose — "Add Youtube first to improve matching performance … Add Generic
last so that it is the fallback". Confirming that mattered: the plausible-looking
fix of narrowing `_VALID_URL` would have kept the class at the front of the list
and broken different sites instead.

**The test is the actual deliverable.** Under the broken plugin, every KVS
assertion in the new suite still passes — the override extracted from its target
site flawlessly the whole time it was shadowing everything else. No test that
asks "does this plugin work?" could have caught this; only one that asks "does
everything else still work?" can. So `test:plugins` checks three unrelated
mainstream hosts, checks that no plugin registers a class shadowing a built-in,
and keeps an allow list of added extractor names so adding one is a decision
somebody has to make in the test file. Seven of its thirteen assertions fail
against the shipped form.

**It is offline, so it can live in `npm test`.** Extractor selection happens
before any request succeeds and yt-dlp tags its output with the extractor it
chose, so a dead proxy (`--proxy http://127.0.0.1:1`) reveals the choice with
nothing leaving the machine; the KVS half reads a local fixture over `file://`.
That is what let it go into `npm test` rather than beside it — and a test that
has to be remembered is exactly how this reached two releases.

**It fails rather than skips without a binary,** which is why CI grew a download
step. A skip would have restored the hole the test exists to close. Isolation
needed the same care: `--no-plugin-dirs` beats `--plugin-dirs` whatever the
order and the default search follows the executable, so the test copies the
binary next to a plugin tree built from `resources/plugins/` — the developer's
installed copy cannot mask a broken file in the repo, and it incidentally proves
the on-disk layout `plugins.ts` writes is one yt-dlp discovers.

**One extra fix found by the fixture.** The plugin decided whether to widen
detection using a looser regex than yt-dlp's own, so the fixture's explanatory
comment — which spelled out the declaration — silently switched the widening
off. The guard now uses yt-dlp's exact prefix, and the fixture carries a warning
not to write that text anywhere in the file.

**Verified end to end, not just asserted:** a real YouTube download through the
app's own managed binary with the plugins live — 19.0s, av1 video + opus audio,
merged by the app's own ffmpeg.

**Released as v0.0.13.** Both CI jobs green, release public with all six
artifacts and both update feeds. Worth noting what CI added over the local run:
it fetches yt-dlp fresh from upstream, so the plugin suite passed 13/13 against a
*different* binary from the one bundled here, on both Windows and Linux. The fix
is in yt-dlp's plugin contract, not in one build's quirk.

## 2026-08-25 — Docs brought current; Gotchas split into its own file

**What:** Moved all 51 Gotchas into `docs/gotchas.md` and left a grouped
one-line-per-entry index in `CLAUDE.md`, which drops from 46.8 KB to 33.7 KB.
Also fixed what had gone stale elsewhere: `docs/plan.md` still described the
Worker as "not deployed" and its route table predated both the sign-in gate and
the delete routes; `docs/releasing.md` still described a Windows-only, three-
artifact, one-feed release and summarised `npm test` as "the argument-builder
assertions".

**Why:** `CLAUDE.md` loads on every session, so its length is a cost paid every
run, and it was within 3 KB of the 50 KB budget. The stale docs are the worse
problem though — `plan.md` saying the Worker is undeployed is exactly the kind of
thing a future session acts on.

**Files:** CLAUDE.md, docs/gotchas.md, docs/plan.md, docs/releasing.md, changes.md

**An index, not a pointer.** The obvious move — replace the section with one line
saying "see docs/gotchas.md" — would have been wrong. Gotchas earn their place in
the always-loaded file precisely because you need to be warned *before* you go
looking, and nobody opens a traps file to check whether a trap exists. One line
per entry keeps that property at about a quarter of the bytes; the detail, which
is where each symptom is described, lives in the split-out file.

**The release facts were checked, not remembered.** The artifact list came from
`gh release view v0.0.12`, which is how the table now says `x86_64.AppImage`
rather than the plausible-looking `-x64.AppImage` the builder config reads like
it would produce, and how `latest-linux.yml` and the setup blockmap got into a
list that had never mentioned either.

## 2026-08-25 — Delete data from the stats dashboard

**What:** Added `POST /admin/delete` to the stats Worker and delete controls to
the dashboard. Four scopes: one site row, the whole site table, the install
table, or both. Each row in the table gets a `×`; a *Delete data* panel below it
holds the three bulk buttons. Wrote `scripts/test-worker.mjs` — 43 offline
assertions that run the real `server/worker.js` against a stubbed D1 — and wired
it into `npm test`.

**Why:** Clearing test rows meant hand-writing `wrangler d1 execute` against
production SQL, which is both awkward and the kind of thing that deletes the
wrong table at the wrong moment.

**Files:** server/worker.js, server/README.md, scripts/test-worker.mjs,
package.json, CLAUDE.md, task.md, changes.md

**Gated like the dashboard, not like the uploads.** Deleting is the operator
acting, so it sits behind the same Google sign-in as `GET`: 503 with no secrets
configured, 401 for an unsigned, forged, expired or off-allow-list session, and
every one of those paths deletes nothing. `POST /sites` and `POST /install` stay
open and unauthenticated — asserted in the test, because the day the app needs a
credential is the day the two-stream guarantee is gone.

**The trap this had to avoid.** Every POST whose path is not `/install` falls
through to the open site-counts handler. A gated route that missed its own branch
would therefore not 404 — its body would be read as an anonymous upload and
written to the database. `/admin/` is matched at the top of `fetch` alongside
`/auth/`, and the test asserts an `/admin/` request is never counted as an
upload. Deleting that single routing line fails 20 of the 43 assertions,
including that one, so it was verified by mutation rather than by reading.

**Bulk deletes demand a typed `DELETE ALL`.** The tables hold running sums with
no per-submission history, so there is nothing anywhere to rebuild a wiped total
from — friction is the only protection available. A single site row is exempt on
purpose: that site just starts counting from zero again.

**Two smaller things, both now in Gotchas.** Clearing installs *forgets* machines
rather than removing them — each one reappears on its next ping, which reads as a
failed delete unless the UI says so, so it does. And the dashboard's inline
`<script>` is built inside a template literal, so its own escapes need doubling:
`\n` collapsed into a real newline mid-string and served a page that died with
"Invalid or unexpected token" while the server reported a clean 200. Caught by
compiling the served script in the test, which is now a permanent assertion.

**Deployed** the same day, version `5a728402`, and probed live rather than
assumed: deletes without a session 401 and change nothing, a forged cookie 401s,
`GET /admin/delete` 405s, the dashboard still 401s and both upload routes still
answer unauthenticated. The one worth doing against production specifically —
an `/admin/` path carrying an upload-shaped body — returned 401 rather than the
200 the open handler would have produced, so the fall-through guard holds in the
deployed Worker and not only in the test. Row counts were re-read afterwards and
were unchanged.

**A side finding, recorded in task.md.** The read-only check turned up 2 site
rows / 3 downloads and 1 install rather than the empty database the open P1
assumed. They are not test rows — the fixture uploads two named domains and only
one of them could match, while the other row is a site the fixture never
mentions. So real downloads completed and the entire upload path works end to
end, which reverses that P1's conclusion; what is left to explain is only why the
*local* tally is empty, and Clear stats having been pressed would account for it
without any bug at all.


---

_Older history: `docs/changes-archive-2.md` (2026-08-24 → 2026-08-21) and `docs/changes-archive.md` (2026-08-21 → 2026-08-20)._
