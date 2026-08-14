import { ElNotification } from 'element-plus'
import { useAnnotationStore } from '$/store/annotation/index.js'
import { useDocumentationStore } from '$/store/documentation/index.js'
import { useDocumentationWorkflowStore } from '$/store/documentation-workflow/index.js'
import { sleep } from '$/utils/index.js'

export function useDocumentationAction() {
  const preferenceStore = usePreferenceStore()
  const annotationStore = useAnnotationStore()
  const documentationStore = useDocumentationStore()
  const workflowStore = useDocumentationWorkflowStore()

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

  function plainSession(session) {
    if (!session) {
      return null
    }
    return {
      id: session.id || '',
      deviceId: session.deviceId || '',
      deviceName: session.deviceName || '',
      title: session.title || '',
      root: session.root || '',
      originalDir: session.originalDir || '',
      projectDir: session.projectDir || '',
      outputDir: session.outputDir || '',
      startedAt: Number(session.startedAt || 0),
    }
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

      ElMessage.success(`GuidePix 项目保存位置：${root}`)
      return root
    }
    catch (error) {
      console.warn('[documentation] Failed to choose workspace root:', error)
      ElMessage.warning('保存位置设置暂不可用，将继续使用默认目录')
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
      'guidepix-session-start',
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
      'guidepix-session-get',
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
        ElMessage.success('文档模式和勿扰状态已恢复')
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

  async function getPendingCaptures(device) {
    if (!device?.id) {
      return { pendingCount: 0, pending: [] }
    }
    return window.$preload.ipcRenderer.invoke(
      'documentation-phone-batch-status',
      device.id,
    )
  }

  async function captureToPhone(device, { ensureDemoMode = true, notify = true } = {}) {
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

      const queued = await window.$preload.ipcRenderer.invoke(
        'documentation-phone-capture-queue',
        device.id,
      )

      if (notify) {
        ElNotification({
          title: `手机已截图 · 待同步 ${queued.pendingCount} 张`,
          message: '继续按 F8 可连续截图；完成后按 Ctrl+F8 一次同步到电脑。',
          type: 'success',
          duration: 3500,
          position: 'bottom-right',
        })
      }

      return queued
    }
    catch (error) {
      ElMessage.warning(error?.message || String(error))
      return false
    }
    finally {
      loading.value = false
    }
  }

  async function refreshOpenWorkbench(session) {
    if (!workflowStore.visible || !session?.root) {
      return
    }

    const current = workflowStore.session
    if (current?.root && current.root !== session.root) {
      return
    }

    const manifest = await window.$preload.ipcRenderer.invoke(
      'documentation-workflow-get',
      {
        root: session.root,
        session: plainSession(session),
      },
    ).catch(() => null)

    if (manifest) {
      workflowStore.setManifest(manifest)
    }
  }

  async function syncPendingCaptures(
    device,
    { latestOnly = false, notify = true } = {},
  ) {
    if (!device?.id) {
      return false
    }

    loading.value = true
    try {
      const pendingStatus = await getPendingCaptures(device)
      const pending = pendingStatus?.pending || []
      const items = latestOnly ? pending.slice(-1) : pending

      if (!items.length) {
        if (notify) {
          ElMessage.info('没有待同步的手机截图')
        }
        return []
      }

      const workspaceRoot = await getWorkspaceRoot(device)
      const results = []

      for (const item of items) {
        const capture = await window.$preload.ipcRenderer.invoke(
          'guidepix-prepare-capture',
          {
            saveRoot: workspaceRoot,
            deviceId: device.id,
            deviceName: getDeviceName(device),
          },
        )

        const pulled = await window.$preload.ipcRenderer.invoke(
          'documentation-phone-pull',
          {
            deviceId: device.id,
            remotePath: item.remotePath,
            savePath: capture.originalPath,
            cleanupDeviceCopy: true,
          },
        )

        results.push({
          ...capture,
          ...pulled,
          captureBackend: 'phone-native',
        })
        documentationStore.setStatus(device.id, { captureSession: capture })
      }

      const last = results[results.length - 1]
      if (last) {
        await refreshOpenWorkbench(last)
      }

      if (notify && last) {
        ElNotification({
          title: `已同步 ${results.length} 张到电脑`,
          message: `项目目录：${last.root}\n点击打开`,
          type: 'success',
          duration: 8000,
          position: 'bottom-right',
          onClick: () => {
            window.$preload.ipcRenderer.invoke(
              'documentation-reveal-path',
              last.root,
            ).catch(() => {})
          },
        })
      }

      return results
    }
    catch (error) {
      ElNotification({
        title: '同步手机截图失败',
        message: error?.message || String(error),
        type: 'warning',
        duration: 9000,
        position: 'bottom-right',
      })
      return false
    }
    finally {
      loading.value = false
    }
  }

  async function captureOriginal(device, options = {}) {
    return captureToPhone(device, options)
  }

  async function captureAndAnnotate(device) {
    const queued = await captureToPhone(device, { notify: false })
    if (!queued) {
      return false
    }

    const results = await syncPendingCaptures(device, {
      latestOnly: true,
      notify: false,
    })
    const capture = results?.[results.length - 1]
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
      ElMessage.info('当前还没有 GuidePix 项目目录')
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
    getPendingCaptures,
    captureToPhone,
    syncPendingCaptures,
    captureOriginal,
    captureAndAnnotate,
    openProject,
    openSessionFolder,
  }
}

export default useDocumentationAction
