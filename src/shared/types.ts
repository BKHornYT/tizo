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

export interface FormatOption {
  id: string
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
}

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

  percent: number | null
  speed: number | null
  eta: number | null
  downloadedBytes: number | null
  totalBytes: number | null

  outputPath: string | null
  error: EngineError | null

  /** Present only while state is 'playlist'. */
  playlist: PlaylistInfo | null
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
