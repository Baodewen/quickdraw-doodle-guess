<script setup>
import { computed } from 'vue'
import { labelName } from '../lib/api.js'

const props = defineProps({
  state: { type: Object, required: true },
})

const topGuess = computed(() => props.state.predictions[0])
const healthText = computed(() => ({
  loading: '连接中',
  ready: '模型已就绪',
  missing: '模型未加载',
  offline: '后端未连接',
})[props.state.health])

function percent(probability) {
  return `${(probability * 100).toFixed(1)}%`
}

function latency(value) {
  return value === null ? '—' : `${value.toFixed(1)} ms`
}
</script>

<template>
  <aside class="prediction-panel panel" :class="{ 'is-thinking': state.isPredicting }" aria-labelledby="prediction-heading">
    <span class="panel-ornament ornament-tl" aria-hidden="true"></span>
    <span class="panel-ornament ornament-br" aria-hidden="true"></span>
    <header class="panel-heading">
      <div class="heading-with-icon">
        <span class="folio-numeral" aria-hidden="true">III</span>
        <div>
          <p class="panel-kicker">Folio III · <em>The Observer</em></p>
          <h2 id="prediction-heading">AI 的小猜想</h2>
        </div>
      </div>
      <span class="status-pill" :class="`status-${state.health}`">
        <span class="status-dot" aria-hidden="true"></span>
        <Transition name="swap" mode="out-in"><span :key="healthText">{{ healthText }}</span></Transition>
      </span>
    </header>

    <div class="observer-zone">
      <div class="observer" :class="{ 'is-thinking': state.isPredicting, 'is-celebrating': state.celebrate }" aria-hidden="true">
        <svg viewBox="0 0 100 100" width="76" height="76">
          <defs><path id="observer-ring" d="M50 50m-40 0a40 40 0 1 1 80 0a40 40 0 1 1 -80 0" /></defs>
          <circle class="observer-disc" cx="50" cy="50" r="47" />
          <g class="observer-ring"><text><textPath href="#observer-ring">· I SEE · I WONDER · I GUESS · I SEE · I WONDER · I GUESS </textPath></text></g>
          <g class="observer-eye">
            <path class="eye-lid" d="M28 50c8-11 36-11 44 0-8 11-36 11-44 0Z" />
            <circle class="eye-iris" cx="50" cy="50" r="7.5" />
            <circle class="eye-glint" cx="52.6" cy="47.4" r="1.8" />
          </g>
        </svg>
      </div>
      <Transition name="swap" mode="out-in">
        <p :key="state.bubble" class="speech-bubble" aria-live="polite">{{ state.bubble }}</p>
      </Transition>
    </div>

    <div class="best-guess" :class="{ 'is-celebrating': state.celebrate, 'is-stable': state.stableLabel }" aria-live="polite">
      <span class="guess-frame" aria-hidden="true"></span>
      <div class="guess-top">
        <span class="guess-label">{{ state.stableLabel ? '我猜到了' : '我猜你画的是' }}</span>
        <Transition name="stamp"><span v-if="state.stableLabel" class="guess-seal" aria-hidden="true">確</span></Transition>
      </div>
      <div class="guess-result">
        <Transition name="reveal-name" mode="out-in">
          <strong :key="topGuess ? topGuess.label : 'none'" class="guess-name" :class="{ 'is-empty': !topGuess }">{{ topGuess ? labelName(topGuess.label) : '等你落笔' }}</strong>
        </Transition>
        <span v-if="topGuess" class="guess-confidence">{{ percent(topGuess.prob) }}</span>
      </div>
      <Transition name="swap" mode="out-in">
        <span v-if="topGuess" :key="topGuess.label" class="guess-key"><em>{{ topGuess.label }}</em></span>
      </Transition>
      <div class="guess-rule" aria-hidden="true"><span></span>◆<span></span></div>
      <p class="prediction-status" role="status">{{ state.status }}</p>
      <span class="latency-label">本次推理 <b>{{ latency(state.latencyMs) }}</b></span>
    </div>

    <section class="ranking" aria-labelledby="ranking-heading">
      <div class="section-label"><h3 id="ranking-heading">可能的答案</h3><span>Top Five</span></div>
      <TransitionGroup name="rank" tag="div" class="rank-list">
        <div v-for="(item, index) in state.predictions" :key="item.label" class="rank-row" :class="{ 'is-first': index === 0 }">
          <span class="rank-label" :title="item.label"><span class="rank-numeral">{{ ['i', 'ii', 'iii', 'iv', 'v'][index] }}</span>{{ labelName(item.label) }}</span>
          <div class="rank-track" aria-hidden="true"><span class="rank-fill" :style="{ width: `${item.prob * 100}%` }"></span></div>
          <span class="rank-value">{{ percent(item.prob) }}</span>
        </div>
      </TransitionGroup>
      <p v-if="!state.predictions.length" class="empty-note">落笔之后，五个可能的答案会出现在这里。</p>
    </section>

    <div class="metric-grid">
      <div class="metric-card"><span class="metric-caption">平均推理 <em>mean</em></span><strong class="metric-value">{{ latency(state.averageLatency) }}</strong></div>
      <div class="metric-card"><span class="metric-caption">最长推理 <em>max</em></span><strong class="metric-value">{{ latency(state.maxLatency) }}</strong></div>
    </div>
    <p class="metric-note">统计最近 200 次推理</p>

    <section aria-labelledby="history-heading">
      <div class="section-label"><h3 id="history-heading">猜画足迹</h3><span>Last Ten</span></div>
      <TransitionGroup v-if="state.history.length" name="ledger" tag="ol" class="history-list">
        <li v-for="item in state.history" :key="item.id" class="history-row">
          <time class="history-time">{{ item.time }}</time>
          <span class="history-label" :title="item.label">{{ labelName(item.label) }}</span>
          <span class="history-prob">{{ percent(item.prob) }}</span>
        </li>
      </TransitionGroup>
      <p v-else class="empty-note">每一次猜想，都会在这里留下足迹。</p>
    </section>

    <section aria-labelledby="classes-heading">
      <div class="section-label"><h3 id="classes-heading">我认识这些</h3><span>{{ state.classes.length }} Classes</span></div>
      <div v-if="state.classes.length" class="class-list">
        <span v-for="(name, index) in state.classes" :key="name" class="class-chip" :class="{ 'is-current': topGuess && topGuess.label === name }" :style="{ '--i': index }" :title="name">{{ labelName(name) }}</span>
      </div>
      <p v-else class="empty-note">{{ state.health === 'loading' ? '正在读取模型类别…' : '类别列表暂未加载。' }}</p>
    </section>
  </aside>
</template>
