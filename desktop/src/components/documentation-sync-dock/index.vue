<template>
  <Transition name="guidepix-sync-dock">
    <div
      v-if="activeDevice && pendingCount > 0"
      class="guidepix-sync-dock"
    >
      <div class="guidepix-sync-dock__icon">
        <i class="i-bi-images"></i>
        <span>{{ pendingCount }}</span>
      </div>
      <div class="min-w-0 flex-1">
        <strong>手机已截 {{ pendingCount }} 张</strong>
        <div class="text-xs opacity-70 mt-0.5">还在手机上，完成流程后一次同步</div>
      </div>
      <el-button
        type="primary"
        :loading="syncing"
        @click="syncNow"
      >
        <i class="i-bi-cloud-arrow-down mr-1"></i>
        同步到电脑
      </el-button>
    </div>
  </Transition>
</template>

<script setup>
const deviceStore = useDeviceStore()
const documentationStore = useDocumentationStore()
const { syncPendingCaptures } = useDocumentationAction()

const pendingCount = ref(0)
const syncing = ref(false)
let timer = null

const activeDevice = computed(() => {
  const ids = documentationStore.getActiveDeviceIds()
  if (ids.length !== 1) {
    return null
  }
  return deviceStore.list.find(item => item.id === ids[0]) || null
})

async function refreshPending() {
  const device = activeDevice.value
  if (!device?.id || syncing.value) {
    pendingCount.value = 0
    return
  }

  const status = await window.$preload.ipcRenderer.invoke(
    'documentation-phone-batch-status',
    device.id,
  ).catch(() => null)

  pendingCount.value = Number(status?.pendingCount || 0)
}

async function syncNow() {
  const device = activeDevice.value
  if (!device) {
    return
  }

  syncing.value = true
  try {
    await syncPendingCaptures(device)
  }
  finally {
    syncing.value = false
    await refreshPending()
  }
}

watch(
  () => activeDevice.value?.id,
  () => refreshPending(),
)

onMounted(() => {
  refreshPending()
  timer = window.setInterval(refreshPending, 800)
})

onBeforeUnmount(() => {
  if (timer) {
    window.clearInterval(timer)
  }
})
</script>

<style scoped>
.guidepix-sync-dock {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 5000;
  display: flex;
  align-items: center;
  gap: 12px;
  width: min(440px, calc(100vw - 48px));
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--el-color-primary) 24%, transparent);
  border-radius: 16px;
  background: color-mix(in srgb, var(--el-bg-color-overlay) 94%, transparent);
  box-shadow: 0 16px 46px rgb(15 23 42 / 18%);
  backdrop-filter: blur(18px);
}

.guidepix-sync-dock__icon {
  position: relative;
  display: grid;
  flex: none;
  width: 42px;
  height: 42px;
  place-items: center;
  border-radius: 12px;
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  font-size: 20px;
}

.guidepix-sync-dock__icon span {
  position: absolute;
  top: -6px;
  right: -6px;
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  border-radius: 10px;
  color: white;
  background: var(--el-color-primary);
  font-size: 11px;
  font-weight: 700;
  line-height: 20px;
  text-align: center;
}

.guidepix-sync-dock-enter-active,
.guidepix-sync-dock-leave-active {
  transition: all 180ms ease;
}

.guidepix-sync-dock-enter-from,
.guidepix-sync-dock-leave-to {
  opacity: 0;
  transform: translateY(12px) scale(0.98);
}
</style>
