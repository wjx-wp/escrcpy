import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
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
import { nanoid } from 'nanoid'
import {
  clampRect,
  cropImageDataUrl,
  findSmallestRegionAt,
  getCanvasImageElement,
  getRegionText,
  healImageDataUrl,
  normalizeRect,
  parseUiHierarchy,
  pixelateImageDataUrl,
} from './helpers/index.js'

const CUSTOM_PROPS = [
  'annotationType',
  'stepNumber',
  'spotlightId',
  'sourceRect',
  'magnifierZoom',
  'healMethod',
  'healSourceDirection',
  'healSourceRect',
]

export function useAnnotationEditor({ canvasRef, stageRef, capture, onClose }) {
  const ready = ref(false)
  const dirty = ref(false)
  const tool = ref('select')
  const color = ref('#ff3b30')
  const strokeWidth = ref(5)
  const spotlightOpacity = ref(60)
  const mosaicBlockSize = ref(14)
  const magnifierZoom = ref(2)
  const healFeather = ref(8)
  const stepCounter = ref(1)
  const sourceWidth = ref(0)
  const sourceHeight = ref(0)
  const hasSelection = ref(false)
  const smartRegions = ref([])
  const smartLoading = ref(false)
  const hoverRegion = ref(null)

  const history = ref([])
  const redoStack = ref([])

  let canvas = null
  let baseImage = null
  let drawingObject = null
  let drawingStart = null
  let historyLocked = false
  let smartGuide = null
  let resizeObserver = null

  const presetColors = [
    '#ff3b30',
    '#ff9500',
    '#ffcc00',
    '#34c759',
    '#007aff',
    '#5856d6',
    '#000000',
    '#ffffff',
  ]

  const tools = [
    { value: 'select', label: '选择', icon: 'i-bi-cursor', hotkey: 'V' },
    { value: 'rect', label: '矩形', icon: 'i-bi-bounding-box', hotkey: 'R' },
    { value: 'arrow', label: '箭头', icon: 'i-bi-arrow-up-right', hotkey: 'A' },
    { value: 'text', label: '文字', icon: 'i-bi-type', hotkey: 'T' },
    { value: 'step', label: '步骤', icon: 'i-bi-1-circle', hotkey: 'N' },
    { value: 'spotlight', label: '聚光灯', icon: 'i-bi-lightbulb', hotkey: 'L' },
    { value: 'magnifier', label: '放大镜', icon: 'i-bi-search', hotkey: 'G' },
    { value: 'mosaic', label: '马赛克', icon: 'i-bi-grid-3x3-gap', hotkey: 'M' },
    { value: 'heal', label: '无痕修复', icon: 'i-bi-eraser', hotkey: 'H' },
    { value: 'pencil', label: '画笔', icon: 'i-bi-pencil', hotkey: 'P' },
  ]

  const canUndo = computed(() => history.value.length > 1)
  const canRedo = computed(() => redoStack.value.length > 0)
  const hoverRegionText = computed(() => getRegionText(hoverRegion.value))

  async function init() {
    dispose()

    const payload = capture.value
    if (!payload?.imageDataUrl || !canvasRef.value) {
      return false
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
    })
    baseImage.annotationType = 'base-image'

    const project = payload.projectData
    if (Array.isArray(project?.annotations) && project.annotations.length) {
      await canvas.loadFromJSON({ objects: project.annotations })
      canvas.add(baseImage)
      canvas.sendObjectToBack(baseImage)
      stepCounter.value = Number(project?.editor?.stepCounter) || inferNextStepNumber()
      color.value = project?.editor?.annotationColor || color.value
      strokeWidth.value = Number(project?.editor?.strokeWidth) || strokeWidth.value
      spotlightOpacity.value = Number(project?.editor?.spotlightOpacity) || spotlightOpacity.value
      mosaicBlockSize.value = Number(project?.editor?.mosaicBlockSize) || mosaicBlockSize.value
      magnifierZoom.value = Number(project?.editor?.magnifierZoom) || magnifierZoom.value
      healFeather.value = Number(project?.editor?.healFeather) || healFeather.value
    }
    else {
      canvas.add(baseImage)
      canvas.sendObjectToBack(baseImage)
    }

    rehydrateAnnotations()
    installCanvasEvents()
    installKeyboardEvents()
    updateCssSize()

    resizeObserver = new ResizeObserver(updateCssSize)
    if (stageRef.value) {
      resizeObserver.observe(stageRef.value)
    }

    historyLocked = false
    history.value = [serializeAnnotations()]
    redoStack.value = []
    dirty.value = false
    ready.value = true
    await setTool('select')
    loadSmartRegions({ silent: true })
    return true
  }

  function dispose() {
    resizeObserver?.disconnect()
    resizeObserver = null
    uninstallKeyboardEvents()
    uninstallCanvasEvents()
    canvas?.dispose?.()
    canvas = null
    baseImage = null
    drawingObject = null
    drawingStart = null
    smartGuide = null
    historyLocked = false
    history.value = []
    redoStack.value = []
    ready.value = false
    dirty.value = false
    hasSelection.value = false
    smartRegions.value = []
    smartLoading.value = false
    hoverRegion.value = null
    sourceWidth.value = 0
    sourceHeight.value = 0
    stepCounter.value = 1
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
    canvas.on('object:moving', handleObjectTransforming)
    canvas.on('object:scaling', handleObjectTransforming)
    canvas.on('object:modified', handleObjectModified)
    canvas.on('path:created', handlePathCreated)
    canvas.on('text:changed', recordHistory)
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
    canvas.off('object:moving', handleObjectTransforming)
    canvas.off('object:scaling', handleObjectTransforming)
    canvas.off('object:modified', handleObjectModified)
    canvas.off('path:created', handlePathCreated)
    canvas.off('text:changed', recordHistory)
  }

  function installKeyboardEvents() {
    window.addEventListener('keydown', handleKeydown)
  }

  function uninstallKeyboardEvents() {
    window.removeEventListener('keydown', handleKeydown)
  }

  function handleKeydown(event) {
    if (!ready.value || !canvas) {
      return
    }

    const target = event.target
    const isTyping = ['INPUT', 'TEXTAREA'].includes(target?.tagName)
      || target?.isContentEditable

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      if (!isTyping) {
        event.preventDefault()
        undo()
      }
      return
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
      if (!isTyping) {
        event.preventDefault()
        redo()
      }
      return
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault()
      saveProject()
      return
    }

    if (isTyping || event.ctrlKey || event.metaKey || event.altKey) {
      return
    }

    if (['Delete', 'Backspace'].includes(event.key)) {
      event.preventDefault()
      deleteSelection()
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      setTool('select')
      return
    }

    const hotkey = event.key.toUpperCase()
    const targetTool = tools.find(item => item.hotkey === hotkey)
    if (targetTool) {
      event.preventDefault()
      setTool(targetTool.value)
    }
  }

  function getPointer(event) {
    return event.scenePoint || canvas?.getScenePoint?.(event.e) || { x: 0, y: 0 }
  }

  function updateSelectionState() {
    hasSelection.value = Boolean(canvas?.getActiveObjects?.().length)
  }

  async function setTool(value) {
    if (!canvas) {
      tool.value = value
      return
    }

    tool.value = value
    canvas.isDrawingMode = value === 'pencil'
    canvas.selection = value === 'select'
    canvas.defaultCursor = [
      'rect',
      'arrow',
      'text',
      'step',
      'spotlight',
      'mosaic',
      'magnifier',
      'heal',
      'smart',
    ].includes(value)
      ? 'crosshair'
      : 'default'

    canvas.getObjects().forEach((object) => {
      if (object === baseImage || object.annotationType === 'spotlight-overlay') {
        object.selectable = false
        object.evented = false
        return
      }

      if (object === smartGuide) {
        return
      }

      object.selectable = value === 'select'
      object.evented = value === 'select'
    })

    if (value === 'pencil') {
      const brush = new PencilBrush(canvas)
      brush.color = color.value
      brush.width = strokeWidth.value
      canvas.freeDrawingBrush = brush
    }

    if (value === 'smart' && !smartRegions.value.length) {
      await loadSmartRegions()
    }

    if (value !== 'smart') {
      removeSmartGuide()
    }

    if (value !== 'select') {
      canvas.discardActiveObject()
      updateSelectionState()
      canvas.requestRenderAll()
    }
  }

  function handleMouseDown(event) {
    if (!canvas || ['select', 'pencil'].includes(tool.value)) {
      return
    }

    const point = getPointer(event)

    if (tool.value === 'smart') {
      createSmartAnnotation(point)
      return
    }

    if (event.target && event.target !== baseImage) {
      return
    }

    if (tool.value === 'text') {
      addText(point)
      return
    }

    if (tool.value === 'step') {
      addStep(point)
      return
    }

    drawingStart = point

    if (tool.value === 'arrow') {
      drawingObject = new Line(
        [point.x, point.y, point.x, point.y],
        {
          stroke: color.value,
          strokeWidth: strokeWidth.value,
          selectable: false,
          evented: false,
          excludeFromExport: true,
        },
      )
      addWithoutHistory(drawingObject)
      return
    }

    if (tool.value === 'rect') {
      drawingObject = createRectObject({
        left: point.x,
        top: point.y,
        width: 1,
        height: 1,
      })
      drawingObject.set({ selectable: false, evented: false })
      addWithoutHistory(drawingObject)
      return
    }

    drawingObject = createAreaPreview(point)
    addWithoutHistory(drawingObject)
  }

  function handleMouseMove(event) {
    if (!canvas) {
      return
    }

    const point = getPointer(event)

    if (tool.value === 'smart' && !drawingObject) {
      updateSmartGuide(point)
      return
    }

    if (!drawingObject || !drawingStart) {
      return
    }

    if (tool.value === 'arrow') {
      drawingObject.set({ x2: point.x, y2: point.y })
      drawingObject.setCoords()
      canvas.requestRenderAll()
      return
    }

    const rect = normalizeRect(drawingStart, point)
    drawingObject.set({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    })
    drawingObject.setCoords()
    canvas.requestRenderAll()
  }

  async function handleMouseUp(event) {
    if (!canvas || !drawingObject || !drawingStart) {
      return
    }

    const activeTool = tool.value
    const end = getPointer(event)
    const start = drawingStart
    const object = drawingObject
    drawingObject = null
    drawingStart = null

    if (activeTool === 'rect') {
      object.set({ selectable: true, evented: true })
      object.annotationType = 'rect'
      canvas.setActiveObject(object)
      await setTool('select')
      recordHistory()
      return
    }

    if (activeTool === 'arrow') {
      removeWithoutHistory(object)
      const arrow = createArrow(start, end)
      canvas.add(arrow)
      canvas.setActiveObject(arrow)
      await setTool('select')
      recordHistory()
      return
    }

    const rect = clampRect(
      normalizeRect(start, end),
      sourceWidth.value,
      sourceHeight.value,
    )
    removeWithoutHistory(object)

    if (rect.width < 8 || rect.height < 8) {
      canvas.requestRenderAll()
      return
    }

    if (activeTool === 'spotlight') {
      createSpotlight(rect)
    }
    else if (activeTool === 'mosaic') {
      await createMosaic(rect)
    }
    else if (activeTool === 'magnifier') {
      await createMagnifier(rect)
    }
    else if (activeTool === 'heal') {
      await createHeal(rect)
    }

    await setTool('select')
    recordHistory()
  }

  function createRectObject(rect, options = {}) {
    const object = new Rect({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      fill: 'rgba(255, 59, 48, 0.02)',
      stroke: color.value,
      strokeWidth: strokeWidth.value,
      rx: 10,
      ry: 10,
      transparentCorners: false,
      cornerColor: '#ffffff',
      cornerStrokeColor: color.value,
      borderColor: color.value,
      ...options,
    })
    object.annotationType = options.annotationType || 'rect'
    return object
  }

  function createAreaPreview(point) {
    const object = new Rect({
      left: point.x,
      top: point.y,
      width: 1,
      height: 1,
      fill: 'rgba(47, 128, 237, 0.08)',
      stroke: '#2f80ed',
      strokeWidth: 3,
      strokeDashArray: [10, 8],
      selectable: false,
      evented: false,
      excludeFromExport: true,
    })
    object.annotationType = 'selection-preview'
    return object
  }

  function createArrow(start, end) {
    const angle = Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI
    const line = new Line(
      [start.x, start.y, end.x, end.y],
      {
        stroke: color.value,
        strokeWidth: strokeWidth.value,
        selectable: false,
        evented: false,
      },
    )
    const headSize = Math.max(18, strokeWidth.value * 4)
    const head = new Triangle({
      left: end.x,
      top: end.y,
      width: headSize,
      height: headSize * 1.25,
      fill: color.value,
      angle: angle + 90,
      originX: 'center',
      originY: 'center',
      selectable: false,
      evented: false,
    })

    const arrow = new Group([line, head], {
      selectable: true,
      evented: true,
      transparentCorners: false,
      cornerColor: '#ffffff',
      cornerStrokeColor: color.value,
      borderColor: color.value,
    })
    arrow.annotationType = 'arrow'
    return arrow
  }

  function addText(point, value = '输入说明文字') {
    const text = new Textbox(value, {
      left: point.x,
      top: point.y,
      width: Math.min(440, sourceWidth.value * 0.58),
      fill: '#111827',
      fontSize: Math.max(28, Math.round(sourceWidth.value * 0.032)),
      fontFamily: 'sans-serif',
      backgroundColor: 'rgba(255,255,255,0.90)',
      padding: 8,
      borderColor: color.value,
      cornerColor: '#ffffff',
      cornerStrokeColor: color.value,
      transparentCorners: false,
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
      fill: color.value,
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
      transparentCorners: false,
      cornerColor: '#ffffff',
      cornerStrokeColor: color.value,
      borderColor: color.value,
    })
    marker.annotationType = 'step'
    marker.stepNumber = number

    canvas.add(marker)
    canvas.setActiveObject(marker)
    setTool('select')
    recordHistory()
  }

  function resetStepCounter() {
    stepCounter.value = 1
    ElMessage.success('步骤编号已从 1 重新开始')
  }

  function createSpotlight(rect) {
    const spotlightId = nanoid(10)
    const overlay = new Rect({
      left: 0,
      top: 0,
      width: sourceWidth.value,
      height: sourceHeight.value,
      fill: `rgba(0, 0, 0, ${spotlightOpacity.value / 100})`,
      selectable: false,
      evented: false,
      hasControls: false,
      hasBorders: false,
    })
    overlay.annotationType = 'spotlight-overlay'
    overlay.spotlightId = spotlightId

    const controller = createRectObject(rect, {
      annotationType: 'spotlight',
      fill: 'rgba(255,255,255,0.002)',
      stroke: color.value,
      strokeWidth: Math.max(2, strokeWidth.value - 1),
      lockRotation: true,
    })
    controller.spotlightId = spotlightId

    syncSpotlightClip(controller, overlay)
    canvas.add(overlay)
    canvas.sendObjectToBack(overlay)
    canvas.sendObjectToBack(baseImage)
    canvas.add(controller)
    canvas.setActiveObject(controller)
  }

  function syncSpotlightClip(controller, overlay) {
    if (!controller || !overlay) {
      return
    }

    const bounds = controller.getBoundingRect()
    const clip = new Rect({
      left: bounds.left,
      top: bounds.top,
      width: bounds.width,
      height: bounds.height,
      rx: Math.min(16, bounds.width / 8),
      ry: Math.min(16, bounds.height / 8),
      absolutePositioned: true,
      inverted: true,
      fill: '#000000',
      originX: 'left',
      originY: 'top',
    })

    overlay.set({ clipPath: clip })
    overlay.dirty = true
  }

  function syncSpotlightForController(controller) {
    if (controller?.annotationType !== 'spotlight' || !controller.spotlightId) {
      return
    }

    const overlay = canvas.getObjects().find((object) => {
      return object.annotationType === 'spotlight-overlay'
        && object.spotlightId === controller.spotlightId
    })
    syncSpotlightClip(controller, overlay)
    canvas.requestRenderAll()
  }

  function syncAllSpotlights() {
    canvas?.getObjects().forEach((object) => {
      if (object.annotationType === 'spotlight') {
        syncSpotlightForController(object)
      }
    })
  }

  async function createMosaic(rect) {
    const imageElement = getCanvasImageElement(baseImage)
    if (!imageElement) {
      return
    }

    const dataUrl = pixelateImageDataUrl(
      imageElement,
      rect,
      mosaicBlockSize.value,
    )
    const image = await FabricImage.fromURL(dataUrl)
    image.set({
      left: rect.left,
      top: rect.top,
      selectable: true,
      evented: true,
      transparentCorners: false,
      cornerColor: '#ffffff',
      cornerStrokeColor: color.value,
      borderColor: color.value,
    })
    image.annotationType = 'mosaic'
    image.sourceRect = rect
    canvas.add(image)
    canvas.setActiveObject(image)
  }

  async function createMagnifier(rect) {
    const imageElement = getCanvasImageElement(baseImage)
    if (!imageElement) {
      return
    }

    const squareSize = Math.max(rect.width, rect.height)
    const square = clampRect(
      {
        left: rect.left + rect.width / 2 - squareSize / 2,
        top: rect.top + rect.height / 2 - squareSize / 2,
        width: squareSize,
        height: squareSize,
      },
      sourceWidth.value,
      sourceHeight.value,
    )
    const dataUrl = cropImageDataUrl(imageElement, square)
    const image = await FabricImage.fromURL(dataUrl)
    const diameter = Math.min(
      Math.max(180, square.width * magnifierZoom.value),
      Math.min(sourceWidth.value, sourceHeight.value) * 0.55,
    )
    const scale = diameter / Math.max(1, image.width)

    image.set({
      left: 0,
      top: 0,
      originX: 'center',
      originY: 'center',
      scaleX: scale,
      scaleY: scale,
      selectable: false,
      evented: false,
      clipPath: new Circle({
        radius: Math.max(1, image.width / 2),
        originX: 'center',
        originY: 'center',
      }),
    })

    const border = new Circle({
      left: 0,
      top: 0,
      radius: diameter / 2,
      originX: 'center',
      originY: 'center',
      fill: 'rgba(255,255,255,0)',
      stroke: color.value,
      strokeWidth: Math.max(3, strokeWidth.value),
      selectable: false,
      evented: false,
    })

    let left = square.right + diameter / 2 + 24
    if (left + diameter / 2 > sourceWidth.value) {
      left = square.left - diameter / 2 - 24
    }
    left = Math.max(
      diameter / 2 + 8,
      Math.min(sourceWidth.value - diameter / 2 - 8, left),
    )

    const top = Math.max(
      diameter / 2 + 8,
      Math.min(
        sourceHeight.value - diameter / 2 - 8,
        square.top + square.height / 2,
      ),
    )

    const magnifier = new Group([image, border], {
      left,
      top,
      originX: 'center',
      originY: 'center',
      selectable: true,
      evented: true,
      transparentCorners: false,
      cornerColor: '#ffffff',
      cornerStrokeColor: color.value,
      borderColor: color.value,
    })
    magnifier.annotationType = 'magnifier'
    magnifier.sourceRect = square
    magnifier.magnifierZoom = magnifierZoom.value

    canvas.add(magnifier)
    canvas.setActiveObject(magnifier)
  }

  async function createHeal(rect) {
    const imageElement = getCanvasImageElement(baseImage)
    if (!imageElement) {
      return
    }

    const healed = healImageDataUrl(imageElement, rect, {
      feather: healFeather.value,
    })
    const image = await FabricImage.fromURL(healed.dataUrl)
    image.set({
      left: rect.left,
      top: rect.top,
      selectable: true,
      evented: true,
      transparentCorners: false,
      cornerColor: '#ffffff',
      cornerStrokeColor: '#34c759',
      borderColor: '#34c759',
    })
    image.annotationType = 'heal'
    image.sourceRect = rect
    image.healMethod = healed.method
    image.healSourceDirection = healed.sourceDirection
    image.healSourceRect = healed.sourceRect

    canvas.add(image)
    canvas.setActiveObject(image)
  }

  async function loadSmartRegions({ silent = false } = {}) {
    const deviceId = capture.value?.deviceId
    if (!deviceId || smartLoading.value) {
      return smartRegions.value
    }

    smartLoading.value = true
    try {
      const xml = await window.$preload.adb.deviceShell(
        deviceId,
        'uiautomator dump /sdcard/escrcpy_documentation_ui.xml >/dev/null && cat /sdcard/escrcpy_documentation_ui.xml && rm -f /sdcard/escrcpy_documentation_ui.xml',
      )
      smartRegions.value = parseUiHierarchy(xml, {
        width: sourceWidth.value,
        height: sourceHeight.value,
      })

      if (!silent) {
        if (smartRegions.value.length) {
          ElMessage.success(`已识别 ${smartRegions.value.length} 个界面区域`)
        }
        else {
          ElMessage.info('当前页面没有可吸附的 Android UI 区域')
        }
      }
    }
    catch (error) {
      smartRegions.value = []
      if (!silent) {
        ElMessage.warning(`智能框选暂不可用：${error?.message || error}`)
      }
    }
    finally {
      smartLoading.value = false
    }

    return smartRegions.value
  }

  function updateSmartGuide(point) {
    const region = findSmallestRegionAt(smartRegions.value, point)
    hoverRegion.value = region

    if (!region) {
      removeSmartGuide()
      return
    }

    if (!smartGuide) {
      smartGuide = new Rect({
        fill: 'rgba(47, 128, 237, 0.08)',
        stroke: '#2f80ed',
        strokeWidth: 3,
        strokeDashArray: [9, 6],
        selectable: false,
        evented: false,
        excludeFromExport: true,
      })
      smartGuide.annotationType = 'smart-guide'
      canvas.add(smartGuide)
    }

    smartGuide.set({
      left: region.left,
      top: region.top,
      width: region.width,
      height: region.height,
    })
    smartGuide.setCoords()
    canvas.requestRenderAll()
  }

  function removeSmartGuide() {
    hoverRegion.value = null
    if (canvas && smartGuide) {
      removeWithoutHistory(smartGuide)
    }
    smartGuide = null
  }

  function createSmartAnnotation(point) {
    const region = findSmallestRegionAt(smartRegions.value, point)
    if (!region) {
      return
    }

    removeSmartGuide()
    const rect = createRectObject(region, {
      annotationType: 'smart-rect',
    })
    rect.sourceRect = region
    canvas.add(rect)
    canvas.setActiveObject(rect)
    setTool('select')
    recordHistory()
  }

  function handleObjectTransforming(event) {
    const object = event.target
    if (object?.annotationType === 'spotlight') {
      syncSpotlightForController(object)
    }
  }

  function handleObjectModified(event) {
    const object = event.target
    if (object?.annotationType === 'spotlight') {
      syncSpotlightForController(object)
    }
    recordHistory()
  }

  function handlePathCreated(event) {
    if (event.path) {
      event.path.annotationType = 'pencil'
    }
    recordHistory()
  }

  function applyStyleToSelection() {
    if (!canvas) {
      return
    }

    if (canvas.isDrawingMode && canvas.freeDrawingBrush) {
      canvas.freeDrawingBrush.color = color.value
      canvas.freeDrawingBrush.width = strokeWidth.value
    }

    const objects = canvas.getActiveObjects()
    if (!objects.length) {
      return
    }

    objects.forEach((object) => {
      switch (object.annotationType) {
        case 'rect':
        case 'smart-rect':
        case 'spotlight':
          object.set({
            stroke: color.value,
            strokeWidth: strokeWidth.value,
            borderColor: color.value,
            cornerStrokeColor: color.value,
          })
          if (object.annotationType === 'spotlight') {
            syncSpotlightForController(object)
          }
          break
        case 'arrow':
          object.getObjects?.().forEach((child) => {
            if (child.type === 'line') {
              child.set({
                stroke: color.value,
                strokeWidth: strokeWidth.value,
              })
            }
            else {
              child.set({ fill: color.value })
            }
          })
          object.set({
            borderColor: color.value,
            cornerStrokeColor: color.value,
          })
          break
        case 'step':
          object.getObjects?.()[0]?.set?.({ fill: color.value })
          object.set({
            borderColor: color.value,
            cornerStrokeColor: color.value,
          })
          break
        case 'magnifier':
          object.getObjects?.()[1]?.set?.({
            stroke: color.value,
            strokeWidth: strokeWidth.value,
          })
          object.set({
            borderColor: color.value,
            cornerStrokeColor: color.value,
          })
          break
        default:
          object.set?.({
            borderColor: color.value,
            cornerStrokeColor: color.value,
          })
          break
      }
      object.setCoords?.()
    })

    canvas.requestRenderAll()
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

    selected.forEach((item) => {
      if (item.annotationType === 'spotlight' && item.spotlightId) {
        const overlay = canvas.getObjects().find((object) => {
          return object.annotationType === 'spotlight-overlay'
            && object.spotlightId === item.spotlightId
        })
        if (overlay) {
          canvas.remove(overlay)
        }
      }
      canvas.remove(item)
    })

    historyLocked = false
    updateSelectionState()
    canvas.requestRenderAll()
    recordHistory()
  }

  function addWithoutHistory(object) {
    historyLocked = true
    canvas.add(object)
    historyLocked = false
  }

  function removeWithoutHistory(object) {
    if (!canvas || !object) {
      return
    }
    historyLocked = true
    canvas.remove(object)
    historyLocked = false
  }

  function getSerializableObjects() {
    if (!canvas) {
      return []
    }

    return canvas.getObjects()
      .filter((object) => {
        return object !== baseImage
          && object !== smartGuide
          && object.annotationType !== 'selection-preview'
          && object.annotationType !== 'smart-guide'
      })
      .map(object => object.toObject(CUSTOM_PROPS))
  }

  function serializeAnnotations() {
    return JSON.stringify({ objects: getSerializableObjects() })
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
    removeSmartGuide()
    const value = JSON.parse(snapshot)
    await canvas.loadFromJSON(value)
    canvas.add(baseImage)
    canvas.sendObjectToBack(baseImage)
    canvas.backgroundColor = '#ffffff'
    rehydrateAnnotations()
    canvas.requestRenderAll()
    historyLocked = false
    updateSelectionState()
  }

  function rehydrateAnnotations() {
    if (!canvas) {
      return
    }

    canvas.getObjects().forEach((object) => {
      if (object === baseImage) {
        object.set({ selectable: false, evented: false })
        return
      }

      if (object.annotationType === 'spotlight-overlay') {
        object.set({
          selectable: false,
          evented: false,
          hasControls: false,
          hasBorders: false,
        })
      }

      if (object.annotationType === 'spotlight') {
        object.set({ lockRotation: true })
      }
    })

    syncAllSpotlights()
  }

  function inferNextStepNumber() {
    const values = canvas?.getObjects()
      .filter(object => object.annotationType === 'step')
      .map(object => Number(object.stepNumber) || 0) || []

    return Math.max(0, ...values) + 1
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
    return {
      version: 2,
      source: {
        originalPath: capture.value?.originalPath,
        deviceId: capture.value?.deviceId,
        deviceName: capture.value?.deviceName,
        width: sourceWidth.value,
        height: sourceHeight.value,
      },
      editor: {
        stepCounter: stepCounter.value,
        annotationColor: color.value,
        strokeWidth: strokeWidth.value,
        spotlightOpacity: spotlightOpacity.value,
        mosaicBlockSize: mosaicBlockSize.value,
        magnifierZoom: magnifierZoom.value,
        healFeather: healFeather.value,
      },
      annotations: getSerializableObjects(),
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
      removeSmartGuide()
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

  async function revealRoot() {
    if (!capture.value?.root) {
      return false
    }
    return window.$preload.ipcRenderer.invoke(
      'documentation-reveal-path',
      capture.value.root,
    )
  }

  async function close() {
    if (dirty.value) {
      await saveProject({ silent: true })
    }
    onClose?.()
  }

  function updateCssSize() {
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

  onBeforeUnmount(dispose)

  return {
    ready,
    dirty,
    tool,
    tools,
    color,
    presetColors,
    strokeWidth,
    spotlightOpacity,
    mosaicBlockSize,
    magnifierZoom,
    healFeather,
    stepCounter,
    sourceWidth,
    sourceHeight,
    hasSelection,
    smartRegions,
    smartLoading,
    hoverRegionText,
    canUndo,
    canRedo,
    init,
    dispose,
    setTool,
    applyStyleToSelection,
    deleteSelection,
    resetStepCounter,
    loadSmartRegions,
    undo,
    redo,
    saveProject,
    exportPng,
    revealRoot,
    close,
  }
}

export default useAnnotationEditor
