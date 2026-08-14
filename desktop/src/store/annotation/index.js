export const useAnnotationStore = defineStore('annotation-workbench', () => {
  const visible = ref(false)
  const capture = ref(null)
  const queue = ref([])
  const queueIndex = ref(-1)
  const loadingQueue = ref(false)

  const hasQueue = computed(() => queue.value.length > 0)
  const queuePosition = computed(() => queueIndex.value >= 0 ? queueIndex.value + 1 : 0)
  const canPrevious = computed(() => queueIndex.value > 0)
  const canNext = computed(() => queueIndex.value >= 0 && queueIndex.value < queue.value.length - 1)

  function open(payload) {
    queue.value = []
    queueIndex.value = -1
    capture.value = payload
    visible.value = true
  }

  async function loadQueueItem(index) {
    if (index < 0 || index >= queue.value.length) {
      return null
    }

    const item = queue.value[index]
    loadingQueue.value = true
    try {
      const payload = await window.$preload.ipcRenderer.invoke(
        'documentation-workflow-open-item',
        item,
      )
      queueIndex.value = index
      capture.value = payload
      visible.value = true
      return payload
    }
    finally {
      loadingQueue.value = false
    }
  }

  async function openQueue(items = [], index = 0) {
    queue.value = Array.isArray(items) ? items : []
    queueIndex.value = -1
    if (!queue.value.length) {
      return null
    }
    return loadQueueItem(Math.max(0, Math.min(index, queue.value.length - 1)))
  }

  async function move(delta) {
    if (!hasQueue.value) {
      return null
    }
    return loadQueueItem(queueIndex.value + delta)
  }

  function close() {
    visible.value = false
    capture.value = null
    queue.value = []
    queueIndex.value = -1
  }

  return {
    visible,
    capture,
    queue,
    queueIndex,
    queuePosition,
    loadingQueue,
    hasQueue,
    canPrevious,
    canNext,
    open,
    openQueue,
    loadQueueItem,
    move,
    close,
  }
})
