# Releasing

Every release publishes the same artifacts plus the update feed:

| File | Who it is for |
|---|---|
| `tizo-<version>-setup.exe` | Most people. Per-user NSIS install, no admin prompt |
| `tizo-<version>-portable.exe` | USB sticks and locked-down machines. No install |
| `tizo-<version>-x64.zip` | Manual extract |
| `tizo-<version>-x86_64.AppImage` | Linux. The only Linux target — see the AppImage decision in CLAUDE.md |
| `latest.yml` | **Not optional.** electron-updater reads this to find Windows updates |
| `latest-linux.yml` | The same thing for Linux. A separate feed — Windows's does not cover it |

electron-builder also uploads `tizo-<version>-setup.exe.blockmap`, which is what
lets an update download only the changed parts of the installer.

`latest.yml` is the one that is easy to forget and breaks everything quietly: without
it in the release, every installed copy simply stops finding updates, with no error
anywhere. electron-builder generates and uploads it automatically — just never
hand-curate a release by uploading only the exes.

## Cutting a release

```bash
# 1. Bump the version — the tag and package.json must agree
npm version 0.1.0 --no-git-tag-version

# 2. Commit it
git add package.json package-lock.json && git commit -m "Release 0.1.0"

# 3. Tag and push. The workflow does the rest.
git tag v0.1.0
git push && git push --tags
```

`.github/workflows/release.yml` then runs two jobs — `windows-latest` for the
installer, portable exe and zip, `ubuntu-latest` for the AppImage. Each refuses to
continue if the tag and `package.json` disagree, runs `npm test`, and publishes to
the same GitHub release.

**Why the version check exists:** electron-updater compares the version *inside* the
artifacts, not the tag on the release. A release tagged `v0.2.0` containing a 0.1.0
build looks perfectly fine on GitHub and updates nobody. The workflow fails loudly
instead.

## Building locally

```bash
npm run dist        # the three Windows targets into dist/
npm run dist:linux  # the AppImage — needs a Linux host; CI does this on ubuntu-latest
npm run dist:dir    # unpacked only — much faster for a smoke test
```

Local builds do not publish. To publish from a machine, set `GH_TOKEN` and add
`--publish always`.

## What to check before tagging

- `npm test` passes — typecheck plus the offline assertions: args, formats,
  embeds, manifest, stats and the stats Worker. CI runs it in both jobs
- If the component registry changed, prove it against the real published assets
  *before* pushing: `TIZO_MANIFEST_URL=./components.json npm run test:essentials`
- The installer runs on a machine that has never had Tizo: terms → Essentials
  download → a real download completes
- The portable exe keeps its `tizo-data/` folder beside itself, and shows an update
  *banner* rather than attempting to replace a running exe

## Update channels

Three things update independently — see [plan.md](plan.md#the-three-update-channels).
Only the app itself is tied to releases. The download engine refreshes weekly from
yt-dlp's own repo, and the component registry is read from `components.json` on
`main`, so **site tuning and new components ship without a release at all**. Prefer
that route for anything that does not need new app code.

## The draft trap

electron-builder publishes a **draft** release unless told otherwise, and a draft is
invisible to electron-updater. CI goes green, the assets are all there, and nothing
updates. `electron-builder.yml` now sets `releaseType: release`; if a release ever
appears with an `untagged-…` URL, that setting has been lost.

## Code signing

Not set up. Every install shows a SmartScreen warning until the app builds
reputation. When a certificate exists, add it to `electron-builder.yml` under `win`
and store the password as a repository secret — nothing else needs to change.
