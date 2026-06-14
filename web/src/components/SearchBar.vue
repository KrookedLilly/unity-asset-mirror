<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { extractAssetId } from '../ids.js';

const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void; (e: 'submit'): void; (e: 'open-asset', id: string): void }>();

const text = ref(props.modelValue);
watch(() => props.modelValue, (v) => { text.value = v; });
const directId = computed(() => extractAssetId(text.value));

function submit() {
  emit('update:modelValue', text.value);
  emit('submit');
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <form class="flex gap-2" @submit.prevent="submit">
      <input v-model="text" inputmode="search" placeholder="Search assets, or paste an id / URL"
             class="flex-1 rounded-lg bg-gray-800 px-4 py-3 outline-none focus:ring-2 ring-indigo-500" />
      <button class="rounded-lg bg-indigo-600 px-5 py-3 font-medium active:scale-95">Go</button>
    </form>
    <button v-if="directId" type="button" @click="emit('open-asset', directId)"
            class="self-start rounded-lg bg-gray-800 px-3 py-2 text-sm text-indigo-300 active:scale-95">
      Open asset {{ directId }} →
    </button>
  </div>
</template>
