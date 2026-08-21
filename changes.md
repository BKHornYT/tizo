# Changes — Video Downloader Tizo

Newest first. One entry per change, using this format:

```
## YYYY-MM-DD — Short title
**What:** what actually changed
**Why:** the reason it changed
**Files:** the files touched
```

---

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

## 2026-08-21 — v0.0.5: the first build that can actually upload
**What:** Bumped to 0.0.5 — the first release whose bundle carries a real
`TIZO_STATS_ENDPOINT`. Added `npm run test:stats`, which runs the **real**
`src/main/stats` module against a stub HTTP server and asserts what goes over the
wire; wired it into `npm test`. `electron` is replaced by a loader hook
(`scripts/electron-stub*.mjs`) rather than the module being copied into the test.
**Why:** The endpoint had been wired end to end and shipped inert for four
releases. A test that copies the module would have copied the bug and passed, so
it had to be the shipping code that runs.
**Files:** package.json, scripts/test-stats.ts, scripts/electron-stub.mjs,
scripts/electron-stub-hooks.mjs, scripts/electron-stub-register.mjs, CLAUDE.md,
task.md

**15 assertions**, including the ones that are really privacy checks: the site
batch carries no install id and no URL, path or title; the install ping carries a
uuid and no site data; opting out uploads nothing while still counting locally;
`pending` survives a rejected upload; a second upload the same day is throttled.

**Also run against the live Worker** (`TIZO_STATS_TEST_URL=…`): it accepted the
real payloads and D1 held `youtube.com: 1`, `vimeo.com: 1` and one install at
`9.9.9-test`. Test rows deleted afterwards — the database is back to zeros.

**Verified in the shipped artifact, not just locally.** Downloaded the published
`tizo-0.0.5-x64.zip`, read `resources/app.asar` out of it and found
`const ENDPOINT = "https://tizo-stats.itemhunt-analytics.workers.dev"`. That is
the check the original bug would have failed: everything upstream of the binary
looked correct for four releases. Release is published (not a draft) with setup,
portable, zip, blockmap and `latest.yml`.

**Anyone updating from 0.0.4 starts uploading without a new prompt.** Accepting
the terms sets `shareStats: true`, and those terms already describe exactly this:
a per-site count with no identifier, plus a separate install ping. So the consent
covers it — but it is worth knowing that the behaviour changes on update rather
than on install, and the toggle in Options is how anyone withdraws.

## 2026-08-21 — Dashboard behind Google sign-in; upload routes left open
**What:** The usage dashboard was public by design. It is now behind Google
OAuth implemented inside the Worker: `/auth/login` → Google (`openid email`,
random `state` cookie), `/auth/callback` verifies `iss`/`aud`/`email_verified`
and checks the address against an `ALLOWED_EMAILS` allow list, then sets an
HMAC-signed session cookie. `GET` — HTML and JSON alike — requires it.
**Why:** Asked for directly. Reverses the "public on purpose" decision, which no
user-facing copy ever promised (checked `terms.ts` and `strings.ts` — neither
mentions the dashboard), so nothing breaks for users.
**Files:** server/worker.js, server/README.md, CLAUDE.md, task.md

**`POST /sites` and `POST /install` are deliberately still open.** The app has no
account and must never have one: a shipped credential would be a shared secret in
every copy *and* would give the server a way to tell submissions apart — the same
linkability that keeping the two streams keyless exists to prevent. Verified after
deploy: `GET` returned 503 while both POSTs returned 200.

**Fails closed.** Missing secrets mean 503 and no data, never a silent fall back
to public. It was deployed in that state on purpose, before the Google client
exists, so there was no window where the numbers sat public and unattended.

**No session table.** The session is a signed cookie. Storing sessions would put a
timestamped record of the operator beside tables whose whole point is holding
nothing per-person. The allow list is re-checked per request, so revoking access
is immediate rather than cookie-lifetime.

**In-Worker OAuth rather than Cloudflare Access** because Access cannot be applied
to a `*.workers.dev` hostname and no domain is owned. Access would also have
needed a bypass policy to keep the POST routes reachable.

**Client configured the same day.** All four secrets are set and deployed.
Verified against the live Worker: `GET` returns 401 with the sign-in page instead
of the data, `/auth/login` 302s to Google carrying the right client id, an exactly
matching `redirect_uri` and `openid email`, a forged `state` is rejected with "did
not match", and `POST /sites` still returns 200. Test rows deleted afterwards.

