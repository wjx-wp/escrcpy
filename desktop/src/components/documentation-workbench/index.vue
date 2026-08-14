<template>
  <el-dialog
    v-model="dialogVisible"
    fullscreen
    append-to-body
    destroy-on-close
    :close-on-click-modal="false"
    :show-close="false"
    class="guidepix-workbench-dialog"
  >
    <template #header>
      <div class="guidepix-workbench-header">
        <div class="flex items-center gap-3 min-w-0">
          <button class="guidepix-icon-button" title="关闭工作台" @click="closeWorkbench">
            <i class="i-bi-arrow-left"></i>
          </button>
          <div class="guidepix-brand-mark guidepix-brand-mark--small">
            <i class="i-bi-phone"></i>
            <span>1</span>
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <strong class="text-lg leading-none">GuidePix</strong>
              <el-tag v-if="device?.id" size="small" type="success" effect="plain">
                {{ deviceLabel }}
              </el-tag>
            </div>
            <div class="text-xs text-gray-500 mt-1 truncate">
              {{ manifest?.title || '手机操作指南工作台' }}
              <span v-if="manifest?.shots?.length"> · {{ manifest.shots.length }} 张截图</span>
            </div>
          </div>
        </div>

        <div class="guidepix-stage-tabs">
          <button
            v-for="item in tabs"
            :key="item.value"
            class="guidepix-stage-tab"
            :class="{ 'is-active': activeTab === item.value }"
            @click="setTab(item.value)"
          >
            <i :class="item.icon"></i>
            <span>{{ item.label }}</span>
            <small>{{ item.sub }}</small>
          </button>
        </div>

        <div class="flex items-center gap-2">
          <el-button text @click="revealSession">
            <i class="i-bi-folder2-open mr-1"></i>
            打开目录
          </el-button>
          <el-button text :loading="loading" @click="refreshManifest">
            <i class="i-bi-arrow-clockwise mr-1"></i>
            刷新
          </el-button>
        </div>
      </div>
    </template>

    <div v-loading="loading" class="guidepix-workbench-body">
      <section v-if="activeTab === 'capture'" class="guidepix-panel">
        <div class="guidepix-hero">
          <div class="min-w-0 flex-1">
            <div class="guidepix-kicker">CAPTURE FIRST · EDIT LATER</div>
            <h1>先把完整操作流程走完，再集中整理。</h1>
            <p>
              保持文档模式开启，连续按 F8。GuidePix 会自动编号并归入同一个会话，
              不再让标注动作打断手机操作思路。
            </p>
            <div class="flex flex-wrap gap-2 mt-4">
              <el-button size="large" type="primary" :loading="captureLoading" @click="captureNow">
                <i class="i-bi-camera-fill mr-2"></i>
                截一张 · F8
              </el-button>
              <el-button size="large" :loading="captureLoading" @click="captureAndEdit">
                <i class="i-bi-pencil-square mr-2"></i>
                截图并标注 · Shift+F8
              </el-button>
              <el-button size="large" :disabled="!shotCount" @click="setTab('annotate')">
                完成截图，去整理
                <i class="i-bi-arrow-right ml-2"></i>
              </el-button>
            </div>
          </div>

          <div class="guidepix-session-card">
            <div class="guidepix-session-stat">
              <strong>{{ shotCount }}</strong>
              <span>本次截图</span>
            </div>
            <div class="guidepix-session-stat">
              <strong>{{ completedCount }}</strong>
              <span>已导出标注图</span>
            </div>
            <div class="guidepix-session-stat">
              <strong>{{ variantCount }}</strong>
              <span>步骤变体</span>
            </div>
            <div class="text-xs text-gray-500 mt-3 break-all">
              {{ manifest?.root || session?.root || '-' }}
            </div>
          </div>
        </div>

        <div class="guidepix-section-head">
          <div>
            <h2>故事板</h2>
            <p>拖动卡片调整步骤顺序；Caption 会同时用于合集导出。</p>
          </div>
          <div class="flex items-center gap-2">
            <el-input
              v-model="titleDraft"
              class="!w-72"
              clearable
              placeholder="给本次指南起个名字"
              @change="saveMetadata"
            />
            <el-select v-model="stepModeDraft" class="!w-40" @change="saveMetadata">
              <el-option label="全局连续编号" value="global" />
              <el-option label="每张从 1 开始" value="per-image" />
              <el-option label="手动编号" value="manual" />
            </el-select>
          </div>
        </div>

        <div v-if="!shotCount" class="guidepix-empty">
          <div class="guidepix-empty-icon"><i class="i-bi-camera"></i></div>
          <h3>还没有截图</h3>
          <p>保持手机在需要记录的页面，按 F8 开始连续截图。</p>
        </div>

        <div v-else class="guidepix-story-grid">
          <article
            v-for="shot in shots"
            :key="shot.id"
            class="guidepix-shot-card"
            draggable="true"
            @dragstart="dragShotId = shot.id"
            @dragover.prevent
            @drop="dropShot(shot.id)"
          >
            <div class="guidepix-shot-thumb" @dblclick="openShot(shot)">
              <img v-if="thumbs[shot.originalPath]" :src="thumbs[shot.originalPath]" alt="" />
              <div v-else class="guidepix-thumb-loading">
                <i class="i-bi-image"></i>
              </div>
              <span class="guidepix-shot-number">{{ shot.id }}</span>
              <span class="guidepix-shot-status" :class="{ 'is-done': hasCompletedVariant(shot) }">
                {{ hasCompletedVariant(shot) ? '已完成' : '原图' }}
              </span>
            </div>
            <el-input
              :model-value="captionDrafts[shot.id] ?? shot.caption"
              maxlength="240"
              placeholder="例如：点击“提交工单”"
              @input="captionDrafts[shot.id] = $event"
              @blur="saveCaption(shot)"
            />
            <div class="flex items-center justify-between mt-2">
              <span class="text-xs text-gray-500">{{ shot.variants.length }} 个版本</span>
              <div class="flex items-center gap-1">
                <el-button text size="small" @click="openShot(shot)">标注</el-button>
                <el-button text size="small" @click="duplicateVariant(shot)">复制版本</el-button>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section v-else-if="activeTab === 'annotate'" class="guidepix-panel">
        <div class="guidepix-section-head guidepix-section-head--sticky">
          <div>
            <div class="guidepix-kicker">ANNOTATE</div>
            <h2>连续标注</h2>
            <p>一次选好步骤，进入编辑器后用“上一张 / 下一张”连续完成，不来回切窗口。</p>
          </div>
          <div class="flex flex-wrap items-center justify-end gap-2">
            <el-button text @click="selectAll">全选</el-button>
            <el-button text @click="clearSelection">清空</el-button>
            <el-button
              size="large"
              type="primary"
              :disabled="!selectedShots.length"
              @click="openContinuousEditor"
            >
              <i class="i-bi-pencil-square mr-2"></i>
              连续标注 {{ selectedShots.length }} 张
            </el-button>
            <el-button size="large" :disabled="!shotCount" @click="setTab('compose')">
              去做合集
              <i class="i-bi-grid-1x2 ml-2"></i>
            </el-button>
          </div>
        </div>

        <div class="guidepix-annotate-layout">
          <div class="guidepix-annotate-list">
            <article
              v-for="shot in shots"
              :key="shot.id"
              class="guidepix-annotate-row"
              :class="{ 'is-selected': selectedIds.includes(shot.id) }"
            >
              <el-checkbox
                :model-value="selectedIds.includes(shot.id)"
                @change="workflowStore.toggleSelected(shot.id, $event)"
              />
              <div class="guidepix-mini-thumb" @click="openShot(shot)">
                <img v-if="thumbs[shot.originalPath]" :src="thumbs[shot.originalPath]" alt="" />
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <strong>步骤 {{ shot.order + 1 }}</strong>
                  <el-tag size="small" effect="plain">{{ shot.id }}</el-tag>
                  <el-tag v-if="hasCompletedVariant(shot)" size="small" type="success" effect="plain">已导出</el-tag>
                </div>
                <div class="text-sm text-gray-500 truncate mt-1">
                  {{ shot.caption || '尚未填写步骤说明' }}
                </div>
              </div>
              <el-select
                v-model="workflowStore.composeVariantMap[shot.id]"
                class="!w-44"
                placeholder="标注版本"
              >
                <el-option
                  v-for="variant in shot.variants"
                  :key="variant.id"
                  :label="variantLabel(variant)"
                  :value="variant.id"
                />
              </el-select>
              <el-button @click="openShot(shot, workflowStore.composeVariantMap[shot.id])">
                编辑
              </el-button>
              <el-dropdown trigger="click">
                <el-button text><i class="i-bi-three-dots"></i></el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item @click="duplicateVariant(shot, workflowStore.composeVariantMap[shot.id])">
                      复制为新步骤版本
                    </el-dropdown-item>
                    <el-dropdown-item
                      v-if="workflowStore.composeVariantMap[shot.id] !== shot.id"
                      divided
                      @click="removeVariant(shot, workflowStore.composeVariantMap[shot.id])"
                    >
                      删除当前变体
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </article>
          </div>
        </div>
      </section>

      <section v-else class="guidepix-panel guidepix-compose-panel">
        <div class="guidepix-section-head guidepix-section-head--sticky">
          <div>
            <div class="guidepix-kicker">COMPOSE</div>
            <h2>生成可直接放进手册的合集图</h2>
            <p>不是自由画布，而是针对操作指南优化的四种模板。</p>
          </div>
          <div class="flex items-center gap-2">
            <el-button :disabled="!selectedShots.length" @click="renderComposition">
              刷新预览
            </el-button>
            <el-button
              size="large"
              type="primary"
              :disabled="!composeReady"
              :loading="composeExporting"
              @click="exportComposition"
            >
              <i class="i-bi-download mr-2"></i>
              导出合集 PNG
            </el-button>
          </div>
        </div>

        <div class="guidepix-compose-layout">
          <aside class="guidepix-compose-settings">
            <h3>版式</h3>
            <div class="guidepix-template-list">
              <button
                v-for="item in composeTemplates"
                :key="item.value"
                class="guidepix-template-card"
                :class="{ 'is-active': composeTemplate === item.value }"
                @click="composeTemplate = item.value"
              >
                <i :class="item.icon"></i>
                <div>
                  <strong>{{ item.label }}</strong>
                  <small>{{ item.description }}</small>
                </div>
              </button>
            </div>

            <h3 class="mt-5">内容</h3>
            <el-checkbox v-model="composeShowTitle">显示指南标题</el-checkbox>
            <el-checkbox v-model="composeShowCaptions">显示步骤说明</el-checkbox>
            <el-checkbox v-model="composeUseOutput">优先使用已标注导出图</el-checkbox>

            <div class="mt-4">
              <div class="text-xs text-gray-500 mb-1">合集标题</div>
              <el-input v-model="composeTitle" placeholder="例如：海外 ITSM 提单指南" />
            </div>

            <template v-if="composeTemplate === 'dual' && dualShot">
              <h3 class="mt-5">同图双步骤版本</h3>
              <div class="text-xs text-gray-500 mb-2">
                {{ dualShot.id }} · 选择两个不同标注版本左右对照
              </div>
              <el-select v-model="dualLeftVariant" class="w-full mb-2">
                <el-option
                  v-for="variant in dualShot.variants"
                  :key="variant.id"
                  :label="variantLabel(variant)"
                  :value="variant.id"
                />
              </el-select>
              <el-select v-model="dualRightVariant" class="w-full">
                <el-option
                  v-for="variant in dualShot.variants"
                  :key="variant.id"
                  :label="variantLabel(variant)"
                  :value="variant.id"
                />
              </el-select>
            </template>

            <div class="mt-5 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div class="flex items-center justify-between mb-2">
                <h3 class="!m-0">参与合集</h3>
                <span class="text-xs text-gray-500">{{ selectedShots.length }}/{{ shotCount }}</span>
              </div>
              <div class="space-y-2 max-h-72 overflow-auto pr-1">
                <label v-for="shot in shots" :key="shot.id" class="guidepix-compose-shot-option">
                  <el-checkbox
                    :model-value="selectedIds.includes(shot.id)"
                    @change="workflowStore.toggleSelected(shot.id, $event)"
                  />
                  <span class="flex-1 truncate">{{ shot.id }} · {{ shot.caption || `步骤 ${shot.order + 1}` }}</span>
                </label>
              </div>
            </div>
          </aside>

          <main class="guidepix-compose-preview">
            <div v-if="!composeReady" class="guidepix-empty guidepix-empty--compact">
              <div class="guidepix-empty-icon"><i class="i-bi-grid-1x2"></i></div>
              <h3>选择步骤后生成预览</h3>
              <p>合集只读取已选择的截图，不会改变任何原图和标注工程。</p>
              <el-button type="primary" :disabled="!selectedShots.length" @click="renderComposition">
                生成预览
              </el-button>
            </div>
            <div v-else class="guidepix-compose-canvas-wrap">
              <canvas ref="composeCanvasRef" class="guidepix-compose-canvas"></canvas>
            </div>
          </main>
        </div>
      </section>
    </div>
  </el-dialog>
