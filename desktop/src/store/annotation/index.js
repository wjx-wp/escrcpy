export const useAnnotationStore = defineStore('annotation-workbench', () => {
  const visible = ref(false)
  const capture = ref(null)

  function open(payload) {
    capture.value = payload
    visible.value = true
  }

  function close() {
    visible.value = false
    capture.value = null
  }

  return {
    visible,
    capture,
    open,
    close,
  }
})
