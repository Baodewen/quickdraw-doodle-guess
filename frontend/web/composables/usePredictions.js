import { onMounted, onUnmounted, reactive } from 'vue'
import { getClasses, getHealth, labelName, predict } from '../lib/api.js'

export function usePredictions({ getSnapshot, isPaused = () => false }) {
  const state = reactive({
    health: 'loading',
    classes: [],
    predictions: [],
    history: [],
    latencyMs: null,
    averageLatency: null,
    maxLatency: null,
    status: '正在连接识别模型…',
    bubble: '准备好了就画一笔，让我猜猜你画的是什么。',
    stableLabel: null,
    predictionRevision: null,
    isPredicting: false,
    celebrate: false,
  })

  let intervalId
  let celebrationTimer
  let startupController
  let reconnectTimer
  let predictionController
  let requestId = 0
  let historyId = 0
  let confirmedRevision = null
  let lastTopLabel = null
  let stableCount = 0
  let stabilityRevision = null
  let lastCelebratedLabel = null
  let latencySamples = []

  function idleStatus() {
    if (isPaused()) return '奶龙点睛中，识别暂停…'
    if (state.health === 'missing') return '模型尚未加载，请先运行 python ml/train.py。'
    if (state.health === 'offline') return '后端暂时无法连接，请确认服务已启动。'
    if (state.health === 'loading') return '正在连接识别模型…'
    return '等待你的第一笔…'
  }

  function resetStability() {
    lastTopLabel = null
    stableCount = 0
    stabilityRevision = null
    state.stableLabel = null
  }

  function reset() {
    requestId += 1
    predictionController?.abort()
    predictionController = null
    clearTimeout(celebrationTimer)
    confirmedRevision = getSnapshot().revision
    state.isPredicting = false
    state.predictions = []
    state.predictionRevision = null
    state.history = []
    state.latencyMs = null
    state.averageLatency = null
    state.maxLatency = null
    state.celebrate = false
    latencySamples = []
    lastCelebratedLabel = null
    resetStability()
    state.status = idleStatus()
    state.bubble = isPaused()
      ? '先给奶龙点上两只眼睛，回到画板后我们继续猜。'
      : '画板焕然一新，我们再来猜一幅吧。'
  }

  function updateLatency(latency) {
    state.latencyMs = latency
    latencySamples.push(latency)
    if (latencySamples.length > 200) latencySamples.shift()
    state.averageLatency = latencySamples.reduce((sum, sample) => sum + sample, 0) / latencySamples.length
    state.maxLatency = Math.max(...latencySamples)
  }

  function updateStability(top, revision) {
    if (stabilityRevision !== revision) {
      resetStability()
      stabilityRevision = revision
    }
    if (top.prob < 0.65) {
      resetStability()
      return
    }

    stableCount = top.label === lastTopLabel ? stableCount + 1 : 1
    lastTopLabel = top.label
    state.stableLabel = stableCount >= 2 ? top.label : null

    if (state.stableLabel && lastCelebratedLabel !== top.label) {
      lastCelebratedLabel = top.label
      clearTimeout(celebrationTimer)
      state.celebrate = true
      celebrationTimer = setTimeout(() => {
        state.celebrate = false
      }, 1000)
    }
  }

  function updateBubble(top, second) {
    const name = labelName(top.label)
    if (state.stableLabel || top.prob >= 0.9) return `我认出来啦，这很像${name}！`
    if (top.prob >= 0.75) return `我觉得你画的是${name}！`
    if (top.prob >= 0.65) return `看起来像${name}，让我再确认一下。`
    if (top.prob >= 0.4) return `我还在想…目前最像${name}。`
    return second
      ? `有点难猜，可能是${name}，也可能是${labelName(second.label)}。`
      : `我猜可能是${name}，再画几笔给我一点提示吧。`
  }

  async function sendPrediction() {
    if (isPaused() || state.health !== 'ready' || state.isPredicting) return
    const snapshot = getSnapshot()
    const needsConfirmation = snapshot.revision === confirmedRevision && stableCount === 1
    if (!snapshot.hasDrawing || (snapshot.revision === confirmedRevision && !needsConfirmation)) return

    const submittedRevision = snapshot.revision
    const currentRequest = ++requestId
    predictionController = new AbortController()
    state.isPredicting = true
    state.status = '正在观察你的线条…'

    try {
      const data = await predict(snapshot.image_b64, predictionController.signal)
      if (isPaused() || currentRequest !== requestId) return

      // Only acknowledge the image sent with this request; later strokes remain pending.
      confirmedRevision = submittedRevision
      state.predictionRevision = submittedRevision
      updateLatency(data.latency_ms)

      if (data.is_blank || !data.predictions.length) {
        state.predictions = []
        resetStability()
        state.status = '再添几笔，让轮廓更清楚一点。'
        state.bubble = '画面里的线条还太少，我还没看清楚。'
        return
      }

      state.predictions = data.predictions
      const [top, second] = data.predictions
      state.history.unshift({
        id: ++historyId,
        time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
        label: top.label,
        prob: top.prob,
      })
      if (state.history.length > 10) state.history.pop()

      updateStability(top, submittedRevision)
      state.status = state.stableLabel
        ? `猜到啦：${labelName(top.label)}`
        : `正在思考…我猜是${labelName(top.label)}`
      state.bubble = updateBubble(top, second)
    } catch (error) {
      if (currentRequest !== requestId || error.name === 'AbortError') return
      state.status = `识别失败：${error.message}`
      state.bubble = '暂时没能完成识别，下一轮我会继续尝试。'
    } finally {
      if (currentRequest === requestId) {
        predictionController = null
        state.isPredicting = false
      }
    }
  }

  function scheduleReconnect() {
    clearTimeout(reconnectTimer)
    reconnectTimer = setTimeout(loadClassesAndHealth, 3000)
  }

  async function loadClassesAndHealth() {
    clearTimeout(reconnectTimer)
    startupController?.abort()
    startupController = new AbortController()
    const wasOffline = state.health === 'offline'
    try {
      const [health, classes] = await Promise.all([
        getHealth(startupController.signal),
        getClasses(startupController.signal),
      ])
      if (startupController.signal.aborted) return
      state.classes = classes.classes
      state.health = health.model_loaded ? 'ready' : 'missing'
      state.status = idleStatus()
      if (state.health === 'missing') state.bubble = '我还需要加载训练好的模型，才能开始猜画。'
      else if (wasOffline && !state.predictions.length) state.bubble = '已经连接上识别模型，随时可以开始。'
    } catch (error) {
      if (error.name === 'AbortError') return
      state.health = 'offline'
      state.status = '后端未连接，请先启动识别服务。'
      state.bubble = '暂时联系不上识别服务，正在自动重试…'
    }
    if (state.health !== 'ready') scheduleReconnect()
  }

  onMounted(() => {
    loadClassesAndHealth()
    intervalId = setInterval(sendPrediction, 500)
  })

  onUnmounted(() => {
    clearInterval(intervalId)
    clearTimeout(celebrationTimer)
    clearTimeout(reconnectTimer)
    requestId += 1
    startupController?.abort()
    predictionController?.abort()
  })

  return { state, reset }
}
