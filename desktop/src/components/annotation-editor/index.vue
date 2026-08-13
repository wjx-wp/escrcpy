<template>
  <el-dialog
    v-model="dialogVisible"
    fullscreen
    append-to-body
    destroy-on-close
    :close-on-click-modal="false"
    :show-close="false"
    class="documentation-editor-dialog"
    @closed="editor.dispose"
  >
    <template #header>
      <div class="h-13 flex items-center gap-2 px-2">
        <el-button text :icon="ArrowLeft" @click="editor.close">
          返回
        </el-button>

        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 min-w-0">
            <div class="font-medium truncate">
              {{ capture?.baseName || '-' }}.png
            </div>
            <el-tag
              v-if="capture?.projectData"
              size="small"
              type="success"
              effect="plain"
            >
              已载入工程
            </el-tag>
            <el-tag
              v-if="editor.dirty"
              size="small"
              type="warning"
              effect="plain"
            >
              未保存
            </el-tag>
          </div>
          <div class="text-xs text-gray-500 truncate" :title="capture?.root">
            {{ capture?.deviceName || capture?.deviceId || 'Documentation' }}
            <span v-if="capture?.root"> · {{ capture.root }}</span>
          </div>
        </div>

        <el-button
          v-if="capture?.root"
          text
          title="打开当前会话目录"
          @click="editor.revealRoot"
        >
          <i class="i-bi-folder2-open mr-1"></i>
          目录
        </el-button>
        <el-button
          text
          title="设置以后 F8 文档截图的保存目录"
          @click="chooseCaptureWorkspace"
        >
          <i class="i-bi-folder-symlink mr-1"></i>
          设置目录
        </el-button>
        <el-button :disabled="!editor.ready" @click="editor.saveProject()">
          保存工程
        </el-button>
        <el-button
          type="primary"
          :disabled="!editor.ready"
          @click="editor.exportPng()"
        >
          导出 PNG
        </el-button>
      </div>
    </template>

    <div class="h-full flex flex-col overflow-hidden bg-gray-100 dark:bg-gray-950">
      <div class="flex-none px-3 pt-2">
        <div
          class="documentation-toolbar flex items-center gap-1 px-2 py-1.5 overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-900/95 shadow-sm"
        >
          <el-button-group>
            <el-button
              v-for="item in editor.tools"
              :key="item.value"
              :type="editor.tool === item.value ? 'primary' : 'default'"
              :title="`${item.label} (${item.hotkey})`"
              @click="editor.setTool(item.value)"
              @contextmenu.prevent="item.value === 'step' && editor.resetStepCounter()"
            >
              <i :class="item.icon"></i>
              <span class="ml-1 hidden 2xl:inline">{{ item.label }}</span>
            </el-button>
          </el-button-group>

          <el-button
            :loading="editor.smartLoading"
            :type="editor.tool === 'smart' ? 'primary' : 'default'"
            title="智能框选：读取 Android UI 结构并吸附控件"
            @click="editor.setTool('smart')"
          >
            <i v-if="!editor.smartLoading" class="i-bi-magic"></i>
            <span class="ml-1 hidden 2xl:inline">智能框选</span>
          </el-button>

          <div class="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-1"></div>

          <div class="flex items-center gap-1 px-1" title="标注颜色">
            <el-color-picker
              v-model="editor.color"
              size="small"
              :predefine="editor.presetColors"
              @change="editor.applyStyleToSelection"
            />
          </div>

          <el-popover placement="bottom" :width="300" trigger="click">
            <template #reference>
              <el-button title="标注参数">
                <i class="i-bi-sliders mr-1"></i>
                {{ editor.strokeWidth }}
              </el-button>
            </template>

            <div class="space-y-4">
              <div>
                <div class="flex justify-between text-xs text-gray-500 mb-1">
                  <span>线条宽度</span><span>{{ editor.strokeWidth }}</span>
                </div>
                <el-slider
                  v-model="editor.strokeWidth"
                  :min="2"
                  :max="16"
                  :step="1"
                  @change="editor.applyStyleToSelection"
                />
              </div>

              <div>
                <div class="flex justify-between text-xs text-gray-500 mb-1">
                  <span>聚光灯遮罩</span><span>{{ editor.spotlightOpacity }}%</span>
                </div>
                <el-slider
                  v-model="editor.spotlightOpacity"
                  :min="20"
                  :max="85"
                  :step="5"
                />
              </div>

              <div>
                <div class="flex justify-between text-xs text-gray-500 mb-1">
                  <span>马赛克颗粒</span><span>{{ editor.mosaicBlockSize }}</span>
                </div>
                <el-slider
                  v-model="editor.mosaicBlockSize"
                  :min="6"
                  :max="32"
                  :step="2"
                />
              </div>

              <div>
                <div class="flex justify-between text-xs text-gray-500 mb-1">
                  <span>放大镜倍率</span><span>{{ editor.magnifierZoom.toFixed(1) }}×</span>
                </div>
                <el-slider
                  v-model="editor.magnifierZoom"
                  :min="1.5"
                  :max="4"
                  :step="0.5"
                />
              </div>

              <div>
                <div class="flex justify-between text-xs text-gray-500 mb-1">
                  <span>无痕修复羽化</span><span>{{ editor.healFeather }} px</span>
                </div>
                <el-slider
                  v-model="editor.healFeather"
                  :min="0"
                  :max="24"
                  :step="1"
                />
              </div>
            </div>
          </el-popover>

          <el-tooltip content="步骤编号；右键可从 1 重新开始" placement="bottom">
            <el-button @click="editor.setTool('step')" @contextmenu.prevent="editor.resetStepCounter">
              <i class="i-bi-123 mr-1"></i>
              {{ editor.stepCounter }}
            </el-button>
          </el-tooltip>

          <div class="flex-1 min-w-2"></div>

          <el-button-group class="flex-none">
            <el-button title="完整适应窗口" @click="fitView">
              适应
            </el-button>
            <el-button title="缩小视图" @click="zoomOut">
              <i class="i-bi-dash-lg"></i>
            </el-button>
            <el-button class="!min-w-16" title="当前视图缩放" @click="fitView">
              {{ Math.round(viewZoom * 100) }}%
            </el-button>
            <el-button title="放大视图" @click="zoomIn">
              <i class="i-bi-plus-lg"></i>
            </el-button>
          </el-button-group>

          <el-button
            :disabled="!editor.canUndo"
            title="撤销 Ctrl+Z"
            @click="editor.undo"
          >
            <i class="i-bi-arrow-counterclockwise"></i>
          </el-button>
          <el-button
            :disabled="!editor.canRedo"
            title="重做 Ctrl+Y"
            @click="editor.redo"
          >
            <i class="i-bi-arrow-clockwise"></i>
          </el-button>
          <el-button
            :disabled="!editor.hasSelection"
            :title="$t('common.delete')"
            @click="editor.deleteSelection"
          >
            <i class="i-bi-trash"></i>
          </el-button>
        </div>
      </div>

      <div
        ref="stageRef"
        class="flex-1 min-h-0 overflow-auto p-4 documentation-canvas-stage"
      >
        <div class="min-h-full min-w-full flex items-center justify-center">
          <div
            class="documentation-canvas-shell shadow-xl"
            :style="{ zoom: viewZoom }"
          >
            <canvas ref="canvasRef"></canvas>
          </div>
        </div>
      </div>

      <div
        class="flex-none flex items-center gap-3 px-3 py-2 text-xs text-gray-500 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-x-auto"
      >
        <el-tag
          size="small"
          effect="plain"
          :type="editor.smartRegions.length ? 'success' : 'info'"
        >
          UI 区域 {{ editor.smartRegions.length }}
        </el-tag>
        <span
          v-if="editor.hoverRegionText"
          class="truncate max-w-80"
          :title="editor.hoverRegionText"
        >
          吸附：{{ editor.hoverRegionText }}
        </span>
        <span v-else>
          {{ editor.sourceWidth }} × {{ editor.sourceHeight }} · 视图 {{ Math.round(viewZoom * 100) }}% · 选择对象后可移动 / 缩放 / 旋转
        </span>
        <span class="ml-auto">F8 截原图</span>
        <span>Shift+F8 截图并标注</span>
        <span>Ctrl+S 保存工程</span>
      </div>
    </div>
  </el-dialog>
