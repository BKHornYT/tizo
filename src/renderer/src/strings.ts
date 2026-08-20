/**
 * Every user-visible string in the app.
 *
 * Tizo ships English-only, but strings live here from day one because
 * retrofitting i18n means touching every component — whereas swapping this one
 * module for a locale lookup does not. Components must never hardcode copy.
 */
export const strings = {
  app: {
    name: 'Video Downloader Tizo',
    short: 'Tizo'
  },

  nav: {
    download: 'Download',
    settings: 'Settings',
    back: 'Back'
  },

  status: {
    noEngine: 'no engine',
    noFfmpeg: 'no HQ pack',
    portable: 'portable'
  },

  queue: {
    addPlaceholder: 'Paste one link, or many at once…',
    add: 'Add',
    heading: 'Queue',
    dropHint: 'Drop links anywhere in the window',
    dropActive: 'Release to add',
    empty: 'Nothing queued yet',
    emptyHint: 'Paste a link above, or drop one onto the window. Almost any video site works.',
    downloadAll: 'Download all',
    stopAll: 'Stop all',
    clearFinished: 'Clear finished',
    openOutput: 'Open folder',
    count: (n: number) => `${n} ${n === 1 ? 'item' : 'items'}`,
    activeCount: (n: number) => `${n} downloading`,
    states: {
      probing: 'Reading…',
      ready: 'Ready',
      queued: 'Queued',
      downloading: 'Downloading',
      processing: 'Merging…',
      done: 'Done',
      error: 'Failed',
      cancelled: 'Stopped'
    },
    start: 'Download',
    retry: 'Retry',
    stop: 'Stop',
    remove: 'Remove',
    reveal: 'Show file',
    allFormatsGroup: 'All formats',
    bestGroup: 'Recommended'
  },

  downloader: {
    placeholder: 'Paste a video link…',
    check: 'Check',
    checking: 'Checking…',
    quality: 'Quality',
    allFormats: 'All formats',
    fewerFormats: 'Show fewer',
    allFormatsHint: 'Raw streams, exactly as the site offers them.',
    saveTo: 'Save to',
    change: 'Change',
    download: 'Download',
    cancel: 'Cancel',
    showInFolder: 'Show in folder',
    needsHqPack: 'needs HQ pack',
    unknownUploader: 'Unknown',
    emptyTitle: 'Paste a link to get started',
    emptyBody: 'Almost any video site works — paste and press Check.'
  },

  progress: {
    downloading: 'Downloading',
    processing: 'Processing',
    done: 'Done',
    error: 'Failed',
    cancelled: 'Cancelled',
    complete: 'Complete',
    of: 'of',
    eta: 'ETA'
  },

  conflict: {
    title: 'That file already exists',
    body: 'A file with this name is already in the folder.',
    keepBoth: 'Keep both',
    replace: 'Replace',
    cancel: 'Cancel'
  },

  settings: {
    title: 'Settings',
    outputDir: 'Download folder',
    outputDirHint: 'Where finished files land.',

    maxSpeed: 'Speed limit',
    maxSpeedHint: 'Leave unlimited unless downloads are crowding out other traffic.',
    unlimited: 'Unlimited',

    folderPerDownload: 'Give each download its own folder',
    folderPerDownloadHint: 'Keeps subtitles and extras beside their video.',

    geoBypass: 'Try to bypass region blocks',
    geoBypassHint: 'Spoofs a request header. Helps sometimes, never reliably.',

    onFileExists: 'When a file already exists',
    onFileExistsHint: 'Asking every time gets painful during batch downloads.',
    rules: {
      'skip-if-same': 'Skip it',
      rename: 'Keep both',
      overwrite: 'Replace it',
      ask: 'Ask me every time'
    },

    container: 'Video container',
    containerHint: 'Only applies when video and audio have to be merged.',
    containers: {
      mp4: 'MP4 — widest compatibility',
      mkv: 'MKV — keeps every stream',
      original: 'Leave as-is'
    },

    concurrent: 'Downloads at once',
    concurrentHint: 'Used by the download queue.',

    components: 'Components',
    installed: 'installed',
    notInstalled: 'not installed',

    reset: 'Reset to defaults',
    dataLocation: 'App data'
  },

  setup: {
    title: 'Setting up',
    intro: 'Tizo ships small and fetches the two pieces it cannot work without. This happens once.',
    installedBadge: 'installed',
    start: 'Download and install',
    resumeNote: 'Interrupted downloads resume where they stopped.',
    cancel: 'Cancel',
    retry: 'Try again',
    manual: 'Install from a file instead',
    manualHint:
      'Behind a proxy or a blocked network? Download the archive manually from the releases page and point Tizo at it.',
    offlineRegistry: (source: string) =>
      `Using the ${source} component list — could not reach the registry.`,
    stages: {
      downloading: 'Downloading',
      verifying: 'Verifying',
      extracting: 'Unpacking',
      checking: 'Checking'
    },
    starting: 'Starting',
    failed: 'Setup failed.'
  }
} as const

export type Strings = typeof strings
