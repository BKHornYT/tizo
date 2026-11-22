# Video Downloader — changes archive, part 2: 2026-08-21 → 2026-08-24

Entries rolled out of `changes.md` on 2026-10-16 so every file in this log stays
under the owner's 50,000 B cap (lucy, estate keeper). This part holds the
2026-08-21 → 2026-08-24 entries; the older 2026-08-20 → 2026-08-21 entries are in
`changes-archive.md`. Newest first, same entry format as `changes.md`.

---

## 2026-08-24 - v0.0.12: Linux

**What:** First release that builds for Linux. Ships the AppImage alongside the
Windows installer, portable exe and zip, plus the three portability fixes and the
platform-aware component registry.

**Why:** Everything under it was already portable; what was missing was packaging
and a registry that could describe more than one platform.

**Files:** package.json, package-lock.json

**Backward compatibility was proven, not assumed.** The parser shipped in v0.0.11
was checked out of git and run against the new `components.json`: it still sees
the Windows urls, sizes and binary names exactly as before, and ignores the new
`platforms` key. That mattered more than any other check here - every install out
there fetches this file on first run, and a break would have been unreachable.

**Verified after publishing, against the published artifacts:** both CI jobs
green and the release public, not a draft. The AppImage carries the Linux
registry entries, the bundled plugin, `app-update.yml` and the stats endpoint as
a literal; it starts under xvfb and stays up; and electron-updater accepts it as
an AppImage rather than refusing — the `paths.ts` decision confirmed from the
other side. The live registry serves the Linux variants at the raw URL shipped
clients fetch.

**Still unproven:** nobody has used it on a real desktop, and Linux auto-update
has not round-tripped — that needs v0.0.13 to be picked up by an installed copy.

---

## 2026-08-24 - Linux support: AppImage, a platform-aware registry, verified end to end

**What:** Tizo builds and ships for Linux. The component registry gained a
per-platform dimension, the engine and HQ pack are published for Linux, CI has an
ubuntu job, and electron-builder produces an AppImage.

**Why:** Everything under it was already portable once the three bugs in the
previous entry were fixed. What was missing was packaging and a registry that
could describe more than one platform.

**Files:** src/main/components/manifest.ts, src/main/setup/index.ts,
src/shared/types.ts, src/main/paths.ts, components.json, electron-builder.yml,
package.json, .github/workflows/release.yml, scripts/test-manifest.ts,
scripts/test-essentials.ts, scripts/electron-stub-hooks.mjs, CLAUDE.md, task.md

**The registry change is additive, and that is the whole design.** Every client
shipped since v0.0.5 fetches `components.json` and reads `url`, `size`, `sha256`
and `binaries` off the top level. So the top level stays exactly as it was - it
IS the Windows variant - and Linux arrives in an optional `platforms` key those
clients ignore. Restructuring the file into a platform map would have broken
first-run setup, a mandatory gate, for every Windows install already out there.

**An unpublished platform resolves to null, never to the Windows spec.** Falling
back would download `ffmpeg.exe` onto a Linux box, fail the execute check and
report "installed but will not run. Antivirus may have quarantined it." Absent
has to read as absent.

**Setup now fails loudly instead of quietly succeeding.** `findComponent`
returning nothing for an unpublished platform would have left `runSetup` with an
empty plan, which it treats as "everything already installed" and marks complete
- an app that believes it is ready with no engine on disk. Unresolvable
essentials are tracked separately and keep the gate shut.

**AppImage only, and AppImage is deliberately not "portable".** electron-updater
can self-update an AppImage but not a deb, rpm or snap, so any other format would
ship the self-updating promise without the mechanism. And because `isPortable()`
is what *disables* the updater, adding `APPIMAGE` to it - the obvious-looking
move - would silently switch off self-updating for the entire platform. There is
a comment in `paths.ts` saying so.

**Measured rather than assumed, in a container:**
- `yt-dlp_linux` ships curl_cffi with the full impersonate target list, so the
  bot-wall retry, the impersonating page fetch and the plugin route all work.
  This was the one fact that decided whether Linux was worth shipping at all.
