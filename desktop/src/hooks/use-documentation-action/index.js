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

      ElMessage.success(`GuidePix 工作目录已设置：${root}`)
      return root
    }
    catch (error) {
      console.warn('[documentation] Failed to choose workspace root:', error)
      ElMessage.warning('工作目录设置暂不可用，截图仍会保存到默认目录')
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

      let captureResult
      try {
        captureResult = await window.$preload.ipcRenderer.invoke(
          'documentation-capture-screen',
          {
            deviceId: device.id,
            savePath: capture.originalPath,
            cleanupDeviceCopy: true,
            allowAdbFallback: false,
          },
        )
      }
      catch (error) {
        console.warn('[documentation] Phone-native capture failed:', error)
        ElNotification({
          title: '手机截图没有成功拉取到电脑',
          message: error?.message || String(error),
          type: 'warning',
          duration: 9000,
          position: 'bottom-right',
        })
        return false
      }

      const result = {
        ...capture,
        captureBackend: captureResult?.backend || 'phone-native',
        nativeScreenshot: Boolean(captureResult?.nativeScreenshot),
        remotePath: captureResult?.remotePath || '',
        imageWidth: captureResult?.width || 0,
        imageHeight: captureResult?.height || 0,
      }

      if (notify) {
        ElNotification({
          title: `F8 已拉取到电脑 · ${capture.baseName}.png`,
          message: `保存位置：${capture.originalPath}\n点击此提示打开所在文件夹`,
          type: 'success',
          duration: 9000,
          position: 'bottom-right',
          onClick: () => {
            window.$preload.ipcRenderer.invoke(
              'documentation-reveal-path',
              capture.originalPath,
            ).catch(() => {})
          },
        })
      }

      return result
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
