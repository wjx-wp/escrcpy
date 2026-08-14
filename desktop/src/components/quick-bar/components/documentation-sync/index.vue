<template>
  <slot v-bind="{ loading }" :trigger="syncNow" />
</template>

<script setup>
const deviceStore = useDeviceStore()
const documentationStore = useDocumentationStore()
const { loading, syncPendingCaptures } = useDocumentationAction()

function getActiveDevice() {
  const ids = documentationStore.getActiveDeviceIds()
  if (!ids.length) {
    ElMessage.info('请先开启文档模式')
    return null
  }
  if (ids.length > 1) {
    ElMessage.warning('有多台设备处于文档模式，请先保留一台')
    return null
  }
  return deviceStore.list.find(item => item.id === ids[0]) || null
}

async function syncNow() {
  const device = getActiveDevice()
  if (!device) {
    return
  }
  await syncPendingCaptures(device)
}
</script>
