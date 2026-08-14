import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  app,
  dialog,
  ipcMain,
  nativeImage,
  shell as electronShell,
} from 'electron'
import electronStore from '$electron/helpers/store/index.js'
import { getAdbPath } from '$electron/configs/which/index.js'

const execFileAsync = promisify(execFile)
const DND_SESSION_STORE_KEY = 'documentation.dndSessions'
const WORKSPACE_ROOT_STORE_KEY = 'documentation.workspaceRoot'
const CAPTURE_SESSION_STORE_KEY = 'documentation.captureSessions'
const SCREENSHOT_DIRS = [
  '/sdcard/DCIM/Screenshots',
  '/storage/emulated/0/DCIM/Screenshots',
  '/sdcard/Pictures/Screenshots',
  '/storage/emulated/0/Pictures/Screenshots',
]

function getMap(key) {
  const value = electronStore.get(key, {})
  return value && typeof value === 'object' ? value : {}
}

function setMap(key, value) {
  electronStore.set(key, value)
}

function getAdbExecutable() {
  const adbPath = getAdbPath() || getAdbPath({ onlyDefault: true })
  if (!adbPath) {
    throw new Error('ADB executable was not found')
  }
  return adbPath
}

async function runAdb(deviceId, args = []) {
  const { stdout = '' } = await execFileAsync(
    getAdbExecutable(),
    ['-s', deviceId, ...args],
    {
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
    },
  )
  return stdout.trim()
}

async function runAdbBuffer(deviceId, args = []) {
  const { stdout = Buffer.alloc(0) } = await execFileAsync(
    getAdbExecutable(),
    ['-s', deviceId, ...args],
    {
      encoding: null,
      windowsHide: true,
      maxBuffer: 32 * 1024 * 1024,
    },
  )
  return Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout)
}

