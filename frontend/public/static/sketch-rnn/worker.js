importScripts('./vendor/numjs.js', './vendor/sketch_rnn.js', './geometry.js')

const MODEL_SCALE = 256 / 280
const CANVAS_SIZE = 280
const FIT_MARGIN = 8
const MIN_SCALE = 0.25
const MIN_FIT = 0.3
let cachedModelName = null
let cachedModel = null

function measure(paths) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const path of paths) {
    for (const point of path) {
      if (point.x < minX) minX = point.x
      if (point.y < minY) minY = point.y
      if (point.x > maxX) maxX = point.x
      if (point.y > maxY) maxY = point.y
    }
  }
  return { minX, minY, maxX, maxY }
}

function scaleAround(paths, anchor, scale) {
  return paths.map(path => path.map(point => ({
    x: anchor.x + (point.x - anchor.x) * scale,
    y: anchor.y + (point.y - anchor.y) * scale,
  })))
}

// QuickDraw sketches are normalized to a 256-wide box. Match the generated
// stroke scale to the user's drawing so a small head does not get a full-canvas body.
function drawingScale(lines) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const line of lines) {
    for (const [x, y] of line) {
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  const extent = Math.max(maxX - minX, maxY - minY)
  return Math.min(1, Math.max(MIN_SCALE, extent / 256))
}

function fitScale(paths, anchor) {
  const bounds = measure(paths)
  let fit = 1
  const roomRight = CANVAS_SIZE - FIT_MARGIN - anchor.x
  const roomLeft = anchor.x - FIT_MARGIN
  const roomBottom = CANVAS_SIZE - FIT_MARGIN - anchor.y
  const roomTop = anchor.y - FIT_MARGIN
  const needRight = bounds.maxX - anchor.x
  const needLeft = anchor.x - bounds.minX
  const needBottom = bounds.maxY - anchor.y
  const needTop = anchor.y - bounds.minY
  if (roomRight > 0 && needRight > roomRight) fit = Math.min(fit, roomRight / needRight)
  if (roomLeft > 0 && needLeft > roomLeft) fit = Math.min(fit, roomLeft / needLeft)
  if (roomBottom > 0 && needBottom > roomBottom) fit = Math.min(fit, roomBottom / needBottom)
  if (roomTop > 0 && needTop > roomTop) fit = Math.min(fit, roomTop / needTop)
  return fit
}

function generateCandidate(model, warmState, lastStroke, lastPoint, temperature, id, baseScale) {
  let state = model.copy_state(warmState)
  let previous = lastStroke
  let x = lastPoint[0]
  let y = lastPoint[1]
  let path = []
  const paths = []

  for (let step = 0; step < model.info.max_seq_len; step++) {
    const stroke = model.sample(model.get_pdf(state), temperature)
    if (stroke[4] === 1) break

    const nextX = x + stroke[0]
    const nextY = y + stroke[1]
    if (previous[2] === 1) {
      if (path.length === 0) path.push({ x: x / MODEL_SCALE, y: y / MODEL_SCALE })
      path.push({ x: nextX / MODEL_SCALE, y: nextY / MODEL_SCALE })
    } else {
      if (path.length > 1) paths.push(path)
      path = []
    }
    x = nextX
    y = nextY
    previous = stroke
    state = model.update(stroke, state)
  }
  if (path.length > 1) paths.push(path)

  const anchor = { x: lastPoint[0] / MODEL_SCALE, y: lastPoint[1] / MODEL_SCALE }
  const scaled = scaleAround(paths, anchor, baseScale)
  const fit = Math.max(MIN_FIT, fitScale(scaled, anchor))
  const fitted = fit < 1 ? scaleAround(scaled, anchor, fit) : scaled
  const visiblePaths = self.SketchGeometry.clipPaths(fitted, CANVAS_SIZE)
  return {
    id,
    paths: visiblePaths,
    pointCount: visiblePaths.reduce((count, line) => count + line.length, 0),
  }
}

self.onmessage = async ({ data }) => {
  const { id, model, temperature, strokes } = data
  const startedAt = performance.now()

  try {
    const lines = self.SketchGeometry.visibleLines(strokes)
      .map(line => DataTool.simplify_line(
        line.map(point => [point.x * MODEL_SCALE, point.y * MODEL_SCALE]), 2))
      .filter(line => line.length > 1)

    if (lines.length === 0) {
      self.postMessage({ id, type: 'result', candidates: [], durationMs: Math.round(performance.now() - startedAt) })
      return
    }

    if (cachedModelName !== model) {
      self.postMessage({ id, type: 'loading' })
      const modelData = await fetch('../models/sketch-rnn/' + model + '.gen.json')
        .then(response => response.json())
      cachedModel = new SketchRNN(modelData)
      cachedModel.set_pixel_factor(3)
      cachedModelName = model
    }

    self.postMessage({ id, type: 'generating' })
    const prefix = DataTool.lines_to_strokes(lines)
    prefix.pop()
    let warmState = cachedModel.update(cachedModel.zero_input(), cachedModel.zero_state())
    for (const stroke of prefix) warmState = cachedModel.update(stroke, warmState)

    const lastLine = lines[lines.length - 1]
    const lastPoint = lastLine[lastLine.length - 1]
    const lastStroke = prefix[prefix.length - 1]
    const baseScale = drawingScale(lines)
    const candidates = [0, 1, 2].map(candidateId => generateCandidate(
      cachedModel, warmState, lastStroke, lastPoint, temperature, candidateId, baseScale))

    self.postMessage({
      id,
      type: 'result',
      candidates,
      durationMs: Math.round(performance.now() - startedAt),
    })
  } catch (error) {
    self.postMessage({ id, type: 'error', message: error.message })
  }
}
