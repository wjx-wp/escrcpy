import { BaseFabricObject, Canvas, Group, Rect } from 'fabric'

// Fabric.js 7 changed the default object origin to center. This editor stores
// Android screenshot coordinates in top-left space, so keep Fabric aligned to
// that coordinate system. Explicit center-origin objects (step markers,
// magnifiers, arrow heads, etc.) still override these defaults individually.
BaseFabricObject.ownDefaults.originX = 'left'
BaseFabricObject.ownDefaults.originY = 'top'

const originalAdd = Canvas.prototype.add
const originalRemove = Canvas.prototype.remove

function getSpotlightOverlay(canvas) {
  return canvas.getObjects().find(item => item.annotationType === 'spotlight-overlay')
}

function getSpotlightControllers(canvas) {
  return canvas.getObjects().filter(item => item.annotationType === 'spotlight')
}

function rebuildSpotlightMask(canvas) {
  const overlay = getSpotlightOverlay(canvas)
  if (!overlay) {
    return
  }

  const controllers = getSpotlightControllers(canvas)
  if (!controllers.length) {
    return
  }

  const holes = controllers.map((controller) => {
    const bounds = controller.getBoundingRect()
    return new Rect({
      left: bounds.left,
      top: bounds.top,
      width: bounds.width,
      height: bounds.height,
      rx: Math.min(16, bounds.width / 8),
      ry: Math.min(16, bounds.height / 8),
      fill: '#000000',
      originX: 'left',
      originY: 'top',
      selectable: false,
      evented: false,
    })
  })

  const clip = new Group(holes, {
    left: 0,
    top: 0,
    originX: 'left',
    originY: 'top',
    absolutePositioned: true,
    inverted: true,
    selectable: false,
    evented: false,
  })

  overlay.set({ clipPath: clip })
  overlay.dirty = true
  canvas.requestRenderAll()
}

function ensureSpotlightListeners(canvas) {
  if (canvas.__documentationSpotlightCompat) {
    return
  }
  canvas.__documentationSpotlightCompat = true

  const refresh = (event) => {
    if (
      event?.target?.annotationType === 'spotlight'
      || event?.target?.annotationType === 'spotlight-overlay'
    ) {
      queueMicrotask(() => rebuildSpotlightMask(canvas))
    }
  }

  canvas.on('object:added', refresh)
  canvas.on('object:moving', refresh)
  canvas.on('object:scaling', refresh)
  canvas.on('object:modified', refresh)
  canvas.on('object:removed', refresh)
}

Canvas.prototype.add = function (...objects) {
  ensureSpotlightListeners(this)

  for (const object of objects) {
    if (object?.annotationType === 'spotlight-overlay') {
      const existing = getSpotlightOverlay(this)
      if (existing && existing !== object) {
        originalRemove.call(this, existing)
      }
    }
  }

  const result = originalAdd.apply(this, objects)
  queueMicrotask(() => rebuildSpotlightMask(this))
  return result
}

Canvas.prototype.remove = function (...objects) {
  const filtered = objects.filter((object) => {
    if (object?.annotationType !== 'spotlight-overlay') {
      return true
    }

    // Deleting one spotlight must not remove the shared mask while other
    // spotlight controllers still exist. The following controller removal will
    // rebuild the mask with the remaining holes.
    return getSpotlightControllers(this).length <= 1
  })

  const result = filtered.length
    ? originalRemove.apply(this, filtered)
    : []
  queueMicrotask(() => rebuildSpotlightMask(this))
  return result
}
