<script setup>
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  state: { type: Object, required: true },
})
defineEmits(['close', 'retry', 'download'])

const busy = computed(() => ['starting', 'pending'].includes(props.state.status))
const label = computed(() => props.state.labelName || props.state.label || '')
const statusText = computed(() => {
  if (props.state.status === 'starting') return '正在递交你的线稿'
  if (props.state.status === 'pending') return 'AI 正在重新描绘'
  if (props.state.status === 'done') return '美化完成'
  if (props.state.status === 'error') return '这次没有画成'
  return '等待你的线稿'
})
</script>

<template>
  <section class="enhance-panel panel" aria-labelledby="enhance-title">
    <span class="panel-ornament ornament-tl" aria-hidden="true"></span>
    <span class="panel-ornament ornament-br" aria-hidden="true"></span>

    <header class="panel-heading">
      <div class="heading-with-icon">
        <span class="folio-numeral" aria-hidden="true">IV</span>
        <div>
          <p class="panel-kicker">Folio IV · <em>AI Atelier</em></p>
          <h2 id="enhance-title">AI 美化</h2>
        </div>
      </div>
      <button class="enhance-close" type="button" aria-label="收起 AI 美化" @click="$emit('close')">收起</button>
    </header>

    <div class="enhance-stage" :class="`is-${state.status}`" aria-live="polite">
      <figure v-if="state.status === 'done'" class="enhance-figure">
        <img :src="state.imageUrl" :alt="label ? `${label}的 AI 美化图` : '线稿的 AI 美化图'" />
        <figcaption>
          <span class="enhance-caption-mark" aria-hidden="true">◆</span>
          基于你的线稿{{ label ? ` · ${label}` : '' }}
        </figcaption>
      </figure>

      <div v-else-if="state.status === 'error'" class="enhance-message">
        <span class="enhance-error-mark" aria-hidden="true">!</span>
        <strong>{{ statusText }}</strong>
        <p>{{ state.error }}</p>
        <button class="button button-secondary" type="button" @click="$emit('retry')">再试一次</button>
      </div>

      <div v-else class="enhance-loading" role="status">
        <span class="enhance-orbit" aria-hidden="true">
          <span class="enhance-orbit-ring"></span>
          <AppIcon name="sparkle" :size="24" />
        </span>
        <strong>{{ statusText }}<span class="enhance-dots" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span></strong>
        <p>{{ label ? `以「${label}」为线索，保留你的构图与姿态。` : '保留你的构图，重新上色、细化并补全光影。' }}</p>
        <span class="enhance-elapsed">已用时 {{ state.elapsed }} 秒<template v-if="state.progress > 0"> · {{ state.progress }}%</template></span>
      </div>
    </div>

    <footer class="enhance-footer">
      <div v-if="state.status === 'done'" class="enhance-actions">
        <button class="button button-primary" type="button" @click="$emit('download')"><AppIcon name="download" :size="16" />下载图片</button>
        <button class="button button-secondary" type="button" @click="$emit('retry')">再来一张</button>
        <button class="button button-quiet" type="button" @click="$emit('close')">收起</button>
      </div>
      <p class="enhance-note">
        <template v-if="busy">生成通常需要几秒到一分钟，请保持页面打开。</template>
        <template v-else>当前线稿会发送至 AI 美化服务，仅用于本次生成。</template>
      </p>
    </footer>
  </section>
</template>