- Both ffmpeg candidates were downloaded, repacked, hashed and executed in a
  clean Debian container before one was chosen.
- The published asset was fetched back and its sha256 compared against the
  registry entry, so the hash is verified against what is actually being served
  rather than against the file that happened to be on this machine.

**ffmpeg 9.0.1 (BtbN, repacked and self-hosted) over a smaller static build.**
57.5 MB and glibc-independent was tempting, but that build is ffmpeg 7.0.2 from
2024 - two majors behind Windows - and its glibc advantage is moot because
Electron 43 will not run on those systems either. Version parity means one ffmpeg
behaviour to reason about across platforms. The cost is stated plainly: Linux
first-run is about 151 MB against 92 MB on Windows.

**Two test affordances added:** `test-essentials` takes `TIZO_MANIFEST_URL` and
accepts a local path, so a candidate registry can be proven against the real
published assets before it is pushed; and the electron stub hook now supplies the
JSON import attribute, because the rule that nothing in `src/` changes to
accommodate a test still holds.

---

## 2026-08-24 - Linux portability groundwork (no packaging yet)

**What:** Three fixes that make the engine layer platform-agnostic, ahead of any
Linux build: binary names are chosen per platform instead of hardcoded `.exe`,
downloaded binaries get their execute bit set before the run check, and download
jobs are spawned `detached` on POSIX so cancelling actually kills the tree.

**Why:** An audit for Linux support found two of these are latent bugs rather
than missing features - they would have shipped as confusing failures, not as
"unsupported platform". Fixing them is correct on Windows terms too and costs
nothing, so they land now while packaging waits.

**Files:** src/main/engine/binaries.ts, src/main/components/install.ts,
src/main/engine/download.ts, CLAUDE.md, task.md

**The execute bit is the dangerous one.** `installComponent` copied the
downloaded file and went straight to `verifyRuns`. On Unix a downloaded file has
no `+x`, so that check fails with EACCES and setup reports *"installed but will
not run. Antivirus may have quarantined it."* Setup is a mandatory gate, so that
is a dead app whose error message points away from the cause. Now `chmod 0o755`
runs first, on both the download path and the offline install-from-file path.

**Cancel would have silently done nothing.** `killTree` already had a POSIX
branch calling `process.kill(-pid)`, but the spawn passed no `detached`, so no
process group with that id existed and the call threw ESRCH into an empty catch.
Stop would report success while yt-dlp and its ffmpeg child kept writing the
output file. The job is still not `unref`'d and `before-quit` still cancels
everything, so nothing is orphaned when the app exits.

**Binary names are now a stated contract with the registry.** `resolveYtdlp` and
`resolveFfmpeg` pick `yt-dlp.exe`/`yt-dlp` and `ffmpeg.exe`/`ffmpeg` by platform,
which means a future Linux component spec's `binaries` array must land exactly
those names on disk - otherwise setup installs a working engine and the app then
reports it missing.

**Deliberately not done:** the manifest still has no platform dimension, there is
no Linux target in `electron-builder.yml` or CI, and no Linux ffmpeg bundle is
hosted. See task.md for what that would take and why the manifest change has to
be additive.

## 2026-08-22 - v0.0.11

**What:** Ships everything since 0.0.10: pages that refuse a plain request are now
read through an impersonating client, extractor plugins can arrive from the
registry sha256-verified, and Options lists what is installed with its origin.

**Why:** Together these change site support from "Claude investigates each one and
we cut a release" into something that scales - a verified file, no release, and
walled aggregators readable at all.

**Files:** package.json, package-lock.json

**Two gaps stated rather than papered over:** no plugin has yet travelled the
registry path with a real file, and `TIZO_MANIFEST_URL` still defaults to the
public repo, so anything the manifest names remains public.

## 2026-08-22 - Plugins from the registry, verified, and visible

