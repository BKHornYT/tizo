# Feature Set — what we take, improve, and skip

Reference: "Videodownloader" (screenshots reviewed 2026-08-20). Dated WinForms UI,
but the feature thinking is sound and worth mining. This file records what we
adopt and — more importantly — where we deliberately do it differently.

## Adopted as-is

These are good ideas we would have wanted anyway.

| Feature | Notes | Phase |
|---|---|---|
| Clipboard auto-add | Copy a URL, it appears in the list | 6 |
| Drag & drop links | Drop onto the window to queue | 4 |
| Download-all / clear-list | Batch controls over the queue | 4 |
| Max download speed | yt-dlp `-r`; presets plus a custom value | 3 |
| Subtitle download | Language picker, embed or sidecar | 5 |
| Folder per download | Optional; off by default | 3 |
| Minimize to tray instead of closing | Long downloads outlive the window | 6 |
| Geo-bypass toggle | yt-dlp `--geo-bypass`; nearly free to add | 3 |
| Per-host credentials | Their "Manage credentials" / "Hosts" | 7 |
| Playlist monitoring | Watch a playlist/channel, grab new uploads | **new — Phase 6.5** |

## Adopted but done better

Where their design is workable but we can beat it.

**Format selection — "Normal vs Expert" becomes progressive disclosure.**
They bury a Normal/Expert radio in a settings dialog, so a user who wants one
odd format must go change a global mode and come back. We show the short list
inline with an "All formats" expander on the picker itself. Same power, no
round trip, no global mode to forget you left on.

**Empty state — a wall of instructions becomes a working target.**
Their first screen is six lines of prose explaining how to add items. Ours is a
paste field that is already focused, plus — when the clipboard holds a URL — a
single "Download this?" prompt. Instructions you don't need to read beat
instructions you do.

**File-exists handling — "Always ask me" is a bad default.**
Asking on every collision punishes batch downloads, which is exactly when
collisions happen. Default: skip when the existing file matches size and
duration, otherwise auto-rename. Ask-every-time stays available as an option.

**Credentials — cookies-from-browser instead of typing passwords.**
Their model is a username/password vault. Most sites no longer accept plain
credentials (2FA, OAuth, bot checks), so that vault fails exactly where it is
needed. The Auth Pack imports cookies from an existing browser session instead,
which works with sites a password never would — and means we never store a
password at all.

**Updates — three channels, not one checkbox.**
They offer "Keep this app updated". The thing that actually breaks a downloader
is the *engine* going stale when a site changes, which an app-update checkbox
does not address. Our engine updates on its own weekly cadence. See
[plan.md](plan.md#the-three-update-channels).

**Playlist monitoring — offer, don't auto-hoover.**
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
  But retrofitting i18n is far more expensive than designing for it, so UI
  strings should live in one module from the start even while there is one
  locale. Cheap insurance — see task.md Open questions.

## Where we are simply ahead

Not from the reference, already in the plan: the portable USB build, the
on-demand component system, sha256-verified installs, and the domain-gate
request pipeline that turns an unsupported site into a tracked issue rather than
a dead end.
