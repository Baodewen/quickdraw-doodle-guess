<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import BrandMark from './components/BrandMark.vue'
import DrawingBoard from './components/DrawingBoard.vue'
import EnhancePanel from './components/EnhancePanel.vue'
import IdentityWatermark from './components/IdentityWatermark.vue'
import PredictionPanel from './components/PredictionPanel.vue'
import { usePredictions } from './composables/usePredictions.js'
import ContinuationPanel from './components/ContinuationPanel.vue'
import { useContinuation } from './composables/useContinuation.js'
import { useEnhance } from './composables/useEnhance.js'
import { CLASS_LABELS, labelName } from './lib/api.js'

const board = ref(null)
const enhancePanel = ref(null)
const nailongActive = ref(false)
const enhancer = useEnhance()
const enhanceState = enhancer.state
const enhanceBusy = computed(() => ['starting', 'pending'].includes(enhanceState.status))
const { state, reset } = usePredictions({
  getSnapshot: () => board.value.getSnapshot(),
  isPaused: () => nailongActive.value,
})
const completion = useContinuation({
  getDrawing: () => board.value.getDrawing(),
  getRecognition: () => ({ label: state.stableLabel, revision: state.predictionRevision }),
  onAccept: paths => board.value.acceptPaths(paths),
})
const completionState = completion.state

watch(() => [state.stableLabel, state.predictionRevision], () => {
  if (!nailongActive.value) completion.consider()
})

function clearDrawing() {
  if (nailongActive.value) return
  reset()
  completion.invalidate('画板已清空，画完一笔后重新开始续画。', true)
}

function onNailongStart() {
  nailongActive.value = true
  reset()
  completion.invalidate('奶龙点睛中，识别和续画先暂停。', true)
}

function onNailongEnd() {
  nailongActive.value = false
  reset()
  completion.invalidate('回到画板，画完一笔后可以继续续画。', true)
}

function handleStrokeStart() {
  if (!nailongActive.value) completion.invalidate()
}

function handleStrokeEnd() {
  if (!nailongActive.value) completion.consider()
}

function onEnhance(payload) {
  const top = state.predictions[0]
  enhancer.start({
    ...payload,
    label: top?.label || '',
    label_name: top ? labelName(top.label) : '',
  })
  nextTick(() => {
    enhancePanel.value?.$el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  })
}
</script>

<template>
  <div class="studio" :class="{ 'is-nailong': nailongActive }">
    <header class="site-header reveal" style="--d: 0">
      <a class="brand" href="/" aria-label="QuickDraw 首页">
        <BrandMark :size="50" />
        <span class="brand-words">
          <span class="brand-name">Quick<em>Draw</em></span>
          <span class="brand-subtitle">涂鸦实验室 · Atelier of Strokes</span>
        </span>
      </a>
      <nav class="header-meta" aria-label="站点信息">
        <span class="header-folio">Vol. I</span>
        <span class="header-rule" aria-hidden="true"></span>
        <span class="header-note"><span class="live-dot" :class="`live-${state.health}`"></span>一点想象，无限可能</span>
      </nav>
    </header>

    <div class="class-ticker reveal" style="--d: 1" aria-hidden="true">
      <div class="class-ticker-track">
        <template v-for="copy in 2" :key="copy">
          <span v-for="label in CLASS_LABELS" :key="`${copy}-${label}`" class="ticker-item"><em>{{ label }}</em>{{ labelName(label) }}<i>◆</i></span>
        </template>
      </div>
    </div>

    <main>
      <section class="intro">
        <div class="intro-copy">
          <div class="intro-kicker reveal" style="--d: 2"><span class="kicker-rule"></span>Small Sketches, Big Ideas<span class="kicker-rule"></span></div>
          <h1 class="reveal" style="--d: 3">
            <span class="h1-line">随手一画，</span>
            <span class="h1-line h1-accent">AI 来猜<span class="h1-stop">。</span></span>
          </h1>
          <p class="intro-lede reveal" style="--d: 4"><span class="drop-cap">把</span>脑海里的小想法画下来，看 AI 能不能读懂你的灵感。一笔一画，皆被郑重收藏。</p>
          <dl class="intro-ledger reveal" style="--d: 5">
            <div><dt>I</dt><dd><strong>{{ CLASS_LABELS.length }}</strong><span>种涂鸦类别</span></dd></div>
            <div><dt>II</dt><dd><strong>Live</strong><span>实时智能识别</span></dd></div>
            <div><dt>III</dt><dd><strong>∞</strong><span>每一笔都有记录</span></dd></div>
          </dl>
        </div>
        <div class="intro-aside reveal" style="--d: 4">
          <div class="intro-emblem" aria-hidden="true"><BrandMark :size="230" /></div>
          <IdentityWatermark />
        </div>
      </section>

      <div class="workspace">
        <div class="sketch-column">
          <DrawingBoard ref="board" class="reveal" style="--d: 6" :guess-label="state.predictions[0]?.label || 'unknown'" :candidates="completionState.candidates" :selected-candidate="completionState.selected" :can-accept="completionState.status === 'ready'" :enhancing="enhanceBusy" @clear="clearDrawing" @stroke-start="handleStrokeStart" @stroke-end="handleStrokeEnd" @cycle-candidate="completion.cycle" @accept-candidate="completion.accept" @nailong-start="onNailongStart" @nailong-end="onNailongEnd" @enhance="onEnhance" />
          <Transition name="fold">
            <EnhancePanel v-if="enhanceState.visible" ref="enhancePanel" :state="enhanceState" @close="enhancer.close" @retry="enhancer.retry" @download="enhancer.download" />
          </Transition>
          <Transition name="fold">
            <ContinuationPanel v-if="!nailongActive" class="reveal" style="--d: 8" :state="completionState" @toggle="completion.setEnabled" @temperature="completion.setTemperature" @select="completion.select" @regenerate="completion.regenerate" @accept="completion.accept" />
          </Transition>
        </div>
        <PredictionPanel class="reveal" style="--d: 7" :state="state" />
      </div>
    </main>

    <footer class="site-footer">
      <div class="footer-ornament" aria-hidden="true"><span></span>◆<span></span></div>
      <div class="footer-row">
        <span class="footer-brand"><BrandMark :size="30" :ring="false" />画得像不像不重要，<strong>有趣才重要。</strong></span>
        <span class="footer-colophon">Made of strokes &amp; a little AI · Set in Cormorant &amp; Noto Serif</span>
      </div>
    </footer>
  </div>
</template>