**What:** `components.json` gained a `plugins` array. Each entry is validated
field by field, fetched with `fetchFile` - which already refuses a file whose
sha256 does not match - and installed into `<binDir>/yt-dlp-plugins/<id>/`. A new
"Site support" section in Options lists what is installed, its version, and
whether it shipped with the app or arrived on its own.

**Why:** Until now a new site meant an app release. This is what makes "someone
suggests a site and it works" true without one.

**Files:** src/main/components/manifest.ts, src/main/engine/plugins.ts,
src/main/index.ts, src/main/ipc.ts, src/preload/index.ts, src/shared/types.ts,
src/renderer/src/{strings.ts,views/SettingsView.tsx}, components.json, CLAUDE.md,
task.md

**A plugin is executable code on a user's machine**, so it gets exactly what
ffmpeg gets and not what a config file gets: https only, from our own registry,
sha256 checked before the file is written anywhere yt-dlp will load it. The
validator drops any entry lacking a well-formed id, an https url or a 64-hex
hash, because a half-written entry must be ignored rather than half-applied.

**A registry entry can never replace a bundled package.** Without that rule a
compromised registry would be a way to swap out code shipped inside the app.

**Two failure modes handled deliberately:** a failed update leaves the previous
version in place, since a bad fetch is no reason to remove working support; and
bundled packages are replaced one at a time rather than by clearing the plugin
root, which would have deleted registry plugins on every single launch.

**Shown in Options on purpose.** Anything running on someone's machine on our
say-so should be visible to them with its origin stated - "included" versus
"updated" is a real difference, since one can change without a new release.

**Not yet done:** no plugin has actually been published through this path, so the
pipeline is built but untested with a real file. And `TIZO_MANIFEST_URL` still
defaults to the public repo, so anything the manifest names remains public.

## 2026-08-22 - Read pages that refuse a plain request

**What:** `fetchHtml` moved into `src/main/engine/page.ts` and gained a fallback:
when a plain fetch is answered with 403, 429, 503 or a refused connection, the
page is fetched again through yt-dlp, which impersonates a browser down to the
TLS handshake. Shared by the page scanner and the embed finder so both see the
same markup.

**Why:** Node's `fetch` cannot fake a TLS fingerprint, so a Cloudflare-walled
aggregator answered it with 403 - while yt-dlp walked straight through. The embed
finder therefore never saw an iframe it would happily have followed, and the site
looked unsupported for a reason that had nothing to do with its player.

**Files:** src/main/engine/page.ts, src/main/engine/scrape.ts, CLAUDE.md, task.md

**Verified on the reported site:** plain fetch 403, impersonated fetch 111 KB,
and the embed finder returns the iframe it previously could not see.

**The plain fetch stays first**, because it is far faster and is what almost every
page needs; spawning a process per page would be a poor trade for the few that are
walled.

**yt-dlp's exit code is deliberately ignored** in the fallback. "Unsupported URL"
is a failure for yt-dlp and a success here - the page is still written, and we
want the HTML precisely because yt-dlp could not do anything with the URL.

**This unlocks a category, not a site.** Any walled aggregator whose player is
already supported now works. The site that prompted it still needs its own player
solved, which is a separate problem.

## 2026-08-22 - Two more reported sites: one already covered, one blocked

**What:** Diagnosed two further reported sites. One needs no work at all; the
other is blocked on a gap that matters more than the site does.

**The one that needs nothing.** My first read of it was wrong and worth recording
as such: I reported it as "a Video.js config with in-page sources" on the strength
of `file:`, `source:` and `videojs` appearing in the page. They were CSS icon
class names (`.el-icon-file`, `.el-icon-opensource`) and an HTML comment naming a
WordPress plugin. There is no player config - the page carries a plain download
link. `findCandidates` already returns it, so the existing page-scan rung should
cover that site unchanged. Still to confirm in the running app, where `verify()`
HEAD-checks candidates and could answer differently from a GET.

