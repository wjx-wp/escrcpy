<template>
  <el-dialog
    v-model="dialogVisible"
    fullscreen
    append-to-body
    destroy-on-close
    :close-on-click-modal="false"
    :show-close="false"
    class="documentation-editor-dialog"
    @closed="disposeCanvas"
  >
    <template #header>
      <div class="h-12 flex items-center gap-2 px-1">
        <el-button text :icon="ArrowLeft" @click="closeEditor">
          返回
        </el-button>

        <div class="min-w-0 flex-1">
          <div class="font-medium truncate">
            {{ capture?.baseName || '-' }}.png
          </div>
          <div class="text-xs text-gray-500 truncate">
            {{ capture?.deviceName || capture?.deviceId || '' }}
          </div>
        </div>

        <el-button :disabled="!canvasReady" @click="saveProject()">
          保存工程
        </el-button>
        <el-button type="primary" :disabled="!canvasReady" @click="exportPng()">
          导出 PNG
        </el-button>
      </div>
    </template>

    <div class="h-full flex flex-col overflow-hidden bg-gray-100 dark:bg-gray-950">
      <div class="flex-none flex items-center gap-1 px-3 py-2 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-x-auto">
        <el-button-group>
          <el-button
            v-for="item in tools"
            :key="item.value"
            :type="tool === item.value ? 'primary' : 'default'"
            :title="item.label"
            @click="setTool(item.value)"
          >
            <i :class="item.icon"></i>
            <span class="ml-1 hidden xl:inline">{{ item.label }}</span>
          </el-button>
        </el-button-group>

        <div class="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-1"></div>

        <el-button :disabled="!canUndo" title="撤销" @click="undo">
          <i class="i-bi-arrow-counterclockwise"></i>
        </el-button>
        <el-button :disabled="!canRedo" title="重做" @click="redo">
          <i class="i-bi-arrow-clockwise"></i>
        </el-button>
        <el-button :disabled="!hasSelection" :title="$t('common.delete')" @click="deleteSelection">
          <i class="i-bi-trash"></i>
        </el-button>

        <div class="flex-1"></div>

        <el-tag v-if="dirty" type="warning" effect="plain">
          未保存
        </el-tag>
        <el-tag type="info" effect="plain">
          {{ sourceWidth }} × {{ sourceHeight }}
        </el-tag>
      </div>

      <div ref="stageRef" class="flex-1 min-h-0 overflow-auto p-4 documentation-canvas-stage">
        <div class="min-h-full min-w-full flex items-center justify-center">
          <div class="documentation-canvas-shell shadow-xl">
            <canvas ref="canvasRef"></canvas>
          </div>
        </div>
      </div>

      <div class="flex-none flex items-center gap-4 px-3 py-2 text-xs text-gray-500 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <span>选择对象后可移动 / 缩放 / 旋转</span>
        <span>Ctrl+Z 撤销</span>
        <span>Ctrl+Y 重做</span>
        <span>Ctrl+S 保存工程</span>
        <span>Delete {{ $t('common.delete') }}</span>
      </div>
    </div>
  </el-dialog>
</template>

<script setup>
import {
  Canvas,
  Circle,
  FabricImage,
  FabricText,
  Group,
  Line,
  PencilBrush,
  Rect,
  Textbox,
  Triangle,
} from 'fabric'
import { ArrowLeft } from '@element-plus/icons-vue'

const annotationStore = useAnnotationStore()

const canvasRef = ref(null)
const stageRef = ref(null)
const canvasReady = ref(false)
const tool = ref('select')
const dirty = ref(false)
const hasSelection = ref(false)
const sourceWidth = ref(0)
const sourceHeight = ref(0)
const stepCounter = ref(1)

let canvas = null
let baseImage = null
let drawingObject = null
let drawingStart = null
let historyLocked = false
const history = ref([])
const redoStack = ref([])
let resizeObserver = null

const capture = computed(() => annotationStore.capture)

const dialogVisible = computed({
  get: () => annotationStore.visible,
  set: (value) => {
    if (!value) {
      closeEditor()
    }
  },
})

const tools = [
  { value: 'select', label: '选择', icon: 'i-bi-cursor' },
  { value: 'rect', label: '矩形框', icon: 'i-bi-bounding-box' },
  { value: 'arrow', label: '箭头', icon: 'i-bi-arrow-up-right' },
  { value: 'text', label: '文字', icon: 'i-bi-fonts' },
  { value: 'step', label: '步骤编号', icon: 'i-bi-1-circle' },
  { value: 'pencil', label: '画笔', icon: 'i-bi-pencil' },
]

const canUndo = computed(() => history.value.length > 1)
const canRedo = computed(() => redoStack.value.length > 0)

watch(
  () => annotationStore.visible,
  async (visible) => {
    if (!visible) {
      return
    }

    await nextTick()
    await initCanvas()
  },
)

