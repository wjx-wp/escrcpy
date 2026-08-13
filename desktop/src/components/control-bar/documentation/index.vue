<template>
  <slot v-bind="{ loading, active }" :trigger="() => handleToggle(device)" />
</template>

<script setup>
defineOptions({ inheritAttrs: false })

const props = defineProps({
  device: {
    type: Object,
    default: () => ({}),
  },
})

const {
  documentationStore,
  loading,
  getStatus,
  toggle: handleToggle,
} = useDocumentationAction()

const active = computed(() => documentationStore.isActive(props.device?.id))

watch(
  () => props.device?.id,
  (deviceId) => {
    if (!deviceId) {
      return
    }
    getStatus(props.device).catch(() => {})
  },
  { immediate: true },
)
</script>
