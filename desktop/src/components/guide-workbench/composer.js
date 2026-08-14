function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = dataUrl
  })
}

function roundedRect(ctx, x, y, width, height, radius = 24) {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.roundRect(x, y, width, height, r)
}

function fillTextBlock(ctx, text, x, y, maxWidth, options = {}) {
  const {
    font = '32px sans-serif',
    fillStyle = '#374151',
    lineHeight = 44,
    maxLines = 3,
  } = options
  ctx.font = font
  ctx.fillStyle = fillStyle
  ctx.textBaseline = 'top'

  const chars = Array.from(String(text || ''))
  const lines = []
  let line = ''
  for (const char of chars) {
    const candidate = line + char
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line)
      line = char
      if (lines.length >= maxLines) {
        break
      }
    }
    else {
      line = candidate
    }
  }
  if (line && lines.length < maxLines) {
    lines.push(line)
  }

  lines.forEach((value, index) => {
    ctx.fillText(value, x, y + index * lineHeight, maxWidth)
  })
  return Math.max(lineHeight, lines.length * lineHeight)
}

function drawBadge(ctx, number, x, y, radius = 30) {
  ctx.save()
  ctx.fillStyle = '#2563eb'
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.font = `700 ${Math.round(radius * 1.05)}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(number), x, y + 1)
  ctx.restore()
}

function fitInto(image, maxWidth, maxHeight = Infinity) {
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1)
  return {
    width: Math.round(image.width * scale),
    height: Math.round(image.height * scale),
  }
}

async function prepareItems(items) {
  const result = []
  for (const item of items) {
    result.push({
      ...item,
      image: await loadImage(item.dataUrl),
    })
  }
  return result
}

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  return canvas
}

function drawCard(ctx, item, rect, index, options = {}) {
  const { showCaption = true, badge = true } = options
  const padding = 28
  const captionHeight = showCaption && item.caption ? 82 : 34

  ctx.save()
  roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, 28)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.strokeStyle = '#e5e7eb'
  ctx.lineWidth = 2
  ctx.stroke()

  const maxImageWidth = rect.width - padding * 2
  const maxImageHeight = rect.height - padding * 2 - captionHeight
  const size = fitInto(item.image, maxImageWidth, maxImageHeight)
  const imageX = rect.x + (rect.width - size.width) / 2
  const imageY = rect.y + padding
  ctx.drawImage(item.image, imageX, imageY, size.width, size.height)

  if (badge) {
    drawBadge(ctx, item.stepNumber || index + 1, rect.x + 46, rect.y + 46, 27)
  }

  if (showCaption && item.caption) {
    fillTextBlock(
      ctx,
      item.caption,
      rect.x + padding,
      rect.y + rect.height - captionHeight + 15,
      rect.width - padding * 2,
      { font: '28px sans-serif', lineHeight: 38, maxLines: 2 },
    )
  }
  ctx.restore()
}

async function composeVertical(items, title) {
  const prepared = await prepareItems(items)
  const width = 1320
  const margin = 64
  const gap = 42
  const titleHeight = title ? 118 : 48
  const cards = prepared.map((item) => {
    const size = fitInto(item.image, width - margin * 2 - 56, 1500)
    const caption = item.caption ? 100 : 42
    return { item, height: size.height + 56 + caption }
  })
  const height = titleHeight + margin + cards.reduce((sum, card) => sum + card.height, 0) + gap * Math.max(0, cards.length - 1) + margin
  const canvas = makeCanvas(width, height)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#f4f7fb'
  ctx.fillRect(0, 0, width, height)

  let y = margin
  if (title) {
    fillTextBlock(ctx, title, margin, y, width - margin * 2, {
      font: '700 46px sans-serif',
      fillStyle: '#111827',
      lineHeight: 58,
      maxLines: 2,
    })
    y += titleHeight
  }

  cards.forEach((card, index) => {
    drawCard(ctx, card.item, {
      x: margin,
      y,
      width: width - margin * 2,
      height: card.height,
    }, index)
    y += card.height + gap
  })
  return canvas
}

async function composeGrid(items, title) {
  const prepared = await prepareItems(items)
  const width = 1800
  const margin = 64
  const gap = 42
  const titleHeight = title ? 118 : 48
  const cardWidth = (width - margin * 2 - gap) / 2
  const cardHeight = 1180
  const rows = Math.ceil(prepared.length / 2)
  const height = margin + titleHeight + rows * cardHeight + Math.max(0, rows - 1) * gap + margin
  const canvas = makeCanvas(width, height)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#f4f7fb'
  ctx.fillRect(0, 0, width, height)

  if (title) {
    fillTextBlock(ctx, title, margin, margin, width - margin * 2, {
      font: '700 48px sans-serif',
      fillStyle: '#111827',
      lineHeight: 60,
      maxLines: 2,
    })
  }

  const top = margin + titleHeight
  prepared.forEach((item, index) => {
    const row = Math.floor(index / 2)
    const col = index % 2
    drawCard(ctx, item, {
      x: margin + col * (cardWidth + gap),
      y: top + row * (cardHeight + gap),
      width: cardWidth,
      height: cardHeight,
    }, index)
  })
  return canvas
}

async function composePair(items, title, labels) {
  const prepared = await prepareItems(items.slice(0, 2))
  const width = 1800
  const margin = 64
  const gap = 44
  const titleHeight = title ? 118 : 48
  const cardWidth = (width - margin * 2 - gap) / 2
  const cardHeight = 1240
  const height = margin + titleHeight + cardHeight + margin
  const canvas = makeCanvas(width, height)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#f4f7fb'
  ctx.fillRect(0, 0, width, height)

  if (title) {
    fillTextBlock(ctx, title, margin, margin, width - margin * 2, {
      font: '700 48px sans-serif',
      fillStyle: '#111827',
      lineHeight: 60,
      maxLines: 2,
    })
  }

  prepared.forEach((item, index) => {
    const x = margin + index * (cardWidth + gap)
    drawCard(ctx, item, {
      x,
      y: margin + titleHeight,
      width: cardWidth,
      height: cardHeight,
    }, index)

    const label = labels?.[index]
    if (label) {
      ctx.save()
      ctx.font = '700 34px sans-serif'
      ctx.fillStyle = '#111827'
      ctx.textAlign = 'center'
      ctx.fillText(label, x + cardWidth / 2, margin + titleHeight + 54)
      ctx.restore()
    }
  })
  return canvas
}

export async function composeGuide({ template, title, items }) {
  if (!items?.length) {
    throw new Error('请至少选择一张图片')
  }

  let canvas
  if (template === 'grid') {
    canvas = await composeGrid(items, title)
  }
  else if (template === 'compare') {
    if (items.length < 2) {
      throw new Error('前后对比至少需要选择两张图片')
    }
    canvas = await composePair(items, title, ['Before', 'After'])
  }
  else if (template === 'dual') {
    if (items.length < 2) {
      throw new Error('同图双步骤至少需要选择两个版本')
    }
    canvas = await composePair(items, title, ['Step 1', 'Step 2'])
  }
  else {
    canvas = await composeVertical(items, title)
  }

  return {
    dataUrl: canvas.toDataURL('image/png'),
    width: canvas.width,
    height: canvas.height,
  }
}

export default composeGuide
