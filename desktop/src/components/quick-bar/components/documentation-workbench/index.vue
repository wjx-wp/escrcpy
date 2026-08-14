<template>
  <slot v-bind="{ loading }" :trigger="openWorkbench" />
</template>

<script setup>
const loading = ref(false)
const deviceStore = useDeviceStore()
const documentationStore = useDocumentationStore()
const workflowStore = useDocumentationWorkflowStore()
const { getCaptureSession, getWorkspaceRoot } = useDocumentationAction()

async function openWorkbench() {
  const activeIds = documentationStore.getActiveDeviceIds()
  if (!activeIds.length) {
    ElMessage.warning('请先开启一台设备的文档模式')
    return
  }
  if (activeIds.length > 1) {
    ElMessage.warning('请只保留一台设备处于文档模式后再打开工作台')
    return
  }

  const device = deviceStore.list.find(item => item.id === activeIds[0])
  if (!device) {
    ElMessage.warning('文档模式设备当前不可用')
    return
  }

  loading.value = true
  try {
    let session = await getCaptureSession(device).catch(() => null)
    if (!session) {
      const saveRoot = await getWorkspaceRoot(device)
      session = await window.$preload.ipcRenderer.invoke(
        'documentation-session-start',
        {
          deviceId: device.id,
          deviceName: device.remark || device.name || device.model || device.id,
          saveRoot,
        },
      )
    }

    workflowStore.open({ device, session, tab: 'capture' })
  }
  catch (error) {
    ElMessage.warning(error?.message || String(error))
  }
  finally {
    loading.value = false
  }
}
</script>
