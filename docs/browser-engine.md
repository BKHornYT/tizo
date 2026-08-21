# The embedded browser — plan

**Status:** proposal, nothing built. Written 2026-08-21.

Electron already contains Chromium. This document is about using it for three
things it is uniquely good at — logging in, watching what a player actually
fetches, and, in the last resort, doing the transfer itself — without breaking
the single-engine design that everything else depends on.

## Why this instead of `--cookies-from-browser`

The original Phase 7 plan was an "Auth Pack" built on yt-dlp reading cookies out
of the user's real browser. That approach has four problems that never get fixed,
because none of them are ours to fix:

- **Chrome on Windows is closed.** App-Bound Encryption (Chrome ~127+) means the
  cookie store cannot be decrypted by another process. yt-dlp's own documentation
  now points people at Firefox or a cookie-export extension.
- **The browser has to be closed**, because the cookie database is locked while
  it runs.
- **Cookies rotate.** It works Tuesday, fails Thursday, and surfaces as a 403 —
  indistinguishable from the bot wall and codec bugs already fixed twice.
- **We ship unsigned.** An unsigned executable that reads Chrome's cookie
  database is the textbook behavioural signature of an infostealer. That is not a
  hypothetical false positive; it is what the detection is for.

An embedded window has none of these. The user logs in to *our* Chromium, and we
read *our own* session. Nothing touches another browser's storage.

**This also collapses the "Auth Pack" framing.** The addon system exists to avoid
shipping capabilities most people never use — but Chromium is already in the
binary and cannot be removed. There is nothing to download, so there is no
component to gate. What Phase 7 called an addon becomes a UI affordance: a "Sign
in to this site" button that appears when a download fails with `AUTH_REQUIRED`
or `AGE_RESTRICTED`.

## What exists today

Four ways the media is discovered, and exactly one that moves bytes:

```
probe()  ──▶ yt-dlp extractor (~1800 sites)
              │ fails, stderr looks like a bot wall
              ▼
             yt-dlp + --extractor-args generic:impersonate
              │ fails with UNSUPPORTED_SITE or UNKNOWN
              ▼
             scrapePage() — fetch HTML, regex for media, HEAD-verify
              │ fails
              ▼
             report to the user, offer the GitHub issue
```

Whatever wins, the download is always the same: **one yt-dlp subprocess**, given
a format selector and optionally `--referer`, `--impersonate`, `-N`, `-r`,
`--geo-bypass`, `--merge-output-format`, `--ffmpeg-location`. Resume is yt-dlp's
`.part` file. Cancel kills the process tree, because ffmpeg is a child.

Everything the queue knows — progress, ETA, the twelve error codes, stop/retry,
collision handling — is built on that one engine. **Preserving that is the main
design constraint here.**

## The ladder

The useful framing is not "should the browser download things" but *how much of
the request does the browser need to be responsible for*. Four rungs, cheapest
first.

### Rung 1 — Login only

A **visible** `BrowserWindow` on its own persistent partition. The user signs in
by hand; we do nothing clever. On close we read the session's cookies, write a
Netscape-format file, and pass `--cookies <file>` to the same yt-dlp call as
always.

Visible, not headless — the user has to type a password and clear 2FA or a
CAPTCHA. Headless is for rung 2.

- **New:** one window, a cookie exporter, a per-domain "signed in" record
- **Unchanged:** discovery, transfer, progress, resume, cancel, the queue

### Rung 2 — Discovery by watching the network

A **hidden** window loads the page while `session.webRequest` watches for
requests to `.m3u8`, `.mpd`, `.mp4` and media content types. After a timeout the
window is destroyed and the best candidate is handed to yt-dlp as `directUrl`.

This is a strictly better `scrapePage()`: a regex over raw HTML cannot see a
player that JavaScript builds at runtime, which is most of them now. Watching the
network sees **what the player actually fetched**, including signed URLs that
never appear in the markup.

`scrapePage()` stays as the cheaper rung above it — it costs one fetch, this
costs a full page load and several seconds.

- **New:** a hidden window, a request watcher, a candidate ranker
- **Unchanged:** transfer and everything downstream of it

### Rung 3 — Replaying the full request context

Same as rung 2, but capture the headers the player actually sent — `Referer`,
`Origin`, `User-Agent`, `Cookie`, any bearer token — and replay them via
`--add-header`.

