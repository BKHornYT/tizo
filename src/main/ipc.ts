import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { engineStatus } from './engine/binaries'
import { probe } from './engine/probe'
import { cancelDownload, startDownload, type DownloadRequest } from './engine/download'
import { defaultDownloadDir } from './paths'

export function registerIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('app:versions', () => ({
    app: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node
  }))

  ipcMain.handle('engine:status', () => engineStatus())

  ipcMain.handle('engine:probe', (_e, url: unknown) => {
    if (typeof url !== 'string' || !url.trim()) {
      return { ok: false, error: { code: 'INVALID_URL', message: 'Paste a link first.' } }
    }
    return probe(url.trim())
  })

  ipcMain.handle('engine:download', (_e, req: DownloadRequest) =>
    startDownload(req, (event) => {
      // The window can be gone mid-download (user closed it); sending to a
      // destroyed webContents throws.
      const win = getWindow()
      if (win && !win.isDestroyed()) win.webContents.send('engine:progress', event)
    })
  )

  ipcMain.handle('engine:cancel', (_e, jobId: unknown) =>
    typeof jobId === 'string' ? cancelDownload(jobId) : false
  )

  ipcMain.handle('paths:downloadDir', () => defaultDownloadDir())

  ipcMain.handle('shell:reveal', (_e, target: unknown) => {
    if (typeof target === 'string' && target) shell.showItemInFolder(target)
  })

  ipcMain.handle('dialog:pickFolder', async (_e, current: unknown) => {
    const win = getWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory'],
      ...(typeof current === 'string' && current ? { defaultPath: current } : {})
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })
}
