import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { app, dialog, shell as electronShell, ipcMain } from 'electron'
import electronStore from '$electron/helpers/store/index.js'
import { getAdbPath } from '$electron/configs/which/index.js'

const execFileAsync = promisify(execFile)
const DEMO_SESSION_STORE_KEY = 'documentation.demoSessions'
const CAPTURE_SESSION_STORE_KEY = 'documentation.captureSessions'
const WORKSPACE_FOLDER = 'GuidePix'

function getStoreMap(key) {
  const value = electronStore.get(key, {})
  return value && typeof value === 'object' ? value : {}
}

function setStoreMap(key, value) {
  electronStore.set(key, value)
}

function getDemoSessions() {
  return getStoreMap(DEMO_SESSION_STORE_KEY)
}

function setDemoSessions(value) {
  setStoreMap(DEMO_SESSION_STORE_KEY, value)
}

function getCaptureSessions() {
  return getStoreMap(CAPTURE_SESSION_STORE_KEY)
}

function setCaptureSessions(value) {
  setStoreMap(CAPTURE_SESSION_STORE_KEY, value)
}

function normalizeSetting(value) {
  const normalized = String(value ?? '').trim()
  return normalized || 'null'
}

function sanitizeSegment(value, fallback = 'Android') {
  const result = String(value || fallback)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 72)

  return result || fallback
}

function pad(value) {
  return String(value).padStart(2, '0')
}

