export const useDocumentationStore = defineStore('documentation-mode', () => {
  const statuses = ref({})

  function setStatus(deviceId, status = {}) {
    if (!deviceId) {
      return
    }

    statuses.value = {
      ...statuses.value,
      [deviceId]: {
        ...(statuses.value[deviceId] || {}),
        ...status,
      },
    }
  }

  function clearStatus(deviceId) {
    if (!deviceId || !statuses.value[deviceId]) {
      return
    }

    const value = { ...statuses.value }
    delete value[deviceId]
    statuses.value = value
  }

  function getStatus(deviceId) {
    return statuses.value[deviceId] || null
  }

  function isActive(deviceId) {
    const status = getStatus(deviceId)
    return Boolean(status?.active || status?.tracked)
  }

  function getActiveDeviceIds() {
    return Object.entries(statuses.value)
      .filter(([, status]) => Boolean(status?.active || status?.tracked))
      .map(([deviceId]) => deviceId)
  }

  return {
    statuses,
    setStatus,
    clearStatus,
    getStatus,
    isActive,
    getActiveDeviceIds,
  }
})