**The one that is blocked.** Its aggregator page 403s a plain request and only
opens to an impersonating client; behind it sits a normal iframe to a player host
whose page carries none of the usual markers, so it builds its URL at runtime.
Two separate problems, and the first is the general one: **`fetchHtml` uses plain
`fetch`, so the embed finder cannot read a Cloudflare-walled page** while yt-dlp
gets through by impersonating. The app never sees an iframe it would happily
follow. That blocks every walled aggregator, not one site.

**Also fixed:** the embed plugin matched ids as `[a-z0-9]{8,}`, so a host using
mixed-case ids never matched and its pages read as "Unsupported URL" - a
too-narrow character class presenting as a missing feature, which is now the third
time that shape of bug has appeared here.

**Process note:** five reported sites have produced three distinct player
families. Each needs its own diagnosis, and every fix currently requires an app
release. That is the treadmill the addon design was meant to avoid, and it argues
for spending the next effort on delivering plugins through the registry rather
than on a sixth site.

## 2026-08-22 - v0.0.10: KVS-platform sites now work

**What:** A second reported site turned out to run KVS, off-the-shelf tube-site
software used by a large number of sites. Diagnosed fully; not fixed.

**Why it fails:** the page carries `kt_player`, `license_code` and a
`video_url: 'function/0/...'` - everything needed, and yt-dlp already implements
the entire decode in `GenericIE._extract_kvs`. Detection is the only problem: it
looks for a `flashvars = {` assignment and these deployments declare the same
config another way, so it gives up with "Unable to extract flashvars" while the
data is right there.

**What was tried:** a plugin hooking `_extract_from_webpage`, which contributes to
generic extraction without claiming URLs of its own - deliberately, because a
plugin matching `/video/<id>` on any host would take over pages generic can
already handle and turn a miss into a hard failure. It does not work: generic sees
the KVS markers and raises before webpage extractors run, so the hook never fires.
Removed rather than left in the tree as dead code.

**Fixed by overriding generic's `_extract_kvs`.** A plugin that subclasses the
built-in extractor replaces it, so detection can be widened without touching
anything else: when the standard declaration is absent, the config object is
located by walking outwards from `license_code` to its enclosing braces and
appended in the shape yt-dlp expects. yt-dlp's own decoder then does the whole
job - nothing about the obfuscation is reimplemented here.

**Verified on two separately reported sites**, which turned out to run the same
software: each yields 2 raw formats, shaping into three rows - Best available,
720p and 480p. Metadata only; no downloads were made.

**Worth an upstream report.** yt-dlp already has the decoder and only its
detection is too narrow, so this is a small fix that would help every KVS site
rather than living in our plugin forever.

## 2026-08-21 - v0.0.9: pasting the page URL is enough

**What:** Embed-following now runs as part of the normal chain instead of being
gated behind Settings > Experimental. Only the browser rung - loading a player to
watch what it fetches - stays behind that switch.

**Why:** Reported directly: pasting the page did nothing. Both halves had been put
behind one toggle, so a site that shows "Player 1 / Player 2" instead of a video
stayed broken unless someone found the setting. Following an embed is a fetch and
a probe; it cannot crash anything, and gating it bought nothing.

**Files:** src/main/engine/deep.ts, src/main/queue/index.ts, CLAUDE.md, task.md

**Verified end to end from the page URL, toggle off:** probe fails with
UNSUPPORTED_SITE, the page scan correctly finds nothing, the embed is followed,
the plugin extracts, and one row is offered. 8.5 seconds start to finish.

**The general lesson:** an opt-in switch is right for something that can misbehave,
and wrong for something that is simply the next step. Splitting them by risk rather
than by feature is what made the difference.

## 2026-08-21 — v0.0.8: a single-URL extractor produced no downloadable row
**What:** An extractor that returns one top-level `url` has no `formats` array at
all, and the probe read `info.formats ?? []` — so shaping produced zero rows and
the queue offered nothing to download, despite extraction having succeeded.
`rawFormatsOf()` now synthesises the single format from the top-level fields.
**Why:** Caught while checking whether the new plugin route would actually work
in the app rather than only on the command line. It would not have.
**Files:** src/main/engine/{formats,probe}.ts, scripts/test-formats.ts,
package.json, CLAUDE.md, task.md

