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

  update: {
    version: (v: string) => `v${v}`,
    checking: 'Checking for updates…',
    current: 'Up to date',
    downloading: (pct: number) => `Downloading update… ${Math.round(pct)}%`,
    ready: (v: string) => `Version ${v} is ready`,
    restart: 'Restart now',
    later: 'Later',
    check: 'Check for updates',
    engineUpdating: 'Updating download engine…',
    engineCurrent: (v: string) => `Engine ${v}`,
    devNote: 'Auto-update is off in development builds.',
    portableNote: 'Portable builds cannot update themselves — download the new version manually.',
    failed: 'Update check failed'
  },

  toolbar: {
    add: 'Add link',
    downloads: 'Downloads',
    sorting: 'Sorting',
    options: 'Options',
    openOutput: 'Open output'
  },

  sort: {
    added: 'Order added',
    title: 'Title (A–Z)',
    size: 'Largest first',
    state: 'Status'
  },

  status: {
    noEngine: 'no engine',
    noFfmpeg: 'no HQ pack',
    portable: 'portable'
  },

  queue: {
    add: 'Add',
    heading: 'Queue',
    dropHint: 'Drop links anywhere in the window',
    dropActive: 'Release to add',
    empty: 'Copy a link, then press Ctrl+V',
    emptyHint:
      'Paste anywhere in this window, or drag a link onto it. Almost any video site works — paste several at once and they all queue.',
    pasteHint: 'Ctrl+V',
    added: (n: number) => `Added ${n} ${n === 1 ? 'link' : 'links'}`,
    noLinks: 'No links found in what you pasted',
    alreadyQueued: 'Already in the list',
    downloadAll: 'Download all',
    stopAll: 'Stop all',
    clearFinished: 'Clear finished',
    openOutput: 'Open folder',
    count: (n: number) => `${n} ${n === 1 ? 'item' : 'items'}`,
    activeCount: (n: number) => `${n} downloading`,
    states: {
      probing: 'Reading…',
      playlist: 'Playlist',
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
    bestGroup: 'Recommended',
    playlistCount: (shown: number, total: number) =>
      shown < total ? `${shown} of ${total} videos` : `${total} videos`,
    choose: 'Choose videos',
    addAll: 'Add all',
    selectTitle: 'Choose videos to add',
    selectAll: 'Select all',
    selectNone: 'Select none',
    addSelected: (n: number) => (n === 0 ? 'Add none' : `Add ${n}`),
    cancel: 'Cancel',
    capped: (cap: number) =>
      `Only the first ${cap} are listed — long channels are capped to keep this fast.`
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

    updates: 'Updates',
    updatesHint:
      'Tizo checks for app updates on launch and every six hours, and refreshes the download engine weekly. The engine matters most — sites change often, and a stale engine is what breaks downloads.',
    appVersion: 'App version',
    engineVersion: 'Download engine',

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