</template>

<script setup>
const workflowStore = useDocumentationWorkflowStore()
const annotationStore = useAnnotationStore()
const { captureOriginal, captureAndAnnotate } = useDocumentationAction()

const loading = ref(false)
const captureLoading = ref(false)
const composeExporting = ref(false)
const thumbs = reactive({})
const captionDrafts = reactive({})
const titleDraft = ref('')
const stepModeDraft = ref('global')
const dragShotId = ref('')
const composeCanvasRef = ref(null)
const composeReady = ref(false)
const composeTemplate = ref('vertical')
const composeShowTitle = ref(true)
const composeShowCaptions = ref(true)
const composeUseOutput = ref(true)
const composeTitle = ref('')
const dualLeftVariant = ref('')
const dualRightVariant = ref('')

const tabs = [
  { value: 'capture', label: '截图', sub: 'Capture', icon: 'i-bi-camera-fill' },
  { value: 'annotate', label: '标注', sub: 'Annotate', icon: 'i-bi-pencil-square' },
  { value: 'compose', label: '合集', sub: 'Compose', icon: 'i-bi-grid-1x2' },
]

const composeTemplates = [
  { value: 'vertical', label: '纵向长图', description: '最适合飞书、微信和 Wiki', icon: 'i-bi-layout-text-sidebar-reverse' },
  { value: 'grid', label: '两列步骤', description: '适合 Word、PPT 和桌面阅读', icon: 'i-bi-grid' },
  { value: 'compare', label: '前后对比', description: '取前两张做 Before / After', icon: 'i-bi-layout-split' },
  { value: 'dual', label: '同图双步骤', description: '同一原图的两个标注版本', icon: 'i-bi-copy' },
]

