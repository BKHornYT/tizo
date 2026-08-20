# Releasing

Every release publishes the same three artifacts plus the update feed:

| File | Who it is for |
|---|---|
| `tizo-<version>-setup.exe` | Most people. Per-user NSIS install, no admin prompt |
| `tizo-<version>-portable.exe` | USB sticks and locked-down machines. No install |
| `tizo-<version>-x64.zip` | Manual extract |
| `latest.yml` | **Not optional.** electron-updater reads this to find updates |

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

`.github/workflows/release.yml` then builds on `windows-latest`, refuses to continue
if the tag and `package.json` disagree, runs `npm test`, and publishes all four files
to a GitHub release.

**Why the version check exists:** electron-updater compares the version *inside* the
artifacts, not the tag on the release. A release tagged `v0.2.0` containing a 0.1.0
build looks perfectly fine on GitHub and updates nobody. The workflow fails loudly
instead.

## Building locally

```bash
npm run dist        # all three targets into dist/
npm run dist:dir    # unpacked only — much faster for a smoke test
```

Local builds do not publish. To publish from a machine, set `GH_TOKEN` and add
`--publish always`.

## What to check before tagging

- `npm test` passes (typecheck plus the argument-builder assertions)
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

## Code signing

Not set up. Every install shows a SmartScreen warning until the app builds
reputation. When a certificate exists, add it to `electron-builder.yml` under `win`
and store the password as a repository secret — nothing else needs to change.
