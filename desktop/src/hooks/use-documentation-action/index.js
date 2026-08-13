import { useAnnotationStore } from '$/store/annotation/index.js'
import { useDocumentationStore } from '$/store/documentation/index.js'
import { sleep } from '$/utils/index.js'

export function useDocumentationAction() {
  const preferenceStore = usePreferenceStore()
  const annotationStore = useAnnotationStore()
  const documentationStore = useDocumentationStore()

  const loading = ref(false)

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
      documentationStore.setStatus(device.id, status || { active: true, tracked: true })

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
      documentationStore.setStatus(device.id, status || { active: false, tracked: false })

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
        },
      )

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
        deviceName: device.remark || device.name || device.id,
        imageDataUrl: `data:image/png;base64,${base64}`,
      })

      return capture
    }
    catch (error) {
      ElMessage.warning(error?.message || String(error))
      return false
    }
  }

  return {
    documentationStore,
    loading,
    getStatus,
    enter,
    exit,
    toggle,
    captureOriginal,
    captureAndAnnotate,
  }
}

export default useDocumentationAction