const dialogVisible = computed({
  get: () => workflowStore.visible,
  set: value => !value && closeWorkbench(),
})
const device = computed(() => workflowStore.device)
const session = computed(() => workflowStore.session)
const manifest = computed(() => workflowStore.manifest)
const shots = computed(() => manifest.value?.shots || [])
const activeTab = computed(() => workflowStore.tab)
const selectedIds = computed(() => workflowStore.selectedIds)
const selectedShots = computed(() => shots.value.filter(item => selectedIds.value.includes(item.id)))
const shotCount = computed(() => shots.value.length)
const variantCount = computed(() => shots.value.reduce((sum, shot) => sum + Math.max(0, shot.variants.length - 1), 0))
const completedCount = computed(() => shots.value.filter(hasCompletedVariant).length)
const deviceLabel = computed(() => device.value?.remark || device.value?.name || device.value?.model || device.value?.id || 'Android')
const dualShot = computed(() => selectedShots.value[0] || shots.value[0] || null)

function hasCompletedVariant(shot) {
  return Boolean(shot?.variants?.some(item => item.hasOutput))
}

function variantLabel(variant) {
  const suffix = variant.hasOutput ? ' · 已导出' : variant.hasProject ? ' · 已编辑' : ''
  return `${variant.label || variant.id}${suffix}`
}

