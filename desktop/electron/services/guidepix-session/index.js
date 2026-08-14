import fs from 'node:fs'
import path from 'node:path'
import { app, ipcMain } from 'electron'
import electronStore from '$electron/helpers/store/index.js'

const CAPTURE_SESSION_STORE_KEY = 'documentation.captureSessions'

function getSessions() {
  const value = electronStore.get(CAPTURE_SESSION_STORE_KEY, {})
  return value && typeof value === 'object' ? value : {}
}

function setSessions(value) {
  electronStore.set(CAPTURE_SESSION_STORE_KEY, value)
}

function pad(value) {
  return String(value).padStart(2, '0')
}

function shortProjectId(date = new Date()) {
  return `GP-${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

async function startSession(payload = {}) {
  const {
    deviceId,
    deviceName,
    saveRoot = app.getPath('desktop'),
  } = payload

  if (!deviceId) {
    throw new Error('Device id is required')
  }

  const sessions = getSessions()
  const existing = sessions[deviceId]
  if (existing) {
    const stat = await fs.promises.stat(existing.root).catch(() => null)
    if (stat?.isDirectory()) {
      return existing
    }
  }

  let id = shortProjectId()
  let root = path.resolve(saveRoot, id)
  let suffix = 2
  while (await fs.promises.stat(root).catch(() => null)) {
    root = path.resolve(saveRoot, `${id}-${suffix}`)
    suffix += 1
  }
  id = path.basename(root)

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
    title: '',
    root,
    originalDir,
    projectDir,
    outputDir,
    startedAt: Date.now(),
    layout: 'compact-v1',
  }

  sessions[deviceId] = session
  setSessions(sessions)
  return session
}

function getSession(deviceId) {
  if (!deviceId) {
    return null
  }
  return getSessions()[deviceId] || null
}

function endSession(deviceId) {
  if (!deviceId) {
    return null
  }
  const sessions = getSessions()
  const session = sessions[deviceId] || null
  delete sessions[deviceId]
  setSessions(sessions)
  return session
}

async function prepareCapture(payload = {}) {
  const { deviceId } = payload
  let session = getSession(deviceId)
  if (!session) {
    session = await startSession(payload)
  }

  const names = await fs.promises.readdir(session.originalDir).catch(() => [])
  const max = names.reduce((value, name) => {
    const match = name.match(/^(\d+)\.png$/i)
    return match ? Math.max(value, Number(match[1]) || 0) : value
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

export default {
  name: 'service:guidepix-session',
  deps: ['module:main'],
  apply() {
    ipcMain.handle('guidepix-session-start', (_, payload) => startSession(payload))
    ipcMain.handle('guidepix-session-get', (_, deviceId) => getSession(deviceId))
    ipcMain.handle('guidepix-session-end', (_, deviceId) => endSession(deviceId))
    ipcMain.handle('guidepix-prepare-capture', (_, payload) => prepareCapture(payload))

    return () => {
      ipcMain.removeHandler('guidepix-session-start')
      ipcMain.removeHandler('guidepix-session-get')
      ipcMain.removeHandler('guidepix-session-end')
      ipcMain.removeHandler('guidepix-prepare-capture')
    }
  },
}
