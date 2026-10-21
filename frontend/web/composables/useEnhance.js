import { onBeforeUnmount, reactive } from 'vue'
import { downloadFile, fileTimestamp } from '../lib/strokes.js'

const POLL_INTERVAL = 1500
const MAX_WAIT = 240000
const MAX_POLL_FAILURES = 4

export function useEnhance() {
  const state = reactive({
    visible: false,
    status: 'idle',
    progress: 0,
    taskId: null,
    imageUrl: '',
    label: '',
    labelName: '',
    error: '',
    elapsed: 0,
  })

  let runId = 0
  let pollTimer = null
  let elapsedTimer = null
  let startController = null
  let pollController = null
  let pollFailures = 0
  let startedAt = 0
  let lastPayload = null

  function stopTimers() {
    clearTimeout(pollTimer)
    clearInterval(elapsedTimer)
    pollTimer = null
    elapsedTimer = null
  }

  function stopRequests() {
    startController?.abort()
    pollController?.abort()
    startController = null
    pollController = null
  }

  function startElapsed() {
    clearInterval(elapsedTimer)
    state.elapsed = 0
    elapsedTimer = setInterval(() => {
      state.elapsed = Math.floor((Date.now() - startedAt) / 1000)
    }, 1000)
  }

  function finish(status, error = '') {
    state.status = status
    state.error = error
    clearInterval(elapsedTimer)
    elapsedTimer = null
  }

  function reset() {
    runId += 1
    stopTimers()
    stopRequests()
    lastPayload = null
    Object.assign(state, {
      visible: false,
      status: 'idle',
      progress: 0,
      taskId: null,
      imageUrl: '',
      label: '',
      labelName: '',
      error: '',
      elapsed: 0,
    })
  }

  function close() {
    if (state.status === 'pending' && state.taskId) {
      // Release the server's single-task slot; the upstream job cannot be
      // cancelled, but a new beautification should not wait for the timeout.
      fetch(`/api/enhance/${encodeURIComponent(state.taskId)}`, {
        method: 'DELETE',
        keepalive: true,
      }).catch(() => {})
    }
    reset()
  }

  function schedulePoll(run) {
    clearTimeout(pollTimer)
    pollTimer = setTimeout(() => poll(run), POLL_INTERVAL)
  }

  async function poll(run) {
    if (run !== runId || !state.taskId) return
    if (Date.now() - startedAt > MAX_WAIT) {
      finish('error', '生成超时，请稍后再试。')
      return
    }

    pollController = new AbortController()
    try {
      const response = await fetch(`/api/enhance/${encodeURIComponent(state.taskId)}`, {
        signal: pollController.signal,
      })
      const data = await response.json().catch(() => ({}))
      if (run !== runId) return
      if (!response.ok) throw new Error(data.detail || `查询失败（HTTP ${response.status}）`)

      pollFailures = 0
      state.progress = Number(data.progress) || 0
      if (data.status === 'done' && data.image_url) {
        state.imageUrl = `${data.image_url}?v=${Date.now()}`
        state.progress = 100
        finish('done')
        return
      }
      if (data.status === 'error') {
        finish('error', data.error || '这次没有生成成功，请再试一次。')
        return
      }
      state.status = 'pending'
      schedulePoll(run)
    } catch (error) {
      if (run !== runId || error.name === 'AbortError') return
      pollFailures += 1
      if (pollFailures <= MAX_POLL_FAILURES) {
        schedulePoll(run)
        return
      }
      finish('error', error.message || '无法获取生成结果，请检查后端服务。')
    }
  }

  async function start(payload) {
    if (!payload?.image_b64) return
    lastPayload = payload
    runId += 1
    const run = runId
    stopTimers()
    stopRequests()
    pollFailures = 0
    startedAt = Date.now()
    Object.assign(state, {
      visible: true,
      status: 'starting',
      progress: 0,
      taskId: null,
      imageUrl: '',
      label: payload.label || '',
      labelName: payload.label_name || payload.label || '',
      error: '',
      elapsed: 0,
    })
    startElapsed()

    startController = new AbortController()
    try {
      const response = await fetch('/api/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_b64: payload.image_b64,
          label: payload.label || '',
          label_name: payload.label_name || '',
        }),
        signal: startController.signal,
      })
      const data = await response.json().catch(() => ({}))
      if (run !== runId) return
      if (!response.ok) throw new Error(data.detail || `创建任务失败（HTTP ${response.status}）`)
      state.taskId = data.task_id
      state.status = 'pending'
      schedulePoll(run)
    } catch (error) {
      if (run !== runId || error.name === 'AbortError') return
      finish('error', error.message || '无法创建 AI 美化任务。')
    }
  }

  function retry() {
    if (lastPayload) start(lastPayload)
  }

  function download() {
    if (!state.imageUrl) return
    const name = state.labelName || state.label || 'sketch'
    downloadFile(state.imageUrl, `quickdraw_enhanced_${name}_${fileTimestamp()}.jpg`)
  }

  onBeforeUnmount(reset)

  return { state, start, retry, download, close, reset }
}
