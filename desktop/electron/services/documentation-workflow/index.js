import fs from 'node:fs'
import path from 'node:path'
import { shell as electronShell, ipcMain } from 'electron'

const MANIFEST_FILE = 'session.json'
const COMPOSE_DIR = 'compose'

function safeJsonParse(value, fallback = {}) {
  try {
    return JSON.parse(value)
  }
  catch {
    return fallback
  }
}

async function fileExists(filePath) {
  if (!filePath) {
    return false
  }
  const stat = await fs.promises.stat(filePath).catch(() => null)
  return Boolean(stat?.isFile())
}

function naturalShotSort(a, b) {
  return String(a).localeCompare(String(b), undefined, {
    numeric: true,
    sensitivity: 'base',
  })
}

function manifestPath(root) {
  return path.join(root, MANIFEST_FILE)
}

async function readManifest(root) {
  const raw = await fs.promises.readFile(manifestPath(root), 'utf8').catch(() => '')
  return safeJsonParse(raw, {})
}

async function writeManifest(root, manifest) {
  await fs.promises.mkdir(root, { recursive: true })
  const target = manifestPath(root)
  const temp = `${target}.tmp`
  await fs.promises.writeFile(temp, JSON.stringify(manifest, null, 2), 'utf8')
  await fs.promises.rename(temp, target)
  return manifest
}

function normalizeCaption(value) {
  return String(value || '').trim().slice(0, 240)
}

function variantSuffix(index) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  if (index < alphabet.length) {
    return alphabet[index]
  }
  return `${alphabet[index % alphabet.length]}${Math.floor(index / alphabet.length) + 1}`
}

async function readProjectStepMax(projectPath) {
  if (!await fileExists(projectPath)) {
    return 0
  }

  const project = safeJsonParse(
    await fs.promises.readFile(projectPath, 'utf8').catch(() => ''),
    {},
  )

  const values = Array.isArray(project?.annotations)
    ? project.annotations
        .filter(item => item?.annotationType === 'step')
        .map(item => Number(item?.stepNumber) || 0)
    : []

  const editorCounter = Math.max(0, Number(project?.editor?.stepCounter || 0) - 1)
  return Math.max(editorCounter, ...values, 0)
}

async function collectVariant(root, shotId, variant) {
  const id = variant.id || shotId
  const projectPath = variant.projectPath
    ? path.resolve(root, variant.projectPath)
    : path.join(root, 'project', `${id}.json`)
  const outputPath = variant.outputPath
    ? path.resolve(root, variant.outputPath)
    : path.join(root, 'output', `${id}.png`)

  return {
    id,
    label: String(variant.label || (id === shotId ? '主版本' : id)),
    isPrimary: id === shotId,
    projectPath,
    outputPath,
    hasProject: await fileExists(projectPath),
    hasOutput: await fileExists(outputPath),
  }
}

