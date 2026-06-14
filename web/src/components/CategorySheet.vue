<script setup lang="ts">
import { ref, watch } from 'vue';
import { getCategories, type Category } from '../api.js';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'select', sel: { category?: string; subcategory?: string }): void }>();

const tops = ref<Category[]>([]);
const expanded = ref<string | null>(null);
const subs = ref<Category[]>([]);
const loaded = ref(false);

watch(() => props.open, async (o) => {
  if (o && !loaded.value) { tops.value = await getCategories(); loaded.value = true; }
});

async function toggle(cat: Category) {
  if (expanded.value === cat.slug) { expanded.value = null; return; }
  expanded.value = cat.slug; subs.value = [];
  subs.value = await getCategories(cat.slug);
}
function pickAll() { emit('select', {}); emit('close'); }
function pickCat(slug: string) { emit('select', { category: slug }); emit('close'); }
function pickSub(category: string, subcategory: string) { emit('select', { category, subcategory }); emit('close'); }
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-40 flex items-end bg-black/50" @click.self="emit('close')">
    <div class="max-h-[75vh] w-full overflow-y-auto rounded-t-2xl bg-gray-900 p-4">
      <div class="mb-2 flex items-center justify-between">
        <h2 class="text-lg font-semibold">Categories</h2>
        <button class="text-gray-400" @click="emit('close')">Close</button>
      </div>
      <button class="w-full rounded-lg px-3 py-2 text-left text-indigo-300" @click="pickAll">All categories</button>
      <div v-for="c in tops" :key="c.slug" class="border-t border-gray-800">
        <div class="flex items-center">
          <button class="flex-1 px-3 py-3 text-left" @click="pickCat(c.slug)">
            {{ c.label }} <span class="text-gray-500 text-sm">({{ c.count }})</span>
          </button>
          <button class="px-3 py-3 text-gray-400" @click="toggle(c)">{{ expanded === c.slug ? '▾' : '▸' }}</button>
        </div>
        <div v-if="expanded === c.slug" class="pb-2 pl-4">
          <button v-for="s in subs" :key="s.slug" class="block w-full px-3 py-2 text-left text-sm text-gray-300"
                  @click="pickSub(c.slug, s.slug)">{{ s.label }} <span class="text-gray-600">({{ s.count }})</span></button>
        </div>
      </div>
    </div>
  </div>
</template>
