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

export function extractUiHierarchyXml(value = '') {
  const match = String(value).match(/(<hierarchy[\s\S]*?<\/hierarchy>)/i)
  return match ? match[1] : String(value)
}

export function parseUiHierarchy(xml = '', { width, height } = {}) {
  if (!xml || typeof DOMParser === 'undefined') {
    return []
  }

  const document = new DOMParser().parseFromString(
    extractUiHierarchyXml(xml),
    'text/xml',
  )
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

function getSourceCanvas(image) {
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth || image.width
  canvas.height = image.naturalHeight || image.height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  context.drawImage(image, 0, 0)
  return { canvas, context }
}

function getPatchStats(context, rect) {
  const width = Math.max(1, Math.round(rect.width))
  const height = Math.max(1, Math.round(rect.height))
  const imageData = context.getImageData(
    Math.round(rect.left),
    Math.round(rect.top),
    width,
    height,
  )
  const { data } = imageData
  const stride = Math.max(1, Math.floor(Math.sqrt((width * height) / 5000)))

  let count = 0
  let sumR = 0
  let sumG = 0
  let sumB = 0
  let sumSq = 0

  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const index = (y * width + x) * 4
      const r = data[index]
      const g = data[index + 1]
      const b = data[index + 2]
      const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722
      sumR += r
      sumG += g
      sumB += b
      sumSq += luminance * luminance
      count++
    }
  }

  const meanR = sumR / Math.max(1, count)
  const meanG = sumG / Math.max(1, count)
  const meanB = sumB / Math.max(1, count)
  const meanLum = meanR * 0.2126 + meanG * 0.7152 + meanB * 0.0722
  const variance = Math.max(0, sumSq / Math.max(1, count) - meanLum * meanLum)

  return {
    color: [Math.round(meanR), Math.round(meanG), Math.round(meanB)],
    variance,
  }
}

function buildHealCandidates(target, width, height) {
  const gap = Math.max(2, Math.round(Math.min(target.width, target.height) * 0.08))
  const candidates = []

  const add = (direction, left, top) => {
    const candidate = clampRect(
      {
        left,
        top,
        width: target.width,
        height: target.height,
      },
      width,
      height,
    )

    if (candidate.width >= target.width * 0.92 && candidate.height >= target.height * 0.92) {
      candidates.push({ direction, rect: candidate })
    }
  }

  add('top', target.left, target.top - target.height - gap)
  add('bottom', target.left, target.bottom + gap)
  add('left', target.left - target.width - gap, target.top)
  add('right', target.right + gap, target.top)

  return candidates
}

function applyFeatherMask(context, width, height, feather) {
  const amount = Math.max(0, Math.min(Math.min(width, height) / 3, feather))
  if (amount < 1) {
    return
  }

  context.globalCompositeOperation = 'destination-in'

  const horizontal = context.createLinearGradient(0, 0, width, 0)
  horizontal.addColorStop(0, 'rgba(255,255,255,0)')
  horizontal.addColorStop(amount / width, 'rgba(255,255,255,1)')
  horizontal.addColorStop(1 - amount / width, 'rgba(255,255,255,1)')
  horizontal.addColorStop(1, 'rgba(255,255,255,0)')
  context.fillStyle = horizontal
  context.fillRect(0, 0, width, height)

  const vertical = context.createLinearGradient(0, 0, 0, height)
  vertical.addColorStop(0, 'rgba(255,255,255,0)')
  vertical.addColorStop(amount / height, 'rgba(255,255,255,1)')
  vertical.addColorStop(1 - amount / height, 'rgba(255,255,255,1)')
  vertical.addColorStop(1, 'rgba(255,255,255,0)')
  context.fillStyle = vertical
  context.fillRect(0, 0, width, height)

  context.globalCompositeOperation = 'source-over'
}

export function healImageDataUrl(image, rect, options = {}) {
  const imageWidth = image.naturalWidth || image.width
  const imageHeight = image.naturalHeight || image.height
  const target = clampRect(rect, imageWidth, imageHeight)
  const width = Math.max(1, Math.round(target.width))
  const height = Math.max(1, Math.round(target.height))
  const { context } = getSourceCanvas(image)

  const candidates = buildHealCandidates(target, imageWidth, imageHeight)
    .map((candidate) => {
      const stats = getPatchStats(context, candidate.rect)
      return { ...candidate, stats }
    })
    .sort((a, b) => a.stats.variance - b.stats.variance)

  const best = candidates[0]
  const output = document.createElement('canvas')
  output.width = width
  output.height = height
  const outputContext = output.getContext('2d')
  const uniformThreshold = options.uniformThreshold ?? 90

  if (best && best.stats.variance <= uniformThreshold) {
    const [r, g, b] = best.stats.color
    outputContext.fillStyle = `rgb(${r}, ${g}, ${b})`
    outputContext.fillRect(0, 0, width, height)
  }
  else if (best) {
    outputContext.drawImage(
      image,
      best.rect.left,
      best.rect.top,
      best.rect.width,
      best.rect.height,
      0,
      0,
      width,
      height,
    )
  }
  else {
    const fallback = getPatchStats(context, target)
    const [r, g, b] = fallback.color
    outputContext.fillStyle = `rgb(${r}, ${g}, ${b})`
    outputContext.fillRect(0, 0, width, height)
  }

  applyFeatherMask(
    outputContext,
    width,
    height,
    options.feather ?? Math.max(2, Math.round(Math.min(width, height) * 0.08)),
  )

  return {
    dataUrl: output.toDataURL('image/png'),
    method: best?.stats?.variance <= uniformThreshold ? 'fill' : 'patch',
    sourceDirection: best?.direction || 'average',
    sourceRect: best?.rect || null,
  }
}

export function getCanvasImageElement(fabricImage) {
  return fabricImage?.getElement?.() || null
}
