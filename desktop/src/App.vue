<template>
  <el-config-provider :locale="locale" :size="size">
    <Layouts />
    <AnnotationEditor />
    <DocumentationWorkbench />
    <DocumentationSyncDock />
  </el-config-provider>
</template>

<script setup>
import './components/annotation-editor/fabric-compat.js'
import Layouts from './layouts/index.vue'
import AnnotationEditor from './components/annotation-editor/index.vue'
import DocumentationSyncDock from './components/documentation-sync-dock/index.vue'
import DocumentationWorkbench from './components/documentation-workbench/index.vue'

const router = useRouter()
const deviceStore = useDeviceStore()
const documentationStore = useDocumentationStore()
const {
  captureOriginal,
  captureAndAnnotate,
  syncPendingCaptures,
} = useDocumentationAction()

const { locale, size } = useWindowStateSync()

const documentationShortcuts = [
  { id: 'documentation-capture', accelerator: 'F8' },
  { id: 'documentation-sync', accelerator: 'Ctrl+F8' },
  { id: 'documentation-annotate', accelerator: 'Shift+F8' },
]

window.$preload.ipcRenderer.on('quit-before', async () => {
  ElLoading.service({
    lock: true,
    text: window.t('appClose.quit.loading'),
  })
})

const startApp = useStartApp()

window.$preload.ipcRenderer.on('execute-arguments-change', async (event, params) => {
  startApp.open(params)
})

window.$preload.ipcRenderer.on('navigate-to-route', (event, route) => {
  router.push(route)
})

onMounted(async () => {
  showTips()
  startApp.open()
  await registerDocumentationShortcuts()
  window.$preload.ipcRenderer.on('shortcut-triggered', handleDocumentationShortcut)
})

onBeforeUnmount(async () => {
  window.$preload.ipcRenderer.removeListener(
    'shortcut-triggered',
    handleDocumentationShortcut,
  )

  for (const shortcut of documentationShortcuts) {
    await window.$preload.ipcRenderer.invoke(
      'shortcut-unregister',
      shortcut.id,
    ).catch(() => {})
  }
})

async function registerDocumentationShortcuts() {
  for (const shortcut of documentationShortcuts) {
    const result = await window.$preload.ipcRenderer.invoke(
      'shortcut-register',
      shortcut,
    ).catch(error => ({ success: false, error: error?.message || error }))

    if (!result?.success) {
      console.warn(
        `[documentation] Failed to register ${shortcut.accelerator}:`,
        result?.error,
      )
    }
  }
}

function getDocumentationDevice() {
  const deviceIds = documentationStore.getActiveDeviceIds()

  if (!deviceIds.length) {
    ElMessage.warning('请先为一台设备开启文档模式')
    return null
  }

  if (deviceIds.length > 1) {
    ElMessage.warning('当前有多台设备处于文档模式，请只保留一台后再使用快捷键')
    return null
  }

  const device = deviceStore.list.find(item => item.id === deviceIds[0])
  if (!device) {
    ElMessage.warning('文档模式设备当前不可用')
    return null
  }

  return device
}

async function handleDocumentationShortcut(event, id) {
  if (![
    'documentation-capture',
    'documentation-sync',
    'documentation-annotate',
  ].includes(id)) {
    return
  }

  const device = getDocumentationDevice()
  if (!device) {
    return
  }

  if (id === 'documentation-capture') {
    await captureOriginal(device)
    return
  }

  if (id === 'documentation-sync') {
    await syncPendingCaptures(device)
    return
  }

  await captureAndAnnotate(device)
}

async function showTips() {
  const { getScrcpyPath } = window.$preload.configs || {}

  const scrcpyPath = getScrcpyPath?.({ store: window.$preload.store })

  if (scrcpyPath) {
    return false
  }

  ElMessageBox.alert(
    `<div>
      ${window.t('dependencies.lack.content', {
        name: '<a class="hover:underline text-primary-500" href="https://github.com/Genymobile/scrcpy" target="_blank">scrcpy</a>',
      })}
    <div>`,
    window.t('dependencies.lack.title'),
    {
      dangerouslyUseHTMLString: true,
    },
  )
}
</script>

<style lang="postcss">
</style>
