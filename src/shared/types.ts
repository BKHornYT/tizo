/**
 * Types shared across main, preload and renderer. Nothing in here may import
 * from electron or node — the renderer compiles against it too.
 */

export type BinarySource = 'managed' | 'system' | 'missing'

export interface BinaryStatus {
  found: boolean
  /** Absolute path, or a bare exe name when resolved from PATH. */
  path: string | null
  source: BinarySource
  version: string | null
}

export interface EngineStatus {
  ytdlp: BinaryStatus
  ffmpeg: BinaryStatus
  dataDir: string
  portable: boolean
}

/**
 * Failure classes the UI reacts to differently. UNSUPPORTED_SITE is what drives
 * the domain gate in Phase 7; FFMPEG_REQUIRED drives the capability gate.
 */
export type ErrorCode =
  | 'UNSUPPORTED_SITE'
  | 'INVALID_URL'
  | 'UNAVAILABLE'
  | 'AUTH_REQUIRED'
  | 'AGE_RESTRICTED'
  | 'GEO_BLOCKED'
  | 'RATE_LIMITED'
  | 'FFMPEG_REQUIRED'
  | 'NETWORK'
  | 'BINARY_MISSING'
  | 'CANCELLED'
  | 'UNKNOWN'

export interface EngineError {
  code: ErrorCode
  /** Written for a user, not a developer. */
  message: string
  /** Raw stderr tail. Logs and bug reports only — never the primary UI text. */
  detail?: string
  /** Present on UNSUPPORTED_SITE so the domain gate can look it up. */
  domain?: string
}

/** Containers yt-dlp can extract audio into. `best` keeps whatever came down. */
export type AudioFormat = 'mp3' | 'm4a' | 'opus' | 'flac' | 'wav' | 'best'

export const AUDIO_BITRATES = [320, 256, 192, 128] as const
export type AudioBitrate = (typeof AUDIO_BITRATES)[number]

export interface FormatOption {
  /**
   * Identity, and usually also the yt-dlp selector. Must be unique within a
   * list: the queue resolves the chosen row by matching this, so two rows
   * sharing an id makes the second unreachable.
   */
  id: string
  /**
   * The yt-dlp selector, when it differs from `id`. Audio-extraction rows need
   * this: "M4A" and "Audio only" both select the same stream and differ only in
   * what happens afterwards, so they cannot share an identity.
   */
  selector?: string
  label: string
  kind: 'video' | 'audio'
  height: number | null
  fps: number | null
  ext: string
  /** Bytes. Estimated for video-only formats (adds the best audio track). */
  filesize: number | null
  /** True when the format must be muxed or converted, i.e. needs the HQ pack. */
  needsFfmpeg: boolean
  note?: string
  /**
   * Present only on rows that extract audio to a chosen container. The download
   * adds `-x --audio-format …`; without this the row is a plain stream download
   * and no conversion happens.
   */
  extractAudio?: AudioFormat
}

/**
 * One subtitle track offered by the site.
 *
 * `automatic` separates real subtitles from machine transcription. They are kept
 * apart in the UI because auto-captions are frequently wrong in ways a person
 * would not accept if they thought they were getting authored subtitles.
 */
export interface SubtitleTrack {
  lang: string
  name: string
  automatic: boolean
}

/**
 * What to do with the chosen subtitle tracks.
 *
 * `embed` puts them inside the video (mp4 and mkv only); `file` writes sidecar
 * .srt files next to it; `both` does each. Sidecars are not merely a fallback —
 * they are what a player on another device is most likely to read.
 */
export type SubtitleMode = 'embed' | 'file' | 'both'