async function refreshManifest() {
  const root = session.value?.root || manifest.value?.root
  if (!root) {
    return null
  }
  loading.value = true
  try {
    const value = await window.$preload.ipcRenderer.invoke('documentation-workflow-get', {
      root,
      session: session.value,
    })
    workflowStore.setManifest(value)
    titleDraft.value = value?.title || ''
    stepModeDraft.value = value?.stepMode || 'global'
    if (!composeTitle.value) {
      composeTitle.value = value?.title || '操作指南'
    }
    await loadThumbnails(value?.shots || [])
    syncDualVariants()
    return value
  }
  catch (error) {
    ElMessage.warning(error?.message || String(error))
    return null
  }
  finally {
    loading.value = false
  }
}

async function loadThumbnails(items) {
  await Promise.all(items.map(async (shot) => {
    if (thumbs[shot.originalPath]) {
      return
    }
    const dataUrl = await window.$preload.ipcRenderer.invoke(
      'documentation-workflow-image-data-url',
      shot.originalPath,
    ).catch(() => '')
    if (dataUrl) {
      thumbs[shot.originalPath] = dataUrl
    }
  }))
}

async function captureNow() {
  if (!device.value) {
    return
  }
  captureLoading.value = true
  try {
    const result = await captureOriginal(device.value)
    if (result) {
      await refreshManifest()
    }
  }
  finally {
    captureLoading.value = false
  }
}

async function captureAndEdit() {
  if (!device.value) {
    return
  }
  captureLoading.value = true
  try {
    const result = await captureAndAnnotate(device.value)
    if (result) {
      await refreshManifest()
    }
  }
  finally {
    captureLoading.value = false
  }
}

async function saveMetadata() {
  if (!manifest.value?.root) {
    return
  }
  const value = await window.$preload.ipcRenderer.invoke('documentation-workflow-update', {
    root: manifest.value.root,
    title: titleDraft.value,
    stepMode: stepModeDraft.value,
  })
  workflowStore.setManifest(value)
  composeTitle.value = value?.title || composeTitle.value
}

async function saveCaption(shot) {
  if (!manifest.value?.root || !shot?.id) {
    return
  }
  const caption = captionDrafts[shot.id] ?? shot.caption ?? ''
  if (caption === shot.caption) {
    return
  }
  const value = await window.$preload.ipcRenderer.invoke('documentation-workflow-caption', {
    root: manifest.value.root,
    shotId: shot.id,
    caption,
  })
  workflowStore.setManifest(value)
}

async function dropShot(targetId) {
  const sourceId = dragShotId.value
  dragShotId.value = ''
  if (!sourceId || sourceId === targetId || !manifest.value?.root) {
    return
  }
  const ids = shots.value.map(item => item.id)
  const from = ids.indexOf(sourceId)
  const to = ids.indexOf(targetId)
  if (from < 0 || to < 0) {
    return
  }
  ids.splice(to, 0, ids.splice(from, 1)[0])
  const value = await window.$preload.ipcRenderer.invoke('documentation-workflow-reorder', {
    root: manifest.value.root,
    ids,
  })
  workflowStore.setManifest(value)
}

async function duplicateVariant(shot, sourceVariantId = '') {
  if (!manifest.value?.root || !shot?.id) {
    return
  }
  const value = await window.$preload.ipcRenderer.invoke('documentation-workflow-create-variant', {
    root: manifest.value.root,
    shotId: shot.id,
    sourceVariantId: sourceVariantId || shot.id,
  })
  workflowStore.setManifest(value)
  const updated = value.shots.find(item => item.id === shot.id)
  const newest = updated?.variants?.[updated.variants.length - 1]
  if (newest) {
    workflowStore.composeVariantMap[shot.id] = newest.id
    await openShot(updated, newest.id)
  }
}

