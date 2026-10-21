<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useDrawing } from '../composables/useDrawing.js'
import { useNailongBoard } from '../composables/useNailongBoard.js'
import { NAILONG_BOARD_TRANSFORM, NAILONG_EYES, NAILONG_MEDIA, NAILONG_OUTLINE } from '../lib/nailongArt.js'
import { downloadFile, eventPoint, fileTimestamp, paintDrawing } from '../lib/strokes.js'
import AppIcon from './AppIcon.vue'
import BrandMark from './BrandMark.vue'
import PredictionOverlay from './PredictionOverlay.vue'

const props = defineProps({
  guessLabel: { type: String, default: 'unknown' },
  candidates: Array,
  selectedCandidate: Number,
  canAccept: Boolean,
  enhancing: Boolean,
})
const emit = defineEmits(['clear', 'stroke-start', 'stroke-end', 'cycle-candidate', 'accept-candidate', 'nailong-start', 'nailong-end', 'enhance'])
const canvas = ref(null)
const triggerEl = ref(null)
const tool = ref('brush')
const width = ref(8)
const color = ref('#292827')
const drawing = useDrawing()
const { state, records, strokeCount, pointCount, hasDrawing } = drawing
const nailongActive = ref(false)
const savedStrokes = ref(null)
const savedSettings = ref(null)
let activePointer = null
let strokeClock = 0
let observer

const {
  phase: nailongPhase,
  outlinePrepared,
  regionDone,
  media,
  mediaPlaybackKey,
  playbackRequested,
  stillFailed,
  artEl,
  videoEl,
  eyeGuideVisible,
  totalEyes,
  mediaKind,
  showMediaLayer,
  canPlayMedia,
  isMediaReady,
  fallbackBroken,
  statusText: nailongStatus,
  hint: nailongHint,
  enter: enterNailong,
  leave: leaveNailong,
  restart: restartNailongGame,
  finishOutline,
  markStroke: markNailongStroke,
  autoEyes,
  startMediaPlayback,
  replayMedia,
  onVideoCanPlay,
  onVideoError,
  onImageLoad,
  onMediaError,
  onStillError,
} = useNailongBoard()

const savedHadDrawing = computed(() => (
  Boolean(savedStrokes.value?.some(stroke => stroke.tool === 'brush'))
))

function redraw() {
  paintDrawing(canvas.value, records.value)
}

function resizeCanvas() {
  const size = canvas.value.getBoundingClientRect().width
  canvas.value.width = Math.round(size * window.devicePixelRatio)
  canvas.value.height = canvas.value.width
  redraw()
}

function releaseActivePointer() {
  const pointer = activePointer
  activePointer = null
  if (pointer !== null && canvas.value?.hasPointerCapture(pointer)) {
    try {
      canvas.value.releasePointerCapture(pointer)
    } catch {
      // Pointer capture may already be gone after pointercancel.
    }
  }
}

function openNailong() {
  if (nailongActive.value) return
  releaseActivePointer()
  savedStrokes.value = drawing.getStrokes()
  savedSettings.value = { tool: tool.value, color: color.value, width: width.value }
  drawing.clear()
  redraw()
  tool.value = 'brush'
  color.value = '#292827'
  width.value = 5
  nailongActive.value = true
  enterNailong()
  emit('nailong-start')
  nextTick(() => canvas.value?.focus({ preventScroll: true }))
}

function closeNailong() {
  if (!nailongActive.value) return
  releaseActivePointer()
  leaveNailong()
  drawing.restore(savedStrokes.value || [])
  if (savedSettings.value) {
    tool.value = savedSettings.value.tool
    color.value = savedSettings.value.color
    width.value = savedSettings.value.width
  }
  redraw()
  nailongActive.value = false
  savedStrokes.value = null
  savedSettings.value = null
  emit('nailong-end')
  nextTick(() => triggerEl.value?.focus({ preventScroll: true }))
}