export interface MediaInfo {
  id: string
  title: string
  uploader: string | null
  /** Seconds. */
  duration: number | null
  thumbnail: string | null
  webpageUrl: string
  extractor: string
  /** The short, curated list shown by default. */
  formats: FormatOption[]
  /** Every usable format, revealed by the "All formats" expander. */
  allFormats: FormatOption[]
  /** Authored tracks first, then automatic captions. Empty when none exist. */
  subtitles: SubtitleTrack[]
  /**
   * True when the probe only succeeded with browser impersonation. The download
   * must use the same route, or a site we just got past will refuse us again.
   */
  impersonate: boolean
  /**
   * The `--impersonate` target that got the probe through, when a generic
   * client was not enough. Carried so the download takes the identical route —
   * a host that just let us past will refuse a differently-shaped client.
   */
  impersonateTarget: string | null
}

export type JobStatus = 'downloading' | 'processing' | 'done' | 'error' | 'cancelled'

export interface ProgressEvent {
  jobId: string
  status: JobStatus
  /** 0-100, or null when the total size is unknown. */
  percent: number | null
  downloadedBytes: number | null
  totalBytes: number | null
  /** Bytes per second. */
  speed: number | null
  /** Seconds remaining. */
  eta: number | null
  filename: string | null
  /** Final path on disk. Only set when status is 'done'. */
  outputPath?: string
  error?: EngineError
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: EngineError }

// --- First-run setup -------------------------------------------------------

export interface ComponentSummary {
  id: string
  name: string
  summary: string
  version: string
  /** Bytes. */
  size: number
  installed: boolean
}

export interface SetupPlan {
  /** True while any Essentials component is missing. The app is unusable until false. */
  required: boolean
  /** Which copy of the registry we are working from. */
  manifestSource: 'remote' | 'cache' | 'bundled'
  essentialsVersion: number
  completedAt: string | null
  components: ComponentSummary[]
  /** Bytes still to download. */
  totalBytes: number
}

export interface SetupProgress {
  phase: 'running' | 'done' | 'error' | 'cancelled'
  componentId: string | null
  componentName: string | null
  stage: 'downloading' | 'verifying' | 'extracting' | 'checking' | null
  /** Combined across every component, so the bar never restarts at zero. */
  overallPercent: number
  receivedBytes: number
  totalBytes: number
  speed: number | null
  error?: string
}

// --- Settings --------------------------------------------------------------

/**
 * What to do when the target file already exists.
 * `skip-if-same` is the default: asking on every collision punishes batch
 * downloads, which is exactly when collisions happen.
 */
export type FileExistsRule = 'skip-if-same' | 'rename' | 'overwrite' | 'ask'

export type Container = 'mp4' | 'mkv' | 'original'

export interface Settings {
  outputDir: string
  /** Kilobytes per second. null means unlimited. */
  maxSpeedKbps: number | null
  /** Give each download its own subfolder — useful once subtitles arrive. */
  folderPerDownload: boolean
  geoBypass: boolean
  onFileExists: FileExistsRule
  /** Container to mux into when merging. `original` leaves it to yt-dlp. */
  container: Container
  /** Used by the Phase 4 queue; stored now so the setting survives. */
  concurrentDownloads: number
  clipboardWatch: boolean
  /** Opt-in. Shares only a domain-to-count tally; off unless chosen. */
  shareStats: boolean

  // --- Audio extraction ---
  /** Target bitrate for lossy audio extraction. Ignored by flac and wav. */
  audioBitrate: AudioBitrate
  /** Embed cover art into extracted audio. */
  embedThumbnail: boolean
  /** Embed title, artist and date into extracted audio and merged video. */
  embedMetadata: boolean

  // --- Subtitles ---
  /** Languages to fetch, as yt-dlp language codes. Empty means none. */
  subtitleLangs: string[]
  /** Include machine-generated captions when a real track is unavailable. */
  subtitleAuto: boolean
  subtitleMode: SubtitleMode

  // --- Experimental ---
  /**
   * Follow a page's embedded player when the extractor and the page scan have
   * both failed. Off by default: it costs extra requests, can pick the wrong
   * player, and is the kind of behaviour that should be asked for rather than
   * happen quietly.
   */
  experimentalDiscovery: boolean
}

// --- Download queue --------------------------------------------------------