async function initCanvas() {
  disposeCanvas()

  const payload = capture.value
  if (!payload?.imageDataUrl || !canvasRef.value) {
    return
  }

  canvas = new Canvas(canvasRef.value, {
    backgroundColor: '#ffffff',
    preserveObjectStacking: true,
    enableRetinaScaling: false,
    selection: true,
  })

  historyLocked = true

  baseImage = await FabricImage.fromURL(payload.imageDataUrl)
  sourceWidth.value = baseImage.width || 1
  sourceHeight.value = baseImage.height || 1

  canvas.setDimensions({
    width: sourceWidth.value,
    height: sourceHeight.value,
  })

  baseImage.set({
    left: 0,
    top: 0,
    selectable: false,
    evented: false,
    hasControls: false,
    hasBorders: false,
    excludeFromExport: true,
  })

  canvas.add(baseImage)
  canvas.sendObjectToBack(baseImage)

  installCanvasEvents()
  installKeyboardEvents()
  updateCanvasCssSize()

  historyLocked = false
  history.value = [serializeAnnotations()]
  redoStack.value = []
  dirty.value = false
  canvasReady.value = true
  setTool('select')

  resizeObserver = new ResizeObserver(() => updateCanvasCssSize())
  if (stageRef.value) {
    resizeObserver.observe(stageRef.value)
  }
}

function installCanvasEvents() {
  if (!canvas) {
    return
  }

  canvas.on('mouse:down', handleMouseDown)
  canvas.on('mouse:move', handleMouseMove)
  canvas.on('mouse:up', handleMouseUp)
  canvas.on('selection:created', updateSelectionState)
  canvas.on('selection:updated', updateSelectionState)
  canvas.on('selection:cleared', updateSelectionState)
  canvas.on('object:modified', recordHistory)
  canvas.on('path:created', recordHistory)
}

function uninstallCanvasEvents() {
  if (!canvas) {
    return
  }

  canvas.off('mouse:down', handleMouseDown)
  canvas.off('mouse:move', handleMouseMove)
  canvas.off('mouse:up', handleMouseUp)
  canvas.off('selection:created', updateSelectionState)
  canvas.off('selection:updated', updateSelectionState)
  canvas.off('selection:cleared', updateSelectionState)
  canvas.off('object:modified', recordHistory)
  canvas.off('path:created', recordHistory)
}

function installKeyboardEvents() {
  window.addEventListener('keydown', handleKeydown)
}

function uninstallKeyboardEvents() {
  window.removeEventListener('keydown', handleKeydown)
}

function handleKeydown(event) {
  if (!annotationStore.visible || !canvas) {
    return
  }

  const target = event.target
  const isTyping = ['INPUT', 'TEXTAREA'].includes(target?.tagName)
    || target?.isContentEditable

  if (isTyping) {
    return
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    undo()
    return
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
    event.preventDefault()
    redo()
    return
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    saveProject()
    return
  }

  if (['Delete', 'Backspace'].includes(event.key)) {
    event.preventDefault()
    deleteSelection()
  }
}

function updateSelectionState() {
  hasSelection.value = Boolean(canvas?.getActiveObjects?.().length)
}

function setTool(value) {
  if (!canvas) {
    tool.value = value
    return
  }

  tool.value = value
  canvas.isDrawingMode = value === 'pencil'
  canvas.selection = value === 'select'
  canvas.defaultCursor = ['rect', 'arrow', 'text', 'step'].includes(value)
    ? 'crosshair'
    : 'default'

  canvas.getObjects().forEach((object) => {
    if (object === baseImage) {
      return
    }
    object.selectable = value === 'select'
    object.evented = value === 'select'
  })

  if (value === 'pencil') {
    const brush = new PencilBrush(canvas)
    brush.color = '#ff3b30'
    brush.width = 5
    canvas.freeDrawingBrush = brush
  }

  if (value !== 'select') {
    canvas.discardActiveObject()
    updateSelectionState()
    canvas.requestRenderAll()
  }
}

function handleMouseDown(event) {
  if (!canvas || tool.value === 'select' || tool.value === 'pencil') {
    return
  }

  if (event.target && event.target !== baseImage) {
    return
  }

  const point = event.scenePoint || canvas.getScenePoint(event.e)

  if (tool.value === 'text') {
    addText(point)
    return
  }

  if (tool.value === 'step') {
    addStep(point)
    return
  }

  drawingStart = point

  if (tool.value === 'rect') {
    drawingObject = new Rect({
      left: point.x,
      top: point.y,
      width: 1,
      height: 1,
      fill: 'rgba(255, 59, 48, 0.03)',
      stroke: '#ff3b30',
      strokeWidth: 5,
      rx: 10,
      ry: 10,
      selectable: false,
      evented: false,
    })
    drawingObject.annotationType = 'rect'
    historyLocked = true
    canvas.add(drawingObject)
    historyLocked = false
  }
  else if (tool.value === 'arrow') {
    drawingObject = new Line(
      [point.x, point.y, point.x, point.y],
      {
        stroke: '#ff3b30',
        strokeWidth: 6,
        selectable: false,
        evented: false,
      },
    )
    historyLocked = true
    canvas.add(drawingObject)
    historyLocked = false
  }
}