**This is the v0.0.3 bug by a different route.** That one discarded a real file
because a codec field had three states and the filter knew two. This one discards
it because the file is described somewhere the code was not reading. Both end the
same way: a queue row with nothing to download while yt-dlp has already found the
video. The lesson is that a successful probe proves nothing — check the *shaped*
rows.

**Verified against the real payload**, not a fixture: the actual probe output that
had produced zero rows now produces one, "Original quality", correctly flagged as
not needing the HQ pack. Six new assertions cover the single-URL shape, including
that a genuine `formats` list still takes precedence and that a single top-level
*stream* is still flagged as needing ffmpeg.

**Every plugin-served site would have hit this**, since a small extractor almost
never builds a format list — so it would have looked like the whole plugin route
was broken.

## 2026-08-21 — The plugin route works: a site with no source in its HTML
**What:** Wrote a yt-dlp extractor plugin for an embed-host family, shipped it in
`resources/plugins/`, and made the app install it into
`<binDir>/yt-dlp-plugins/` on launch. Also taught the probe to apply site profiles
and to retry a detected bot wall with a real `--impersonate` target.
**Why:** The goal is that a reported site can be supported without an app rewrite.
This is the rung that makes that true.
**Files:** resources/plugins/…/embedhost.py, src/main/engine/plugins.ts,
src/main/engine/{probe,args,formats,download,scrape,deep}.ts,
src/main/queue/index.ts, src/main/index.ts, src/shared/types.ts,
electron-builder.yml, components.json, docs/site-support.md, CLAUDE.md, task.md

**Verified against the case that beat everything else.** A page whose HTML holds
no media source at all: the page scan found nothing (correctly), and the browser
sniffer loaded the player, loaded the challenge widget and watched it never
request media. The plugin talks to the endpoint the player talks to and returned a
playable URL. Run with `-J` — the point was to prove extraction, not to fetch
anything.

**The blocker was not the plugin.** It loaded and ran immediately, then 403'd on
the embed page. `--extractor-args generic:impersonate` addresses the *generic*
extractor, so a named extractor never sees it — the probe now retries with
`--impersonate <target>`, which applies to the requests themselves. Also fixed:
the probe ignored site profiles entirely, which was invisible while every profile
was tuning but fatal for a plugin behind a wall.

**Impersonation targets are discovered, not listed.** Host entries were briefly
added to `siteProfiles` and then removed: naming a host in a public registry
publishes which sites were reported, and a discovered target also covers the
mirror domains these families rotate through, which a list never would.

**Plugins are executable code**, so they install only from the app's own packed
resources. Carrying them in the registry needs the same sha256 verification ffmpeg
gets, and that is not built yet — until it is, a new plugin means an app release.

## 2026-08-21 — Off-screen rendering, real clicks, and why one host still refuses
**What:** The sniff window now renders off-screen (`x: -32000`) and is shown with
`showInactive()` rather than being created with `show: false`, because a window
that is never composited often never starts a player — which looks exactly like a
site with no media. `kick()` also sends a real `sendInputEvent` click alongside
the scripted one, since Chromium distinguishes a trusted gesture from
`element.click()`, and re-runs after a settle delay.
**Why:** Both were plausible reasons a player would sit idle, and both are right
regardless of the host that prompted the investigation.
**Files:** src/main/engine/browser.ts, task.md

**Neither fixed the guarded host, and request logging showed why.** 37 requests:
the page loads, the player script and its CDN assets load, the Cloudflare
Turnstile widget loads — and not one media content-type is ever requested. The
player is gated on the challenge and never gets as far as asking for video. So it
was never the window, the click, or the matcher.

**Deliberately not pursued: solving the challenge.** That means building
bot-detection evasion, which is a different activity from downloading media a site
serves openly. Hosts behind an interactive challenge belong on the plugin route
instead — an extractor that talks to the host's own API, which is both more robust
and less silly than driving a browser through a gate designed to stop exactly
that.

