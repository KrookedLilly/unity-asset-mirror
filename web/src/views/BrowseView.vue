<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { search, type SearchResult } from '../api.js';
import SearchBar from '../components/SearchBar.vue';
import SortMenu from '../components/SortMenu.vue';
import FilterToggles from '../components/FilterToggles.vue';
import CategorySheet from '../components/CategorySheet.vue';
import ResultList from '../components/ResultList.vue';

const router = useRouter();
const q = ref(''); const sort = ref('relevance'); const free = ref(false); const onSale = ref(false);
const category = ref<string | undefined>(); const subcategory = ref<string | undefined>();
const sheetOpen = ref(false);
const results = ref<SearchResult[]>([]); const total = ref(0); const page = ref(0);
const loading = ref(false); const error = ref(''); const hasMore = ref(false);
const sentinel = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;

let pendingReset = false;
async function run(reset: boolean) {
  if (reset) pendingReset = true;
  if (loading.value) return;
  const isReset = pendingReset;
  pendingReset = false;
  loading.value = true; error.value = '';
  if (isReset) { page.value = 0; results.value = []; }
  try {
    const r = await search({ q: q.value, category: category.value, subcategory: subcategory.value, sort: sort.value, free: free.value, onSale: onSale.value, page: page.value });
    results.value = isReset ? r.results : [...results.value, ...r.results];
    total.value = r.totalCount; hasMore.value = r.hasMore;
  } catch (e) { error.value = (e as Error).message; }
  finally {
    loading.value = false;
    if (pendingReset) { run(true); }
    else if (hasMore.value && sentinel.value) {
      const { top } = sentinel.value.getBoundingClientRect();
      if (top < window.innerHeight) loadMore();
    }
  }
}
function loadMore() { if (hasMore.value && !loading.value) { page.value += 1; run(false); } }

watch([sort, free, onSale, category, subcategory], () => run(true));
onMounted(() => {
  run(true); // empty query => Popular
  observer = new IntersectionObserver((es) => { if (es[0].isIntersecting) loadMore(); });
  if (sentinel.value) observer.observe(sentinel.value);
});
onUnmounted(() => observer?.disconnect());

function onSelect(sel: { category?: string; subcategory?: string }) { category.value = sel.category; subcategory.value = sel.subcategory; }
const categoryLabel = computed(() => subcategory.value ?? category.value ?? 'All categories');
const hasActiveFilters = computed(() => !!(category.value || subcategory.value || free.value || onSale.value));
function clearFilters() { category.value = undefined; subcategory.value = undefined; free.value = false; onSale.value = false; }
</script>

<template>
  <main class="mx-auto max-w-3xl p-4 pb-24 flex flex-col gap-3">
    <SearchBar v-model="q" @submit="run(true)" @open-asset="(id) => router.push(`/asset/${id}`)" />
    <div class="flex items-center justify-between gap-2">
      <button class="rounded-lg bg-gray-800 px-3 py-2 text-sm active:scale-95" @click="sheetOpen = true">
        {{ categoryLabel }} ▾
      </button>
      <SortMenu v-model="sort" />
    </div>
    <FilterToggles v-model:free="free" v-model:onSale="onSale" />

    <p v-if="error" class="text-red-400 text-sm">{{ error }}</p>
    <p v-if="!error && results.length" class="text-xs text-gray-500">{{ total.toLocaleString() }} results</p>
    <ResultList :results="results" />
    <p v-if="loading" class="py-4 text-center text-gray-400">Loading…</p>
    <div v-else-if="!results.length && !error" class="py-8 flex flex-col items-center gap-3 text-center text-gray-500">
      <p>{{ hasActiveFilters ? 'No results — you have filters active.' : 'No results.' }}</p>
      <button v-if="hasActiveFilters" type="button" @click="clearFilters"
              class="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white active:scale-95">Clear filters</button>
    </div>
    <div ref="sentinel" class="h-px"></div>

    <CategorySheet :open="sheetOpen" @close="sheetOpen = false" @select="onSelect" />
  </main>
</template>
