import { useAnnotationStore } from '$/store/annotation/index.js'
import { useDocumentationStore } from '$/store/documentation/index.js'
import { sleep } from '$/utils/index.js'

export function useDocumentationAction() {
  const preferenceStore = usePreferenceStore()
  const annotationStore = useAnnotationStore()
  const documentationStore = useDocumentationStore()

  const loading = ref(false)

  function getDeviceName(device) {
    return device?.remark || device?.name || device?.model || device?.id || 'Android'
  }

  async function getStatus(device) {
    if (!device?.id) {
      return null
    }

    const status = await window.$preload.ipcRenderer.invoke(
      'documentation-demo-status',
      device.id,
    )

    documentationStore.setStatus(device.id, status || {})
    return status
  }

  async function ensureCaptureSession(device) {
    if (!device?.id) {
      return null
    }

    const config = preferenceStore.getDataWithFallback(device.id)
    const session = await window.$preload.ipcRenderer.invoke(
      'documentation-session-start',
      {
        deviceId: device.id,
        deviceName: getDeviceName(device),
        saveRoot: config?.savePath,
      },
    )

    if (session) {
      documentationStore.setStatus(device.id, { captureSession: session })
    }

    return session
  }

  async function getCaptureSession(device) {
    if (!device?.id) {
      return null
    }

    const session = await window.$preload.ipcRenderer.invoke(
      'documentation-session-get',
      device.id,
    )

    documentationStore.setStatus(device.id, { captureSession: session })
    return session
  }

  async function enter(device, { silent = false } = {}) {
    if (!device?.id) {
      return false
    }

    loading.value = true
    try {
      const status = await window.$preload.ipcRenderer.invoke(
        'documentation-demo-enter',
        device.id,
      )
      const session = await ensureCaptureSession(device)
      documentationStore.setStatus(device.id, {
        ...(status || { active: true, tracked: true }),
        captureSession: session,
      })

      if (!silent) {
        ElMessage.success('文档模式已开启')
      }

      return status
    }
    catch (error) {
      ElMessage.warning(error?.message || String(error))
      return false
    }
    finally {
      loading.value = false
    }
  }

  async function exit(device, { force = false, silent = false } = {}) {
    if (!device?.id) {
      return false
    }

    loading.value = true
    try {
      const status = await window.$preload.ipcRenderer.invoke(
        'documentation-demo-exit',
        device.id,
        { force },
      )
      documentationStore.setStatus(device.id, {
        ...(status || { active: false, tracked: false }),
        captureSession: null,
      })

      if (!silent) {
        ElMessage.success('文档模式已恢复')
      }

      return status
    }
    catch (error) {
      ElMessage.warning(error?.message || String(error))
      return false
    }
    finally {
      loading.value = false
    }
  }

  async function toggle(device) {
    const status = await getStatus(device).catch(() => null)
    if (status?.active || status?.tracked) {
      return exit(device)
    }
    return enter(device)
  }

  async function ensureDemo(device) {
    const status = await getStatus(device).catch(() => null)
    if (status?.active || status?.tracked) {
      await getCaptureSession(device).catch(() => null)
      return status
    }

    const entered = await enter(device, { silent: true })
    if (entered) {
      await sleep(250)
    }
    return entered
  }

  async function captureOriginal(device, { ensureDemoMode = true, notify = true } = {}) {
    if (!device?.id) {
      return false
    }

    loading.value = true

    try {
      if (ensureDemoMode) {
        const demoStatus = await ensureDemo(device)
        if (!demoStatus) {
          return false
        }
      }

      const config = preferenceStore.getDataWithFallback(device.id)
      const capture = await window.$preload.ipcRenderer.invoke(
        'documentation-prepare-capture',
        {
          saveRoot: config?.savePath,
          deviceId: device.id,
          deviceName: getDeviceName(device),
        },
      )

      documentationStore.setStatus(device.id, { captureSession: capture })

      await window.$preload.adb.screencap(device.id, {
        savePath: capture.originalPath,
      })

      if (notify) {
        ElMessage.success(`原始截图已保存：${capture.baseName}.png`)
      }

      return capture
    }
    catch (error) {
      ElMessage.warning(error?.message || String(error))
      return false
    }
    finally {
      loading.value = false
    }
  }

  async function captureAndAnnotate(device) {
    const capture = await captureOriginal(device, { notify: false })
    if (!capture) {
      return false
    }

    try {
      const base64 = await window.$preload.ipcRenderer.invoke(
        'documentation-read-file-base64',
        capture.originalPath,
      )

      annotationStore.open({
        ...capture,
        deviceId: device.id,
        deviceName: getDeviceName(device),
        imageDataUrl: `data:image/png;base64,${base64}`,
      })

      return capture
    }
    catch (error) {
      ElMessage.warning(error?.message || String(error))
      return false
    }
  }

  async function openProject(projectPath) {
    loading.value = true
    try {
      const project = await window.$preload.ipcRenderer.invoke(
        'documentation-open-project',
        projectPath,
      )

      if (!project) {
        return null
      }

      annotationStore.open(project)
      return project
    }
    catch (error) {
      ElMessage.warning(error?.message || String(error))
      return false
    }
    finally {
      loading.value = false
    }
  }

  async function openSessionFolder(device) {
    const session = await getCaptureSession(device).catch(() => null)
    if (!session?.root) {
      ElMessage.info('当前还没有文档会话目录')
      return false
    }

    return window.$preload.ipcRenderer.invoke(
      'documentation-reveal-path',
      session.root,
    )
  }

  return {
    documentationStore,
    loading,
    getStatus,
    getCaptureSession,
    enter,
    exit,
    toggle,
    captureOriginal,
    captureAndAnnotate,
    openProject,
    openSessionFolder,
  }
}

export default useDocumentationAction