async function removeVariant(shot, variantId) {
  if (!manifest.value?.root || !shot?.id || !variantId || variantId === shot.id) {
    return
  }
  await ElMessageBox.confirm('删除这个标注变体？原始截图不会被删除。', '删除变体', {
    type: 'warning',
    confirmButtonText: '删除',
    cancelButtonText: '取消',
  })
  const value = await window.$preload.ipcRenderer.invoke('documentation-workflow-delete-variant', {
    root: manifest.value.root,
    shotId: shot.id,
    variantId,
  })
  workflowStore.setManifest(value)
}

async function openShot(shot, variantId = '') {
  if (!manifest.value?.root || !shot?.id) {
    return
  }
  const payload = await window.$preload.ipcRenderer.invoke('documentation-workflow-open-item', {
    root: manifest.value.root,
    shotId: shot.id,
    variantId: variantId || workflowStore.composeVariantMap[shot.id] || shot.id,
  })
  annotationStore.open(payload)
}

async function openContinuousEditor() {
  if (!manifest.value?.root || !selectedShots.value.length) {
    return
  }
  const queue = selectedShots.value.map(shot => ({
    root: manifest.value.root,
    shotId: shot.id,
    variantId: workflowStore.composeVariantMap[shot.id] || shot.id,
  }))
  await annotationStore.openQueue(queue, 0)
}

function selectAll() {
  workflowStore.selectAll()
}

function clearSelection() {
  workflowStore.clearSelection()
}

function setTab(value) {
  workflowStore.setTab(value)
  if (value === 'compose') {
    nextTick(() => renderComposition())
  }
}

function syncDualVariants() {
  const shot = dualShot.value
  if (!shot?.variants?.length) {
    dualLeftVariant.value = ''
    dualRightVariant.value = ''
    return
  }
  const ids = shot.variants.map(item => item.id)
  if (!ids.includes(dualLeftVariant.value)) {
    dualLeftVariant.value = ids[0]
  }
  if (!ids.includes(dualRightVariant.value) || dualRightVariant.value === dualLeftVariant.value) {
    dualRightVariant.value = ids[1] || ids[0]
  }
}

async function loadCompositionItem(shot, variantId) {
  const variant = shot.variants.find(item => item.id === variantId) || shot.variants[0]
  const sourcePath = composeUseOutput.value && variant?.hasOutput
    ? variant.outputPath
    : shot.originalPath
  const dataUrl = await window.$preload.ipcRenderer.invoke(
    'documentation-workflow-image-data-url',
    sourcePath,
  )
  return {
    shot,
    variant,
    dataUrl,
    image: await loadImage(dataUrl),
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = src
  })
}

function roundRect(ctx, x, y, width, height, radius, fill) {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + width, y, x + width, y + height, r)
  ctx.arcTo(x + width, y + height, x, y + height, r)
  ctx.arcTo(x, y + height, x, y, r)
  ctx.arcTo(x, y, x + width, y, r)
  ctx.closePath()
  if (fill) {
    ctx.fillStyle = fill
    ctx.fill()
  }
}

function drawStepBadge(ctx, number, x, y) {
  ctx.beginPath()
  ctx.arc(x, y, 27, 0, Math.PI * 2)
  ctx.fillStyle = '#2563eb'
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.font = '700 28px "Segoe UI", "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(number), x, y + 1)
}

function drawCaption(ctx, text, x, y, maxWidth) {
  if (!text) {
    return 0
  }
  ctx.fillStyle = '#334155'
  ctx.font = '400 26px "Segoe UI", "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  const words = [...String(text)]
  const lines = []
  let line = ''
  for (const char of words) {
    const next = `${line}${char}`
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line)
      line = char
    }
    else {
      line = next
    }
  }
  if (line) {
    lines.push(line)
  }
  lines.slice(0, 3).forEach((value, index) => ctx.fillText(value, x, y + index * 38))
  return Math.min(3, lines.length) * 38
}

function drawTitle(ctx, width) {
  if (!composeShowTitle.value) {
    return 0
  }
  const title = composeTitle.value || manifest.value?.title || '操作指南'
  ctx.fillStyle = '#0f172a'
  ctx.font = '700 42px "Segoe UI", "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(title, width / 2, 68)
  ctx.fillStyle = '#64748b'
  ctx.font = '400 20px "Segoe UI", "Microsoft YaHei", sans-serif'
  ctx.fillText(`${selectedShots.value.length} 个步骤`, width / 2, 108)
  return 145
}

async function renderComposition() {
  const canvas = composeCanvasRef.value
  if (!canvas || !manifest.value?.root || !selectedShots.value.length) {
    composeReady.value = false
    return false
  }

  try {
    let items = []
    if (composeTemplate.value === 'dual') {
      syncDualVariants()
      const shot = dualShot.value
      if (!shot) {
        return false
      }
      items = await Promise.all([
        loadCompositionItem(shot, dualLeftVariant.value),
        loadCompositionItem(shot, dualRightVariant.value),
      ])
    }
    else {
      items = await Promise.all(selectedShots.value.map(shot => {
        return loadCompositionItem(shot, workflowStore.composeVariantMap[shot.id] || shot.id)
      }))
    }

    const ctx = canvas.getContext('2d')
    if (composeTemplate.value === 'vertical') {
      renderVertical(canvas, ctx, items)
    }
    else if (composeTemplate.value === 'grid') {
      renderGrid(canvas, ctx, items)
    }
    else {
      renderSideBySide(canvas, ctx, items, composeTemplate.value === 'compare')
    }
    composeReady.value = true
    return true
  }
  catch (error) {
    composeReady.value = false
    ElMessage.warning(`合集预览生成失败：${error?.message || error}`)
    return false
  }
}

