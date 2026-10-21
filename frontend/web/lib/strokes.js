export const CANVAS_SIZE = 280

export function eventPoint(event, rect, startedAt) {
  return {
    x: Math.round(Math.min(CANVAS_SIZE, Math.max(0, (event.clientX - rect.left) * CANVAS_SIZE / rect.width)) * 100) / 100,
    y: Math.round(Math.min(CANVAS_SIZE, Math.max(0, (event.clientY - rect.top) * CANVAS_SIZE / rect.height)) * 100) / 100,
    t: Math.round(performance.now() - startedAt),
  }
}

export function paintStroke(context, stroke) {
  const [first, ...rest] = stroke.points
  context.strokeStyle = stroke.tool === 'eraser' ? '#ffffff' : stroke.color
  context.fillStyle = context.strokeStyle
  context.lineWidth = stroke.width
  context.lineCap = 'round'
  context.lineJoin = 'round'

  context.beginPath()
  context.arc(first.x, first.y, stroke.width / 2, 0, Math.PI * 2)
  context.fill()

  context.beginPath()
  context.moveTo(first.x, first.y)
  for (const point of rest) context.lineTo(point.x, point.y)
  context.stroke()
}

export function paintDrawing(canvas, strokes) {
  const context = canvas.getContext('2d')
  context.setTransform(canvas.width / CANVAS_SIZE, 0, 0, canvas.height / CANVAS_SIZE, 0, 0)
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
  for (const stroke of strokes) paintStroke(context, stroke)
}

export function drawingImage(strokes) {
  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_SIZE
  canvas.height = CANVAS_SIZE
  paintDrawing(canvas, strokes)
  return canvas.toDataURL('image/png')
}

export function downloadFile(url, filename) {
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
}

export function fileTimestamp() {
  return new Date().toISOString().replaceAll(':', '-').replace(/\.\d+Z$/, '')
}