**Two traps worth knowing, both now in Gotchas:** `wrangler secret put` reported
success for all four secrets and the Worker kept answering 503 until an explicit
`wrangler deploy` — the secret list looks complete while the running version has
none of them. And secrets must be piped with `printf '%s'`, not `echo`, because a
trailing newline in `GOOGLE_CLIENT_ID` would silently fail the `aud` check.

**Left to do:** sign in once in a browser, add the address under Audience → Test
users, and publish the consent screen so Testing mode's 7-day consent expiry stops
applying.

## 2026-08-21 — Usage endpoint deployed, and the wiring that made it inert
**What:** Deployed the Cloudflare Worker + D1 from `server/` to
`https://tizo-stats.itemhunt-analytics.workers.dev` and set `TIZO_STATS_ENDPOINT`
as a repo variable on `BKHornYT/tizo`. Before that: fixed a bug that would have
made the whole deploy do nothing. `src/main/stats/index.ts` read the endpoint as
`process.env['TIZO_STATS_ENDPOINT']` and `electron.vite.config.ts` had no
`define`, so nothing was inlined — the packaged app was reading an environment
variable at runtime on a user's machine, where it cannot exist. `ENDPOINT` was
therefore always `''` and `statsEnabled()` always false, no matter what CI was
configured with.
**Why:** The last unchecked item in the suggestions/usage block, and it was
carrying a silent failure: the CI step setting the variable already existed and
already looked correct.
**Files:** electron.vite.config.ts, src/main/stats/index.ts,
server/{wrangler.toml,README.md}, CLAUDE.md, task.md

**Verified:** built with a dummy value and confirmed
`const ENDPOINT = "https://example-check.invalid"` in `out/main/index.js` — a
literal, not a lookup — then rebuilt clean back to `""`. Against the live Worker:
`POST /sites` counted 7, `POST /install` accepted a real UUID and was idempotent
on a second ping, the JSON view reported `{installs:1, downloads:7}`, and the
browser view returned the HTML dashboard. Test rows then deleted, so the database
is back to zeros.

**A 400 from `/install` during testing was correct, not a bug** — the fake id was
not hex and `UUID_RE` rejected it. Worth remembering before "fixing" that route.

**Takes effect from v0.0.5.** Every release already out carries an empty endpoint
and will never send anything, which is the right outcome: those users consented
to a build that could not upload.

**`define` matches an exact token**, so the source must use dot access. Written
into Gotchas because bracket notation reintroduces the bug silently and the
build still succeeds.

## 2026-08-20 — v0.0.4: get past Cloudflare bot walls
**What:** The reported site turned out not to be a shaping problem at all. yt-dlp
was being 403'd by a Cloudflare anti-bot challenge, and the page scan was refused
for the same reason — it sends a browser user-agent but cannot fake a TLS
fingerprint. Both failed, so the app honestly reported "no video found". The probe
now inspects stderr, and when the failure looks like a bot wall it retries once with
`--extractor-args generic:impersonate`. The finding is carried through `MediaInfo` →
`QueueItem` → the download request, so the download takes the same route the probe
succeeded on. Added a readable dashboard to the stats worker.
**Why:** Reported directly. Also: v0.0.3 shipped a real fix for a *different* cause
of the same symptom, so both were needed.
**Files:** src/main/engine/{formats,probe,args,download,scrape}.ts,
src/main/queue/index.ts, src/shared/types.ts, scripts/test-args.ts,
server/worker.js, package.json, CLAUDE.md, task.md

**Verified end to end against the reported URL**: plain attempt failed, detected as
a bot wall, retry succeeded, one downloadable option produced. Three new assertions
cover the flag reaching the command line and a registry target still winning over
the generic form.

**Why retry and not default:** impersonation is slower and some sites behave worse
under it, so it is only worth paying for after a refusal. yt-dlp names this exact
flag in its own error message, which is the strongest possible hint that it is the
intended fix rather than a workaround.

**Lesson recorded in Gotchas:** the CLI on PATH succeeded where the app failed,
because bot walls are inconsistent about who they challenge. Reproduce with the
*managed* binary and the app's exact args before concluding anything about a
"not supported" report.

## 2026-08-20 — v0.0.3: fix sites that expose a plain mp4
**What:** A reported site returned a perfectly good mp4 that the app refused to
download. The page scan was not at fault and never even ran — yt-dlp's Generic
extractor had already found the file. The bug was in format shaping: codec fields
have three states (a named codec, `'none'` for genuinely absent, and `null` for
"did not look"), and the filter treated the third like the second. The single
format was discarded, leaving a queue row with nothing to download. Fixed the codec
logic, added an "Original quality" option for sites offering one file with no
resolution, and split the pure shaping into `engine/formats.ts` so it can be tested.
**Why:** Reported directly, and it affects every site whose video is just a file on
the page — which is a large share of the smaller web.
**Files:** src/main/engine/{formats,probe}.ts, scripts/test-formats.ts, package.json,
CLAUDE.md, task.md