**Kept anyway:** off-screen rendering and the trusted click are strict
improvements for every other site, and cost nothing.

## 2026-08-21 — Verified: the bundled yt-dlp loads extractor plugins
**What:** Confirmed that the managed `yt-dlp.exe` picks up extractor plugins from
`<binDir>/yt-dlp-plugins/<pkg>/yt_dlp_plugins/extractor/`, and wrote
[docs/site-support.md](docs/site-support.md) — the ladder a reported site should
be answered by, cheapest rung first, with the plugin route as the rung that turns
"we cannot do that site" into "that takes an afternoon".
**Why:** The goal is that anyone can suggest a site and it gets added. Writing our
own extractors per site is the treadmill the addon design was meant to avoid;
plugins reuse yt-dlp's entire framework instead.
**Files:** docs/site-support.md, CLAUDE.md, task.md

**Worth verifying rather than assuming:** the binary is a PyInstaller bundle, so
it would have been reasonable to conclude plugins were unavailable. A throwaway
extractor was loaded and used — `[debug] Extractor Plugins: TizoProbeIE` — then
removed from the real data directory.

**Everything downstream keeps working.** A plugin returns the same shape as a
built-in extractor, so the format picker, queue, progress, resume, cancel and the
twelve error codes need no changes at all.

**The part that must not be got wrong:** a plugin is executable code running on a
user's machine. It has to be served from our own registry over https and
sha256-verified before being written to disk, exactly like ffmpeg, and never
fetched from a URL supplied by a user, an issue or a page. Treating it as "just
config" is how this becomes a way to run arbitrary code on every install.

## 2026-08-21 — Allow bot-challenge frames through the frame block
**What:** The third-party sub-frame block that stopped the crash also blocked
`challenges.cloudflare.com`, so a challenge could never load and therefore could
never pass. Challenge frames are now allowed through while ad frames stay blocked.
**Why:** A guarded player was waiting on a gate that had been prevented from
opening.
**Files:** src/main/engine/browser.ts

**It did not fix the guarded host** — still zero media found, still zero aborts —
so the challenge was not what was stopping that player. Kept regardless: blocking
a challenge frame is wrong on its own terms and costs nothing to allow.

**Next suspect is `kick()`**, which only calls `play()` and clicks common
play-button selectors. That host responds to neither, so a synthesized input
event is the next thing to try.

## 2026-08-21 — Contain the experimental browser in a child process
**What:** The hidden window moved out of the main process. `sniffMedia` now
spawns a child copy of the app with `--tizo-sniff-url=`, which loads the page,
prints one marked line of JSON and exits; the parent treats a child that dies for
any reason as "found nothing". Also removed the crash itself: third-party
sub-frames are blocked, and site isolation is disabled in that child only.
**Why:** Running the chain against a real aggregator aborted the process with
repeated `site_info.cc … origin.GetTupleOrPrecursorTupleIfOpaque().IsValid()`
CHECK failures. A crash there takes the app down with every queued download.
**Files:** src/main/engine/browser.ts, src/main/index.ts, CLAUDE.md, task.md

**A Chromium CHECK cannot be caught** — it aborts, so there is no stack, no
rejection and nothing for `try/catch` to see. That is why the first run looked
like a silent success with a clean exit code. Isolation was the only fix
available; `utilityProcess` could not be used because it is Node-only and cannot
create a window.

**Measured, not assumed:** 14 aborts on the reported page → 6 after blocking
third-party sub-frames → 0 after disabling site isolation in the child. Blocking
those frames also stops ad video from ranking as a candidate, which would have
handed back a preroll instead of the feature.

**Two lifecycle bugs surfaced behind the crash.** Electron quits when the last
window closes, including a hidden one, so a page that closed its own renderer
ended the child before it printed — the parent then read a perfectly good page as
empty. And `app.exit()` immediately after `process.stdout.write` truncated the
result, so the child reported nothing every time.

