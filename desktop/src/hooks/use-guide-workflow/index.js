import { useAnnotationStore } from '$/store/annotation/index.js'
import { useGuideStore } from '$/store/guide/index.js'

export function useGuideWorkflow() {
  const guideStore = useGuideStore()
  const annotationStore = useAnnotationStore()
  const { getCaptureSession, ensureCaptureSession } = useDocumentationAction()

  async function syncSession(device) {
    if (!device?.id) {
      return null
    }

    let captureSession = await getCaptureSession(device).catch(() => null)
    if (!captureSession?.root) {
      captureSession = await ensureCaptureSession?.(device).catch(() => null)
    }
    if (!captureSession?.root) {
      return null
    }

    const session = await window.$preload.ipcRenderer.invoke('guide-session-sync', {
      root: captureSession.root,
      deviceId: device.id,
      deviceName: device.remark || device.name || device.model || device.id,
      title: captureSession.title || '',
      originalDir: captureSession.originalDir,
      projectDir: captureSession.projectDir,
      outputDir: captureSession.outputDir,
    })

    guideStore.setSession(session)
    return session
  }

  async function openWorkbench(device, tab = 'capture') {
    const session = await syncSession(device)
    if (!session) {
      ElMessage.info('请先开启文档模式，或至少完成一张文档截图')
      return false
    }
    guideStore.open(session, tab)
    return session
  }

  async function refreshSession() {
    const session = guideStore.session
    if (!session?.root) {
      return null
    }
    const value = await window.$preload.ipcRenderer.invoke('guide-session-sync', {
      root: session.root,
      deviceId: session.deviceId,
      deviceName: session.deviceName,
      title: session.title,
      originalDir: session.originalDir,
      projectDir: session.projectDir,
      outputDir: session.outputDir,
    })
    guideStore.setSession(value)
    return value
  }

  async function updateSession(patch) {
    if (!guideStore.session?.root) {
      return null
    }
    const session = await window.$preload.ipcRenderer.invoke('guide-session-update', {
      root: guideStore.session.root,
      patch,
    })
    guideStore.setSession(session)
    return session
  }

  async function updateShot(shotId, patch) {
    if (!guideStore.session?.root) {
      return null
    }
    const session = await window.$preload.ipcRenderer.invoke('guide-shot-update', {
      root: guideStore.session.root,
      shotId,
      patch,
    })
    guideStore.setSession(session)
    return session
  }

  async function reorderShots(shotIds) {
    if (!guideStore.session?.root) {
      return null
    }
    const session = await window.$preload.ipcRenderer.invoke('guide-shot-reorder', {
      root: guideStore.session.root,
      shotIds,
    })
    guideStore.setSession(session)
    return session
  }

  async function duplicateVariant(shotId) {
    if (!guideStore.session?.root) {
      return null
    }
    const result = await window.$preload.ipcRenderer.invoke('guide-shot-variant', {
      root: guideStore.session.root,
      shotId,
    })
    if (result?.session) {
      guideStore.setSession(result.session)
    }
    return result
  }

  async function buildCapture(item) {
    if (!item) {
      return null
    }

    if (item.projectExists && item.projectPath) {
      const project = await window.$preload.ipcRenderer.invoke(
        'documentation-open-project',
        item.projectPath,
      ).catch(() => null)
      if (project) {
        return {
          ...item,
          ...project,
          sessionRoot: guideStore.session?.root,
          stepMode: guideStore.session?.stepMode || 'global',
        }
      }
    }

    return {
      ...item,
      root: guideStore.session?.root,
      sessionRoot: guideStore.session?.root,
      deviceId: guideStore.session?.deviceId,
      deviceName: guideStore.session?.deviceName,
      baseName: item.baseName || item.id,
      stepMode: guideStore.session?.stepMode || 'global',
    }
  }

  function flattenEditableItems(session = guideStore.session) {
    const items = []
    for (const shot of session?.shots || []) {
      items.push({
        ...shot,
        baseName: shot.id,
        variantId: '',
      })
      for (const variant of shot.variants || []) {
        items.push({
          ...shot,
          ...variant,
          id: `${shot.id}-${variant.id}`,
          baseName: `${shot.id}-${variant.id}`,
          originalPath: shot.originalPath,
          caption: variant.caption || shot.caption || '',
          variantId: variant.id,
          shotId: shot.id,
        })
      }
    }
    return items
  }

  async function openItem(item, options = {}) {
    const capture = await buildCapture(item)
    if (!capture) {
      return false
    }
    annotationStore.open(capture, {
      queue: options.queue || [capture],
      index: options.index || 0,
      context: {
        sessionRoot: guideStore.session?.root,
        source: 'guidepix',
      },
    })
    return capture
  }

  async function openBatchAnnotate(startId) {
    const items = flattenEditableItems()
    if (!items.length) {
      ElMessage.info('当前会话还没有截图')
      return false
    }

    const queue = []
    for (const item of items) {
      queue.push(await buildCapture(item))
    }
    const index = Math.max(0, startId
      ? queue.findIndex(item => item?.id === startId || item?.baseName === startId)
      : 0)

    annotationStore.openQueue(queue, {
      index: index < 0 ? 0 : index,
      context: {
        sessionRoot: guideStore.session?.root,
        source: 'guidepix-batch',
      },
    })
    return true
  }

  async function openRoot() {
    const root = guideStore.session?.root
    if (!root) {
      return false
    }
    return window.$preload.ipcRenderer.invoke('documentation-reveal-path', root)
  }

  async function getComposeOutputPath(template) {
    const session = guideStore.session
    if (!session?.root) {
      return null
    }
    return window.$preload.ipcRenderer.invoke('guide-compose-output-path', {
      root: session.root,
      template,
      title: session.title || 'GuidePix-Guide',
    })
  }

  return {
    guideStore,
    syncSession,
    openWorkbench,
    refreshSession,
    updateSession,
    updateShot,
    reorderShots,
    duplicateVariant,
    flattenEditableItems,
    openItem,
    openBatchAnnotate,
    openRoot,
    getComposeOutputPath,
  }
}

export default useGuideWorkflow