**Verified against the real response**: that page produced 0 options before and 1
working option after. `npm run test:formats` covers all three shapes — generic
single file, a YouTube-style ladder, and an HLS manifest — 17 assertions, including
that the YouTube path still picks progressive-only selectors for the no-ffmpeg rows.

## 2026-08-20 — v0.0.2
**What:** Second release. Contains the page-scan fallback for sites with no
extractor, and `releaseType: release` so this one publishes directly instead of
landing as an invisible draft.
**Why:** The scan landed after v0.0.1 was tagged, so it is not in that binary. This
release also serves as the auto-update proof — an installed v0.0.1 should find it.
**Files:** package.json, package-lock.json, changes.md

Published straight from CI with `draft=false`, confirming the `releaseType` fix —
no manual publish step this time. The update feed at
`releases/latest/download/latest.yml` now advertises 0.0.2, which is exactly what an
installed 0.0.1 polls.

## 2026-08-20 — v0.0.1 released
**What:** First public release: https://github.com/BKHornYT/tizo/releases/tag/v0.0.1
carrying the setup exe (99 MB), portable exe (98 MB), zip (138 MB) and `latest.yml`.
Verified the update feed fetches unauthenticated with the correct version and hash.
**Why:** Every version should ship all three artifacts; this proves the pipeline
rather than assuming it.
**Files:** electron-builder.yml, CLAUDE.md, task.md, docs/releasing.md

**Three CI failures got there, each a real bug worth having caught:**
1. Every assertion passed and the run still failed — `process.exit()` while the
   type-stripping loader has async handles open trips a libuv assertion on Windows.
   Now sets `exitCode` instead. That also revealed `scripts/` was outside the
   typecheck, so the test fixture had silently drifted from the `Settings` type.
2. `app.asar` shipped with no entry file — the workflow called `electron-builder`
   without running the bundler. `npm run dist` chains both locally, so this could
   only ever appear in CI.
3. The release landed as a **draft**, which is electron-builder's default and is
   invisible to electron-updater. A green run would have produced a release that
   updated nobody. Fixed with `releaseType: release`; v0.0.1 was published by hand.

**Still unproven:** nothing has installed v0.0.1 and watched it update to a v0.0.2.
That is the only test that shows the whole chain works.

## 2026-08-20 — Page-scan fallback for unsupported sites
**What:** `src/main/engine/scrape.ts` does by hand what a person does with the
inspector: fetches the page with a browser user-agent and pulls media URLs out of
`<video>`, `<source>`, `og:video`/`twitter:player:stream`, JSON-LD `contentUrl`, and
inline scripts. Candidates are ranked by how trustworthy the source is, resolved
against the page URL, then HEAD-verified before any is offered. The winner is
downloaded directly with the page sent as `--referer`.
**Why:** Requested. Plenty of ordinary sites just put an mp4 on the page, and
"unsupported" was giving up before trying the obvious thing.
**Files:** src/main/engine/{scrape,args,download}.ts, src/main/queue/index.ts,
src/shared/types.ts, CLAUDE.md, task.md

**Three constraints that keep it honest:**
- It runs **only after** an extractor has failed, and only for `UNSUPPORTED_SITE` or
  `UNKNOWN`. Scanning cannot solve a geo-block, a login wall or a dead connection,
  and trying would just replace a clear error with a confusing one.
- Candidates are **HEAD-verified** — content-type must be video/audio, and anything
  under 100 KB is rejected as a placeholder. Regex over HTML happily finds poster
  images and dead CDN paths; offering one produces a download that fails for reasons
  the user cannot act on, which is worse than an honest "not supported".
- The referer is sent, because a direct CDN link scraped from a page is routinely
  403'd without the page it was embedded on.

When both the extractor and the scan come up empty the message says so plainly —
"No video found on this page — this site is not supported yet" — with the report
button beside it.

## 2026-08-20 — Tag-driven release pipeline
**What:** `.github/workflows/release.yml` builds on `windows-latest` and publishes
all four release files — setup exe, portable exe, zip, and `latest.yml` — on any
`v*` tag. `docs/releasing.md` documents the process. Tagged v0.0.1 to run it for
real rather than assume it works.
**Why:** Every new version should ship all three artifacts without anyone assembling
a release by hand.
**Files:** .github/workflows/release.yml, docs/releasing.md, CLAUDE.md, task.md