async function syncManifest(payload = {}) {
  const root = path.resolve(String(payload.root || payload.session?.root || ''))
  if (!root) {
    throw new Error('Documentation session root is required')
  }

  const raw = await readManifest(root)
  const session = payload.session || {}
  const originalDir = path.join(root, 'original')
  const projectDir = path.join(root, 'project')
  const outputDir = path.join(root, 'output')
  const composeDir = path.join(root, COMPOSE_DIR)

  await Promise.all([
    fs.promises.mkdir(originalDir, { recursive: true }),
    fs.promises.mkdir(projectDir, { recursive: true }),
    fs.promises.mkdir(outputDir, { recursive: true }),
    fs.promises.mkdir(composeDir, { recursive: true }),
  ])

  const files = await fs.promises.readdir(originalDir).catch(() => [])
  const shotIds = files
    .filter(name => /^\d+\.png$/i.test(name))
    .map(name => path.basename(name, path.extname(name)))
    .sort(naturalShotSort)

  const rawShotMap = new Map(
    Array.isArray(raw.shots)
      ? raw.shots.map(item => [String(item.id), item])
      : [],
  )

  const shots = []
  let maxStep = 0

  for (let index = 0; index < shotIds.length; index += 1) {
    const id = shotIds[index]
    const previous = rawShotMap.get(id) || {}
    const originalPath = path.join(originalDir, `${id}.png`)

    const rawVariants = Array.isArray(previous.variants)
      ? previous.variants
      : []

    const variantIds = new Set([id, ...rawVariants.map(item => item.id).filter(Boolean)])
    const projectNames = await fs.promises.readdir(projectDir).catch(() => [])
    projectNames
      .filter(name => name.startsWith(`${id}-`) && name.endsWith('.json'))
      .forEach((name) => {
        variantIds.add(path.basename(name, '.json'))
      })

    const variants = []
    for (const variantId of [...variantIds].sort(naturalShotSort)) {
      const prior = rawVariants.find(item => item.id === variantId) || {}
      const variant = await collectVariant(root, id, {
        ...prior,
        id: variantId,
      })
      variants.push(variant)
      maxStep = Math.max(maxStep, await readProjectStepMax(variant.projectPath))
    }

    shots.push({
      id,
      order: Number.isFinite(previous.order) ? previous.order : index,
      caption: normalizeCaption(previous.caption),
      originalPath,
      variants,
    })
  }

  shots.sort((a, b) => a.order - b.order || naturalShotSort(a.id, b.id))
  shots.forEach((shot, index) => {
    shot.order = index
  })

  const manifest = {
    version: 1,
    title: String(raw.title || session.title || '').trim(),
    deviceId: raw.deviceId || session.deviceId || '',
    deviceName: raw.deviceName || session.deviceName || '',
    root,
    composeDir,
    stepMode: ['global', 'per-image', 'manual'].includes(raw.stepMode)
      ? raw.stepMode
      : 'global',
    nextStepNumber: Math.max(1, maxStep + 1),
    shots,
    updatedAt: new Date().toISOString(),
  }

  await writeManifest(root, {
    version: manifest.version,
    title: manifest.title,
    deviceId: manifest.deviceId,
    deviceName: manifest.deviceName,
    stepMode: manifest.stepMode,
    shots: manifest.shots.map(shot => ({
      id: shot.id,
      order: shot.order,
      caption: shot.caption,
      variants: shot.variants
        .filter(variant => !variant.isPrimary)
        .map(variant => ({
          id: variant.id,
          label: variant.label,
          projectPath: path.relative(root, variant.projectPath),
          outputPath: path.relative(root, variant.outputPath),
        })),
    })),
    updatedAt: manifest.updatedAt,
  })

  return manifest
}

async function updateManifestMetadata(payload = {}) {
  const manifest = await syncManifest(payload)
  if (payload.title !== undefined) {
    manifest.title = String(payload.title || '').trim().slice(0, 160)
  }
  if (payload.stepMode && ['global', 'per-image', 'manual'].includes(payload.stepMode)) {
    manifest.stepMode = payload.stepMode
  }

  const raw = await readManifest(manifest.root)
  raw.title = manifest.title
  raw.stepMode = manifest.stepMode
  raw.updatedAt = new Date().toISOString()
  await writeManifest(manifest.root, raw)
  return syncManifest({ root: manifest.root })
}

async function setCaption(payload = {}) {
  const manifest = await syncManifest(payload)
  const shot = manifest.shots.find(item => item.id === String(payload.shotId))
  if (!shot) {
    throw new Error('Shot not found')
  }

  const raw = await readManifest(manifest.root)
  raw.shots = Array.isArray(raw.shots) ? raw.shots : []
  const target = raw.shots.find(item => String(item.id) === shot.id)
  if (target) {
    target.caption = normalizeCaption(payload.caption)
  }
  await writeManifest(manifest.root, raw)
  return syncManifest({ root: manifest.root })
}

