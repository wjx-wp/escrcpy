<template>
  <slot v-bind="{ loading }" :trigger="openProject" />
</template>

<script setup>
const { loading, openProject } = useDocumentationAction()
</script>