function renderVertical(canvas, ctx, items) {
  const width = 1080
  const margin = 58
  const imageWidth = 760
  const cardWidth = width - margin * 2
  const titleHeight = composeShowTitle.value ? 145 : 30
  const blocks = items.map((item) => {
    const imageHeight = imageWidth * item.image.height / item.image.width
    const captionHeight = composeShowCaptions.value && item.shot.caption ? 90 : 24
    return { ...item, imageHeight, height: imageHeight + captionHeight + 92 }
  })
  const height = Math.ceil(titleHeight + 30 + blocks.reduce((sum, item) => sum + item.height + 28, 0) + 30)
  canvas.width = width
  canvas.height = height
  ctx.fillStyle = '#f1f5f9'
  ctx.fillRect(0, 0, width, height)
  let y = drawTitle(ctx, width) + 24

  blocks.forEach((item, index) => {
    roundRect(ctx, margin, y, cardWidth, item.height, 28, '#ffffff')
    drawStepBadge(ctx, index + 1, margin + 48, y + 48)
    ctx.fillStyle = '#0f172a'
    ctx.font = '700 26px "Segoe UI", "Microsoft YaHei", sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(`步骤 ${index + 1}`, margin + 92, y + 48)
    const imageX = (width - imageWidth) / 2
    const imageY = y + 82
    ctx.drawImage(item.image, imageX, imageY, imageWidth, item.imageHeight)
    if (composeShowCaptions.value) {
      drawCaption(ctx, item.shot.caption, margin + 72, imageY + item.imageHeight + 20, cardWidth - 144)
    }
    y += item.height + 28
  })
}

function renderGrid(canvas, ctx, items) {
  const width = 1600
  const margin = 54
  const gap = 34
  const columnWidth = (width - margin * 2 - gap) / 2
  const imageWidth = Math.min(520, columnWidth - 80)
  const titleHeight = composeShowTitle.value ? 145 : 30
  const cards = items.map((item) => {
    const imageHeight = imageWidth * item.image.height / item.image.width
    return { ...item, imageHeight, height: imageHeight + (composeShowCaptions.value ? 130 : 86) }
  })
  const rows = []
  for (let i = 0; i < cards.length; i += 2) {
    rows.push(cards.slice(i, i + 2))
  }
  const height = Math.ceil(titleHeight + 34 + rows.reduce((sum, row) => sum + Math.max(...row.map(item => item.height)) + gap, 0) + 30)
  canvas.width = width
  canvas.height = height
  ctx.fillStyle = '#f1f5f9'
  ctx.fillRect(0, 0, width, height)
  let y = drawTitle(ctx, width) + 22
  let step = 1
  rows.forEach((row) => {
    const rowHeight = Math.max(...row.map(item => item.height))
    row.forEach((item, column) => {
      const x = margin + column * (columnWidth + gap)
      roundRect(ctx, x, y, columnWidth, rowHeight, 28, '#ffffff')
      drawStepBadge(ctx, step, x + 46, y + 46)
      ctx.fillStyle = '#0f172a'
      ctx.font = '700 25px "Segoe UI", "Microsoft YaHei", sans-serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(`步骤 ${step}`, x + 88, y + 46)
      const imageX = x + (columnWidth - imageWidth) / 2
      const imageY = y + 80
      ctx.drawImage(item.image, imageX, imageY, imageWidth, item.imageHeight)
      if (composeShowCaptions.value) {
        drawCaption(ctx, item.shot.caption, x + 42, imageY + item.imageHeight + 16, columnWidth - 84)
      }
      step += 1
    })
    y += rowHeight + gap
  })
}

