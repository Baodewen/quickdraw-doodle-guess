<script setup>
import { computed } from 'vue'
import { labelName } from '../lib/api.js'

const props = defineProps({ state: { type: Object, required: true } })
const emit = defineEmits(['toggle', 'temperature', 'select', 'regenerate', 'accept'])

const supportedLabels = ['bicycle', 'bird', 'book', 'bus', 'cat', 'key', 'clock']
const statusNames = {
  waiting: '等待识别',
  unsupported: '暂无模型',
  loading: '加载模型',
  generating: '正在续画',
  ready: '候选已就绪',
  empty: '本次未生成笔画',
  error: '生成失败',
}
const busy = computed(() => ['loading', 'generating'].includes(props.state.status))
const selectedCandidate = computed(() => props.state.candidates[props.state.selected])
const canAccept = computed(() => props.state.enabled && props.state.status === 'ready' && selectedCandidate.value?.paths.length > 0)
const canRegenerate = computed(() => props.state.enabled && props.state.qualified && !busy.value)
</script>

<template>
  <section class="completion-panel panel" aria-labelledby="completion-title">
    <span class="panel-ornament ornament-tl" aria-hidden="true"></span>
    <span class="panel-ornament ornament-br" aria-hidden="true"></span>
    <div class="completion-heading">
      <div class="completion-heading-copy">
        <span class="folio-numeral" aria-hidden="true">II</span>
        <div>
          <p class="completion-kicker">Folio II · <em>Sketch-RNN, local</em></p>
          <h2 id="completion-title" class="completion-title">让 AI 接着画</h2>
        </div>
      </div>
      <button
        class="completion-switch"
        :class="{ 'completion-switch-on': state.enabled }"
        type="button"
        role="switch"
        :aria-checked="state.enabled"
        aria-label="启用 AI 辅助续画"
        @click="emit('toggle', !state.enabled)"
      >
        <span class="completion-switch-label">{{ state.enabled ? '已启用' : '已关闭' }}</span>
        <span class="completion-switch-track"><span class="completion-switch-knob" /></span>
      </button>
    </div>

    <p class="completion-description">你画下开头，AI 为下一笔提供三种灵感；画板显示当前选中的方案。</p>

    <div class="completion-status-row">
      <span class="completion-status" :class="`completion-status-${state.enabled ? state.status : 'off'}`">
        <span class="completion-status-dot" :class="{ 'completion-status-busy': busy && state.enabled }" />
        <Transition name="swap" mode="out-in"><span :key="`${state.enabled}-${state.status}`">{{ state.enabled ? statusNames[state.status] : '续画已关闭' }}</span></Transition>
      </span>
      <span v-if="state.label" class="completion-current-label">
        当前类别 <strong>{{ labelName(state.label) }}</strong>
      </span>
      <span v-if="state.durationMs !== null" class="completion-duration">{{ (state.durationMs / 1000).toFixed(2) }} s</span>
    </div>
    <Transition name="swap" mode="out-in"><p :key="state.message" class="completion-message" aria-live="polite">{{ state.message }}</p></Transition>

    <div class="completion-temperature">
      <label for="completion-temperature" class="completion-control-label">创意温度 <strong>{{ state.temperature.toFixed(2) }}</strong></label>
      <input
        id="completion-temperature"
        class="completion-range"
        type="range"
        min="0.15"
        max="0.85"
        step="0.05"
        :value="state.temperature"
        :disabled="!state.enabled || busy"
        @change="emit('temperature', Number($event.target.value))"
      />
      <div class="completion-range-labels"><span>更规整</span><span>更自由</span></div>
    </div>

    <div class="completion-candidate-heading">
      <span class="completion-control-label">选择续画方案</span>
      <span class="completion-preview-note">点击切换画板预览</span>
    </div>
    <div class="completion-candidates" :data-selected="state.candidates.length ? state.selected : -1" role="group" aria-label="续画候选方案">
      <button
        v-for="index in [0, 1, 2]"
        :key="index"
        type="button"
        class="completion-candidate"
        :class="[`completion-candidate-${index + 1}`, { 'completion-candidate-selected': state.selected === index && state.candidates[index] }]"
        :aria-pressed="state.selected === index && Boolean(state.candidates[index])"
        :disabled="!state.enabled || busy || !state.candidates[index]?.paths.length"
        @click="emit('select', index)"
      >
        <span class="completion-candidate-numeral">{{ ['I', 'II', 'III'][index] }}</span>
        <span class="completion-candidate-top"><span class="completion-candidate-dot" />候选 {{ index + 1 }}</span>
        <span class="completion-candidate-detail">{{ state.candidates[index] ? `${state.candidates[index].pointCount} 个采样点` : '等待生成' }}</span>
      </button>
    </div>

    <div class="completion-actions">
      <button class="completion-button completion-button-secondary" type="button" :disabled="!canRegenerate" @click="emit('regenerate')">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6 7a7 7 0 0 1 11.5-1L20 9M4 15l2.5 3A7 7 0 0 0 18 17" /></svg>
        重新生成
      </button>
      <button class="completion-button completion-button-primary" type="button" :disabled="!canAccept" @click="emit('accept')">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
        采纳选中续画
      </button>
    </div>
    <p class="completion-shortcuts">画板获得焦点时 <kbd>Tab</kbd> 切换候选 <span>·</span> <kbd>Enter</kbd> 采纳续画</p>

    <div class="completion-model-note">
      <p class="completion-trigger-note">CNN 最高概率 ≥ 65%，且连续两次识别为同一类别时，自动开始续画。</p>
      <p class="completion-model-heading">本地已保存 7 个续画模型</p>
      <div class="completion-models">
        <span v-for="label in supportedLabels" :key="label" class="completion-model-chip" :class="{ 'completion-model-active': state.label === label }">{{ labelName(label) }}</span>
      </div>
      <p class="completion-model-caption">其余 13 个识别类别暂无续画模型。时钟使用闹钟（alarm_clock）模型近似续画。</p>
      <p v-if="state.model" class="completion-model-source">当前模型：{{ state.model }}</p>
    </div>
  </section>
</template>