function handleMouseMove(event) {
  if (!canvas || !drawingObject || !drawingStart) {
    return
  }

  const point = event.scenePoint || canvas.getScenePoint(event.e)

  if (tool.value === 'rect') {
    drawingObject.set({
      left: Math.min(drawingStart.x, point.x),
      top: Math.min(drawingStart.y, point.y),
      width: Math.abs(point.x - drawingStart.x),
      height: Math.abs(point.y - drawingStart.y),
    })
    drawingObject.setCoords()
  }
  else if (tool.value === 'arrow') {
    drawingObject.set({ x2: point.x, y2: point.y })
    drawingObject.setCoords()
  }

  canvas.requestRenderAll()
}

function handleMouseUp(event) {
  if (!canvas || !drawingObject || !drawingStart) {
    return
  }

  const point = event.scenePoint || canvas.getScenePoint(event.e)

  if (tool.value === 'rect') {
    drawingObject.set({ selectable: true, evented: true })
    canvas.setActiveObject(drawingObject)
  }
  else if (tool.value === 'arrow') {
    const tempLine = drawingObject
    historyLocked = true
    canvas.remove(tempLine)

    const angle = Math.atan2(point.y - drawingStart.y, point.x - drawingStart.x) * 180 / Math.PI
    const line = new Line(
      [drawingStart.x, drawingStart.y, point.x, point.y],
      {
        stroke: '#ff3b30',
        strokeWidth: 6,
        selectable: false,
        evented: false,
      },
    )
    const head = new Triangle({
      left: point.x,
      top: point.y,
      width: 22,
      height: 28,
      fill: '#ff3b30',
      angle: angle + 90,
      originX: 'center',
      originY: 'center',
      selectable: false,
      evented: false,
    })

    const arrow = new Group([line, head], {
      selectable: true,
      evented: true,
    })
    arrow.annotationType = 'arrow'
    canvas.add(arrow)
    canvas.setActiveObject(arrow)
    historyLocked = false
  }

  drawingObject = null
  drawingStart = null
  setTool('select')
  recordHistory()
}

function addText(point) {
  const text = new Textbox('输入说明文字', {
    left: point.x,
    top: point.y,
    width: Math.min(420, sourceWidth.value * 0.55),
    fill: '#111827',
    fontSize: Math.max(28, Math.round(sourceWidth.value * 0.032)),
    fontFamily: 'sans-serif',
    backgroundColor: 'rgba(255,255,255,0.88)',
    padding: 8,
  })
  text.annotationType = 'text'
  canvas.add(text)
  canvas.setActiveObject(text)
  setTool('select')
  recordHistory()

  nextTick(() => {
    text.enterEditing?.()
    text.selectAll?.()
  })
}

function addStep(point) {
  const radius = Math.max(22, Math.round(sourceWidth.value * 0.026))
  const number = stepCounter.value++

  const circle = new Circle({
    radius,
    fill: '#ff3b30',
    originX: 'center',
    originY: 'center',
    selectable: false,
    evented: false,
  })

  const text = new FabricText(String(number), {
    fill: '#ffffff',
    fontSize: Math.round(radius * 1.15),
    fontWeight: '700',
    originX: 'center',
    originY: 'center',
    selectable: false,
    evented: false,
  })

  const marker = new Group([circle, text], {
    left: point.x,
    top: point.y,
    originX: 'center',
    originY: 'center',
    selectable: true,
    evented: true,
  })
  marker.annotationType = 'step'
  marker.stepNumber = number

  canvas.add(marker)
  canvas.setActiveObject(marker)
  setTool('select')
  recordHistory()
}

function deleteSelection() {
  if (!canvas) {
    return
  }

  const selected = canvas.getActiveObjects().filter(item => item !== baseImage)
  if (!selected.length) {
    return
  }

  historyLocked = true
  canvas.discardActiveObject()
  selected.forEach(item => canvas.remove(item))
  historyLocked = false
  updateSelectionState()
  canvas.requestRenderAll()
  recordHistory()
}

function serializeAnnotations() {
  if (!canvas) {
    return JSON.stringify({ objects: [] })
  }

  return JSON.stringify(canvas.toObject(['annotationType', 'stepNumber']))
}

function recordHistory() {
  if (!canvas || historyLocked) {
    return
  }

  const snapshot = serializeAnnotations()
  if (history.value[history.value.length - 1] === snapshot) {
    return
  }

  history.value.push(snapshot)
  if (history.value.length > 80) {
    history.value.shift()
  }
  redoStack.value = []
  dirty.value = true
}