function renderSideBySide(canvas, ctx, items, compare) {
  const width = 1600
  const margin = 60
  const gap = 44
  const cardWidth = (width - margin * 2 - gap) / 2
  const imageWidth = Math.min(560, cardWidth - 70)
  const chosen = items.slice(0, 2)
  const prepared = chosen.map((item) => ({
    ...item,
    imageHeight: imageWidth * item.image.height / item.image.width,
  }))
  const maxImageHeight = Math.max(...prepared.map(item => item.imageHeight), 500)
  const height = Math.ceil((composeShowTitle.value ? 145 : 30) + maxImageHeight + 230)
  canvas.width = width
  canvas.height = height
  ctx.fillStyle = '#f1f5f9'
  ctx.fillRect(0, 0, width, height)
  const y = drawTitle(ctx, width) + 26

  prepared.forEach((item, index) => {
    const x = margin + index * (cardWidth + gap)
    roundRect(ctx, x, y, cardWidth, height - y - 34, 28, '#ffffff')
    drawStepBadge(ctx, index + 1, x + 46, y + 48)
    ctx.fillStyle = '#0f172a'
    ctx.font = '700 27px "Segoe UI", "Microsoft YaHei", sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    const label = compare ? (index === 0 ? '操作前' : '操作后') : (item.variant?.label || `步骤 ${index + 1}`)
    ctx.fillText(label, x + 90, y + 48)
    const imageX = x + (cardWidth - imageWidth) / 2
    const imageY = y + 86
    ctx.drawImage(item.image, imageX, imageY, imageWidth, item.imageHeight)
    if (composeShowCaptions.value) {
      drawCaption(ctx, item.shot.caption || label, x + 40, imageY + item.imageHeight + 18, cardWidth - 80)
    }
  })
}

