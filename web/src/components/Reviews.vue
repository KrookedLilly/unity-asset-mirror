<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getReviews, type Review } from '../api.js';

const props = defineProps<{ assetId: string; rating: number | null; reviewCount: number | null }>();

const sort = ref<'helpful' | 'recent' | 'rating'>('helpful');
const reviews = ref<Review[]>([]);
const total = ref(0); const lastPage = ref(1); const page = ref(1);
const loading = ref(false); const error = ref('');

let pendingReset = false;
async function load(reset: boolean) {
  if (reset) pendingReset = true;
  if (loading.value) return;
  const isReset = pendingReset;
  pendingReset = false;
  loading.value = true; error.value = '';
  if (isReset) { page.value = 1; reviews.value = []; }
  try {
    const r = await getReviews(props.assetId, sort.value, page.value);
    reviews.value = isReset ? r.reviews : [...reviews.value, ...r.reviews];
    total.value = r.total; lastPage.value = r.lastPage;
  } catch (e) { error.value = (e as Error).message; }
  finally {
    loading.value = false;
    if (pendingReset) load(true);
  }
}
function setSort(s: 'helpful' | 'recent' | 'rating') { if (s !== sort.value) { sort.value = s; load(true); } }
function loadMore() { if (page.value < lastPage.value && !loading.value) { page.value += 1; load(false); } }
onMounted(() => load(true));

const stars = (n: number | null) => { const f = Math.max(0, Math.min(5, n ?? 0)); return '★'.repeat(f) + '☆'.repeat(5 - f); };
const day = (d: string | null) => (d ? d.slice(0, 10) : '');
const sortLabel = { helpful: 'Most helpful', recent: 'Recent', rating: 'Rating' } as const;
</script>

<template>
  <section class="flex flex-col gap-3">
    <div class="flex items-center justify-between">
      <h2 class="text-sm uppercase tracking-wide text-gray-500">
        Reviews <span v-if="rating" class="text-amber-400">★ {{ rating }}</span>
        <span v-if="reviewCount" class="text-gray-500">({{ reviewCount.toLocaleString() }})</span>
      </h2>
      <div class="flex gap-1">
        <button v-for="s in (['helpful','recent','rating'] as const)" :key="s" type="button" @click="setSort(s)"
                :aria-pressed="sort === s"
                :class="`rounded-full px-3 py-1 text-xs active:scale-95 ${sort === s ? 'bg-indigo-600' : 'bg-gray-800'}`">
          {{ sortLabel[s] }}
        </button>
      </div>
    </div>

    <p v-if="error" class="text-red-400 text-sm">{{ error }}</p>

    <article v-for="r in reviews" :key="r.id" class="rounded-lg bg-gray-800/50 p-3 flex flex-col gap-1">
      <div class="flex items-center justify-between gap-2 text-sm">
        <span class="text-amber-400">{{ stars(r.rating) }}</span>
        <span class="text-gray-500 text-xs">👍 {{ r.helpfulCount }}</span>
      </div>
      <div class="font-medium">{{ r.title }}</div>
      <div class="text-xs text-gray-400">{{ r.author }} · {{ day(r.date) }}<span v-if="r.version"> · v{{ r.version }}</span></div>
      <p class="text-sm whitespace-pre-line leading-relaxed break-words">{{ r.body }}</p>
      <div v-for="(rep, idx) in r.replies" :key="idx" class="mt-1 ml-3 border-l-2 border-gray-700 pl-3">
        <div class="text-xs text-indigo-300">↳ {{ rep.author }} (publisher) · {{ day(rep.date) }}</div>
        <p class="text-sm whitespace-pre-line leading-relaxed break-words text-gray-300">{{ rep.body }}</p>
      </div>
    </article>

    <p v-if="loading" class="py-2 text-center text-gray-400 text-sm">Loading…</p>
    <button v-if="!loading && page < lastPage" type="button" @click="loadMore"
            class="self-center rounded-lg bg-gray-800 px-4 py-2 text-sm active:scale-95">
      Load more reviews ({{ (total - reviews.length).toLocaleString() }} more)
    </button>
    <p v-if="!loading && !error && !reviews.length" class="text-gray-500 text-sm">No reviews yet.</p>
  </section>
</template>
