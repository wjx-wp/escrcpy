<template>
  <slot v-bind="{ loading }" :trigger="() => captureOriginal(device)" />
</template>

<script setup>
defineOptions({ inheritAttrs: false })

const props = defineProps({
  device: {
    type: Object,
    default: () => ({}),
  },
})

const { loading, captureOriginal } = useDocumentationAction()
</script>
