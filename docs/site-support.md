# Adding support for a site

**Goal:** someone reports a site that does not work, and it works soon after —
without waiting for an app release, and without a maintenance treadmill.

This document is the route to that. Every rung below is built and proven; what is
still missing is delivering plugins through the registry, so today a new one
means an app release.

## The ladder, cheapest first

A reported site should be answered by the first of these that works, not by
jumping to the bottom rung.

| # | Route | Cost to add a site | Already built |
|---|---|---|---|
| 1 | yt-dlp already supports it — the report is really a bug | nothing | ✅ |
| 2 | Site profile: impersonation target, player client, rate limits | a registry entry | ✅ |
| 3 | Page scan — a plain file on the page | nothing | ✅ |
| 4 | Click-to-load player in a `data-*` attribute | nothing | ✅ |
| 5 | **yt-dlp extractor plugin** — a small Python file | one file | ✅ ships with the app |
| 6 | Run the player and watch the network | nothing | ✅ (experimental) |

Rungs 3, 4 and 6 are generic: they cost nothing per site and already cover a
large share of reports. Rung 5 is the one that turns "we cannot do that site"
into "that site takes an afternoon".

## Rung 5: extractor plugins

**Verified 2026-08-21 against the bundled binary.** A throwaway extractor was
placed next to the managed `yt-dlp.exe` and picked up:

```
[debug] Extractor Plugins: TizoProbeIE
[debug] Plugin directories: …\bin\yt-dlp-plugins\<name>\yt_dlp_plugins
[tizoprobe] Extracting URL: https://tizo.test/123
```

This matters because the binary is a PyInstaller bundle, and it would have been
reasonable to assume plugins were unavailable there. They are not.

### Proven

A plugin for an embed-host family was written and run against a page whose HTML
contains no media source at all — the exact case where the page scan finds
nothing and the browser sniffer is stopped by a bot challenge. It returned a
playable URL. Run with `-J` only: the point was to prove extraction, not to fetch
anything.

The flow those hosts use, which the plugin encodes:

1. the embed page defines a token in inline script
2. the player asks a small endpoint for a base path, sending the embed page as
   `Referer`
3. it appends random characters, the token and a millisecond expiry
4. the media comes from a CDN node, which refuses a request with no `Referer`

None of that is visible to a scanner, and the page is guarded well enough that
watching a real browser does not help either. Talking to the endpoint the player
talks to sidesteps both problems.

### Layout

```
<binDir>/yt-dlp-plugins/<package>/yt_dlp_plugins/extractor/<name>.py
```

`<binDir>` is the managed binary directory the app already owns, so plugins live
beside the engine they extend and are removed when it is.

Plugins that ship with the app live in `resources/plugins/`, are packed by
electron-builder, and are copied into place on every launch by
`src/main/engine/plugins.ts` — replaced wholesale, so one dropped from a release
disappears from disk rather than lingering as a stale file nobody can reproduce.

**A plugin behind a bot wall needs impersonation.** `--extractor-args
generic:impersonate` speaks only to the generic extractor, so a named one keeps
403ing; the probe retries with a real `--impersonate` target instead. That target
is discovered rather than configured, because listing hosts in the registry would
publish which sites had been reported.

### Why this rather than our own extractors

- yt-dlp's extractor framework already handles HLS and DASH manifests, format
  shaping, subtitles, geo-bypass, impersonation and everything else. A plugin is
  usually a `_VALID_URL` and a `_real_extract` that returns a dict.
- Everything downstream keeps working unchanged: the format picker, the queue,
  progress, resume, cancel, the error codes. A plugin produces the same shape as
  any built-in extractor.
- Plugins for many hosts already exist publicly, and existing extractors are the
  reference for writing new ones.
- Distribution is a few KB, which the component pipeline already handles.

### The part that must not be got wrong

**A plugin is executable code running on a user's machine.** This is a
code-execution channel, and it is only acceptable on the terms the component
pipeline already enforces:

- served from the registry we control, over https
- **sha256-verified before it is written to disk**, exactly like ffmpeg
- never fetched from a URL supplied by a user, a page, or an issue report
- removable, and visible somewhere in Options alongside components

Treating a plugin as "just a config file" is how this becomes a way to run
arbitrary code on every install. It is closer to shipping a binary than to
shipping a site profile, and the safeguards must match.

## Where a suggestion goes

The reporting path already exists: a failed row offers "Report site" for
`UNSUPPORTED_SITE`/`UNKNOWN` only, and builds a prefilled GitHub issue with URLs
and user paths stripped. What is missing is the other end — a route from an issue
to a shipped plugin without an app release.

**Never name a reported site in the repo.** Describe it by shape. A real page id
or host in a commit, a changelog or a test fixture is a traceable identifier for
whoever reported it; this has already had to be cleaned up once.

## What no route reaches

**DRM.** Widevine, PlayReady and FairPlay hold the key in a black box. No plugin,
no page scan and no amount of watching the network changes that, and a site using
it should say so plainly rather than failing with a generic error.

Everything else — a login wall, a bot wall, a JavaScript-built player, an
obfuscated embed — is reachable by some rung above.
