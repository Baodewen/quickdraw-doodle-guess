import { onBeforeUnmount, onMounted, reactive } from 'vue'
import { SKETCH_MODELS } from '../lib/sketchModels.js'
import { labelName } from '../lib/api.js'

const WORKER_VERSION = 4

export function useContinuation({ getDrawing, getRecognition, onAccept }) {
  const state = reactive({
    enabled: true,
    temperature: 0.4,
    status: 'waiting',
    label: null,
    model: null,
    candidates: [],
    selected: 0,
    message: '画完一笔，等 AI 连续两次确认类别后，我会尝试接着画。',
    durationMs: null,
    qualified: false,
  })

  let worker = null
  let requestId = 0
  let requestedDrawing = null

  function invalidate(message = '继续画吧，旧的续画已清除；抬笔后会重新判断。', clearRecognition = false) {
    requestId++
    requestedDrawing = null
    if (state.status === 'loading' || state.status === 'generating') {
      worker.terminate()
      worker = null
    }
    state.candidates = []
    state.selected = 0
    state.durationMs = null
    state.qualified = false
    state.status = 'waiting'
    state.message = state.enabled ? message : 'AI 续画已关闭，仍可照常画画和识别。'
    if (clearRecognition) {
      state.label = null
      state.model = null
    }
  }

  function createWorker() {
    worker = new Worker(`/static/sketch-rnn/worker.js?v=${WORKER_VERSION}`)
    worker.onmessage = ({ data }) => {
      if (data.id !== requestId) return
      if (data.type === 'loading') {
        state.status = 'loading'
        state.message = `正在读取本地${labelName(state.label)}续画模型…`
      } else if (data.type === 'generating') {
        state.status = 'generating'
        state.message = 'AI 正在后台构思三种结尾，你随时可以继续落笔。'
      } else if (data.type === 'result') {
        state.candidates = data.candidates
        const longestPath = candidate => candidate.paths.reduce(
          (longest, path) => Math.max(longest, path.length), 0)
        const firstVisible = data.candidates.findIndex(candidate => candidate.paths.length)
        const substantial = data.candidates.flatMap((candidate, index) => (
          candidate.paths.length && longestPath(candidate) >= 8 ? [index] : []
        ))
        state.selected = substantial.length
          ? substantial.reduce((best, index) => (
            longestPath(data.candidates[index]) > longestPath(data.candidates[best]) ? index : best
          ), substantial[0])
          : (firstVisible === -1 ? 0 : firstVisible)
        state.durationMs = data.durationMs
        state.status = firstVisible === -1 ? 'empty' : 'ready'
        state.message = firstVisible === -1
          ? '模型本次没有生成画板内的新线条，可以换个温度再试。'
          : '虚线是当前选中的 AI 猜想；切换候选可查看另外两种，采纳后就成为正式笔画。'
      } else if (data.type === 'error') {
        state.status = 'error'
        state.message = `续画未完成：${data.message}`
      }
    }
    worker.onerror = event => {
      state.status = 'error'
      state.message = `续画线程未完成：${event.message}`
      worker.terminate()
      worker = null
    }
  }

  function consider() {
    const drawing = getDrawing()
    const recognition = getRecognition()
    state.label = recognition.label
    state.model = SKETCH_MODELS[recognition.label] || null
    state.qualified = false

    if (!state.enabled) return
    if (drawing.isDrawing || !drawing.strokes.length || !recognition.label || recognition.revision !== drawing.revision) {
      state.status = 'waiting'
      state.message = '等待这一笔完成，并由 CNN 连续两次以至少 65% 的概率确认类别。'
      return
    }
    if (!state.model) {
      state.status = 'unsupported'
      state.message = `${labelName(recognition.label)}暂无本地续画模型，CNN 识别与笔画记录仍可使用。`
      return
    }

    state.qualified = true
    const drawingKey = `${recognition.label}:${drawing.revision}:${state.temperature}`
    if (requestedDrawing === drawingKey) return
    requestedDrawing = drawingKey
    if (!worker) createWorker()
    const id = ++requestId
    state.status = 'loading'
    state.candidates = []
    state.selected = 0
    state.durationMs = null
    state.message = '正在准备本地 Sketch-RNN 模型…'
    worker.postMessage({ id, model: state.model, temperature: state.temperature, strokes: drawing.strokes })
  }

  function setEnabled(value) {
    state.enabled = value
    invalidate()
    if (value) consider()
  }

  function setTemperature(value) {
    state.temperature = value
    invalidate('随机程度已更新，正在重新构思。')
    consider()
  }

  function regenerate() {
    invalidate('正在重新构思三种结尾。')
    consider()
  }

  function select(index) {
    state.selected = index
  }

  function cycle(direction) {
    const available = state.candidates.flatMap((candidate, index) => candidate.paths.length ? [index] : [])
    if (!available.length) return
    const position = available.indexOf(state.selected)
    state.selected = available[(position + direction + available.length) % available.length]
  }

  function accept() {
    const candidate = state.candidates[state.selected]
    if (!candidate?.paths.length) return
    onAccept(candidate.paths)
    invalidate('已采纳为正式笔画，CNN 会重新观察完整画面。')
  }

  onMounted(consider)
  onBeforeUnmount(() => worker?.terminate())

  return { state, consider, invalidate, setEnabled, setTemperature, regenerate, select, cycle, accept }
}