function formatSessionTime(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

async function runAdb(deviceId, args = []) {
  const adbPath = getAdbPath() || getAdbPath({ onlyDefault: true })
  if (!adbPath) {
    throw new Error('ADB executable was not found')
  }

  const { stdout = '' } = await execFileAsync(
    adbPath,
    ['-s', deviceId, ...args],
    {
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024,
    },
  )

  return stdout.trim()
}

function runShell(deviceId, args = []) {
  return runAdb(deviceId, ['shell', ...args])
}

async function getSetting(deviceId, key) {
  return normalizeSetting(
    await runShell(deviceId, ['settings', 'get', 'global', key]),
  )
}

async function restoreSetting(deviceId, key, value) {
  const normalized = normalizeSetting(value)

  if (normalized === 'null') {
    await runShell(deviceId, ['settings', 'delete', 'global', key])
    return
  }

  await runShell(deviceId, ['settings', 'put', 'global', key, normalized])
}

async function broadcastDemo(deviceId, extras = []) {
  return runShell(deviceId, [
    'am',
    'broadcast',
    '-a',
    'com.android.systemui.demo',
    ...extras,
  ])
}

async function safeDemoCommand(deviceId, extras = []) {
  try {
    await broadcastDemo(deviceId, extras)
    return true
  }
  catch (error) {
    console.warn('[documentation] Demo command failed:', extras.join(' '), error?.message || error)
    return false
  }
}

async function enterDemoMode(deviceId) {
  if (!deviceId) {
    throw new Error('Device id is required')
  }

  const sessions = getDemoSessions()
  let session = sessions[deviceId]

  if (!session) {
    const [allowed, enabled] = await Promise.all([
      getSetting(deviceId, 'sysui_demo_allowed'),
      getSetting(deviceId, 'sysui_tuner_demo_on'),
    ])

    session = {
      deviceId,
      allowed,
      enabled,
      startedAt: Date.now(),
    }

    sessions[deviceId] = session
    setDemoSessions(sessions)
  }

  await runShell(deviceId, ['settings', 'put', 'global', 'sysui_demo_allowed', '1'])
  await runShell(deviceId, ['settings', 'put', 'global', 'sysui_tuner_demo_on', '1'])

  await safeDemoCommand(deviceId, ['-e', 'command', 'enter'])
  await safeDemoCommand(deviceId, ['-e', 'command', 'clock', '-e', 'hhmm', '1000'])
  await safeDemoCommand(deviceId, ['-e', 'command', 'battery', '-e', 'level', '100', '-e', 'plugged', 'false'])
  await safeDemoCommand(deviceId, ['-e', 'command', 'network', '-e', 'wifi', 'show', '-e', 'level', '4'])
  await safeDemoCommand(deviceId, ['-e', 'command', 'network', '-e', 'mobile', 'hide'])
  await safeDemoCommand(deviceId, ['-e', 'command', 'notifications', '-e', 'visible', 'false'])
  await safeDemoCommand(deviceId, ['-e', 'command', 'status', '-e', 'bluetooth', 'hide', '-e', 'location', 'hide', '-e', 'alarm', 'hide', '-e', 'volume', 'hide'])

  return getDemoStatus(deviceId)
}

async function exitDemoMode(deviceId, options = {}) {
  if (!deviceId) {
    throw new Error('Device id is required')
  }

  const { force = false } = options
  const sessions = getDemoSessions()
  const session = sessions[deviceId]

  await safeDemoCommand(deviceId, ['-e', 'command', 'exit'])
  await runShell(deviceId, ['settings', 'put', 'global', 'sysui_tuner_demo_on', '0']).catch(() => {})

  if (session) {
    await restoreSetting(deviceId, 'sysui_tuner_demo_on', session.enabled)
    await restoreSetting(deviceId, 'sysui_demo_allowed', session.allowed)
    delete sessions[deviceId]
    setDemoSessions(sessions)
  }
  else if (force) {
    await runShell(deviceId, ['settings', 'put', 'global', 'sysui_tuner_demo_on', '0'])
    await runShell(deviceId, ['settings', 'put', 'global', 'sysui_demo_allowed', '0'])
  }

  endCaptureSession(deviceId)
  return getDemoStatus(deviceId)
}

async function getDemoStatus(deviceId) {
  if (!deviceId) {
    throw new Error('Device id is required')
  }

  const sessions = getDemoSessions()
  const [allowed, enabled] = await Promise.all([
    getSetting(deviceId, 'sysui_demo_allowed').catch(() => 'unknown'),
    getSetting(deviceId, 'sysui_tuner_demo_on').catch(() => 'unknown'),
  ])

  return {
    deviceId,
    tracked: Boolean(sessions[deviceId]),
    allowed,
    enabled,
    active: enabled === '1',
    captureSession: getCaptureSession(deviceId),
  }
}

async function restoreAllDemoSessions() {
  const sessions = getDemoSessions()
  const entries = Object.keys(sessions)
  const results = []

  for (const deviceId of entries) {
    try {
      const status = await exitDemoMode(deviceId)
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

function getCaptureSession(deviceId) {
  if (!deviceId) {
    return null
  }
  return getCaptureSessions()[deviceId] || null
}

async function startCaptureSession(payload = {}) {
  const {
    deviceId,
    deviceName,
    saveRoot = app.getPath('desktop'),
    title,
  } = payload

  if (!deviceId) {
    throw new Error('Device id is required')
  }

  const sessions = getCaptureSessions()
  const existing = sessions[deviceId]

  if (existing) {
    const exists = await fs.promises.stat(existing.root).catch(() => null)
    if (exists?.isDirectory()) {
      return existing
    }
  }

  const sessionName = title
    ? sanitizeSegment(title, 'GuidePix')
    : sanitizeSegment(deviceName || deviceId, 'Android')
  const id = `${formatSessionTime()}_${sessionName}`
  const root = path.resolve(saveRoot, WORKSPACE_FOLDER, id)
  const originalDir = path.join(root, 'original')
  const projectDir = path.join(root, 'project')
  const outputDir = path.join(root, 'output')

  await Promise.all([
    fs.promises.mkdir(originalDir, { recursive: true }),
    fs.promises.mkdir(projectDir, { recursive: true }),
    fs.promises.mkdir(outputDir, { recursive: true }),
  ])

  const session = {
    id,
    deviceId,
    deviceName: deviceName || deviceId,
    title: title || '',
    root,
    originalDir,
    projectDir,
    outputDir,
    startedAt: Date.now(),
  }

  sessions[deviceId] = session
  setCaptureSessions(sessions)
  return session
}

function endCaptureSession(deviceId) {
  if (!deviceId) {
    return null
  }

  const sessions = getCaptureSessions()
  const session = sessions[deviceId] || null
  if (session) {
    delete sessions[deviceId]
    setCaptureSessions(sessions)
  }
  return session
}

async function prepareCapture(payload = {}) {
  const { deviceId } = payload
  let session = getCaptureSession(deviceId)

  if (!session) {
    session = await startCaptureSession(payload)
  }

  const names = await fs.promises.readdir(session.originalDir).catch(() => [])
  const max = names.reduce((value, name) => {
    const match = name.match(/^(\d+)\.png$/i)
    if (!match) {
      return value
    }
    return Math.max(value, Number(match[1]) || 0)
  }, 0)

  const number = max + 1
  const baseName = String(number).padStart(3, '0')

  return {
    ...session,
    number,
    baseName,
    originalPath: path.join(session.originalDir, `${baseName}.png`),
    projectPath: path.join(session.projectDir, `${baseName}.json`),
    outputPath: path.join(session.outputDir, `${baseName}.png`),
  }
}

async function readFileBase64(filePath) {
  if (!filePath) {
    throw new Error('File path is required')
  }
  return (await fs.promises.readFile(filePath)).toString('base64')
}

async function writeProject(payload = {}) {
  const { projectPath, data } = payload
  if (!projectPath) {
    throw new Error('Project path is required')
  }

  await fs.promises.mkdir(path.dirname(projectPath), { recursive: true })
  const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2)
  await fs.promises.writeFile(projectPath, content, 'utf8')
  return projectPath
}

async function readProject(projectPath) {
  if (!projectPath) {
    throw new Error('Project path is required')
  }
  const content = await fs.promises.readFile(projectPath, 'utf8')
  return JSON.parse(content)
}

async function openProject(projectPath) {
  let targetPath = projectPath

  if (!targetPath) {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'GuidePix Project', extensions: ['json'] },
      ],
    })

    if (result.canceled || !result.filePaths[0]) {
      return null
    }
    targetPath = result.filePaths[0]
  }

  const projectData = await readProject(targetPath)
  const originalPath = projectData?.source?.originalPath

  if (!originalPath) {
    throw new Error('Project does not contain the original image path')
  }

  const base64 = await readFileBase64(originalPath)
  const projectDir = path.dirname(targetPath)
  const root = path.dirname(projectDir)
  const baseName = path.basename(targetPath, path.extname(targetPath))

  return {
    root,
    baseName,
    originalPath,
    projectPath: targetPath,
    outputPath: path.join(root, 'output', `${baseName}.png`),
    deviceId: projectData?.source?.deviceId || '',
    deviceName: projectData?.source?.deviceName || '',
    imageDataUrl: `data:image/png;base64,${base64}`,
    projectData,
  }
}

