<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps({
  candidates: { type: Array, required: true },
  selected: { type: Number, required: true },
})

const colors = ['#8e3b2f', '#2f5d56', '#a8844a']
const progress = ref(0)
let animationFrame = null

const visibleCandidates = computed(() => props.candidates.map((candidate, index) => {
  const pointCount = candidate.paths.reduce((count, path) => count + path.length, 0)
  let remaining = Math.ceil(pointCount * progress.value)
  const paths = []
  for (const path of candidate.paths) {
    const visible = path.slice(0, Math.max(0, remaining))
    remaining -= path.length
    if (visible.length > 0) paths.push(visible.map(point => `${point.x},${point.y}`).join(' '))
  }
  return { id: candidate.id, color: colors[index], paths }
}))

watch(() => props.candidates, candidates => {
  cancelAnimationFrame(animationFrame)
  progress.value = 0
  if (candidates.length === 0) return
  let startedAt
  function reveal(timestamp) {
    if (startedAt === undefined) startedAt = timestamp
    progress.value = Math.min((timestamp - startedAt) / 700, 1)
    if (progress.value < 1) animationFrame = requestAnimationFrame(reveal)
  }
  animationFrame = requestAnimationFrame(reveal)
}, { immediate: true })

onBeforeUnmount(() => cancelAnimationFrame(animationFrame))
</script>

<template>
  <svg class="prediction-overlay-root" viewBox="0 0 280 280" fill="none" aria-hidden="true">
    <g
      v-for="(candidate, index) in visibleCandidates"
      v-show="selected === index"
      :key="candidate.id"
      class="prediction-overlay-candidate"
      :class="{ 'prediction-overlay-selected': selected === index }"
      :stroke="candidate.color"
    >
      <polyline v-for="(points, pathIndex) in candidate.paths" :key="pathIndex" :points="points" />
    </g>
  </svg>
</template>
