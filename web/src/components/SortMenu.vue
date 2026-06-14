<script setup lang="ts">
defineProps<{ modelValue: string }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>();
const opts = [
  ['relevance', 'Relevance'], ['popular', 'Popular'], ['newest', 'Newest'],
  ['rating', 'Top rated'], ['price-asc', 'Price ↑'], ['price-desc', 'Price ↓'],
] as const;
</script>

<template>
  <select :value="modelValue" @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
          class="rounded-lg bg-gray-800 px-3 py-2 text-sm outline-none">
    <option v-for="[v, label] in opts" :key="v" :value="v">{{ label }}</option>
  </select>
</template>