export interface PlaylistEntry {
  id: string
  url: string
  title: string
  duration: number | null
}

export interface PlaylistInfo {
  url: string
  title: string
  /** True total, which can exceed `entries.length` when the fetch was capped. */
  count: number
  entries: PlaylistEntry[]
}

export type ItemState =
  | 'probing'   // fetching metadata
  | 'playlist'  // a playlist awaiting the user's selection
  | 'ready'     // has formats, waiting for the user
  | 'queued'    // user pressed go; waiting on a concurrency slot
  | 'downloading'
  | 'processing' // merging / converting
  | 'done'
  | 'error'
  | 'cancelled'

export interface QueueItem {
  id: string
  url: string
  state: ItemState
  addedAt: number

  title: string | null
  uploader: string | null
  duration: number | null
  thumbnail: string | null
  extractor: string | null

  formats: FormatOption[]
  allFormats: FormatOption[]
  /** Selected format id; defaults to the best option that works right now. */
  formatId: string | null

  /** Impersonation target the probe needed, replayed on the download. */
  impersonateTarget: string | null

  /** Tracks this item offers. Empty when the site has none. */
  subtitles: SubtitleTrack[]
  /**
   * Languages chosen for this item. `null` means "not chosen", and the settings
   * default applies — distinct from `[]`, which is a deliberate "no subtitles"
   * for this one item and must not be overridden by the default.
   */
  subLangs: string[] | null

  percent: number | null
  speed: number | null
  eta: number | null
  downloadedBytes: number | null
  totalBytes: number | null

  outputPath: string | null
  error: EngineError | null

  /** Present only while state is 'playlist'. */
  playlist: PlaylistInfo | null

  /**
   * Set when the media was found by scanning the page rather than by an
   * extractor. Downloads target this instead of `url`, with `url` sent as the
   * referer — many CDNs refuse a request that arrives without one.
   */
  directUrl: string | null

  /**
   * Set when experimental discovery redirected this item to an embedded player.
   * `url` then points at the player and this holds the page it was found on —
   * many embed hosts refuse a request that arrives without it as the referer.
   */
  sourcePage: string | null

  /** Carried from the probe: this site needs browser impersonation. */
  impersonate: boolean
}

// --- Updates ---------------------------------------------------------------

export interface AppUpdateState {
  currentVersion: string
  status: 'idle' | 'checking' | 'current' | 'downloading' | 'ready' | 'error' | 'unsupported'
  newVersion: string | null
  percent: number | null
  error: string | null
  canSelfUpdate: boolean
  /** Why self-update is off, when it is: running in dev, or a portable exe. */
  reason: 'dev' | 'portable' | null
}

export interface EngineUpdateState {
  currentVersion: string | null
  status: 'idle' | 'checking' | 'current' | 'updating' | 'error'
  newVersion: string | null
  error: string | null
  lastCheckedAt: number | null
}

export interface UpdateState {
  app: AppUpdateState
  engine: EngineUpdateState
}

export interface TermsState {
  /** True until the current terms version has been accepted. */
  required: boolean
  acceptedVersion: number | null
  acceptedAt: string | null
  currentVersion: number
}

/**
 * A yt-dlp extractor plugin present on disk.
 *
 * Surfaced in Options because a plugin is executable code the app installed:
 * anything running on someone's machine on our say-so should be visible to them,
 * with its origin stated.
 */
export interface InstalledPlugin {
  id: string
  name: string
  version: string
  summary: string
  /** False for anything that shipped inside the app. */
  fromRegistry: boolean
}

export interface SiteStat {
  domain: string
  downloads: number
}

// --- Feedback --------------------------------------------------------------

export type FeedbackKind = 'site' | 'idea' | 'bug'

export interface FeedbackDraft {
  kind: FeedbackKind
  domain: string
  /** Exactly what will be attached, shown to the user before anything opens. */
  body: string
  /** Prefilled GitHub issue URL. */
  url: string
}
