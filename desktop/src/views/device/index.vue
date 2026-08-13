<template>
  <div class="guidepix-device-page">
    <header class="guidepix-device-header">
      <div class="flex items-center gap-4 min-w-0">
        <div class="guidepix-home-logo">
          <i class="i-bi-phone"></i>
          <span>1</span>
        </div>
        <div class="min-w-0">
          <div class="flex items-center gap-3">
            <h1>GuidePix</h1>
            <el-tag size="small" effect="plain" type="info">Guide Studio</el-tag>
          </div>
          <p>连接手机、连续截图、标注步骤，再直接生成可发布的操作指南。</p>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <WirelessGroup ref="wirelessGroupRef" v-bind="{ handleRefresh }" @auto-connected="onAutoConnected" />
        <el-button :loading="loading" :icon="loading ? '' : 'Refresh'" @click="handleRefresh">
          刷新设备
        </el-button>
      </div>
    </header>

    <main class="guidepix-device-main">
      <div v-if="loading && !deviceList.length" class="guidepix-loading-state">
        <el-skeleton :rows="5" animated />
      </div>

      <div v-else-if="!deviceList.length" class="guidepix-device-empty">
        <div class="guidepix-empty-phone"><i class="i-bi-phone"></i></div>
        <h2>连接一台 Android 手机开始</h2>
        <p>开启 USB 调试并允许当前电脑后，GuidePix 会自动发现设备。</p>
        <el-button type="primary" :loading="loading" @click="handleRefresh">重新检测</el-button>
      </div>

      <div v-else class="guidepix-device-grid">
        <article
          v-for="row in deviceList"
          :key="row.id"
          class="guidepix-device-card"
          :class="{ 'is-offline': row.status === 'offline' }"
        >
          <div class="guidepix-device-card-head">
            <div class="flex items-center gap-3 min-w-0">
              <DevicePopover :key="row.status" :device="row" />
              <div class="min-w-0">
                <div class="flex items-center gap-2 min-w-0">
                  <h2 class="truncate">{{ deviceTitle(row) }}</h2>
                  <i v-if="row.wifi" class="i-bi-wifi text-primary-500 flex-none"></i>
                </div>
                <div class="text-xs text-gray-500 truncate mt-1" :title="row.id">
                  {{ row.model || row.name || 'Android Device' }} · {{ row.id }}
                </div>
              </div>
            </div>
            <div class="flex items-center gap-2 flex-none">
              <el-tag :type="statusType(row.status)" effect="light">
                {{ statusText(row.status) }}
              </el-tag>
              <MoreDropdown
                v-if="row.status === 'device'"
                v-bind="{ row, toggleRowExpansion: toggleTools }"
              />
            </div>
          </div>

          <template v-if="['device', 'unauthorized'].includes(row.status)">
            <div class="guidepix-primary-actions">
              <el-button
                class="guidepix-big-action guidepix-big-action--mirror"
                type="primary"
                :loading="mirrorLoading[row.id]"
                :disabled="row.status !== 'device'"
                @click="startMirror(row)"
              >
                <i class="i-bi-display text-xl"></i>
                <span>
                  <strong>打开投屏</strong>
                  <small>控制手机</small>
                </span>
              </el-button>

              <Documentation :device="row">
                <template #default="{ loading: docLoading, active, trigger }">
                  <el-button
                    class="guidepix-big-action"
                    :type="active ? 'success' : 'default'"
                    :loading="docLoading"
                    :disabled="row.status !== 'device'"
                    @click="trigger"
                  >
                    <i class="i-bi-journal-check text-xl"></i>
                    <span>
                      <strong>{{ active ? '文档模式已开' : '开启文档模式' }}</strong>
                      <small>{{ active ? 'Demo + 勿扰' : '清理状态栏' }}</small>
                    </span>
                  </el-button>
                </template>
              </Documentation>

              <DocumentCapture :device="row">
                <template #default="{ loading: captureBusy, trigger }">
                  <el-button
                    class="guidepix-big-action"
                    :loading="captureBusy"
                    :disabled="row.status !== 'device'"
                    @click="trigger"
                  >
                    <i class="i-bi-camera-fill text-xl"></i>
                    <span>
                      <strong>截图</strong>
                      <small>F8 · 手机原图</small>
                    </span>
                  </el-button>
                </template>
              </DocumentCapture>

              <Annotate :device="row">
                <template #default="{ loading: annotateBusy, trigger }">
                  <el-button
                    class="guidepix-big-action"
                    :loading="annotateBusy"
                    :disabled="row.status !== 'device'"
                    @click="trigger"
                  >
                    <i class="i-bi-pencil-square text-xl"></i>
                    <span>
                      <strong>截图并标注</strong>
                      <small>Shift+F8</small>
                    </span>
                  </el-button>
                </template>
              </Annotate>
            </div>

            <el-button
              class="guidepix-workbench-launch"
              type="primary"
              plain
              size="large"
              :disabled="row.status !== 'device'"
              :loading="workbenchLoading[row.id]"
              @click="openWorkbench(row)"
            >
              <i class="i-bi-layout-wtf mr-2 text-lg"></i>
              <span class="font-semibold">打开 GuidePix 工作台</span>
              <span class="ml-2 opacity-70">截图 → 标注 → 合集</span>
              <i class="i-bi-arrow-right ml-auto"></i>
            </el-button>

            <div class="guidepix-card-secondary">
              <button class="guidepix-secondary-button" @click="toggleTools(row)">
                <i class="i-bi-sliders"></i>
                更多手机工具
                <i :class="expandedTools.has(row.id) ? 'i-bi-chevron-up' : 'i-bi-chevron-down'"></i>
              </button>
              <WirelessAction
                v-if="['device', 'unauthorized'].includes(row.status)"
                v-bind="{ row, handleConnect, handleRefresh }"
              />
            </div>

            <transition name="el-zoom-in-top">
              <div v-if="expandedTools.has(row.id)" class="guidepix-more-tools">
                <ControlBar
                  :device="row"
                  :swapy-enabled="true"
                  :button-height="52"
                  button-class="!min-w-12 !w-12 !max-w-12"
                />
                <div class="text-xs text-gray-500 px-2 py-2">
                  Home、返回、旋转、音量、文件、终端、安装 APK 等原 Escrcpy 能力都保留在这里。
                </div>
              </div>
            </transition>
          </template>

          <div v-else class="guidepix-offline-actions">
            <ConnectAction
              v-if="row.wifi"
              v-bind="{ device: row, handleConnect }"
            />
            <RemoveAction
              v-bind="{ device: row, handleRefresh }"
            />
          </div>
        </article>
      </div>
    </main>

    <footer class="guidepix-device-footer">
      <span>{{ deviceList.length }} 台设备</span>
      <span v-if="connectedCount">· {{ connectedCount }} 台可用</span>
      <span class="ml-auto">F8 截图 · Shift+F8 截图并标注</span>
    </footer>
  </div>
