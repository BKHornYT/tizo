import { app, shell, BrowserWindow } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { registerIpc } from './ipc'
import { cancelAll } from './engine/download'

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

// Single instance: a second launch focuses the existing window instead of
// starting a rival copy that would fight over the download queue and settings.
if (!app.requestSingleInstanceLock()) {
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
