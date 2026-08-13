export function parseAndroidBounds(value = '') {
  const match = String(value).match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/)
  if (!match) {
    return null
  }

  const [, left, top, right, bottom] = match.map(Number)
  const width = right - left
  const height = bottom - top

  if (width <= 1 || height <= 1) {
    return null
  }

  return {
    left,
    top,
    right,
    bottom,
    width,
    height,
    area: width * height,
  }
}

export function parseUiHierarchy(xml = '', { width, height } = {}) {
  if (!xml || typeof DOMParser === 'undefined') {
    return []
  }

  const document = new DOMParser().parseFromString(xml, 'text/xml')
  const nodes = Array.from(document.querySelectorAll('node'))
  const regions = []
  const seen = new Set()

  for (const node of nodes) {
    const bounds = parseAndroidBounds(node.getAttribute('bounds'))
    if (!bounds) {
      continue
    }

    if (width && height && bounds.width >= width * 0.98 && bounds.height >= height * 0.98) {
      continue
    }

    const key = `${bounds.left},${bounds.top},${bounds.right},${bounds.bottom}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)

    regions.push({
      ...bounds,
      text: node.getAttribute('text') || '',
      contentDesc: node.getAttribute('content-desc') || '',
      resourceId: node.getAttribute('resource-id') || '',
      className: node.getAttribute('class') || '',
      clickable: node.getAttribute('clickable') === 'true',
      enabled: node.getAttribute('enabled') !== 'false',
    })
  }

  return regions.sort((a, b) => a.area - b.area)
}

export function findSmallestRegionAt(regions = [], point = {}) {
  const { x = -1, y = -1 } = point

  return regions.find((region) => {
    return x >= region.left
      && x <= region.right
      && y >= region.top
      && y <= region.bottom
  }) || null
}

export function getRegionText(region) {
  if (!region) {
    return ''
  }

  return region.text
    || region.contentDesc
    || region.resourceId?.split('/').pop()
    || ''
}

export function normalizeRect(start, end) {
  const left = Math.min(start.x, end.x)
  const top = Math.min(start.y, end.y)
  const right = Math.max(start.x, end.x)
  const bottom = Math.max(start.y, end.y)

  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  }
}

export function clampRect(rect, width, height) {
  const left = Math.max(0, Math.min(width, rect.left))
  const top = Math.max(0, Math.min(height, rect.top))
  const right = Math.max(left, Math.min(width, rect.right ?? rect.left + rect.width))
  const bottom = Math.max(top, Math.min(height, rect.bottom ?? rect.top + rect.height))

  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  }
}

export function cropImageDataUrl(image, rect) {
  const source = clampRect(rect, image.naturalWidth || image.width, image.naturalHeight || image.height)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(source.width))
  canvas.height = Math.max(1, Math.round(source.height))

  const context = canvas.getContext('2d')
  context.drawImage(
    image,
    source.left,
    source.top,
    source.width,
    source.height,
    0,
    0,
    canvas.width,
    canvas.height,
  )

  return canvas.toDataURL('image/png')
}

export function pixelateImageDataUrl(image, rect, blockSize = 14) {
  const source = clampRect(rect, image.naturalWidth || image.width, image.naturalHeight || image.height)
  const width = Math.max(1, Math.round(source.width))
  const height = Math.max(1, Math.round(source.height))
  const smallWidth = Math.max(1, Math.round(width / Math.max(2, blockSize)))
  const smallHeight = Math.max(1, Math.round(height / Math.max(2, blockSize)))

  const small = document.createElement('canvas')
  small.width = smallWidth
  small.height = smallHeight
  const smallContext = small.getContext('2d')
  smallContext.imageSmoothingEnabled = false
  smallContext.drawImage(
    image,
    source.left,
    source.top,
    source.width,
    source.height,
    0,
    0,
    smallWidth,
    smallHeight,
  )

  const output = document.createElement('canvas')
  output.width = width
  output.height = height
  const outputContext = output.getContext('2d')
  outputContext.imageSmoothingEnabled = false
  outputContext.drawImage(
    small,
    0,
    0,
    smallWidth,
    smallHeight,
    0,
    0,
    width,
    height,
  )

  return output.toDataURL('image/png')
}

export function getCanvasImageElement(fabricImage) {
  return fabricImage?.getElement?.() || null
}