**Two ways a release breaks quietly, both now guarded:**
- **Missing `latest.yml`.** It is the file electron-updater actually reads. Attach
  only the exes and every installed copy stops finding updates, with no error
  anywhere. electron-builder uploads it automatically — so never hand-curate.
- **Tag/version mismatch.** electron-updater compares the version *inside* the
  artifacts, not the tag. A release tagged `v0.2.0` containing a 0.1.0 build looks
  perfectly fine on GitHub and updates nobody. The workflow now fails the build
  instead of shipping it.

## 2026-08-20 — First packaged build
**What:** `npm run dist` now produces all three Windows targets: NSIS installer
(99.1 MB), portable exe (98.9 MB) and zip (138.7 MB), carrying the new app icon.
**Why:** The app had only ever run under `npm run dev`; nothing about packaging was
proven.
**Files:** dist/ (untracked), electron-builder.yml, build/icon.ico

**Size correction.** The plan estimated a ~50 MB slim installer. It is 99 MB —
Electron's runtime is the floor and there is little to trim. First-run total is
about 190 MB including the Essentials download. Corrected in `docs/plan.md` and
noted in Gotchas; better to state it on a download page than surprise people.

**Still unproven:** neither the installer nor the portable exe has been run. The
portable path in particular needs checking — its data directory should land beside
the exe, and the updater should show a banner rather than attempt to replace a
running exe.