</template>

<script setup>
import { sleep } from '$/utils/index.js'
import { openFloatControl } from '$/utils/device/index.js'
import ControlBar from '$/components/control-bar/index.vue'
import Documentation from '$/components/control-bar/documentation/index.vue'
import DocumentCapture from '$/components/control-bar/document-capture/index.vue'
import Annotate from '$/components/control-bar/annotate/index.vue'
import MoreDropdown from './components/more-dropdown/index.vue'
import WirelessAction from './components/wireless-action/index.vue'
import ConnectAction from './components/connect-action/index.vue'
import RemoveAction from './components/remove-action/index.vue'
import WirelessGroup from './components/wireless-group/index.vue'
import DevicePopover from './components/device-popover/index.vue'
import { getDictLabel } from '$/dicts/helper'

const deviceStore = useDeviceStore()
const preferenceStore = usePreferenceStore()
const workflowStore = useDocumentationWorkflowStore()
const documentationStore = useDocumentationStore()
const {
  getStatus,
  enter: enterDocumentation,
  getCaptureSession,
  getWorkspaceRoot,
} = useDocumentationAction()

const loading = ref(false)
const deviceList = computed(() => deviceStore.list)
const connectedCount = computed(() => deviceList.value.filter(item => item.status === 'device').length)
const wirelessGroupRef = ref(null)
const expandedTools = reactive(new Set())
const mirrorLoading = reactive({})
const workbenchLoading = reactive({})
const app = getCurrentInstance()

function deviceTitle(row) {
  return row.remark || row.name || row.model || row.id || 'Android Device'
}

function statusText(status) {
  return window.t(getDictLabel('deviceStatus', status)) || status || '-'
}

function statusType(status) {
  return getDictLabel('deviceStatus', status, { labelKey: 'tagType' }) || 'info'
}

async function startMirror(row) {
  if (!row?.id || row.status !== 'device') {
    return
  }
  mirrorLoading[row.id] = true
  try {
    const args = preferenceStore.scrcpyParameter(row.id)
    await app.proxy.$scrcpy.mirror(row.id, {
      title: deviceStore.getLabel(row, 'mirror'),
      args,
      resolveOnReady: true,
    })
    openFloatControl(toRaw(row))
  }
  catch (error) {
    if (error?.message) {
      ElMessage.warning(error.message)
    }
  }
  finally {
    mirrorLoading[row.id] = false
  }
}

async function openWorkbench(row) {
  if (!row?.id || row.status !== 'device') {
    return
  }
  workbenchLoading[row.id] = true
  try {
    const status = await getStatus(row).catch(() => null)
    if (!status?.active && !status?.tracked) {
      await enterDocumentation(row, { silent: true })
    }

    let session = await getCaptureSession(row).catch(() => null)
    if (!session) {
      const saveRoot = await getWorkspaceRoot(row)
      session = await window.$preload.ipcRenderer.invoke(
        'documentation-session-start',
        {
          deviceId: row.id,
          deviceName: deviceTitle(row),
          saveRoot,
        },
      )
      documentationStore.setStatus(row.id, { captureSession: session })
    }

    workflowStore.open({ device: row, session, tab: 'capture' })
  }
  catch (error) {
    ElMessage.warning(error?.message || String(error))
  }
  finally {
    workbenchLoading[row.id] = false
  }
}

