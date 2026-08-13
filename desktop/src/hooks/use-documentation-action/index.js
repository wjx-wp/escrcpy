import { ElNotification } from 'element-plus'
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

  function getFallbackSaveRoot(device) {
    if (!device?.id) {
      return undefined
    }
    return preferenceStore.getDataWithFallback(device.id)?.savePath
  }

  async function getWorkspaceRoot(device) {
    const fallback = getFallbackSaveRoot(device)

    try {
      return await window.$preload.ipcRenderer.invoke(
        'documentation-workspace-get',
        fallback,
      )
    }
    catch (error) {
      console.warn('[documentation] Workspace service unavailable, using fallback path:', error)
      return fallback
    }
  }

  async function chooseWorkspaceRoot(device) {
    try {
      const root = await window.$preload.ipcRenderer.invoke(
        'documentation-workspace-choose',
        getFallbackSaveRoot(device),
      )

      if (!root) {
        return null
      }

      if (device?.id) {
        documentationStore.setStatus(device.id, { captureSession: null })
      }

      ElMessage.success(`文档工作目录已设置：${root}`)
      return root
    }
    catch (error) {
      console.warn('[documentation] Failed to choose workspace root:', error)
      ElMessage.warning('文档目录设置暂不可用，截图仍会保存到默认目录')
      return null
    }
  }

  async function openWorkspaceRoot(device) {
    const fallback = getFallbackSaveRoot(device)

    try {
      return await window.$preload.ipcRenderer.invoke(
        'documentation-workspace-open',
        fallback,
      )
    }
    catch (error) {
      console.warn('[documentation] Workspace open helper unavailable:', error)
      if (!fallback) {
        return false
      }
      return window.$preload.ipcRenderer.invoke(
        'documentation-reveal-path',
        fallback,
      ).catch(() => false)
    }
  }

  async function getStatus(device) {
    if (!device?.id) {
      return null
    }

    const [status, dnd] = await Promise.all([
      window.$preload.ipcRenderer.invoke(
        'documentation-demo-status',
        device.id,
      ),
      window.$preload.ipcRenderer.invoke(
        'documentation-dnd-status',
        device.id,
      ).catch(() => null),
    ])

    const merged = {
      ...(status || {}),
      dnd,
    }
    documentationStore.setStatus(device.id, merged)
    return merged
  }

  async function ensureCaptureSession(device) {
    if (!device?.id) {
      return null
    }

    const workspaceRoot = await getWorkspaceRoot(device)
    const session = await window.$preload.ipcRenderer.invoke(
      'documentation-session-start',
      {
        deviceId: device.id,
        deviceName: getDeviceName(device),
        saveRoot: workspaceRoot,
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
      let status
      try {
        status = await window.$preload.ipcRenderer.invoke(
          'documentation-demo-enter',
          device.id,
        )
      }
      catch (error) {
        ElMessage.warning(error?.message || String(error))
        return false
      }

      // Demo Mode is the core state. Record it immediately so optional helpers
      // cannot leave the UI in a false "not in documentation mode" state.
      documentationStore.setStatus(device.id, {
        ...(status || { active: true, tracked: true }),
        captureSession: null,
      })

      const dnd = await window.$preload.ipcRenderer.invoke(
        'documentation-dnd-enter',
        device.id,
      ).catch((error) => {
        console.warn('[documentation] Failed to enter DND:', error)
        return null
      })

      const session = await ensureCaptureSession(device).catch((error) => {
        console.warn('[documentation] Failed to pre-create capture session:', error)
        return null
      })

      const merged = {
        ...(status || { active: true, tracked: true }),
        dnd,
        captureSession: session,
      }
      documentationStore.setStatus(device.id, merged)

      if (!silent) {
        if (dnd?.active) {
          ElMessage.success('文档模式已开启 · 勿扰已开启')
        }
        else {
          ElMessage.success('文档模式已开启')
        }
      }

      return merged
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

      const dnd = await window.$preload.ipcRenderer.invoke(
        'documentation-dnd-exit',
        device.id,
        { force },
      ).catch((error) => {
        console.warn('[documentation] Failed to restore DND:', error)
        return null
      })

      documentationStore.setStatus(device.id, {
        ...(status || { active: false, tracked: false }),
        dnd,
        captureSession: null,
      })

      if (!silent) {
        if (dnd?.tracked) {
          ElMessage.warning('文档模式已恢复，但勿扰状态仍在等待恢复')
        }
        else {
          ElMessage.success('文档模式和勿扰状态已恢复')
        }
      }

      return {
        ...(status || {}),
        dnd,
      }
    }
    catch (error) {
      // Demo restore failed; still make a best effort to restore DND.
      await window.$preload.ipcRenderer.invoke(
        'documentation-dnd-exit',
        device.id,
        { force },
      ).catch(() => {})
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
      if (!status?.dnd?.active) {
        const dnd = await window.$preload.ipcRenderer.invoke(
          'documentation-dnd-enter',
          device.id,
        ).catch(() => null)
        documentationStore.setStatus(device.id, { dnd })
      }
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

      const workspaceRoot = await getWorkspaceRoot(device)
      const capture = await window.$preload.ipcRenderer.invoke(
        'documentation-prepare-capture',
        {
          saveRoot: workspaceRoot,
          deviceId: device.id,
          deviceName: getDeviceName(device),
        },
      )

      documentationStore.setStatus(device.id, { captureSession: capture })

      await window.$preload.adb.screencap(device.id, {
        savePath: capture.originalPath,
      })

      if (notify) {
        ElNotification({
          title: `F8 已保存 · ${capture.baseName}.png`,
          message: capture.originalPath,
          type: 'success',
          duration: 5500,
          position: 'bottom-right',
          onClick: () => {
            window.$preload.ipcRenderer.invoke(
              'documentation-reveal-path',
              capture.originalPath,
            ).catch(() => {})
          },
        })
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
    getWorkspaceRoot,
    chooseWorkspaceRoot,
    openWorkspaceRoot,
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