async function exportComposition() {
  if (!composeReady.value || !composeCanvasRef.value || !manifest.value?.root) {
    return
  }
  composeExporting.value = true
  try {
    await renderComposition()
    const fileBase = (composeTitle.value || manifest.value?.title || 'GuidePix')
      .replace(/[<>:"/\\|?*]/g, '-')
      .trim() || 'GuidePix'
    const outputPath = await window.$preload.ipcRenderer.invoke(
      'documentation-workflow-write-compose',
      {
        root: manifest.value.root,
        fileName: `${fileBase}-${composeTemplate.value}.png`,
        dataUrl: composeCanvasRef.value.toDataURL('image/png'),
      },
    )
    ElMessage.success('合集图已导出')
    await window.$preload.ipcRenderer.invoke('documentation-workflow-reveal', outputPath)
  }
  catch (error) {
    ElMessage.warning(error?.message || String(error))
  }
  finally {
    composeExporting.value = false
  }
}

async function revealSession() {
  const root = manifest.value?.root || session.value?.root
  if (root) {
    await window.$preload.ipcRenderer.invoke('documentation-workflow-reveal', root)
  }
}

function closeWorkbench() {
  workflowStore.close()
}

watch(
  () => workflowStore.visible,
  async (visible) => {
    if (visible) {
      await nextTick()
      await refreshManifest()
    }
  },
)

watch(
  () => annotationStore.visible,
  async (visible, previous) => {
    if (previous && !visible && workflowStore.visible) {
      await refreshManifest()
    }
  },
)

watch([composeTemplate, dualShot], () => {
  syncDualVariants()
  composeReady.value = false
})

onBeforeUnmount(() => {
  workflowStore.close()
})
</script>

<style lang="postcss">
.guidepix-workbench-dialog {
  --el-dialog-padding-primary: 0px;
}
.guidepix-workbench-dialog .el-dialog__header {
  @apply !m-0 !p-0 border-b border-gray-200 dark:border-gray-800;
}
.guidepix-workbench-dialog .el-dialog__body {
  @apply !p-0;
  height: calc(100vh - 72px);
}
.guidepix-workbench-header {
  @apply h-18 px-5 flex items-center justify-between gap-5 bg-white dark:bg-gray-950;
}
.guidepix-workbench-body {
  @apply h-full overflow-hidden bg-gray-50 dark:bg-gray-950;
}
.guidepix-panel {
  @apply h-full overflow-auto p-6 lg:p-8;
}
.guidepix-icon-button {
  @apply w-10 h-10 rounded-xl flex items-center justify-center text-lg hover:bg-gray-100 dark:hover:bg-gray-800;
}
.guidepix-brand-mark {
  @apply relative flex items-center justify-center rounded-2xl text-white shadow-sm;
  width: 52px;
  height: 52px;
  background: linear-gradient(145deg, #2563eb, #14b8a6);
}
.guidepix-brand-mark i { @apply text-2xl; }
.guidepix-brand-mark span {
  @apply absolute flex items-center justify-center rounded-full bg-white text-primary-600 text-[10px] font-bold;
  width: 18px;
  height: 18px;
  right: 5px;
  bottom: 5px;
}
.guidepix-brand-mark--small { width: 42px; height: 42px; border-radius: 14px; }
.guidepix-stage-tabs {
  @apply flex items-center gap-1 rounded-2xl bg-gray-100 dark:bg-gray-900 p-1;
}
.guidepix-stage-tab {
  @apply min-w-28 px-4 py-2 rounded-xl flex items-center gap-2 text-left transition-all text-gray-500;
}
.guidepix-stage-tab i { @apply text-lg; }
.guidepix-stage-tab span { @apply font-medium text-sm; }
.guidepix-stage-tab small { @apply text-[10px] opacity-60 uppercase tracking-wide; }
.guidepix-stage-tab.is-active { @apply bg-white dark:bg-gray-800 text-primary-600 shadow-sm; }
.guidepix-hero {
  @apply rounded-3xl border border-primary-100 dark:border-gray-800 p-7 lg:p-9 flex gap-8 items-center;
  background: linear-gradient(135deg, rgba(37,99,235,.08), rgba(20,184,166,.07));
}
.guidepix-kicker { @apply text-xs tracking-[.18em] font-semibold text-primary-500 mb-2; }
.guidepix-hero h1 { @apply text-3xl lg:text-4xl font-bold text-gray-900 dark:text-white max-w-3xl leading-tight; }
.guidepix-hero p { @apply mt-3 text-gray-500 max-w-3xl leading-7; }
.guidepix-session-card {
  @apply flex-none w-72 rounded-2xl bg-white/90 dark:bg-gray-900/90 border border-white dark:border-gray-800 p-5 shadow-sm;
}
.guidepix-session-stat { @apply flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800; }
.guidepix-session-stat strong { @apply text-2xl text-gray-900 dark:text-white; }
.guidepix-session-stat span { @apply text-sm text-gray-500; }
.guidepix-section-head { @apply mt-8 mb-4 flex items-end justify-between gap-5; }
.guidepix-section-head h2 { @apply text-xl font-semibold text-gray-900 dark:text-white; }
.guidepix-section-head p { @apply text-sm text-gray-500 mt-1; }
.guidepix-section-head--sticky { @apply mt-0 pb-4 border-b border-gray-200 dark:border-gray-800; }
.guidepix-story-grid { @apply grid gap-4; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
.guidepix-shot-card { @apply rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-3 shadow-sm hover:shadow-md transition-shadow cursor-grab; }
.guidepix-shot-thumb { @apply relative rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 mb-3 flex items-center justify-center cursor-pointer; height: 290px; }
.guidepix-shot-thumb img { @apply w-full h-full object-contain; }
.guidepix-thumb-loading { @apply text-4xl text-gray-300; }
.guidepix-shot-number { @apply absolute top-2 left-2 px-2 py-1 rounded-lg bg-gray-950/75 text-white text-xs font-semibold; }
.guidepix-shot-status { @apply absolute top-2 right-2 px-2 py-1 rounded-lg bg-white/90 text-gray-600 text-xs; }
.guidepix-shot-status.is-done { @apply bg-green-500 text-white; }
.guidepix-empty { @apply min-h-96 flex flex-col items-center justify-center text-center rounded-3xl border border-dashed border-gray-300 dark:border-gray-700 bg-white/60 dark:bg-gray-900/40; }
.guidepix-empty--compact { @apply min-h-72; }
.guidepix-empty-icon { @apply w-16 h-16 rounded-2xl flex items-center justify-center text-3xl text-primary-500 bg-primary-50 dark:bg-gray-800 mb-4; }
.guidepix-empty h3 { @apply text-lg font-semibold; }
.guidepix-empty p { @apply text-sm text-gray-500 mt-1 mb-4; }
.guidepix-annotate-list { @apply max-w-6xl mx-auto space-y-3; }
.guidepix-annotate-row { @apply flex items-center gap-4 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 transition-all; }
.guidepix-annotate-row.is-selected { @apply border-primary-300 ring-1 ring-primary-100; }
.guidepix-mini-thumb { @apply w-18 h-28 rounded-xl overflow-hidden bg-gray-100 flex-none cursor-pointer; }
.guidepix-mini-thumb img { @apply w-full h-full object-contain; }
.guidepix-compose-layout { @apply h-[calc(100%-86px)] grid gap-5; grid-template-columns: 330px minmax(0, 1fr); }
.guidepix-compose-settings { @apply overflow-auto rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4; }
.guidepix-compose-settings h3 { @apply text-sm font-semibold mb-2; }
.guidepix-template-list { @apply space-y-2; }
.guidepix-template-card { @apply w-full rounded-xl border border-gray-200 dark:border-gray-700 p-3 flex items-center gap-3 text-left hover:border-primary-300; }
.guidepix-template-card > i { @apply text-2xl text-gray-400; }
.guidepix-template-card strong { @apply block text-sm; }
.guidepix-template-card small { @apply block text-xs text-gray-500 mt-0.5; }
.guidepix-template-card.is-active { @apply border-primary-400 bg-primary-50/60 dark:bg-gray-800; }
.guidepix-template-card.is-active > i { @apply text-primary-500; }
.guidepix-compose-shot-option { @apply flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer text-sm; }
.guidepix-compose-preview { @apply min-w-0 min-h-0 overflow-auto rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-200/60 dark:bg-gray-900 p-5; }
.guidepix-compose-canvas-wrap { @apply min-h-full flex items-start justify-center; }
.guidepix-compose-canvas { @apply bg-white shadow-xl max-w-full h-auto; }
@media (max-width: 1000px) {
  .guidepix-workbench-header { @apply gap-2 px-3; }
  .guidepix-stage-tab { @apply min-w-0 px-3; }
  .guidepix-stage-tab small { @apply hidden; }
  .guidepix-hero { @apply flex-col items-stretch; }
  .guidepix-session-card { @apply w-full; }
  .guidepix-compose-layout { grid-template-columns: 1fr; height: auto; }
  .guidepix-compose-settings { @apply max-h-none; }
}
</style>