**Verified:** the parent survives the page that used to kill it, and a YouTube
page through the child still returns a media URL with the `Referer`, `Origin` and
`User-Agent` the player sent, with zero aborts.

**Honest limit:** the reported host now fails cleanly rather than crashing, but
still returns nothing — its player sits behind a Cloudflare Turnstile widget and
never requests media within the budget. That is a per-host anti-bot problem
rather than a fault in the mechanism.

## 2026-08-21 — Experimental discovery: follow the player, then watch it run
**What:** An opt-in route for sites the normal chain cannot read, in three new
modules. `embeds.ts` finds players that are never rendered as elements — the
markup sits HTML-entity-encoded in a `data-*` attribute and is injected on click,
which is why such pages show "Player 1 / Player 2" and a poster. `deep.ts` tries
each player in the site's own order. `browser.ts` loads one in a hidden sandboxed
window and watches `webRequest` for what its player fetches, capturing the headers
sent with it. `media.ts` holds the pure classifier.
**Why:** Reported directly, with a real example. A regex over HTML cannot see a
source that JavaScript builds at runtime, and that is now most players.
**Files:** src/main/engine/{embeds,deep,browser,media,args,download,scrape}.ts,
src/main/queue/index.ts, src/main/store/settings.ts, src/shared/types.ts,
src/renderer/src/{strings.ts,views/SettingsView.tsx}, scripts/test-embeds.ts,
scripts/test-args.ts, package.json, CLAUDE.md, task.md

**Opt-in and last.** Settings → Experimental, off by default, and it runs only
after the extractor and the page scan have both failed — so nothing that already
worked gets slower.

**Verified in pieces, and the assembled run fails.** `embeds.ts` was run against
a real reported page and returned both players with their labels. The sniffer was
run against a YouTube page and captured 5 media URLs along with the `Referer`,
`Origin` and `User-Agent` the player actually sent.

**Then the whole chain was run against that reported page and it crashed.**
Player discovery succeeded — both players found and labelled —
and the hidden window then produced repeated fatal Chromium CHECK failures
(`site_info.cc … origin.GetTupleOrPrecursorTupleIfOpaque().IsValid()`), aborting
the process before the probe returned. No JS exception was raised because a CHECK
abort cannot be caught. The identical sniffer is fine on a YouTube page, so it is
these pages specifically: dozens of cross-origin ad frames, popunder attempts and
a Turnstile widget.

**This changes the design, and the change is not optional.** A crash in the main
process takes the entire app down — strictly worse than reporting no media found.
Rung 3 has to run in a `utilityProcess` or a child Electron process, with a dead
child treated as "found nothing". The experimental toggle must not ship in a
release until that exists.

**The matcher was too narrow and a test caught it.** The first version enumerated
content types (`video/mp4`, `video/webm` …) and returned nothing on a page that
was plainly playing video: YouTube serves media as `application/vnd.yt-ump` from a
URL with no extension. It now matches `^(video|audio)/` as a prefix and drops
segments explicitly, since a player fetches hundreds of those and none is the
video.

**Captured headers never touch `QueueItem`.** They can carry a session cookie, and
`QueueItem` crosses to the renderer and is what feedback payloads are built from.
They live in a main-process map keyed by item id instead.

**Known rough edges**, recorded in task.md rather than glossed: ranking is
manifest-over-file then first-seen, with no bitrate or duration signal, so a
preroll ad could win on some sites; and there is no UI for picking between
Player 1 and Player 2 — the first that works is used.

## 2026-08-21 — Phase 5: audio extraction and subtitles
**What:** MP3 and M4A extraction rows with a bitrate setting, cover art and
metadata embedding, and subtitles — languages read from the probe, chosen per
item on the queue row or globally in Options, and written as an embedded track,
a sidecar `.srt`, or both.
**Why:** Phase 5, and audio extraction is the most common thing people want from
a downloader after the video itself.
**Files:** src/shared/types.ts, src/main/engine/{args,formats,probe,download,
scrape}.ts, src/main/queue/index.ts, src/main/store/settings.ts, src/main/ipc.ts,
src/preload/index.ts, src/renderer/src/{strings.ts,views/SettingsView.tsx,
components/QueueRow.tsx}, scripts/test-{args,formats}.ts, CLAUDE.md, task.md

