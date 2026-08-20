import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { cancelSetup, getSetupPlan, installComponentFromFile, runSetup } from './setup'
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

  ipcMain.handle('setup:plan', () => getSetupPlan())

  ipcMain.handle('setup:run', () =>
    runSetup((progress) => {
      const win = getWindow()
      if (win && !win.isDestroyed()) win.webContents.send('setup:progress', progress)
    })
  )

  ipcMain.handle('setup:cancel', () => cancelSetup())

  ipcMain.handle('setup:installFromFile', async (_e, componentId: unknown) => {
    const win = getWindow()
    if (!win || typeof componentId !== 'string') return { ok: false, error: 'Bad request.' }
    const picked = await dialog.showOpenDialog(win, {
      title: 'Select the component archive',
      filters: [{ name: 'Zip archive', extensions: ['zip'] }],
      properties: ['openFile']
    })
    if (picked.canceled || !picked.filePaths[0]) return { ok: false, error: 'Cancelled.' }
    return installComponentFromFile(componentId, picked.filePaths[0])
  })

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