async function writeOutput(payload = {}) {
  const { outputPath, dataUrl } = payload
  if (!outputPath || !dataUrl) {
    throw new Error('Output path and image data are required')
  }

  const match = String(dataUrl).match(/^data:image\/png;base64,(.+)$/)
  const base64 = match ? match[1] : dataUrl
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.promises.writeFile(outputPath, Buffer.from(base64, 'base64'))
  return outputPath
}

async function revealPath(targetPath) {
  if (!targetPath) {
    return false
  }

  const stat = await fs.promises.stat(targetPath).catch(() => null)
  if (stat?.isFile()) {
    electronShell.showItemInFolder(targetPath)
    return true
  }

  const error = await electronShell.openPath(targetPath)
  if (error) {
    throw new Error(error)
  }

  return true
}

export default {
  name: 'service:documentation',
  deps: ['module:main'],
  apply(mainApp) {
    ipcMain.handle('documentation-demo-enter', (_, deviceId) => enterDemoMode(deviceId))
    ipcMain.handle('documentation-demo-exit', (_, deviceId, options) => exitDemoMode(deviceId, options))
    ipcMain.handle('documentation-demo-status', (_, deviceId) => getDemoStatus(deviceId))
    ipcMain.handle('documentation-demo-restore-all', () => restoreAllDemoSessions())
    ipcMain.handle('documentation-session-start', (_, payload) => startCaptureSession(payload))
    ipcMain.handle('documentation-session-get', (_, deviceId) => getCaptureSession(deviceId))
    ipcMain.handle('documentation-session-end', (_, deviceId) => endCaptureSession(deviceId))
    ipcMain.handle('documentation-prepare-capture', (_, payload) => prepareCapture(payload))
    ipcMain.handle('documentation-read-file-base64', (_, filePath) => readFileBase64(filePath))
    ipcMain.handle('documentation-write-project', (_, payload) => writeProject(payload))
    ipcMain.handle('documentation-read-project', (_, projectPath) => readProject(projectPath))
    ipcMain.handle('documentation-open-project', (_, projectPath) => openProject(projectPath))
    ipcMain.handle('documentation-write-output', (_, payload) => writeOutput(payload))
    ipcMain.handle('documentation-reveal-path', (_, targetPath) => revealPath(targetPath))

    const recoverPending = () => {
      restoreAllDemoSessions().then((results) => {
        const recovered = results.filter(item => item.success).length
        if (recovered > 0) {
          console.info(`[documentation] Recovered ${recovered} pending Demo Mode session(s)`)
        }
      }).catch((error) => {
        console.warn('[documentation] Startup recovery failed:', error?.message || error)
      })
    }

    mainApp.on('app:started', recoverPending)

    return async () => {
      mainApp.off('app:started', recoverPending)

      await restoreAllDemoSessions()

      ipcMain.removeHandler('documentation-demo-enter')
      ipcMain.removeHandler('documentation-demo-exit')
      ipcMain.removeHandler('documentation-demo-status')
      ipcMain.removeHandler('documentation-demo-restore-all')
      ipcMain.removeHandler('documentation-session-start')
      ipcMain.removeHandler('documentation-session-get')
      ipcMain.removeHandler('documentation-session-end')
      ipcMain.removeHandler('documentation-prepare-capture')
      ipcMain.removeHandler('documentation-read-file-base64')
      ipcMain.removeHandler('documentation-write-project')
      ipcMain.removeHandler('documentation-read-project')
      ipcMain.removeHandler('documentation-open-project')
      ipcMain.removeHandler('documentation-write-output')
      ipcMain.removeHandler('documentation-reveal-path')
    }
  },
}