function toggleNailong() {
  if (nailongActive.value) closeNailong()
  else openNailong()
}

function skipOutline() {
  finishOutline()
  nextTick(() => canvas.value?.focus({ preventScroll: true }))
}

function autoDotEyes() {
  autoEyes()
  nextTick(() => canvas.value?.focus({ preventScroll: true }))
}

function restartNailong() {
  if (!nailongActive.value) return
  releaseActivePointer()
  drawing.clear()
  redraw()
  restartNailongGame()
  nextTick(() => canvas.value?.focus({ preventScroll: true }))
}

function startDraw(event) {
  if (!event.isPrimary || event.button !== 0 || activePointer !== null) return
  if (nailongActive.value) {
    if (nailongPhase.value === 'intro') finishOutline()
    if (nailongPhase.value !== 'waiting') return
  }
  event.preventDefault()
  activePointer = event.pointerId
  strokeClock = performance.now()
  try {
    canvas.value.setPointerCapture(activePointer)
  } catch {
    // Pointer capture is an optimisation; drawing still works without it.
  }
  drawing.begin(eventPoint(event, canvas.value.getBoundingClientRect(), strokeClock), {
    tool: tool.value, color: color.value, width: width.value,
  })
  canvas.value.focus({ preventScroll: true })
  emit('stroke-start')
  redraw()
}

function draw(event) {
  if (event.pointerId !== activePointer) return
  event.preventDefault()
  const samples = event.getCoalescedEvents ? event.getCoalescedEvents() : [event]
  const rect = canvas.value.getBoundingClientRect()
  for (const sample of samples) drawing.append(eventPoint(sample, rect, strokeClock))
  redraw()
}

function finishDraw(event) {
  if (event.pointerId !== activePointer) return
  if (event.type === 'pointerup') {
    drawing.append(eventPoint(event, canvas.value.getBoundingClientRect(), strokeClock))
  }
  const stroke = drawing.finish()
  const pointer = activePointer
  activePointer = null
  if (canvas.value.hasPointerCapture(pointer)) canvas.value.releasePointerCapture(pointer)
  redraw()
  if (nailongActive.value && stroke) markNailongStroke(stroke)
  emit('stroke-end')
}

function clearBoard() {
  if (nailongActive.value) return
  releaseActivePointer()
  drawing.clear()
  redraw()
  emit('clear')
}

function exportPng() {
  if (nailongActive.value) return
  downloadFile(drawing.getSnapshot().image_b64, `failure_sample_${props.guessLabel}_${fileTimestamp()}.png`)
}

function exportStrokes() {
  if (nailongActive.value) return
  const url = URL.createObjectURL(new Blob([drawing.serialize()], { type: 'application/json' }))
  downloadFile(url, `quickdraw_strokes_${fileTimestamp()}.json`)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function acceptPaths(paths) {
  if (nailongActive.value) return
  drawing.addPaths(paths, { color: color.value, width: width.value })
  redraw()
}

function requestEnhance() {
  if (nailongActive.value || props.enhancing || !hasDrawing.value) return
  emit('enhance', { image_b64: drawing.getSnapshot().image_b64 })
}

function handleKey(event) {
  if (nailongActive.value) {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeNailong()
    }
    return
  }
  if (props.canAccept && event.key === 'Tab') {
    event.preventDefault()
    emit('cycle-candidate', event.shiftKey ? -1 : 1)
  } else if (props.canAccept && event.key === 'Enter') {
    event.preventDefault()
    emit('accept-candidate')
  }
}

onMounted(() => {
  observer = new ResizeObserver(resizeCanvas)
  observer.observe(canvas.value)
  window.addEventListener('resize', resizeCanvas)
  resizeCanvas()
})

onBeforeUnmount(() => {
  releaseActivePointer()
  observer.disconnect()
  window.removeEventListener('resize', resizeCanvas)
})

defineExpose({ getSnapshot: drawing.getSnapshot, getDrawing: drawing.getDrawing, acceptPaths })
</script>


