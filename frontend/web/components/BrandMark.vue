<script setup>
defineProps({ size: { type: Number, default: 46 }, ring: { type: Boolean, default: true } })
</script>

<template>
  <svg class="brand-seal" :width="size" :height="size" viewBox="0 0 100 100" aria-hidden="true">
    <defs>
      <path id="brand-seal-ring" d="M50 50m-38 0a38 38 0 1 1 76 0a38 38 0 1 1 -76 0" />
    </defs>
    <circle class="seal-disc" cx="50" cy="50" r="48" />
    <circle class="seal-hair" cx="50" cy="50" r="44.5" />
    <circle class="seal-hair" cx="50" cy="50" r="31" />
    <g v-if="ring" class="seal-ring">
      <text><textPath href="#brand-seal-ring" startOffset="0">QUICKDRAW · ATELIER · MMXXVI · QUICKDRAW · ATELIER · MMXXVI ·</textPath></text>
    </g>
    <path class="seal-stroke" pathLength="1" d="M38 61c-9-8-8-25 4-29 11-4 22 4 21 16-1 10-9 16-17 14-6-1-8-6-5-9 4-4 13 0 19 6 3 3 6 6 10 6" />
    <circle class="seal-dot" cx="69" cy="34" r="2.2" />
  </svg>
</template>