function toggleTools(row) {
  if (!row?.id) {
    return
  }
  if (expandedTools.has(row.id)) {
    expandedTools.delete(row.id)
  }
  else {
    expandedTools.add(row.id)
  }
}

async function getDeviceData(options = {}) {
  const { unloading = false } = options
  if (!unloading) {
    loading.value = true
  }
  try {
    await deviceStore.getList()
  }
  catch (error) {
    const message = error?.message || error?.cause?.message || ''
    console.warn('Device list fetch error:', message)
    if (message.includes('failed to start daemon')) {
      await sleep(600)
      return getDeviceData(options)
    }
    if (message) {
      ElMessage.warning(message)
    }
    deviceStore.list = []
  }
  finally {
    loading.value = false
  }
}

async function handleRefresh() {
  loading.value = true
  await sleep()
  return getDeviceData({ unloading: true })
}

function handleConnect(...args) {
  wirelessGroupRef.value?.connect?.(...args)
}

function onAutoConnected() {}

async function onAdbWatch(type, ret) {
  if (ret?.id) {
    await sleep(700)
    await getDeviceData({ unloading: true })
  }
}

let unAdbWatch = null

onMounted(async () => {
  await getDeviceData()
  unAdbWatch = await window.$preload.adb.watch(onAdbWatch)

  if (preferenceStore.data.autoMirror) {
    for (const row of deviceList.value.filter(item => item.status === 'device')) {
      startMirror(row)
      await sleep(250)
    }
  }
})

onBeforeUnmount(() => {
  unAdbWatch?.()
})

onActivated(() => {
  getDeviceData({ unloading: true })
})
</script>

<style lang="postcss" scoped>
.guidepix-device-page { @apply h-full flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-950; }
.guidepix-device-header { @apply flex-none flex items-center justify-between gap-5 px-6 py-5 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950; }
.guidepix-device-header h1 { @apply text-2xl font-bold text-gray-900 dark:text-white; }
.guidepix-device-header p { @apply text-sm text-gray-500 mt-1; }
.guidepix-home-logo {
  @apply relative flex-none w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-sm;
  background: linear-gradient(145deg, #2563eb, #14b8a6);
}
.guidepix-home-logo > i { @apply text-3xl; }
.guidepix-home-logo > span { @apply absolute right-1.5 bottom-1.5 w-5 h-5 rounded-full bg-white text-primary-600 flex items-center justify-center text-[10px] font-bold; }
.guidepix-device-main { @apply flex-1 min-h-0 overflow-auto px-6 py-6; }
.guidepix-device-grid { @apply grid gap-5 max-w-[1500px] mx-auto; grid-template-columns: repeat(auto-fit, minmax(520px, 1fr)); }
.guidepix-device-card { @apply rounded-3xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm; }
.guidepix-device-card.is-offline { @apply opacity-70; }
.guidepix-device-card-head { @apply flex items-center justify-between gap-4 mb-5; }
.guidepix-device-card-head h2 { @apply text-xl font-semibold text-gray-900 dark:text-white; }
.guidepix-primary-actions { @apply grid gap-3; grid-template-columns: repeat(4, minmax(0, 1fr)); }
:deep(.guidepix-big-action.el-button) {
  @apply !h-20 !rounded-2xl !mx-0 !px-3 flex-col !gap-1;
}
:deep(.guidepix-big-action.el-button > span) { @apply flex flex-col items-center gap-0.5 leading-tight; }
:deep(.guidepix-big-action.el-button strong) { @apply text-sm font-semibold; }
:deep(.guidepix-big-action.el-button small) { @apply text-[11px] opacity-65 font-normal; }
.guidepix-big-action--mirror { box-shadow: 0 8px 20px rgba(37,99,235,.12); }
.guidepix-workbench-launch { @apply !w-full !h-12 !rounded-2xl !mt-3 !justify-start !px-5; }
.guidepix-card-secondary { @apply flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-gray-800; }
.guidepix-secondary-button { @apply flex items-center gap-2 text-sm text-gray-500 hover:text-primary-500; }
.guidepix-more-tools { @apply mt-3 rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700; }
.guidepix-offline-actions { @apply flex items-center gap-2 justify-end; }
.guidepix-device-empty { @apply max-w-2xl mx-auto h-full min-h-96 flex flex-col items-center justify-center text-center; }
.guidepix-device-empty h2 { @apply text-xl font-semibold mt-4; }
.guidepix-device-empty p { @apply text-sm text-gray-500 mt-2 mb-5; }
.guidepix-empty-phone { @apply w-20 h-20 rounded-3xl bg-primary-50 dark:bg-gray-900 flex items-center justify-center text-primary-500 text-4xl; }
.guidepix-loading-state { @apply max-w-5xl mx-auto mt-10; }
.guidepix-device-footer { @apply flex-none px-6 py-2.5 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 text-xs text-gray-500 flex items-center; }
@media (max-width: 900px) {
  .guidepix-device-header { @apply items-start flex-col; }
  .guidepix-device-grid { grid-template-columns: 1fr; }
  .guidepix-primary-actions { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
