<script setup>
defineProps({ name: String, size: { type: Number, default: 18 } })

const paths = {
  brush: 'm15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15l-1 6 5-2',
  eraser: 'm14 4 6 6a2 2 0 0 1 0 3l-8 8H7l-4-4a2 2 0 0 1 0-3l9-10a1.5 1.5 0 0 1 2 0M8 9l8 8M12 21h9',
  clear: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
  image: 'M4 3h16v18H4zM4 16l5-5 4 4 3-3 4 4M15 7h.01',
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
  arrow: 'M5 12h14m-5-5 5 5-5 5',
  sparkle: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z',
}
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path :d="paths[name]" />
  </svg>
</template>