async function restoreSnapshot(snapshot) {
  if (!canvas || !baseImage) {
    return
  }

  historyLocked = true
  const value = JSON.parse(snapshot)
  await canvas.loadFromJSON(value)
  canvas.add(baseImage)
  canvas.sendObjectToBack(baseImage)
  canvas.requestRenderAll()
  historyLocked = false
  updateSelectionState()
}

async function undo() {
  if (history.value.length <= 1) {
    return
  }

  const current = history.value.pop()
  redoStack.value.push(current)
  await restoreSnapshot(history.value[history.value.length - 1])
  dirty.value = true
}

async function redo() {
  if (!redoStack.value.length) {
    return
  }

  const snapshot = redoStack.value.pop()
  history.value.push(snapshot)
  await restoreSnapshot(snapshot)
  dirty.value = true
}

function buildProject() {
  const annotations = canvas
    ? canvas.toObject(['annotationType', 'stepNumber']).objects
    : []

  return {
    version: 1,
    source: {
      originalPath: capture.value?.originalPath,
      deviceId: capture.value?.deviceId,
      deviceName: capture.value?.deviceName,
      width: sourceWidth.value,
      height: sourceHeight.value,
    },
    editor: {
      stepCounter: stepCounter.value,
    },
    annotations,
    updatedAt: new Date().toISOString(),
  }
}

async function saveProject({ silent = false } = {}) {
  if (!canvas || !capture.value?.projectPath) {
    return false
  }

  try {
    await window.$preload.ipcRenderer.invoke(
      'documentation-write-project',
      {
        projectPath: capture.value.projectPath,
        data: buildProject(),
      },
    )
    dirty.value = false
    if (!silent) {
      ElMessage.success('工程已保存')
    }
    return true
  }
  catch (error) {
    ElMessage.warning(error?.message || String(error))
    return false
  }
}

async function exportPng() {
  if (!canvas || !capture.value?.outputPath) {
    return false
  }

  try {
    await saveProject({ silent: true })
    canvas.discardActiveObject()
    canvas.requestRenderAll()

    const dataUrl = canvas.toDataURL({
      format: 'png',
      multiplier: 1,
      enableRetinaScaling: false,
    })

    const outputPath = await window.$preload.ipcRenderer.invoke(
      'documentation-write-output',
      {
        outputPath: capture.value.outputPath,
        dataUrl,
      },
    )

    ElMessage.success('标注图已导出')
    await window.$preload.ipcRenderer.invoke(
      'documentation-reveal-path',
      outputPath,
    )
    return true
  }
  catch (error) {
    ElMessage.warning(error?.message || String(error))
    return false
  }
}

async function closeEditor() {
  if (dirty.value) {
    await saveProject({ silent: true })
  }
  annotationStore.close()
}

function updateCanvasCssSize() {
  if (!canvas || !stageRef.value || !sourceWidth.value || !sourceHeight.value) {
    return
  }

  const availableWidth = Math.max(320, stageRef.value.clientWidth - 48)
  const availableHeight = Math.max(320, stageRef.value.clientHeight - 48)
  const scale = Math.min(
    1,
    availableWidth / sourceWidth.value,
    availableHeight / sourceHeight.value,
  )

  canvas.setDimensions(
    {
      width: `${Math.round(sourceWidth.value * scale)}px`,
      height: `${Math.round(sourceHeight.value * scale)}px`,
    },
    { cssOnly: true },
  )
  canvas.calcOffset()
}

function disposeCanvas() {
  resizeObserver?.disconnect()
  resizeObserver = null
  uninstallKeyboardEvents()
  uninstallCanvasEvents()
  canvas?.dispose?.()
  canvas = null
  baseImage = null
  drawingObject = null
  drawingStart = null
  history.value = []
  redoStack.value = []
  canvasReady.value = false
  dirty.value = false
  hasSelection.value = false
  sourceWidth.value = 0
  sourceHeight.value = 0
  stepCounter.value = 1
}

onBeforeUnmount(disposeCanvas)
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
  height: calc(100vh - 49px);
}

.documentation-canvas-stage {
  background-image:
    linear-gradient(45deg, rgba(148, 163, 184, 0.10) 25%, transparent 25%),
    linear-gradient(-45deg, rgba(148, 163, 184, 0.10) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, rgba(148, 163, 184, 0.10) 75%),
    linear-gradient(-45deg, transparent 75%, rgba(148, 163, 184, 0.10) 75%);
  background-size: 24px 24px;
  background-position: 0 0, 0 12px, 12px -12px, -12px 0px;
}

.documentation-canvas-shell {
  @apply bg-white flex-none;
  line-height: 0;
}
</style>