**This rung is the one that matters most, and it is easy to skip.** When a media
URL "only works in the browser," it is usually not the browser that is magic — it
is the request context. The same URL fetched bare gets a 403 and fetched with its
Referer and cookies downloads fine. Most sites that appear to need rung 4 are
actually rung 3.

- **New:** header capture, and a hard rule that these values never leave the
  machine (see Security)
- **Unchanged:** still one yt-dlp subprocess

### Rung 4 — The browser performs the transfer

Only for cases that genuinely cannot be replayed:

- per-segment rotating tokens, where JavaScript mints a fresh signature per chunk
- MSE / `blob:` URLs, where segments are assembled in JS and the playable thing
  never exists as a fetchable URL
- media delivered over WebSocket

The technique is to capture segments as the player requests them and mux with
ffmpeg afterwards. It works, with one ugly failure mode: if the player only
fetches as fast as it plays, a 40-minute video takes 40 minutes.

**This is a second download engine, and that is the real cost.** Progress no
longer comes from yt-dlp's JSON. "Resume" does not mean the same thing — there is
no `.part` file to continue from. Every future change to the queue has to be made
twice.

If it is built: segments still go to **ffmpeg** for assembly, so file writing
stays in one place rather than becoming a parallel implementation.

## Where it slots in

```
probe()  ──▶ extractor ──▶ impersonate retry ──▶ scrapePage()
                                                     │ fails
                                                     ▼
                                            rung 2/3: load the page,
                                            watch the network, capture headers
                                                     │ nothing fetchable
                                                     ▼
                                            rung 4: capture segments (last)

AUTH_REQUIRED / AGE_RESTRICTED ──▶ rung 1: offer "Sign in to this site"
```

Rung 1 hangs off the *error*, not off the discovery chain — it is a response to a
specific failure, offered next to the existing "Report site" button.

## Build order

**A — Rung 1.** Most user value, smallest new surface, and it makes the Auth Pack
something worth recommending rather than warning about. Ends with: log in to a
site once, download from it.

**B — Rungs 2 and 3 together.** Splitting them is a false economy; capturing the
URL without its headers produces candidates that 403, which looks exactly like
the bug it was meant to fix. Ends with: a JS-built player on a site with no
extractor produces a working download.

**C — Rung 4, only on evidence.** Do not build it speculatively. If failure
telemetry (see the suggestion in `task.md`) shows a real cluster of sites that
rungs 1–3 cannot serve, build it then, for those.

## Security requirements

Non-negotiable, because this renders hostile pages inside the app and handles
material equivalent to passwords.

- `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`. Never
  render a remote page in the main window.
- Its own partition, shared with nothing else.
- **Cookies and captured headers must never reach the feedback or telemetry
  paths.** `feedback.ts` already strips URLs and user paths; it needs extending,
  and it needs a test — this is the same class of mistake as putting an install
  id on a site-count row.
- A visible "Signed-in sites / sign out" control in Options. A stored session the
  user cannot see or revoke is not acceptable.
- The terms text has to change. It currently says nothing leaves the computer
  except site counts; it will need to say the app can store login sessions
  locally.
- **To verify before building:** whether an Electron partition's cookie store is
  DPAPI-encrypted at rest the way Chrome's own profile is. If it is not, session
  cookies sit in plain SQLite next to the app data and that gap has to be closed
  with `safeStorage` before this ships.

## What this cannot do

**DRM.** Netflix, Disney+, Prime and anything else on Widevine are encrypted at
the CDM level. Electron does not ship the Widevine CDM by default, and even with
it you get playback, not plaintext. No amount of work in this document unlocks
those sites, and the UI should say so plainly rather than failing with a generic
error.

## Open questions

- Does rung 2 reuse the rung 1 partition? Sharing means a logged-in session helps
  discovery; isolating means a hostile page cannot touch a real login. Probably
  isolate by default and share only when the user has explicitly signed in to
  that domain.
- How long does a hidden page get before the window is destroyed? Too short and
  slow players are missed; too long and every failed probe costs the user that
  much time.
- Does a captured `directUrl` get re-verified before the download starts, the way
  `scrapePage()` HEAD-checks candidates? Signed URLs may expire between discovery
  and transfer.
