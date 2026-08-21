import { app, shell, BrowserWindow } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { registerIpc } from './ipc'
import { cancelAll } from './engine/download'
import { runSniffChild, sniffChildTarget } from './engine/browser'
import { installBundledPlugins } from './engine/plugins'

const isDev = !app.isPackaged

function createWindow(): BrowserWindow {
  // Packaged builds get the icon from electron-builder; in dev it has to be set
  // explicitly or the window and taskbar show the default Electron logo.
  const devIcon = join(__dirname, '../../build/icon.ico')

  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 880,
    minHeight: 560,
    show: false, // revealed on ready-to-show to avoid a white flash
    backgroundColor: '#0b0d12',
    autoHideMenuBar: true,
    ...(!app.isPackaged && existsSync(devIcon) ? { icon: devIcon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // electron-vite emits a CJS preload bundle, which the sandbox loader
      // cannot require. The renderer stays isolated regardless.
      sandbox: false
    }
  })

  win.on('ready-to-show', () => win.show())

  // Anything that wants a new window is an external link — hand it to the OS
  // browser rather than opening an unsandboxed Electron window for it.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

/*
 * Experimental discovery runs its browser in a child copy of this executable,
 * because rendering a hostile page can abort the process outright — a Chromium
 * CHECK failure is not catchable, so the only containment is a separate process.
 *
 * This branch has to come first: a sniff child must never take the single
 * instance lock (it would be told to quit), open the real window, or register
 * IPC. It loads a page, prints one line, and exits.
 */
const sniffTarget = sniffChildTarget(process.argv)
if (sniffTarget) {
  app.disableHardwareAcceleration()
  /*
   * Site isolation off, in this child only.
   *
   * The abort that made this child necessary comes from site_info.cc itself:
   * these pages spawn ad and popunder frames with opaque origins that trip
   * `origin.GetTupleOrPrecursorTupleIfOpaque().IsValid()`. Blocking third-party
   * frames cut the failures but did not remove them.
   *
   * The usual objection to this switch does not apply here: the child renders
   * untrusted pages with no preload, no node integration, a sandboxed renderer
   * and a throwaway in-memory session. Site isolation protects cross-site data
   * sharing a process, and this process has no data worth reaching. It exits
   * seconds later having printed one line.
   */
  app.commandLine.appendSwitch('disable-site-isolation-trials')
  app.commandLine.appendSwitch('disable-features', 'IsolateOrigins,site-per-process')
  /*
   * Electron quits by default once every window closes. A hostile page can
   * close or crash its own renderer, and the child would then exit before
   * printing its result — which the parent reads as "found nothing" for a page
   * that may have been fine. The child decides when it is done, not the page.
   */
  app.on('window-all-closed', () => undefined)

  void app.whenReady().then(async () => {
    await runSniffChild(sniffTarget)
    app.exit(0)
  })
} else if (!app.requestSingleInstanceLock()) {
  // Single instance: a second launch focuses the existing window instead of
  // starting a rival copy that would fight over the download queue and settings.
  app.quit()
} else {
  let mainWindow: BrowserWindow | null = null

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  void app.whenReady().then(() => {
    // Extra sites, not a startup dependency — deliberately not awaited.
    void installBundledPlugins()
    registerIpc(() => mainWindow)
    mainWindow = createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
    })
  })

  // A surviving yt-dlp (and its ffmpeg child) would keep writing to disk long
  // after the window is gone.
  app.on('before-quit', cancelAll)

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
