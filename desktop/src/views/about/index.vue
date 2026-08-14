<template>
  <div class="h-full">
    <div class="h-full flex flex-col items-center justify-center space-y-[3vh] -mt-[3vh]">
      <a class="block" :href="homepage" target="_blank">
        <img
          src="$electron/resources/build/logo.svg"
          class="h-[28vh] max-h-64 drop-shadow-lg"
          alt="GuidePix"
        />
      </a>

      <div class="text-center">
        <div class="text-3xl font-bold text-gray-900 dark:text-white">
          GuidePix
        </div>
        <div class="mt-2 text-base text-gray-500">
          Capture · Annotate · Compose
        </div>
      </div>

      <div class="max-w-xl text-center text-sm leading-7 text-gray-500 px-6">
        把手机上的一次操作，直接变成清晰、可修改、可发布的步骤指南。
      </div>

      <div class="pt-[2vh]">
        <el-button
          :loading="loading"
          type="primary"
          :size="$grid.lg ? 'large' : 'default'"
          @click="handleUpdate"
        >
          {{
            loading && percent
              ? `${$t("about.update.progress")}...（${percent.toFixed(1)}%）`
              : $t("about.update")
          }}
        </el-button>

        <el-button :size="$grid.lg ? 'large' : 'default'" @click="openRepository">
          GitHub
        </el-button>
      </div>

      <div class="text-xs text-gray-500 text-center leading-6">
        <div>GuidePix v{{ version }}</div>
        <div>
          Based on
          <a
            class="hover:underline text-primary-500"
            href="https://github.com/viarotel-org/escrcpy"
            target="_blank"
          >Escrcpy</a>
          · Powered by scrcpy &amp; Fabric.js
        </div>
      </div>
    </div>

    <UpdateDialog ref="updateDialogRef" />
  </div>
</template>

<script setup>
import { homepage, version } from '/package.json'
import UpdateDialog from './components/update-dialog/index.vue'

const loading = ref(false)
const percent = ref(0)
const updateDialogRef = ref()

function openRepository() {
  window.open(homepage)
}

function handleUpdate() {
  loading.value = true
  window.$preload.ipcRenderer.send('check-for-update')
}

function onUpdateNotAvailable() {
  window.$preload.ipcRenderer.on('update-not-available', () => {
    loading.value = false
    ElMessage.success(window.t('about.update-not-available'))
  })
}

function onDownloadProgress() {
  window.$preload.ipcRenderer.on('download-progress', (event, ret) => {
    percent.value = ret.percent
  })
}

function onUpdateDownloaded() {
  window.$preload.ipcRenderer.on('update-downloaded', async () => {
    loading.value = false
    try {
      await ElMessageBox.confirm(
        window.t('about.update-downloaded.message'),
        window.t('about.update-downloaded.title'),
        {
          confirmButtonText: window.t('about.update-downloaded.confirm'),
          cancelButtonText: window.t('common.cancel'),
          closeOnClickModal: false,
        },
      )
      window.$preload.ipcRenderer.send('quit-and-install')
    }
    catch (error) {
      console.warn(error.message)
    }
  })
}

function onUpdateError() {
  window.$preload.ipcRenderer.on('update-error', async (_, ret) => {
    loading.value = false
    ElMessage.warning(ret?.message || window.t('about.update-error.message'))
  })
}

function onUpdateAvailable() {
  window.$preload.ipcRenderer.on('update-available', async (_, ret) => {
    loading.value = false

    updateDialogRef.value.open({
      releaseNotes: ret.releaseNotes,
      onConfirm() {
        window.$preload.ipcRenderer.send('download-update')
        loading.value = true
      },
    })
  })
}

onMounted(() => {
  onUpdateNotAvailable()
  onUpdateAvailable()
  onDownloadProgress()
  onUpdateDownloaded()
  onUpdateError()
})
</script>

<style></style>
