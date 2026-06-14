<script setup lang="ts">
import { useRouter } from 'vue-router';
import type { SearchResult } from '../api.js';
const props = defineProps<{ result: SearchResult }>();
const router = useRouter();
const fmt = (n: number | null) => (n == null ? '–' : `$${n.toFixed(2)}`);
</script>

<template>
  <button type="button" @click="router.push(`/asset/${props.result.id}`)"
          class="flex w-full gap-3 rounded-lg bg-gray-800/60 p-2 text-left active:scale-[0.99]">
    <img v-if="result.thumbnail" :src="result.thumbnail" :alt="result.name" loading="lazy"
         class="h-16 w-16 shrink-0 rounded-md object-cover bg-gray-700" />
    <div class="min-w-0 flex-1">
      <div class="truncate font-medium">{{ result.name }}</div>
      <div class="truncate text-sm text-gray-400">{{ result.publisher }}</div>
      <div class="mt-1 flex items-center gap-2 text-sm">
        <span v-if="result.rating" class="text-amber-400">★ {{ result.rating.toFixed(1) }}</span>
        <span v-if="result.price.isFree" class="text-emerald-400 font-medium">Free</span>
        <template v-else>
          <span class="font-medium">{{ fmt(result.price.finalPrice) }}</span>
          <span v-if="result.price.onSale" class="text-gray-500 line-through">{{ fmt(result.price.originalPrice) }}</span>
        </template>
      </div>
    </div>
  </button>
</template>