## 2026-08-20 — Suggestions, site reports, usage counting, terms gate, app icon
**What:** Five things.
1. **Feedback pipeline.** GitHub issue templates for site requests, suggestions and
bugs; a "Report site" action on failed queue rows; a Suggest button in the toolbar
and all three kinds in Options. `src/main/feedback.ts` builds the prefilled issue and
strips URLs and user paths first — yt-dlp stderr routinely contains the full link,
which for private or paid content must never reach a public tracker. The exact
payload is shown in a dialog before anything opens.
2. **Terms gate** on first run, ahead of the Essentials download since it covers that
download too. Agreeing unlocks only after the text is scrolled. Re-readable in
Options.
3. **Usage counting**, opt-in via the terms, switchable afterwards. Local per-site
tally always kept and shown in Options; uploads only when enabled.
4. **Cloudflare Worker** in `server/` with D1 schema and deploy docs.
5. **Custom app icon** — generated by `scripts/build-icon.mjs` into a 7-size .ico,
with the source PNGs checked in so it is reproducible without any toolchain.
Also: default output folder moved from Downloads/Tizo to Videos/Tizo.
**Why:** All requested directly. The user wanted a suggestion channel, a way to
report failing sites, download and install counts, and an icon that is not
Electron's default.
**Files:** .github/ISSUE_TEMPLATE/*.yml, src/main/{feedback.ts,stats/index.ts,
store/terms.ts,paths.ts,ipc.ts,queue/index.ts}, src/preload/index.ts,
src/shared/types.ts, src/renderer/src/{TermsScreen.tsx,terms.ts,strings.ts,App.tsx},
src/renderer/src/components/{FeedbackDialog,Icon}.tsx, views/SettingsView.tsx,
server/{worker.js,schema.sql,wrangler.toml,README.md}, scripts/build-icon.mjs,
build/icon.ico, electron-builder.yml, package.json

**The telemetry design is the part worth not breaking.** Counting unique machines
needs an identifier, which is exactly what a privacy-respecting tally should not
have. Resolved by splitting into two streams that share no key: `/sites` carries
`{domain: count}` with no id, `/install` carries a random UUID with no site data.
Separate tables, no join, no IP logging. The server can answer "how many machines"
and "which sites are popular"; it cannot answer "what does this machine download".
Putting the id on a site row would quietly destroy that, so it is documented in
three places.

**Nothing is collected yet** — the Worker is not deployed and `TIZO_STATS_ENDPOINT`
is unset, so the client short-circuits and never makes a request.

## 2026-08-20 — Visual language, paste-anywhere input, and the update system
**What:** Three things the user asked for. (1) Restyled to match the reference app's
look rather than only its structure: dark navy chrome top and bottom, an
orange→violet→blue gradient behind the content, purple accents, and an
icon-over-label toolbar (Add link / Downloads / Sorting / Options / Open output) with
inline SVG glyphs. Sorting is now real, closing the last Phase 4 item. (2) Removed
the paste input entirely — Ctrl+V anywhere in the window queues links, with a toast
confirming what was added, plus the toolbar button reading the system clipboard.
(3) Built the update system: `src/main/update/` wires electron-updater (launch +
6-hourly, installs on quit so it cannot kill downloads mid-flight) and a separate
weekly yt-dlp channel that replaces only the managed binary. Version shows in the
toolbar and is clickable to check; Settings gained an Updates section.
**Why:** The user pointed out the UI took nothing visual from their screenshots, asked
for paste-to-add instead of a field, and expected the updater to already exist.
**Files:** src/renderer/src/index.css, App.tsx, strings.ts, views/{Queue,SettingsView}.tsx,
components/{Icon,QueueRow,PlaylistPicker}.tsx, SetupWizard.tsx, src/main/update/index.ts,
src/main/ipc.ts, src/preload/index.ts, src/shared/types.ts, CLAUDE.md, task.md

**Verified visually for the first time.** Screen capture had been returning solid
black; the cause was GPU compositing, and `--disable-gpu` fixes it. Now recorded in
Gotchas. The toolbar, gradient, empty state and bottom bar all render as intended.

**Honest status on updates:** the wiring is complete and self-update is explicitly
disabled with a stated reason in dev and portable builds rather than silently doing
nothing — but it has never run against a real release, because nothing has been
packaged yet. That proof needs Phase 8.

## 2026-08-20 — Documentation pass; removed an orphaned component
**What:** Brought every `.md` back in line with the code. `docs/plan.md` got a real
architecture tree (it still described folders that had since gained structure), a
phase table with status markers, a test matrix, and two design notes that were only
living in commit messages — that the queue *is* the app, and that there is no pause
because Stop + Retry resumes from yt-dlp's `.part` file. `docs/features.md` gained
per-feature status so it reads as a scoreboard rather than a wishlist, and records
that the biggest thing taken from the reference was the list-shaped UI itself.
`CLAUDE.md` got an accurate file tree and an honest "not started" list. `task.md` had
grown two competing done-sections; consolidated into Now / Next / Done.
**Why:** User asked for the docs to be brought up to date. Several files described
the app as it was two phases ago, and a doc that is confidently wrong is worse than
a missing one because the next session trusts it.
**Files:** CLAUDE.md, task.md, docs/plan.md, docs/features.md
(removed: src/renderer/src/components/FormatPicker.tsx)

**Three inaccuracies found and fixed while checking, rather than papered over:**
- `FormatPicker.tsx` was orphaned when the single-item view was deleted — nothing
  imported it. Removed, and the feature note that described it as an "All formats
  expander" now describes the per-row dropdown that actually exists.
- `features.md` claimed the empty state was done, including a clipboard prompt that
  is Phase 6 work. Downgraded to partial.
- `task.md` still credited Phase 3 with a quality picker that no longer exists in
  that form.

## 2026-08-20 — Playlist and channel expansion
**What:** Adding a playlist or channel link now creates a playlist row rather than
failing or silently grabbing one video. `inspectPlaylist()` lists entries via
`--flat-playlist` (metadata only, capped at 500), and the row offers "Add all" or
"Choose videos", which opens a picker with everything preselected. Chosen entries
become individual queue items, seeded with their title so rows are readable while
their own probes run.
**Why:** The last open item in Phase 4, and the reason the reference app has a
Playlist menu at all.
**Files:** src/main/engine/probe.ts, src/main/queue/index.ts, src/main/ipc.ts,
src/preload/index.ts, src/shared/types.ts,
src/renderer/src/components/{PlaylistPicker,QueueRow}.tsx,
src/renderer/src/views/Queue.tsx, src/renderer/src/strings.ts, task.md

**Two judgement calls worth keeping:** a `watch?v=…&list=…` URL resolves to the
single video it names, because someone pasting a link they were watching wants that
video and not the 400-item mix it happened to be playing inside — "add the whole
playlist" should be a choice, not a surprise. And the picker starts with everything
selected: a person who pasted a playlist link usually wants the playlist, so the list
is there to deselect a few, not to tick forty boxes.

## 2026-08-20 — Rebuilt the UI around a download queue
**What:** Replaced the single-video form with a queue-centred UI, which is the shape
the reference app uses and the part of it the first build missed entirely. New
`src/main/queue/` owns item state, probing, and a concurrency pump that starts queued
jobs up to the configured limit. The renderer is now `views/Queue.tsx` plus
`components/QueueRow.tsx`: each row carries its own thumbnail, state, format dropdown
(recommended list plus every raw format) and actions, with progress rendered as a
fill behind the row rather than a separate bar. Added window-wide drag and drop,
batch paste (any blob of text is scanned for links), download-all / stop-all /
clear-finished, and an Open folder action in the header. Added a dev-only
`scripts/install-essentials.ts` so a dev machine can skip the first-run wizard.
**Why:** The user pointed out, correctly, that the visible app took nothing from the
reference screenshots they supplied. The settings had been adopted; the *structure*
had not, and structure is what you actually see.
**Files:** src/main/queue/index.ts, src/main/ipc.ts, src/preload/index.ts,
src/shared/types.ts, src/renderer/src/App.tsx, src/renderer/src/views/Queue.tsx,
src/renderer/src/components/QueueRow.tsx, src/renderer/src/strings.ts,
scripts/install-essentials.ts, CLAUDE.md, task.md
(removed: src/renderer/src/views/Downloader.tsx)

**Caught a bug while writing it:** the file-collision retry path inside the pump was
passing a no-op progress callback, so any item that hit a collision would have sat
frozen at 0% while downloading perfectly well underneath. The handler is now named
and shared by both attempts.

**Two departures from the reference, deliberate:** the queue never blocks on a modal
(a collision mid-batch auto-renames rather than halting everything for a click), and
format choice is per item rather than one global preference — their app makes you set
a single download format for everything.

## 2026-08-20 — Phase 3: core GUI, settings, and site tuning
**What:** Built the real UI and the settings layer behind it. New `engine/args.ts`
turns settings plus per-site registry tuning into a yt-dlp command line; it is pure
and electron-free, so `scripts/test-args.ts` asserts on it directly (29/29).
`store/settings.ts` persists settings and re-validates every field on read, because
settings.json is user-writable and survives upgrades. The engine now applies speed
limits, geo-bypass, container choice, folder-per-download, and per-site impersonation
and fragment counts pulled from the registry. File collisions are handled by asking
yt-dlp what it *would* name the file (`--print filename --skip-download`) and then
skipping, auto-renaming, or prompting — guessing the name is not viable since yt-dlp
applies its own sanitisation and picks the extension from the chosen format.
Renderer split into `views/Downloader.tsx` and `views/SettingsView.tsx` behind a
tabbed shell, with a `FormatPicker` that shows the curated list and expands inline to
every raw stream. Probe now returns `allFormats` alongside the curated `formats`.
**Why:** Phase 3 of the plan, plus the settings adopted from the reference app in
docs/features.md.
**Files:** src/main/engine/{args,download,probe}.ts, src/main/store/settings.ts,
src/main/ipc.ts, src/preload/index.ts, src/shared/types.ts,
src/renderer/src/{App.tsx,SetupWizard.tsx,strings.ts},
src/renderer/src/views/{Downloader,SettingsView}.tsx,
src/renderer/src/components/FormatPicker.tsx, scripts/test-args.ts, package.json,
CLAUDE.md, task.md

**Three deliberate departures from the reference app**, each recorded in
docs/features.md: format choice is an inline expander rather than a global
Normal/Expert mode buried in settings; collisions default to skipping rather than
asking every time; and all copy lives in `strings.ts` so i18n stays a lookup swap
instead of a rewrite. Also fixed a stale comment in probe.ts still claiming the
no-ffmpeg ceiling was 720p.

## 2026-08-20 — Phase 2 verified end to end; repo public; commit email rewritten
**What:** Made `BKHornYT/tizo` public so the component downloads and auto-update work
without an embedded token. Refactored `components/install.ts` to take its target
directory as an argument instead of importing the app's paths module, which removed
its last electron dependency and made it directly testable. Added
`scripts/test-essentials.ts`, which installs the real published components from the
live registry and executes them — 10/10 passing.
**Why:** Phase 2 was otherwise unverifiable: a private repo 404s both the release
asset and the raw manifest. Testing the real installer against real assets (rather
than a mock) was the point, and it immediately earned its keep.
**Files:** src/main/components/install.ts, src/main/setup/index.ts,
scripts/test-essentials.ts, tsconfig.json, package.json, CLAUDE.md, task.md

**The test caught a shipping-blocker bug.** `verifyRuns` picked its version flag from
the filename prefix, so `ffprobe.exe` was probed with `--version` — which it does not
accept. Every HQ Pack install would have failed at the final execution check, showing
users a message blaming their antivirus. It now tries both spellings. A mocked test
would have sailed straight past this.

**Commit email rewritten.** The three existing commits carried a work address; the
user asked for it not to be published. Repo was switched back to private within about
a minute, all commits rewritten to `boysgunsmoke@gmail.com` via filter-branch,
force-pushed, and the `refs/original/` and stash refs that filter-branch leaves behind
were deleted with reflogs expired and a gc. `git config user.email` is now pinned in
this repo so future commits cannot regress. Caveat recorded: GitHub can retain
unreferenced objects after a force-push, reachable only by someone who already knows
the old SHAs.

## 2026-08-20 — Phase 2: component manager and first-run setup
**What:** Built the download → verify → unzip → activate pipeline that powers both
first-run setup and later addons. `components/fetcher.ts` does resumable HTTP-range
transfers with backoff, sha256 verification, and discards a corrupt part rather than
resuming bad bytes forever. `components/manifest.ts` fetches the registry with a
three-step fallback (remote → cache → copy bundled into the app), so a registry
outage or a bad manifest push cannot brick a mandatory setup. `components/install.ts`
unpacks and then *executes* each binary to prove it runs — size and hash cannot catch
an AV quarantine. `setup/` orchestrates it behind one combined progress bar and only
records success after that execution check. Published the `essentials-v1` release
with a repackaged ffmpeg 9.0.1 + ffprobe (73.8 MB zipped). Added a real network test
for the resume path: 5/5 passing, confirmed resume continues mid-file rather than
restarting.
**Why:** Phase 2 of the plan. Setup is mandatory, so every failure mode here turns
into a dead app — hence resume, verification and the offline install path being
treated as requirements rather than polish.
**Files:** components.json, src/main/components/{fetcher,manifest,install}.ts,
src/main/setup/{index,state}.ts, src/main/ipc.ts, src/preload/index.ts,
src/shared/types.ts, src/renderer/src/{App.tsx,SetupWizard.tsx},
scripts/test-fetcher.ts, package.json, CLAUDE.md, docs/plan.md, task.md

**Cut a component before building it.** The plan listed ~8 MB of "impersonation
libs". Checked first: the official `yt-dlp.exe` already bundles curl_cffi and lists
working impersonate targets, so that download would have delivered nothing. Removed
from the plan. Essentials is now ffmpeg + yt-dlp only, ~92 MB. The site profile pack
moved into the registry JSON, where it belongs — a few KB that changes often should
not sit inside an 80 MB archive.

**Blocked:** end-to-end setup cannot be tested while `BKHornYT/tizo` is private —
both the release asset and the raw manifest 404 without auth.

## 2026-08-20 — Reference app reviewed, feature set expanded
**What:** Reviewed screenshots of "Videodownloader" and wrote `docs/features.md`
recording what we adopt, what we do differently, and what we skip. Added playlist
monitoring as new Phase 6.5, plus drag-and-drop, speed limiting, geo-bypass,
folder-per-download, file-exists rules, tray-on-close, and sortable queue columns to
existing phases. Logged i18n as an open question — English-only at launch, but UI
strings centralised from the start since retrofitting is far more expensive.
**Why:** User supplied it as inspiration and asked for something better. Several of
their ideas are genuinely good; several of their defaults are not, and the reasoning
for each divergence is worth recording so it is not re-litigated later.
**Files:** docs/features.md, task.md, CLAUDE.md

## 2026-08-20 — Phase 1: download engine
**What:** Built the yt-dlp engine behind a typed IPC surface. `engine/binaries.ts`
resolves yt-dlp and ffmpeg (managed binary first, PATH fallback in dev only — a
packaged build must run what setup verified, not whatever the user has lying
around). `engine/probe.ts` runs `-J` and collapses yt-dlp's 40+ near-duplicate
formats into a short pickable list, flagging which need muxing.
`engine/download.ts` spawns yt-dlp with a JSON progress template, parses progress
line-by-line, detects post-processing stages, and cancels by killing the whole
process tree. `engine/errors.ts` classifies stderr into 12 codes — UNSUPPORTED_SITE
and FFMPEG_REQUIRED are the two the addon gates will hang off. Renderer got a dev
panel: paste link → probe → pick quality → download with live speed/ETA → reveal in
folder. Verified end to end against YouTube, both the progressive and merge paths.
**Why:** Phase 1 of the plan. Everything above this is UI over these four modules.
**Files:** src/shared/types.ts, src/main/paths.ts, src/main/ipc.ts,
src/main/index.ts, src/main/engine/{binaries,errors,probe,download}.ts,
src/preload/index.ts, src/renderer/src/{App.tsx,format.ts}, CLAUDE.md, docs/plan.md,
task.md

**Two findings, both now in CLAUDE.md Gotchas:**
- **Without ffmpeg YouTube caps at 360p, not 720p as the plan assumed.** Measured on
  a real video: 37 video-only formats, exactly one progressive stream, at 360p.
  Corrected in `docs/plan.md` and `CLAUDE.md`. This strengthens the case for the
  mandatory Essentials download — without it the app is nearly useless on YouTube.
- **Caught a real bug from that measurement:** rows marked `needsFfmpeg: false` were
  still being given a `bv*+ba/b` selector, which always attempts a merge. yt-dlp
  hard-errors when ffmpeg is missing rather than falling back down the `/` chain, so
  every "no HQ pack needed" option would have failed for exactly the users who have
  no HQ pack. Those rows now use a progressive-only `b[height<=N]` selector.

## 2026-08-20 — Phase 0: scaffold runs
**What:** Created GitHub repo `BKHornYT/tizo` (private) and scaffolded the app —
Electron 43.4.1, Vite 7, React 19, Tailwind 4, TypeScript, built via electron-vite
into `out/{main,preload,renderer}`. Main process does window creation with
`ready-to-show` reveal, a single-instance lock, external links handed to the OS
browser, and one `app:versions` IPC handler. Preload exposes a single `window.tizo`
contextBridge surface. Renderer shows a placeholder reading versions over IPC, which
proves the bridge works end to end. `electron-builder.yml` configures all three
Windows targets (NSIS per-user installer, portable, zip) with GitHub publishing.
Typecheck clean, build clean, `npm run dev` opens the window.
**Why:** Phase 0 of the plan — everything downstream needs a running shell.
**Files:** package.json, package-lock.json, electron.vite.config.ts,
electron-builder.yml, tsconfig.json, .gitignore, src/main/index.ts,
src/preload/index.ts, src/renderer/index.html, src/renderer/src/{main.tsx,App.tsx,
index.css,env.d.ts}, CLAUDE.md, task.md

**Three things bit us, all now in CLAUDE.md Gotchas:**
- Vite 8 is too new — electron-vite 5 peers at Vite ≤7. Pinned to Vite 7 rather
  than forcing a knowingly broken dependency tree with `--legacy-peer-deps`.
- Electron's postinstall was skipped, so `npm run dev` died with the misleading
  `Error: Electron uninstall`. Fixed with `node node_modules/electron/install.js`.
- `src/preload/index.d.ts` shadowed `src/preload/index.ts` — `'./index'` resolved to
  the declaration file itself, silently voiding the `Window.tizo` type. Global
  declarations moved to `src/renderer/src/env.d.ts`. TypeScript 6 also removed
  `baseUrl`, so path aliases are now relative.

## 2026-08-20 — Plan revised: mandatory first-run Essentials bundle
**What:** Replaced the "slim base + on-demand addons" first-run model with a
mandatory ~110 MB Essentials download on first launch (ffmpeg, yt-dlp fetched live
from upstream, impersonation libs, site profile pack). Hybrid sourcing: self-hosted
versioned zip for the static parts, live upstream fetch for yt-dlp. Added a Site
Coverage section committing to broad unfiltered coverage (adult sites included, no
blocklist) and a concrete "request this site" pipeline via prefilled GitHub issues.
Dropped the supported-sites browser UI. Reordered phases — the component manager now
lands at Phase 2 because setup and addons share one download/verify/unzip pipeline;
optional addons moved to Phase 7. Now 10 phases.
**Why:** User wanted a single setup download rather than surprise popups mid-use, and
broad site coverage. Also recorded that a mandatory gate makes any download failure a
dead app, so resumable transfers, sha256 verification and a manual offline install
path are load-bearing requirements rather than polish.
**Files:** CLAUDE.md, task.md, changes.md, docs/plan.md

## 2026-08-20 — Planning: stack locked, build plan written
**What:** Gathered requirements and locked the design. Electron + React + Tailwind,
Windows-only, GitHub Releases (`BKHornYT/tizo`) for updates and addon hosting, slim
~50 MB base with ffmpeg and auth as on-demand addons, shipping as NSIS installer +
portable USB exe + zip, unsigned for now. Wrote the full architecture, addon manifest
schema, three-update-channel design and an 8-phase build breakdown to `docs/plan.md`;
replaced the scaffold `CLAUDE.md` with the real map and filled `task.md` with the
phase checklist. Verified the toolchain is present (Node 24.13.1, Python 3.12.12,
ffmpeg 9.0, yt-dlp 2026.08.18, gh authed as BKHornYT).
**Why:** Nothing was written down yet — the project was a bare scaffold with a
one-line idea. These are the decisions that are expensive to reverse later
(update mechanism, addon boundary, portable support), so they got settled first.
**Files:** CLAUDE.md, task.md, changes.md, docs/plan.md

## 2026-08-20 — Project created
**What:** Scaffolded `CLAUDE.md`, `task.md`, and `changes.md`.
**Why:** New project created from the launcher.
**Files:** CLAUDE.md, task.md, changes.md