async function reorderShots(payload = {}) {
  const manifest = await syncManifest(payload)
  const requested = Array.isArray(payload.ids)
    ? payload.ids.map(String)
    : []
  const known = new Set(manifest.shots.map(item => item.id))
  const ordered = requested.filter(id => known.has(id))
  manifest.shots.forEach((shot) => {
    if (!ordered.includes(shot.id)) {
      ordered.push(shot.id)
    }
  })

  const raw = await readManifest(manifest.root)
  raw.shots = Array.isArray(raw.shots) ? raw.shots : []
  ordered.forEach((id, index) => {
    const target = raw.shots.find(item => String(item.id) === id)
    if (target) {
      target.order = index
    }
  })
  await writeManifest(manifest.root, raw)
  return syncManifest({ root: manifest.root })
}

async function createVariant(payload = {}) {
  const manifest = await syncManifest(payload)
  const shot = manifest.shots.find(item => item.id === String(payload.shotId))
  if (!shot) {
    throw new Error('Shot not found')
  }

  const sourceId = String(payload.sourceVariantId || shot.id)
  const source = shot.variants.find(item => item.id === sourceId)
    || shot.variants[0]

  const existing = new Set(shot.variants.map(item => item.id))
  let id = ''
  for (let index = 0; index < 100; index += 1) {
    const candidate = `${shot.id}-${variantSuffix(index)}`
    if (!existing.has(candidate)) {
      id = candidate
      break
    }
  }
  if (!id) {
    throw new Error('Too many variants for this screenshot')
  }

  const projectPath = path.join(manifest.root, 'project', `${id}.json`)
  const outputPath = path.join(manifest.root, 'output', `${id}.png`)

  if (source?.hasProject) {
    await fs.promises.copyFile(source.projectPath, projectPath)
  }
  else {
    const project = {
      version: 2,
      source: {
        originalPath: shot.originalPath,
        deviceId: manifest.deviceId,
        deviceName: manifest.deviceName,
      },
      editor: {
        stepCounter: manifest.stepMode === 'global' ? manifest.nextStepNumber : 1,
      },
      annotations: [],
      updatedAt: new Date().toISOString(),
    }
    await fs.promises.writeFile(projectPath, JSON.stringify(project, null, 2), 'utf8')
  }

  const raw = await readManifest(manifest.root)
  raw.shots = Array.isArray(raw.shots) ? raw.shots : []
  const rawShot = raw.shots.find(item => String(item.id) === shot.id)
  rawShot.variants = Array.isArray(rawShot.variants) ? rawShot.variants : []
  rawShot.variants.push({
    id,
    label: normalizeCaption(payload.label) || `版本 ${variantSuffix(rawShot.variants.length)}`,
    projectPath: path.relative(manifest.root, projectPath),
    outputPath: path.relative(manifest.root, outputPath),
  })
  await writeManifest(manifest.root, raw)
  return syncManifest({ root: manifest.root })
}

async function deleteVariant(payload = {}) {
  const manifest = await syncManifest(payload)
  const shotId = String(payload.shotId)
  const variantId = String(payload.variantId)
  if (!variantId || variantId === shotId) {
    throw new Error('The primary variant cannot be deleted')
  }

  const shot = manifest.shots.find(item => item.id === shotId)
  const variant = shot?.variants.find(item => item.id === variantId)
  if (!variant) {
    return manifest
  }

  await Promise.all([
    fs.promises.unlink(variant.projectPath).catch(() => {}),
    fs.promises.unlink(variant.outputPath).catch(() => {}),
  ])

  const raw = await readManifest(manifest.root)
  const rawShot = raw.shots?.find(item => String(item.id) === shotId)
  if (rawShot) {
    rawShot.variants = (rawShot.variants || []).filter(item => item.id !== variantId)
  }
  await writeManifest(manifest.root, raw)
  return syncManifest({ root: manifest.root })
}

