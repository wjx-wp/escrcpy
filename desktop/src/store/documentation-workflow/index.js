export const useDocumentationWorkflowStore = defineStore('documentation-workflow', () => {
  const visible = ref(false)
  const device = shallowRef(null)
  const session = shallowRef(null)
  const manifest = ref(null)
  const tab = ref('capture')
  const selectedIds = ref([])
  const composeVariantMap = ref({})

  function open(payload = {}) {
    device.value = payload.device ? markRaw(toRaw(payload.device)) : null
    session.value = payload.session ? markRaw({ ...toRaw(payload.session) }) : null
    tab.value = payload.tab || 'capture'
    visible.value = true
  }

  function close() {
    visible.value = false
    manifest.value = null
    selectedIds.value = []
    composeVariantMap.value = {}
  }

  function setManifest(value) {
    manifest.value = value || null
    if (!value?.shots?.length) {
      selectedIds.value = []
      return
    }

    const known = new Set(value.shots.map(item => item.id))
    selectedIds.value = selectedIds.value.filter(id => known.has(id))
    if (!selectedIds.value.length) {
      selectedIds.value = value.shots.map(item => item.id)
    }

    const nextMap = { ...composeVariantMap.value }
    value.shots.forEach((shot) => {
      const valid = new Set(shot.variants.map(item => item.id))
      if (!valid.has(nextMap[shot.id])) {
        const completed = shot.variants.find(item => item.hasOutput)
        nextMap[shot.id] = completed?.id || shot.variants[0]?.id || shot.id
      }
    })
    composeVariantMap.value = nextMap
  }

  function setTab(value) {
    tab.value = value
  }

  function toggleSelected(id, checked) {
    const set = new Set(selectedIds.value)
    if (checked) {
      set.add(id)
    }
    else {
      set.delete(id)
    }
    selectedIds.value = [...set]
  }

  function selectAll() {
    selectedIds.value = manifest.value?.shots?.map(item => item.id) || []
  }

  function clearSelection() {
    selectedIds.value = []
  }

  return {
    visible,
    device,
    session,
    manifest,
    tab,
    selectedIds,
    composeVariantMap,
    open,
    close,
    setManifest,
    setTab,
    toggleSelected,
    selectAll,
    clearSelection,
  }
})