<template>
  <section class="drawing-panel panel" :class="{ 'is-nailong': nailongActive }" aria-labelledby="drawing-title">
    <span class="panel-ornament ornament-tl" aria-hidden="true"></span>
    <span class="panel-ornament ornament-br" aria-hidden="true"></span>
    <div class="panel-heading">
      <div class="heading-with-icon">
        <span class="folio-numeral" aria-hidden="true">I</span>
        <div>
          <p class="panel-kicker">Folio I · <em>Your Creative Space</em></p>
          <h2 id="drawing-title">
            <Transition name="swap" mode="out-in">
              <span :key="nailongActive ? 'n' : 'd'">{{ nailongActive ? '奶龙点睛' : '涂鸦画板' }}</span>
            </Transition>
          </h2>
        </div>
      </div>
      <div class="heading-actions">
        <button
          ref="triggerEl"
          class="nailong-trigger"
          :class="{ 'is-active': nailongActive }"
          type="button"
          :aria-label="nailongActive ? '退出奶龙点睛，恢复原画' : '打开奶龙点睛彩蛋'"
          :aria-pressed="nailongActive"
          :title="nailongActive ? '退出奶龙点睛，恢复原画' : '奶龙点睛'"
          @click="toggleNailong"
        >
          <AppIcon name="sparkle" :size="13" />
          <span class="nailong-trigger-label">{{ nailongActive ? '退出奶龙' : '奶龙点睛' }}</span>
        </button>
        <span class="recording-pill"><span></span>Recording</span>
      </div>
    </div>

    <div class="drawing-tools">
      <div class="tool-switch" :data-tool="tool" aria-label="绘画工具">
        <span class="tool-indicator" aria-hidden="true"></span>
        <button type="button" :class="['tool-button', { selected: tool === 'brush' }]" :aria-pressed="tool === 'brush'" :disabled="nailongActive" @click="tool = 'brush'">
          <AppIcon name="brush" :size="16" />画笔
        </button>
        <button type="button" :class="['tool-button', { selected: tool === 'eraser' }]" :aria-pressed="tool === 'eraser'" :disabled="nailongActive" @click="tool = 'eraser'">
          <AppIcon name="eraser" :size="16" />橡皮擦
        </button>
      </div>
      <div class="pen-settings">
        <label class="width-control"><span>粗细</span><input v-model.number="width" type="range" min="2" max="28" step="1" :disabled="nailongActive" :style="{ '--fill': `${(width - 2) / 26 * 100}%` }" /><span class="width-value">{{ String(width).padStart(2, '0') }}</span></label>
        <label class="color-control" title="选择画笔颜色"><input v-model="color" type="color" aria-label="画笔颜色" :disabled="nailongActive" /><span>墨色</span></label>
      </div>
    </div>

    <Transition name="drape">
      <div v-if="nailongActive" class="nailong-mode-bar" :data-phase="nailongPhase">
        <div class="nailong-mode-head">
          <span class="nailong-status-dot" :class="{ 'is-active': nailongPhase === 'intro' || nailongPhase === 'waking' }"></span>
          <strong class="nailong-mode-title">Nailong · 奶龙点睛</strong>
          <Transition name="swap" mode="out-in">
            <span :key="nailongStatus" class="nailong-mode-status">{{ nailongStatus }}</span>
          </Transition>
          <span class="nailong-eye-count"><span class="eye-pip" :class="{ on: regionDone.left }"></span><span class="eye-pip" :class="{ on: regionDone.right }"></span>{{ totalEyes }}<i>/</i>2</span>
        </div>
        <div class="nailong-mode-actions">
          <button v-if="nailongPhase === 'intro'" class="nailong-mode-button nailong-mode-primary" type="button" @click="skipOutline">一键成形</button>
          <button v-if="nailongPhase === 'waiting' && totalEyes < 2" class="nailong-mode-button nailong-mode-quiet" type="button" @click="autoDotEyes">帮我点睛</button>
          <button v-if="nailongPhase !== 'intro'" class="nailong-mode-button nailong-mode-quiet" type="button" @click="restartNailong">重来</button>
          <button v-if="canPlayMedia" class="nailong-mode-button nailong-mode-secondary" type="button" @click="startMediaPlayback">播放动画</button>
          <button v-else-if="nailongPhase === 'alive' && media" class="nailong-mode-button nailong-mode-secondary" type="button" @click="replayMedia">再看一次</button>
          <button class="nailong-mode-button nailong-mode-secondary" type="button" @click="closeNailong">退出</button>
        </div>
        <p class="nailong-mode-hint" aria-live="polite">
          {{ nailongHint }}<span v-if="savedHadDrawing" class="nailong-restore-note"> 退出后会恢复进入前的原画。</span>
        </p>
      </div>
    </Transition>

    <div class="canvas-frame" :class="{ 'eraser-active': tool === 'eraser' }">
      <span class="frame-mark mark-tl" aria-hidden="true"></span>
      <span class="frame-mark mark-tr" aria-hidden="true"></span>
      <span class="frame-mark mark-bl" aria-hidden="true"></span>
      <span class="frame-mark mark-br" aria-hidden="true"></span>
      <span class="frame-caption caption-top" aria-hidden="true">280 × 280 · Plate {{ nailongActive ? 'N' : 'I' }}</span>
      <span class="frame-caption caption-bottom" aria-hidden="true"><em>fig.</em> {{ nailongActive ? 'Nailong awakening' : 'a sketch in progress' }}</span>
      <div
        class="canvas-surface"
        :class="{ 'is-nailong-fallback': fallbackBroken }"
        :data-nailong-active="nailongActive ? 'true' : 'false'"
        :data-nailong-phase="nailongPhase"
        :data-eye-left="regionDone.left ? 'true' : 'false'"
        :data-eye-right="regionDone.right ? 'true' : 'false'"
        :data-media-kind="mediaKind"
      >
        <canvas
          ref="canvas"
          tabindex="0"
          :aria-label="nailongActive ? '奶龙画板。在两只眼睛的虚线圈里各画一笔。' : '涂鸦画板。续画就绪后，Tab 切换候选，Enter 采纳。'"
          @pointerdown="startDraw"
          @pointermove="draw"
          @pointerup="finishDraw"
          @pointercancel="finishDraw"
          @lostpointercapture="finishDraw"
          @keydown="handleKey"
        ></canvas>
        <PredictionOverlay v-if="!nailongActive" :candidates="candidates" :selected="selectedCandidate" />

        <template v-if="nailongActive">
          <svg
            class="nailong-board-art"
            :class="{ 'is-prepared': outlinePrepared }"
            viewBox="0 0 280 280"
            fill="none"
            aria-hidden="true"
          >
            <g :transform="NAILONG_BOARD_TRANSFORM">
              <g ref="artEl" class="nailong-outline">
                <path v-for="path in NAILONG_OUTLINE" :id="`nailong-${path.id}`" :key="path.id" :d="path.d" />
              </g>
              <g v-if="eyeGuideVisible" class="nailong-guides">
                <ellipse
                  v-for="eye in NAILONG_EYES"
                  :key="eye.id"
                  :cx="eye.cx"
                  :cy="eye.cy"
                  :rx="eye.rx"
                  :ry="eye.ry"
                  class="nailong-eye-guide"
                  :class="{ 'is-done': regionDone[eye.id] }"
                />
              </g>
            </g>
          </svg>

          <div
            v-if="showMediaLayer"
            class="nailong-board-media"
            :class="{ 'is-media-ready': isMediaReady }"
            :data-media-kind="mediaKind"
          >
            <div class="nailong-media-glow" aria-hidden="true"></div>
            <img
              v-if="!stillFailed"
              class="nailong-fallback"
              :src="NAILONG_MEDIA.still"
              alt=""
              @error="onStillError"
            />
            <img
              v-if="playbackRequested && media?.kind === 'image'"
              :key="`nailong-image-${mediaPlaybackKey}`"
              class="nailong-media"
              :class="{ 'is-visible': isMediaReady }"
              :src="media.src"
              alt="奶龙活过来了"
              @load="onImageLoad"
              @error="onMediaError"
            />
            <video
              v-else-if="playbackRequested && media?.kind === 'video'"
              :key="`nailong-video-${mediaPlaybackKey}`"
              ref="videoEl"
              class="nailong-media"
              :class="{ 'is-visible': isMediaReady }"
              :src="media.src"
              autoplay
              loop
              playsinline
              preload="auto"
              aria-label="奶龙活过来了"
              @canplay="onVideoCanPlay"
              @error="onVideoError"
            ></video>
            <div class="nailong-sparkles" aria-hidden="true">
              <span v-for="n in 6" :key="n"></span>
            </div>
          </div>
        </template>

        <Transition name="veil">
          <span :key="nailongActive ? 'veil-n' : 'veil-d'" class="canvas-veil" aria-hidden="true"><BrandMark :size="64" :ring="false" /></span>
        </Transition>
      </div>
      <Transition name="fade">
        <div v-if="!hasDrawing && !nailongActive" class="canvas-empty" aria-hidden="true">
          <svg class="empty-doodle" width="132" height="112" viewBox="0 0 120 104" fill="none">
            <path class="doodle-line" pathLength="1" d="M27 57c-12-20 10-42 27-26 18-17 43 1 33 22 19 22-5 43-24 30-22 15-46-4-36-26Z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
            <path class="doodle-line doodle-late" pathLength="1" d="m47 55 1 3m24-5 1 3M53 68c5 4 11 3 15-1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
            <path d="m94 9 1.5 4.5L100 15l-4.5 1.5L94 21l-1.5-4.5L88 15l4.5-1.5L94 9Z" class="doodle-star" fill="currentColor" stroke="none" />
          </svg>
          <strong>画点什么吧</strong>
          <span class="empty-en"><em>Begin with a single line.</em></span>
          <span>一只猫，一个苹果，或者你的奇思妙想</span>
          <span class="empty-invitation">落笔开始，看看 AI 能不能猜中</span>
        </div>
      </Transition>
    </div>

    <div class="drawing-meta">
      <Transition name="swap" mode="out-in">
        <span :key="nailongActive ? 'n' : state.current ? 'c' : 'i'"><span :class="['ink-dot', { active: state.current }]"></span>{{ nailongActive ? '眼睛笔迹只属于这次点睛' : state.current ? '正在记录这一笔…' : '每一笔，都有迹可循' }}</span>
      </Transition>
      <span class="meta-count"><b>{{ strokeCount }}</b> 笔 <i>◆</i> <b>{{ pointCount }}</b> 点</span>
    </div>

    <Transition name="fade-up">
      <div v-if="!nailongActive" class="board-footer">
        <div class="board-actions">
          <button class="button button-quiet clear-button" type="button" @click="clearBoard"><AppIcon name="clear" :size="16" />清空画板</button>
          <div class="export-actions">
            <button class="button button-enhance" type="button" :disabled="!hasDrawing || enhancing" @click="requestEnhance"><AppIcon name="sparkle" :size="16" />{{ enhancing ? 'AI 正在美化…' : 'AI 美化' }}</button>
            <button class="button button-secondary" type="button" :disabled="!strokeCount" @click="exportPng"><AppIcon name="image" :size="16" />导出 PNG</button>
            <button class="button button-primary" type="button" :disabled="!strokeCount" @click="exportStrokes"><AppIcon name="download" :size="16" />导出笔画</button>
          </div>
        </div>
        <p class="board-tip"><span class="tip-mark">Nota</span>一次画一个物体，线条清晰、放在画板中间，AI 会更懂你。</p>
      </div>
    </Transition>
  </section>
</template>