async function openItem(payload = {}) {
  const manifest = await syncManifest(payload)
  const shot = manifest.shots.find(item => item.id === String(payload.shotId))
  if (!shot) {
    throw new Error('Shot not found')
  }

  const variantId = String(payload.variantId || shot.id)
  const variant = shot.variants.find(item => item.id === variantId)
    || shot.variants[0]

  const base64 = (await fs.promises.readFile(shot.originalPath)).toString('base64')
  const projectData = variant.hasProject
    ? safeJsonParse(await fs.promises.readFile(variant.projectPath, 'utf8'), null)
    : null

  return {
    root: manifest.root,
    deviceId: manifest.deviceId,
    deviceName: manifest.deviceName,
    shotId: shot.id,
    variantId: variant.id,
    baseName: variant.id,
    caption: shot.caption,
    originalPath: shot.originalPath,
    projectPath: variant.projectPath,
    outputPath: variant.outputPath,
    projectData,
    imageDataUrl: `data:image/png;base64,${base64}`,
    workflowStepMode: manifest.stepMode,
    workflowStepCounter: manifest.stepMode === 'global'
      ? manifest.nextStepNumber
      : 1,
  }
}

async function imageDataUrl(filePath) {
  const buffer = await fs.promises.readFile(filePath)
  const ext = path.extname(filePath).toLowerCase()
  const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png'
  return `data:${mime};base64,${buffer.toString('base64')}`
}

async function writeComposition(payload = {}) {
  const root = path.resolve(String(payload.root || ''))
  if (!root || !payload.dataUrl) {
    throw new Error('Composition root and data are required')
  }

  const composeDir = path.join(root, COMPOSE_DIR)
  await fs.promises.mkdir(composeDir, { recursive: true })
  const safeName = String(payload.fileName || `guide-${Date.now()}.png`)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\.+$/g, '')
  const outputPath = path.join(composeDir, safeName.endsWith('.png') ? safeName : `${safeName}.png`)
  const encoded = String(payload.dataUrl).replace(/^data:image\/png;base64,/, '')
  await fs.promises.writeFile(outputPath, Buffer.from(encoded, 'base64'))
  return outputPath
}

export default {
  name: 'service:documentation-workflow',
  deps: ['module:main'],
  apply() {
    ipcMain.handle('documentation-workflow-get', (_, payload) => syncManifest(payload))
    ipcMain.handle('documentation-workflow-update', (_, payload) => updateManifestMetadata(payload))
    ipcMain.handle('documentation-workflow-caption', (_, payload) => setCaption(payload))
    ipcMain.handle('documentation-workflow-reorder', (_, payload) => reorderShots(payload))
    ipcMain.handle('documentation-workflow-create-variant', (_, payload) => createVariant(payload))
    ipcMain.handle('documentation-workflow-delete-variant', (_, payload) => deleteVariant(payload))
    ipcMain.handle('documentation-workflow-open-item', (_, payload) => openItem(payload))
    ipcMain.handle('documentation-workflow-image-data-url', (_, filePath) => imageDataUrl(filePath))
    ipcMain.handle('documentation-workflow-write-compose', (_, payload) => writeComposition(payload))
    ipcMain.handle('documentation-workflow-reveal', (_, target) => electronShell.showItemInFolder(target))

    return () => {
      ipcMain.removeHandler('documentation-workflow-get')
      ipcMain.removeHandler('documentation-workflow-update')
      ipcMain.removeHandler('documentation-workflow-caption')
      ipcMain.removeHandler('documentation-workflow-reorder')
      ipcMain.removeHandler('documentation-workflow-create-variant')
      ipcMain.removeHandler('documentation-workflow-delete-variant')
      ipcMain.removeHandler('documentation-workflow-open-item')
      ipcMain.removeHandler('documentation-workflow-image-data-url')
      ipcMain.removeHandler('documentation-workflow-write-compose')
      ipcMain.removeHandler('documentation-workflow-reveal')
    }
  },
}
