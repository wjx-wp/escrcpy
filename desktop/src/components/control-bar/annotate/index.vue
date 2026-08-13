<template>
  <slot v-bind="{ loading }" :trigger="() => captureAndAnnotate(device)" />
</template>

<script setup>
defineOptions({ inheritAttrs: false })

const props = defineProps({
  device: {
    type: Object,
    default: () => ({}),
  },
})

const { loading, captureAndAnnotate } = useDocumentationAction()
</script>
