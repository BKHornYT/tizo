# Adding support for a site

**Goal:** someone reports a site that does not work, and it works soon after —
without waiting for an app release, and without a maintenance treadmill.

This document is the route to that. Nothing here is built yet; the mechanism it
depends on has been verified.

## The ladder, cheapest first

A reported site should be answered by the first of these that works, not by
jumping to the bottom rung.

| # | Route | Cost to add a site | Already built |
|---|---|---|---|
| 1 | yt-dlp already supports it — the report is really a bug | nothing | ✅ |
| 2 | Site profile: impersonation target, player client, rate limits | a registry entry | ✅ |
| 3 | Page scan — a plain file on the page | nothing | ✅ |
| 4 | Click-to-load player in a `data-*` attribute | nothing | ✅ |
| 5 | **yt-dlp extractor plugin** — a small Python file | one file in the registry | ❌ |
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

### Layout

```
<binDir>/yt-dlp-plugins/<package>/yt_dlp_plugins/extractor/<name>.py
```

`<binDir>` is the managed binary directory the app already owns, so plugins live
beside the engine they extend and are removed when it is.

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
