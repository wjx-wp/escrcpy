import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  app,
  dialog,
  shell as electronShell,
  ipcMain,
  nativeImage,
} from 'electron'
import electronStore from '$electron/helpers/store/index.js'
import { getAdbPath } from '$electron/configs/which/index.js'

const execFileAsync = promisify(execFile)
const DND_SESSION_STORE_KEY = 'documentation.dndSessions'
const WORKSPACE_ROOT_STORE_KEY = 'documentation.workspaceRoot'
const CAPTURE_SESSION_STORE_KEY = 'documentation.captureSessions'
const PHONE_BATCH_STORE_KEY = 'documentation.phoneCaptureBatches'
const SCREENSHOT_DIRS = [
  '/sdcard/DCIM/Screenshots',
  '/sdcard/Pictures/Screenshots',
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
    title: '选择 GuidePix 项目保存位置',
    defaultPath: current,
    properties: ['openDirectory', 'createDirectory'],
    buttonLabel: '使用此位置',
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

async function listSystemScreenshots(deviceId, limit = 12) {
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 12))
  const dirs = SCREENSHOT_DIRS.map(shellQuote).join(' ')
  const command = [
    `for d in ${dirs}; do`,
    'if [ -d "$d" ]; then',
    `ls -1t "$d"/*.png "$d"/*.jpg "$d"/*.jpeg "$d"/*.webp 2>/dev/null | head -n ${safeLimit}`,
    'fi',
    'done',
  ].join(' ')

  const output = await runShell(deviceId, ['sh', '-c', command]).catch(() => '')
  return [...new Set(
    String(output || '')
      .split(/\r?\n/)
      .map(item => item.trim())
      .filter(Boolean),
  )]
}

