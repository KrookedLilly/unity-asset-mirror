<script setup lang="ts">
const props = defineProps<{ free: boolean; onSale: boolean }>();
const emit = defineEmits<{ (e: 'update:free', v: boolean): void; (e: 'update:onSale', v: boolean): void }>();
const cls = (on: boolean) => `rounded-full px-3 py-1 text-sm active:scale-95 ${on ? 'bg-indigo-600' : 'bg-gray-800'}`;
</script>

<template>
  <div class="flex gap-2">
    <button type="button" :class="cls(props.free)" @click="emit('update:free', !props.free)">Free</button>
    <button type="button" :class="cls(props.onSale)" @click="emit('update:onSale', !props.onSale)">On-Sale</button>
  </div>
</template>
