<template>
  <slot v-bind="{ loading }" :trigger="chooseWorkspace" />
</template>

<script setup>
const { loading, chooseWorkspaceRoot } = useDocumentationAction()

async function chooseWorkspace() {
  await chooseWorkspaceRoot()
}
</script>