function runShell(deviceId, args = []) {
  return runAdb(deviceId, ['shell', ...args])
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

async function getZenMode(deviceId) {
  const value = await runShell(deviceId, [
    'settings',
    'get',
    'global',
    'zen_mode',
  ])
  return String(value || '0').trim()
}

function mapZenModeToShell(value) {
  switch (String(value)) {
    case '1':
      return 'priority'
    case '2':
      return 'none'
    case '3':
      return 'alarms'
    case '0':
    default:
      return 'off'
  }
}

async function setDnd(deviceId, mode) {
  try {
    await runShell(deviceId, ['cmd', 'notification', 'set_dnd', mode])
    return true
  }
  catch (error) {
    const fallbackValue = mode === 'priority'
      ? '1'
      : mode === 'none'
        ? '2'
        : mode === 'alarms'
          ? '3'
          : '0'

    console.warn('[documentation] cmd notification set_dnd failed, fallback to zen_mode:', error?.message || error)
    await runShell(deviceId, [
      'settings',
      'put',
      'global',
      'zen_mode',
      fallbackValue,
    ])
    return false
  }
}

async function enterDnd(deviceId) {
  if (!deviceId) {
    throw new Error('Device id is required')
  }

  const sessions = getMap(DND_SESSION_STORE_KEY)
  if (!sessions[deviceId]) {
    sessions[deviceId] = {
      deviceId,
      zenMode: await getZenMode(deviceId).catch(() => '0'),
      startedAt: Date.now(),
    }
    setMap(DND_SESSION_STORE_KEY, sessions)
  }

  await setDnd(deviceId, 'none')
  return getDndStatus(deviceId)
}

async function exitDnd(deviceId, { force = false } = {}) {
  if (!deviceId) {
    throw new Error('Device id is required')
  }

  const sessions = getMap(DND_SESSION_STORE_KEY)
  const session = sessions[deviceId]

  if (session) {
    await setDnd(deviceId, mapZenModeToShell(session.zenMode))
    delete sessions[deviceId]
    setMap(DND_SESSION_STORE_KEY, sessions)
  }
  else if (force) {
    await setDnd(deviceId, 'off')
  }

  return getDndStatus(deviceId)
}

async function getDndStatus(deviceId) {
  const sessions = getMap(DND_SESSION_STORE_KEY)
  const zenMode = await getZenMode(deviceId).catch(() => 'unknown')

  return {
    deviceId,
    tracked: Boolean(sessions[deviceId]),
    zenMode,
    active: !['0', 'unknown'].includes(zenMode),
  }
}

async function restoreAllDndSessions() {
  const sessions = getMap(DND_SESSION_STORE_KEY)
  const results = []

  for (const deviceId of Object.keys(sessions)) {
    try {
      const status = await exitDnd(deviceId)
      results.push({ deviceId, success: true, status })
    }
    catch (error) {
      results.push({
        deviceId,
        success: false,
        error: error?.message || String(error),
      })
    }
  }

  return results
}

function getWorkspaceRoot(fallback) {
  const saved = String(electronStore.get(WORKSPACE_ROOT_STORE_KEY, '') || '').trim()
  return saved || fallback || app.getPath('desktop')
}

async function chooseWorkspaceRoot(fallback) {
  const current = getWorkspaceRoot(fallback)
  const result = await dialog.showOpenDialog({
    title: '选择 GuidePix 工作目录',
    defaultPath: current,
    properties: ['openDirectory', 'createDirectory'],
    buttonLabel: '使用此目录',
  })

  if (result.canceled || !result.filePaths[0]) {
    return null
  }

  const root = result.filePaths[0]
  electronStore.set(WORKSPACE_ROOT_STORE_KEY, root)
  setMap(CAPTURE_SESSION_STORE_KEY, {})
  return root
}

function resetWorkspaceRoot() {
  electronStore.delete(WORKSPACE_ROOT_STORE_KEY)
  setMap(CAPTURE_SESSION_STORE_KEY, {})
  return true
}

async function openWorkspaceRoot(fallback) {
  const root = getWorkspaceRoot(fallback)
  const error = await electronShell.openPath(root)
  if (error) {
    throw new Error(error)
  }
  return root
}

async function getSystemScreenshotCandidates(deviceId) {
  const uniqueDirs = [...new Set(SCREENSHOT_DIRS)]
  const dirs = uniqueDirs.map(shellQuote).join(' ')
  const command = [
    `for d in ${dirs}; do`,
    'if [ -d "$d" ]; then',
    'ls -1t "$d"/*.png "$d"/*.jpg "$d"/*.jpeg "$d"/*.webp 2>/dev/null | head -n 3',
    'fi',
    'done',
  ].join(' ')

  const output = await runShell(deviceId, ['sh', '-c', command]).catch(() => '')
  return String(output || '')
    .split(/\r?\n/)
    .map(item => item.trim())
    .filter(Boolean)
}

async function waitForNewSystemScreenshot(deviceId, before) {
  const previous = new Set(before)

  for (let attempt = 0; attempt < 32; attempt += 1) {
    await sleep(250)
    const current = await getSystemScreenshotCandidates(deviceId)
    const fresh = current.find(item => !previous.has(item))
    if (fresh) {
      return fresh
    }
  }

  return null
}

async function getRemoteFileSize(deviceId, remotePath) {
  const output = await runShell(deviceId, [
    'sh',
    '-c',
    `wc -c < ${shellQuote(remotePath)} 2>/dev/null`,
  ]).catch(() => '')

  const value = Number.parseInt(String(output || '').trim(), 10)
  return Number.isFinite(value) ? value : 0
}

async function waitForRemoteFileStable(deviceId, remotePath) {
  let lastSize = 0
  let stableCount = 0

  for (let attempt = 0; attempt < 30; attempt += 1) {
    await sleep(200)
    const size = await getRemoteFileSize(deviceId, remotePath)

    if (size > 1024 && size === lastSize) {
      stableCount += 1
      if (stableCount >= 3) {
        await sleep(250)
        return size
      }
    }
    else {
      stableCount = 0
    }

    lastSize = size
  }

  return 0
}

async function pullPhoneScreenshot(deviceId, remotePath, savePath) {
  await fs.promises.mkdir(path.dirname(savePath), { recursive: true })

  const remoteExt = path.extname(remotePath).toLowerCase() || '.img'
  const tempPath = `${savePath}.phone${remoteExt}`

  await fs.promises.unlink(tempPath).catch(() => {})
  await runAdb(deviceId, ['pull', remotePath, tempPath])

  const stat = await fs.promises.stat(tempPath).catch(() => null)
  if (!stat?.isFile() || stat.size <= 1024) {
    await fs.promises.unlink(tempPath).catch(() => {})
    throw new Error('手机截图文件没有完整拉取到电脑')
  }

  const image = nativeImage.createFromPath(tempPath)
  const size = image.getSize()
  if (image.isEmpty() || !size.width || !size.height) {
    await fs.promises.unlink(tempPath).catch(() => {})
    throw new Error('手机截图已拉取，但图片文件尚未写完整')
  }

  if (remoteExt === '.png') {
    await fs.promises.unlink(savePath).catch(() => {})
    await fs.promises.rename(tempPath, savePath)
  }
  else {
    const png = image.toPNG()
    if (!png.length) {
      await fs.promises.unlink(tempPath).catch(() => {})
      throw new Error('手机截图无法转换为 PNG')
    }
    await fs.promises.writeFile(savePath, png)
    await fs.promises.unlink(tempPath).catch(() => {})
  }

  const localStat = await fs.promises.stat(savePath)
  return {
    bytes: localStat.size,
    width: size.width,
    height: size.height,
  }
}

async function captureViaPhone(deviceId, savePath, { cleanupDeviceCopy = true } = {}) {
  const before = await getSystemScreenshotCandidates(deviceId)

  // Trigger the phone/SystemUI screenshot path so root/LSPosed screenshot
  // hooks participate in the same path as a normal phone-side screenshot.
  await runShell(deviceId, ['input', 'keyevent', '120'])
  const remotePath = await waitForNewSystemScreenshot(deviceId, before)

  if (!remotePath) {
    return {
      success: false,
      reason: '手机已经触发截图，但 GuidePix 没有在常用截图目录找到新文件',
    }
  }

  const remoteBytes = await waitForRemoteFileStable(deviceId, remotePath)
  if (!remoteBytes) {
    return {
      success: false,
      reason: '已找到手机截图，但文件一直没有进入稳定可读取状态',
      remotePath,
    }
  }

  let pulled
  try {
    pulled = await pullPhoneScreenshot(deviceId, remotePath, savePath)
  }
  catch (error) {
    return {
      success: false,
      reason: error?.message || String(error),
      remotePath,
    }
  }

  if (cleanupDeviceCopy) {
    await runShell(deviceId, [
      'sh',
      '-c',
      `rm -f ${shellQuote(remotePath)}`,
    ]).catch(() => {})
  }

  return {
    success: true,
    remotePath,
    remoteBytes,
    ...pulled,
  }
}

async function captureViaAdb(deviceId, savePath) {
  const raw = await runAdbBuffer(deviceId, ['exec-out', 'screencap', '-p'])
  if (!raw.length) {
    throw new Error('ADB screencap returned an empty image')
  }

  await fs.promises.mkdir(path.dirname(savePath), { recursive: true })
  await fs.promises.writeFile(savePath, raw)
  return true
}

async function captureDocumentationScreen(payload = {}) {
  const {
    deviceId,
    savePath,
    cleanupDeviceCopy = true,
    allowAdbFallback = false,
  } = payload

  if (!deviceId || !savePath) {
    throw new Error('Device id and save path are required')
  }

  const phoneCapture = await captureViaPhone(deviceId, savePath, {
    cleanupDeviceCopy,
  }).catch(error => ({
    success: false,
    reason: error?.message || String(error),
  }))

  if (phoneCapture.success) {
    return {
      savePath,
      backend: 'phone-native',
      nativeScreenshot: true,
      remotePath: phoneCapture.remotePath,
      bytes: phoneCapture.bytes,
      width: phoneCapture.width,
      height: phoneCapture.height,
      fallbackAttempted: false,
    }
  }

  if (!allowAdbFallback) {
    throw new Error(`手机截图未能拉取到电脑：${phoneCapture.reason || '未知原因'}。手机相册中的截图不会受影响。`)
  }

  console.warn('[documentation] Phone-native screenshot failed, explicitly falling back to ADB:', phoneCapture.reason)
  await captureViaAdb(deviceId, savePath)

  return {
    savePath,
    backend: 'adb',
    nativeScreenshot: false,
    fallbackAttempted: true,
    fallbackReason: phoneCapture.reason,
  }
}

export default {
  name: 'service:documentation-ux',
  deps: ['module:main'],
  apply(mainApp) {
    ipcMain.handle('documentation-dnd-enter', (_, deviceId) => enterDnd(deviceId))
    ipcMain.handle('documentation-dnd-exit', (_, deviceId, options) => exitDnd(deviceId, options))
    ipcMain.handle('documentation-dnd-status', (_, deviceId) => getDndStatus(deviceId))
    ipcMain.handle('documentation-dnd-restore-all', () => restoreAllDndSessions())
    ipcMain.handle('documentation-workspace-get', (_, fallback) => getWorkspaceRoot(fallback))
    ipcMain.handle('documentation-workspace-choose', (_, fallback) => chooseWorkspaceRoot(fallback))
    ipcMain.handle('documentation-workspace-reset', () => resetWorkspaceRoot())
    ipcMain.handle('documentation-workspace-open', (_, fallback) => openWorkspaceRoot(fallback))
    ipcMain.handle('documentation-capture-screen', (_, payload) => captureDocumentationScreen(payload))

    const recoverPending = () => {
      restoreAllDndSessions().then((results) => {
        const recovered = results.filter(item => item.success).length
        if (recovered > 0) {
          console.info(`[documentation] Recovered ${recovered} pending DND session(s)`)
        }
      }).catch((error) => {
        console.warn('[documentation] DND startup recovery failed:', error?.message || error)
      })
    }

    mainApp.on('app:started', recoverPending)

    return async () => {
      mainApp.off('app:started', recoverPending)
      await restoreAllDndSessions()

      ipcMain.removeHandler('documentation-dnd-enter')
      ipcMain.removeHandler('documentation-dnd-exit')
      ipcMain.removeHandler('documentation-dnd-status')
      ipcMain.removeHandler('documentation-dnd-restore-all')
      ipcMain.removeHandler('documentation-workspace-get')
      ipcMain.removeHandler('documentation-workspace-choose')
      ipcMain.removeHandler('documentation-workspace-reset')
      ipcMain.removeHandler('documentation-workspace-open')
      ipcMain.removeHandler('documentation-capture-screen')
    }
  },
}
