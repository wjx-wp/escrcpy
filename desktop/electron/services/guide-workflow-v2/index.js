import fs from 'node:fs'
import path from 'node:path'
import { ipcMain } from 'electron'

const SESSION_FILE = 'session.json'
const PRODUCT = 'GuidePix'

function exists(filePath) {
  return fs.existsSync(filePath)
}

function normalizeRelative(value) {
  return String(value || '').replace(/\\/g, '/')
}

function resolveFrom(root, relativePath) {
  if (!relativePath) {
    return ''
  }
  return path.resolve(root, relativePath)
}

function relativeFrom(root, absolutePath) {
  if (!absolutePath) {
    return ''
  }
  return normalizeRelative(path.relative(root, absolutePath))
}

function sanitizeFilename(value, fallback = 'GuidePix-Guide') {
  const result = String(value || fallback)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 96)
  return result || fallback
}

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.promises.readFile(filePath, 'utf8'))
  }
  catch {
    return fallback
  }
}

async function writeJson(filePath, value) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
  await fs.promises.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8')
}

function sessionPath(root) {
  return path.join(root, SESSION_FILE)
}

function defaultSession(payload) {
  const root = path.resolve(payload.root)
  const originalDir = payload.originalDir || path.join(root, 'original')
  const projectDir = payload.projectDir || path.join(root, 'project')
  const outputDir = payload.outputDir || path.join(root, 'output')
  const composeDir = path.join(root, 'compose')

  return {
    version: 2,
    product: PRODUCT,
    title: payload.title || '',
    deviceId: payload.deviceId || '',
    deviceName: payload.deviceName || payload.deviceId || 'Android',
    stepMode: 'global',
    nextStepNumber: 1,
    paths: {
      original: relativeFrom(root, originalDir),
      project: relativeFrom(root, projectDir),
      output: relativeFrom(root, outputDir),
      compose: relativeFrom(root, composeDir),
    },
    shots: [],
    compose: {
      lastTemplate: 'vertical',
      lastOutput: '',
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

async function ensureSession(payload = {}) {
  if (!payload.root) {
    throw new Error('GuidePix session root is required')
  }
  const root = path.resolve(payload.root)
  let session = await readJson(sessionPath(root))
  if (!session || Number(session.version) < 2) {
    const fresh = defaultSession(payload)
    if (session?.shots?.length) {
      fresh.shots = session.shots
      fresh.title = session.title || fresh.title
      fresh.stepMode = session.stepMode || fresh.stepMode
      fresh.nextStepNumber = Number(session.nextStepNumber) || fresh.nextStepNumber
    }
    session = fresh
  }

  session.product = PRODUCT
  session.version = 2
  session.title = payload.title ?? session.title ?? ''
  session.deviceId = payload.deviceId || session.deviceId || ''
  session.deviceName = payload.deviceName || session.deviceName || session.deviceId || 'Android'
  session.paths ||= defaultSession(payload).paths
  session.paths.compose ||= 'compose'
  session.updatedAt = new Date().toISOString()

  await Promise.all([
    fs.promises.mkdir(resolveFrom(root, session.paths.original), { recursive: true }),
    fs.promises.mkdir(resolveFrom(root, session.paths.project), { recursive: true }),
    fs.promises.mkdir(resolveFrom(root, session.paths.output), { recursive: true }),
    fs.promises.mkdir(resolveFrom(root, session.paths.compose), { recursive: true }),
  ])
  await writeJson(sessionPath(root), session)
  return { root, session }
}

function hydrateVariant(root, shot, variant) {
  const projectPath = resolveFrom(root, variant.project)
  const outputPath = resolveFrom(root, variant.output)
  return {
    ...variant,
    shotId: shot.id,
    baseName: `${shot.id}-${variant.id}`,
    originalPath: resolveFrom(root, shot.original),
    projectPath,
    outputPath,
    projectExists: exists(projectPath),
    outputExists: exists(outputPath),
    assetPath: exists(outputPath) ? outputPath : resolveFrom(root, shot.original),
  }
}

function hydrateShot(root, shot) {
  const originalPath = resolveFrom(root, shot.original)
  const projectPath = resolveFrom(root, shot.project)
  const outputPath = resolveFrom(root, shot.output)
  const projectExists = exists(projectPath)
  const outputExists = exists(outputPath)
  return {
    ...shot,
    originalPath,
    projectPath,
    outputPath,
    projectExists,
    outputExists,
    assetPath: outputExists ? outputPath : originalPath,
    state: outputExists ? 'done' : projectExists ? 'edited' : 'original',
    variants: (shot.variants || []).map(variant => hydrateVariant(root, shot, variant)),
  }
}

function hydrateSession(root, session) {
  return {
    ...session,
    root,
    manifestPath: sessionPath(root),
    originalDir: resolveFrom(root, session.paths.original),
    projectDir: resolveFrom(root, session.paths.project),
    outputDir: resolveFrom(root, session.paths.output),
    composeDir: resolveFrom(root, session.paths.compose),
    shots: [...(session.shots || [])]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map(shot => hydrateShot(root, shot)),
  }
}

async function syncSession(payload = {}) {
  const { root, session } = await ensureSession(payload)
  const originalDir = resolveFrom(root, session.paths.original)
  const files = (await fs.promises.readdir(originalDir).catch(() => []))
    .filter(name => /^\d+\.png$/i.test(name))
    .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10))

  const previous = new Map((session.shots || []).map(shot => [shot.id, shot]))
  const shots = files.map((name, index) => {
    const id = path.basename(name, path.extname(name))
    const old = previous.get(id) || {}
    return {
      id,
      order: old.order ?? index,
      caption: old.caption || '',
      original: normalizeRelative(path.join(session.paths.original, name)),
      project: old.project || normalizeRelative(path.join(session.paths.project, `${id}.json`)),
      output: old.output || normalizeRelative(path.join(session.paths.output, `${id}.png`)),
      variants: old.variants || [],
      createdAt: old.createdAt || new Date().toISOString(),
    }
  })

  session.shots = shots
  session.updatedAt = new Date().toISOString()
  await writeJson(sessionPath(root), session)
  return hydrateSession(root, session)
}

async function loadSession(root) {
  const { session } = await ensureSession({ root })
  return hydrateSession(path.resolve(root), session)
}

async function updateSession(payload = {}) {
  const { root, session } = await ensureSession(payload)
  const patch = payload.patch || {}
  if ('title' in patch) {
    session.title = String(patch.title || '')
  }
  if (['global', 'per-shot', 'manual'].includes(patch.stepMode)) {
    session.stepMode = patch.stepMode
  }
  if (Number.isFinite(Number(patch.nextStepNumber))) {
    session.nextStepNumber = Math.max(1, Number(patch.nextStepNumber))
  }
  if (patch.compose && typeof patch.compose === 'object') {
    session.compose = { ...(session.compose || {}), ...patch.compose }
  }
  session.updatedAt = new Date().toISOString()
  await writeJson(sessionPath(root), session)
  return hydrateSession(root, session)
}

async function updateShot(payload = {}) {
  const { root, session } = await ensureSession(payload)
  const shot = session.shots.find(item => item.id === payload.shotId)
  if (!shot) {
    throw new Error(`GuidePix shot not found: ${payload.shotId}`)
  }
  const patch = payload.patch || {}
  if ('caption' in patch) {
    shot.caption = String(patch.caption || '')
  }
  if ('order' in patch && Number.isFinite(Number(patch.order))) {
    shot.order = Number(patch.order)
  }
  session.updatedAt = new Date().toISOString()
  await writeJson(sessionPath(root), session)
  return hydrateSession(root, session)
}

async function reorderShots(payload = {}) {
  const { root, session } = await ensureSession(payload)
  const order = new Map((payload.shotIds || []).map((id, index) => [id, index]))
  session.shots.forEach((shot, index) => {
    shot.order = order.has(shot.id) ? order.get(shot.id) : index + order.size
  })
  session.updatedAt = new Date().toISOString()
  await writeJson(sessionPath(root), session)
  return hydrateSession(root, session)
}

function nextVariantLetter(variants = []) {
  const used = new Set(variants.map(item => String(item.id || '').toUpperCase()))
  for (let code = 65; code <= 90; code += 1) {
    const value = String.fromCharCode(code)
    if (!used.has(value)) {
      return value
    }
  }
  return `V${variants.length + 1}`
}

async function duplicateVariant(payload = {}) {
  const { root, session } = await ensureSession(payload)
  const shot = session.shots.find(item => item.id === payload.shotId)
  if (!shot) {
    throw new Error(`GuidePix shot not found: ${payload.shotId}`)
  }
  shot.variants ||= []
  const id = nextVariantLetter(shot.variants)
  const baseName = `${shot.id}-${id}`
  const variant = {
    id,
    caption: payload.caption || shot.caption || '',
    project: normalizeRelative(path.join(session.paths.project, `${baseName}.json`)),
    output: normalizeRelative(path.join(session.paths.output, `${baseName}.png`)),
    createdAt: new Date().toISOString(),
  }
  shot.variants.push(variant)
  session.updatedAt = new Date().toISOString()
  await writeJson(sessionPath(root), session)
  return {
    variant: hydrateVariant(root, shot, variant),
    session: hydrateSession(root, session),
  }
}

async function updateVariant(payload = {}) {
  const { root, session } = await ensureSession(payload)
  const shot = session.shots.find(item => item.id === payload.shotId)
  const variant = shot?.variants?.find(item => item.id === payload.variantId)
  if (!shot || !variant) {
    throw new Error('GuidePix variant not found')
  }
  if ('caption' in (payload.patch || {})) {
    variant.caption = String(payload.patch.caption || '')
  }
  session.updatedAt = new Date().toISOString()
  await writeJson(sessionPath(root), session)
  return hydrateSession(root, session)
}

async function nextGlobalStep(root) {
  const { session } = await ensureSession({ root })
  const value = Math.max(1, Number(session.nextStepNumber) || 1)
  session.nextStepNumber = value + 1
  session.updatedAt = new Date().toISOString()
  await writeJson(sessionPath(path.resolve(root)), session)
  return value
}

async function composeOutputPath(payload = {}) {
  const { root, session } = await ensureSession(payload)
  const composeDir = resolveFrom(root, session.paths.compose)
  const template = sanitizeFilename(payload.template || 'vertical', 'vertical')
  const title = sanitizeFilename(payload.title || session.title || 'GuidePix-Guide')
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return path.join(composeDir, `${title}-${template}-${timestamp}.png`)
}

export default {
  name: 'service:guide-workflow-v2',
  deps: ['module:main'],
  apply() {
    ipcMain.handle('guide-session-get', (_, root) => loadSession(root))
    ipcMain.handle('guide-session-sync', (_, payload) => syncSession(payload))
    ipcMain.handle('guide-session-update', (_, payload) => updateSession(payload))
    ipcMain.handle('guide-shot-update', (_, payload) => updateShot(payload))
    ipcMain.handle('guide-shot-reorder', (_, payload) => reorderShots(payload))
    ipcMain.handle('guide-shot-variant', (_, payload) => duplicateVariant(payload))
    ipcMain.handle('guide-variant-update', (_, payload) => updateVariant(payload))
    ipcMain.handle('guide-step-next', (_, root) => nextGlobalStep(root))
    ipcMain.handle('guide-compose-output-path', (_, payload) => composeOutputPath(payload))

    return () => {
      ipcMain.removeHandler('guide-session-get')
      ipcMain.removeHandler('guide-session-sync')
      ipcMain.removeHandler('guide-session-update')
      ipcMain.removeHandler('guide-shot-update')
      ipcMain.removeHandler('guide-shot-reorder')
      ipcMain.removeHandler('guide-shot-variant')
      ipcMain.removeHandler('guide-variant-update')
      ipcMain.removeHandler('guide-step-next')
      ipcMain.removeHandler('guide-compose-output-path')
    }
  },
}
