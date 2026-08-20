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
  formats: FormatOption[]
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