async function waitForNewSystemScreenshot(deviceId, before) {
  const previous = new Set(before)

  for (let attempt = 0; attempt < 32; attempt += 1) {
    await sleep(250)
    const current = await listSystemScreenshots(deviceId, 16)
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

function getPhoneBatch(deviceId) {
  const batches = getMap(PHONE_BATCH_STORE_KEY)
  return batches[deviceId] || {
    deviceId,
    startedAt: 0,
    baseline: [],
    pending: [],
  }
}

function savePhoneBatch(deviceId, batch) {
  const batches = getMap(PHONE_BATCH_STORE_KEY)
  batches[deviceId] = batch
  setMap(PHONE_BATCH_STORE_KEY, batches)
}

function formatPhoneBatchStatus(deviceId, batch = getPhoneBatch(deviceId)) {
  return {
    deviceId,
    startedAt: batch.startedAt || 0,
    pendingCount: batch.pending?.length || 0,
    pending: (batch.pending || []).map(item => ({
      remotePath: String(item.remotePath || ''),
      bytes: Number(item.bytes || 0),
      createdAt: Number(item.createdAt || 0),
      source: item.source === 'manual' ? 'manual' : 'guidepix',
    })),
  }
}

async function beginPhoneBatch(deviceId, { reset = false } = {}) {
  if (!deviceId) {
    throw new Error('Device id is required')
  }

  const existing = getPhoneBatch(deviceId)
  if (existing.startedAt && !reset) {
    return refreshPhoneBatch(deviceId)
  }

  const baseline = await listSystemScreenshots(deviceId, 200)
  const batch = {
    deviceId,
    startedAt: Date.now(),
    baseline,
    pending: [],
  }
  savePhoneBatch(deviceId, batch)
  return formatPhoneBatchStatus(deviceId, batch)
}

async function refreshPhoneBatch(deviceId) {
  const batch = getPhoneBatch(deviceId)
  if (!batch.startedAt) {
    return formatPhoneBatchStatus(deviceId, batch)
  }

  const current = await listSystemScreenshots(deviceId, 200)
  const baseline = new Set(batch.baseline || [])
  const pendingPaths = new Set((batch.pending || []).map(item => item.remotePath))
  let changed = false

  for (const remotePath of [...current].reverse()) {
    if (baseline.has(remotePath) || pendingPaths.has(remotePath)) {
      continue
    }

    const bytes = await getRemoteFileSize(deviceId, remotePath)
    if (bytes <= 1024) {
      continue
    }

    batch.pending ||= []
    batch.pending.push({
      remotePath,
      bytes,
      createdAt: Date.now(),
      source: 'manual',
    })
    pendingPaths.add(remotePath)
    changed = true
  }

  if (changed) {
    savePhoneBatch(deviceId, batch)
  }

  return formatPhoneBatchStatus(deviceId, batch)
}

async function getPhoneBatchStatus(deviceId) {
  return refreshPhoneBatch(deviceId)
}

async function queuePhoneScreenshot(deviceId) {
  if (!deviceId) {
    throw new Error('Device id is required')
  }

  let batch = getPhoneBatch(deviceId)
  if (!batch.startedAt) {
    await beginPhoneBatch(deviceId)
    batch = getPhoneBatch(deviceId)
  }

  const before = await listSystemScreenshots(deviceId, 16)
  await runShell(deviceId, ['input', 'keyevent', '120'])

  const remotePath = await waitForNewSystemScreenshot(deviceId, before)
  if (!remotePath) {
    throw new Error('手机已触发截图，但 GuidePix 没有在系统截图目录找到新图片')
  }

  const bytes = await waitForRemoteFileStable(deviceId, remotePath)
  if (!bytes) {
    throw new Error('手机截图已经生成，但文件仍在写入，未能进入稳定状态')
  }

  batch = getPhoneBatch(deviceId)
  batch.pending ||= []
  if (!batch.pending.some(item => item.remotePath === remotePath)) {
    batch.pending.push({
      remotePath,
      bytes,
      createdAt: Date.now(),
      source: 'guidepix',
    })
  }
  savePhoneBatch(deviceId, batch)

  const status = await refreshPhoneBatch(deviceId)
  return {
    ...status,
    latest: {
      remotePath,
      bytes,
      source: 'guidepix',
    },
  }
}

async function pullQueuedPhoneScreenshot(payload = {}) {
  const {
    deviceId,
    remotePath,
    savePath,
  } = payload

  if (!deviceId || !remotePath || !savePath) {
    throw new Error('Device id, phone screenshot and local save path are required')
  }

  const batch = getPhoneBatch(deviceId)
  const queuedItem = (batch.pending || []).find(item => item.remotePath === remotePath)
  const cleanupDeviceCopy = payload.cleanupDeviceCopy === undefined
    ? queuedItem?.source !== 'manual'
    : Boolean(payload.cleanupDeviceCopy)

  const remoteBytes = await waitForRemoteFileStable(deviceId, remotePath)
  if (!remoteBytes) {
    throw new Error('手机截图文件已不存在或尚未写入完成')
  }

  const pulled = await pullPhoneScreenshot(deviceId, remotePath, savePath)

  if (cleanupDeviceCopy) {
    await runShell(deviceId, [
      'sh',
      '-c',
      `rm -f ${shellQuote(remotePath)}`,
    ]).catch(() => {})
  }

  batch.pending = (batch.pending || []).filter(item => item.remotePath !== remotePath)
  batch.baseline ||= []
  if (!batch.baseline.includes(remotePath)) {
    batch.baseline.push(remotePath)
  }
  savePhoneBatch(deviceId, batch)

  return {
    savePath,
    remotePath,
    backend: 'phone-native',
    nativeScreenshot: true,
    source: queuedItem?.source || 'guidepix',
    remoteBytes,
    ...pulled,
    pendingCount: batch.pending.length,
  }
}

function clearPhoneBatch(deviceId) {
  const batches = getMap(PHONE_BATCH_STORE_KEY)
  delete batches[deviceId]
  setMap(PHONE_BATCH_STORE_KEY, batches)
  return {
    deviceId,
    pendingCount: 0,
    pending: [],
  }
}

async function captureDocumentationScreen(payload = {}) {
  const {
    deviceId,
    savePath,
  } = payload

  if (!deviceId || !savePath) {
    throw new Error('Device id and save path are required')
  }

  const queued = await queuePhoneScreenshot(deviceId)
  const remotePath = queued.latest?.remotePath
  if (!remotePath) {
    throw new Error('手机截图没有进入 GuidePix 待同步队列')
  }

  return pullQueuedPhoneScreenshot({
    deviceId,
    remotePath,
    savePath,
    cleanupDeviceCopy: payload.cleanupDeviceCopy,
  })
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
    ipcMain.handle('documentation-phone-batch-begin', (_, deviceId, options) => beginPhoneBatch(deviceId, options))
    ipcMain.handle('documentation-phone-capture-queue', (_, deviceId) => queuePhoneScreenshot(deviceId))
    ipcMain.handle('documentation-phone-batch-status', (_, deviceId) => getPhoneBatchStatus(deviceId))
    ipcMain.handle('documentation-phone-pull', (_, payload) => pullQueuedPhoneScreenshot(payload))
    ipcMain.handle('documentation-phone-batch-clear', (_, deviceId) => clearPhoneBatch(deviceId))

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
      ipcMain.removeHandler('documentation-phone-batch-begin')
      ipcMain.removeHandler('documentation-phone-capture-queue')
      ipcMain.removeHandler('documentation-phone-batch-status')
      ipcMain.removeHandler('documentation-phone-pull')
      ipcMain.removeHandler('documentation-phone-batch-clear')
    }
  },
}
