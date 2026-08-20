# Feature Set — what we take, improve, and skip

Reference: "Videodownloader" (screenshots reviewed 2026-08-20). Dated WinForms UI,
but the feature thinking is sound and worth mining. This file records what we
adopt and — more importantly — where we deliberately do it differently.

## Adopted as-is

These are good ideas we would have wanted anyway.

| Feature | Notes | Phase | Status |
|---|---|---|---|
| Download-all / clear-list | Batch controls over the queue | 4 | ✅ |
| Drag & drop links | Drop anywhere on the window, not a small target | 4 | ✅ |
| Max download speed | yt-dlp `-r`; preset dropdown | 3 | ✅ |
| Folder per download | Optional; off by default | 3 | ✅ |
| Geo-bypass toggle | yt-dlp `--geo-bypass` | 3 | ✅ |
| Playlist expansion | Add all, or pick from a list | 4 | ✅ |
| Subtitle download | Language picker, embed or sidecar | 5 | ☐ |
| Clipboard auto-add | Copy a URL, it appears in the list | 6 | ☐ |
| Minimize to tray instead of closing | Long downloads outlive the window | 6 | ☐ |
| Playlist monitoring | Watch a playlist/channel, grab new uploads | 6.5 | ☐ |
| Per-host credentials | Their "Manage credentials" / "Hosts" | 7 | ☐ |

**Also taken, and the biggest one: the list itself.** Their whole UI is a queue —
items stack up, batch controls sit along the bottom. The first build here was a
single-video form, which took their *settings* but not their *shape*. Rebuilt
2026-08-20 so the queue is the app.

## Adopted but done better

Where their design is workable but we can beat it.

**Format selection — "Normal vs Expert" becomes per-item choice.** ✅
They bury a Normal/Expert radio in a settings dialog, and their download format
is a single global preference, so wanting one odd format for one video means
changing an app-wide setting and remembering to change it back. Here every queue
row has its own dropdown, grouped into a short recommended list plus every raw
stream the site offers. Same power, no round trip, nothing global to forget.

**Empty state — a wall of instructions becomes a working target.** ◑
Their first screen is six lines of prose explaining how to add items. Ours is an
already-focused paste field with one line under it. Instructions you don't need
to read beat instructions you do. The clipboard half — offering a copied URL
directly — lands in Phase 6.

**File-exists handling — "Always ask me" is a bad default.** ✅
Asking on every collision punishes batch downloads, which is exactly when
collisions happen. Default is skip; keep-both and replace are available, and
ask-every-time remains an option for single downloads. Inside the queue a
collision never blocks: it resolves to keep-both rather than halting a batch to
wait for a click.

**Credentials — cookies-from-browser instead of typing passwords.** ☐ Phase 7
Their model is a username/password vault. Most sites no longer accept plain
credentials (2FA, OAuth, bot checks), so that vault fails exactly where it is
needed. The Auth Pack imports cookies from an existing browser session instead,
which works with sites a password never would — and means we never store a
password at all.

**Updates — three channels, not one checkbox.** ☐ Phase 9
They offer "Keep this app updated". The thing that actually breaks a downloader
is the *engine* going stale when a site changes, which an app-update checkbox
does not address. Our engine updates on its own weekly cadence. See
[plan.md](plan.md#the-three-update-channels).

**Playlist links — the whole list is a choice, not a surprise.** ✅
A `watch?v=…&list=…` URL resolves to the single video it names. Someone pasting a
link they were watching wants that video, not the 400-item mix it happened to be
playing inside. Pure playlist and channel URLs expand, with everything
preselected so the picker is for deselecting a few rather than ticking forty.

**Playlist monitoring — offer, don't auto-hoover.** ☐ Phase 6.5
Theirs downloads every new video automatically. That quietly fills a disk. Ours
supports both, per playlist: *notify* (default — shows what's new, you pick) or
*auto*. The default should never be the one that surprises you at 400 GB.

## Deliberately skipped

- **"Automatically convert .WebM files"** — a re-encode that costs time and
  quality to solve a compatibility problem that mostly no longer exists. We
  prefer mp4 at *selection* time instead, so no second encode ever happens.
- **"Keep original file after converting"** — only exists to undo the above.
- **Sorting menu** — a sortable queue column beats a menu of sort modes.

## Under consideration

- **App language / i18n.** They ship a language picker; we launch English-only.
  Retrofitting i18n is far more expensive than designing for it, so all copy now
  lives in `src/renderer/src/strings.ts` — adding a locale is a lookup swap
  rather than a rewrite. Whether to ship one is still open.

## Where we are simply ahead

Not from the reference, already in the plan: the portable USB build, the
on-demand component system, sha256-verified installs, and the domain-gate
request pipeline that turns an unsupported site into a tracked issue rather than
a dead end.