**Verified against real downloads, not only asserted.** An MP3 came out of
YouTube and ffprobe confirmed a `png` cover-art stream plus title/artist/date
tags actually inside it. A video came out with `Me at the zoo [id].en.srt` beside
it and a `mov_text` subtitle stream embedded and tagged `language=eng`. Both were
run with the exact argument list `buildDownloadArgs` produces.

**Two bugs fixed on the way, both the same shape as earlier ones:**

*The stream check could never match.* `formats.ts` tested `protocol` against a
`.m3u8` **file extension**, but `protocol` names a transport — `https`,
`m3u8_native`, `http_dash_segments` — and is never a URL. Only the literal
`m3u8_native` comparison beside it did any work, so plain m3u8 and DASH came back
claiming they needed no ffmpeg. Impact was masked because Essentials is mandatory
and ffmpeg is always present; it would have surfaced as soon as the Phase 7
capability gate started trusting the flag.

*Two rows shared an identity.* `FormatOption.id` doubled as the yt-dlp selector,
which held only while every row selected something different. "M4A" and "Audio
only" resolve the same stream and differ only in what ffmpeg does afterwards, so
the queue's lookup by id would have made one unreachable. Rows now carry a unique
`id` plus an explicit `selector`, and a uniqueness assertion guards it.

**A postprocessor flag on a no-ffmpeg row is the `bv*+ba` bug again.**
`--embed-metadata`, `--embed-subs`, `-x` and `--merge-output-format` all require
ffmpeg, so a row advertising that it needs no HQ pack must emit none of them.
Metadata is gated on `needsFfmpeg || extractAudio`, and there is an assertion that
it stays off the no-ffmpeg path. `--merge-output-format` is skipped on audio jobs
because yt-dlp rejects the combination rather than ignoring it, and subtitles are
dropped there for the same reason.

**Subtitle choice has three states, not two.** `null` means "no opinion, use the
setting"; `[]` means "none for this one". Collapsing them would make turning
subtitles off for a single video require changing the global default and
remembering to change it back — the objection that killed the Normal/Expert
switch for formats.

## 2026-08-21 — Plan: the embedded browser
**What:** Wrote [docs/browser-engine.md](docs/browser-engine.md) — a proposal for
using Electron's own Chromium for three things: signing in to sites, discovering
media by watching what a player actually fetches, and, last of all, capturing the
transfer itself. Four rungs, cheapest first, mapped onto the existing
probe -> impersonate -> scrape chain.
**Why:** Phase 7's Auth Pack was designed around `--cookies-from-browser`, which
has stopped working on Chrome for Windows (App-Bound Encryption) and, from an
unsigned executable, is the textbook behavioural signature of an infostealer.
**Files:** docs/browser-engine.md, CLAUDE.md, task.md

**The key point is rung 3, not rung 4.** When a media URL "only works in the
browser" it is almost always the *request context* that matters -- Referer,
Origin, cookies -- not the browser doing the transfer. Replaying captured headers
keeps yt-dlp as the single download engine, which is what preserves progress,
resume from `.part`, cancel and the twelve error codes.

**Rung 4 is a second download engine** and is written up as such: different
progress semantics, no meaningful resume, and every future queue change made
twice. Recommended only on evidence from failure telemetry, never speculatively.

**It also collapses the addon framing.** Chromium is already in the binary, so
there is nothing to download and nothing to gate -- what Phase 7 called an Auth
Pack becomes a button that appears on `AUTH_REQUIRED` / `AGE_RESTRICTED`.

**Nothing is built.** One item flagged to verify first: whether an Electron
partition's cookie store is DPAPI-encrypted at rest. If not, sessions sit in
plain SQLite and that has to be closed with `safeStorage` before it ships.


