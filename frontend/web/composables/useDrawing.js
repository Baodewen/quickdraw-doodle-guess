import { computed, reactive } from 'vue'
import { CANVAS_SIZE, drawingImage } from '../lib/strokes.js'

export function useDrawing() {
  const state = reactive({ strokes: [], current: null, revision: 0 })
  let nextId = 1

  const records = computed(() => state.current ? [...state.strokes, state.current] : state.strokes)
  const strokeCount = computed(() => records.value.length)
  const pointCount = computed(() => records.value.reduce((total, stroke) => total + stroke.points.length, 0))
  const hasDrawing = computed(() => records.value.some(stroke => stroke.tool === 'brush'))

  function begin(point, settings) {
    state.current = {
      id: nextId++,
      source: 'user',
      tool: settings.tool,
      color: settings.color,
      width: settings.width,
      startedAt: Date.now(),
      endedAt: null,
      points: [point],
    }
    state.revision++
  }

  function append(point) {
    if (!state.current) return
    state.current.points.push(point)
    state.revision++
  }

  function finish() {
    if (!state.current) return null
    const stroke = state.current
    stroke.endedAt = Date.now()
    state.strokes.push(stroke)
    state.current = null
    state.revision++
    return stroke
  }

  function clear() {
    state.strokes = []
    state.current = null
    state.revision++
  }

  function getSnapshot() {
    return {
      revision: state.revision,
      hasDrawing: hasDrawing.value,
      image_b64: drawingImage(records.value),
    }
  }

  function serialize() {
    return JSON.stringify({
      version: 1,
      canvas: { width: CANVAS_SIZE, height: CANVAS_SIZE },
      strokes: records.value,
    }, null, 2)
  }

  function cloneStroke(stroke) {
    return {
      ...stroke,
      points: stroke.points.map(point => ({ ...point })),
    }
  }

  function getStrokes() {
    return records.value.map(cloneStroke)
  }

  function restore(strokes = []) {
    const restored = strokes.map(cloneStroke)
    for (const stroke of restored) {
      if (Number.isFinite(stroke.id)) nextId = Math.max(nextId, stroke.id + 1)
    }
    state.current = null
    state.strokes = restored
    state.revision++
  }

  function getDrawing() {
    return {
      revision: state.revision,
      isDrawing: state.current !== null,
      strokes: state.strokes.map(cloneStroke),
    }
  }

  function addPaths(paths, settings) {
    const acceptedAt = Date.now()
    for (const path of paths) {
      state.strokes.push({
        id: nextId++,
        source: 'ai',
        tool: 'brush',
        color: settings.color,
        width: settings.width,
        startedAt: acceptedAt,
        endedAt: acceptedAt,
        points: path.map(point => ({ x: point.x, y: point.y, t: 0 })),
      })
    }
    state.revision++
  }

  return {
    state, records, strokeCount, pointCount, hasDrawing,
    begin, append, finish, clear, getSnapshot, getDrawing, getStrokes, restore, addPaths, serialize,
  }
}