</template>

<script setup>
import { ArrowLeft } from '@element-plus/icons-vue'
import { useAnnotationEditor } from './use-editor.js'

const annotationStore = useAnnotationStore()
const canvasRef = ref(null)
const stageRef = ref(null)
const viewZoom = ref(1.25)

const { chooseWorkspaceRoot } = useDocumentationAction()
const capture = computed(() => annotationStore.capture)

const editor = reactive(useAnnotationEditor({
  canvasRef,
  stageRef,
  capture,
  onClose: () => annotationStore.close(),
}))

const dialogVisible = computed({
  get: () => annotationStore.visible,
  set: (value) => {
    if (!value) {
      editor.close()
    }
  },
})

watch(
  () => annotationStore.visible,
  async (visible) => {
    if (!visible) {
      return
    }
    viewZoom.value = 1.25
    await nextTick()
    await editor.init()
  },
)

function fitView() {
  viewZoom.value = 1
}

function zoomIn() {
  viewZoom.value = Math.min(3, Math.round((viewZoom.value + 0.25) * 100) / 100)
}

function zoomOut() {
  viewZoom.value = Math.max(0.75, Math.round((viewZoom.value - 0.25) * 100) / 100)
}

async function chooseCaptureWorkspace() {
  await chooseWorkspaceRoot({
    id: capture.value?.deviceId,
    name: capture.value?.deviceName,
  })
}
</script>

<style lang="postcss">
.documentation-editor-dialog {
  --el-dialog-padding-primary: 0px;
}

.documentation-editor-dialog .el-dialog__header {
  @apply !m-0 !p-0 border-b border-gray-200 dark:border-gray-800;
}

.documentation-editor-dialog .el-dialog__body {
  @apply !p-0;
  height: calc(100vh - 53px);
}

.documentation-toolbar .el-button + .el-button {
  @apply !ml-0;
}

.documentation-canvas-stage {
  background-image:
    linear-gradient(45deg, rgba(148, 163, 184, 0.1) 25%, transparent 25%),
    linear-gradient(-45deg, rgba(148, 163, 184, 0.1) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, rgba(148, 163, 184, 0.1) 75%),
    linear-gradient(-45deg, transparent 75%, rgba(148, 163, 184, 0.1) 75%);
  background-size: 24px 24px;
  background-position:
    0 0,
    0 12px,
    12px -12px,
    -12px 0;
}

.documentation-canvas-shell {
  @apply bg-white flex-none;
  line-height: 0;
  transform-origin: center center;
}
</style>
