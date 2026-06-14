<script setup lang="ts">
import { ref, watchEffect } from 'vue';
import DOMPurify from 'dompurify';
import { getAsset, type Asset } from '../api.js';
import Gallery from '../components/Gallery.vue';
import Reviews from '../components/Reviews.vue';

const props = defineProps<{ id: string }>();
const asset = ref<Asset | null>(null);
const error = ref('');
const loading = ref(false);

watchEffect(async () => {
  // safe: each asset gets a fresh mount (navigating away unmounts); the await race here
  // is not triggerable in the current router. Revisit with AbortSignal if a same-component
  // id-swap route (e.g. /asset/:id → /asset/:id without unmount) is ever added.
  loading.value = true; error.value = ''; asset.value = null;
  try { asset.value = await getAsset(props.id); }
  catch (e) { error.value = (e as Error).message; }
  finally { loading.value = false; }
});

const clean = (html: string | null) => (html ? DOMPurify.sanitize(html) : '');
</script>

<template>
  <main class="mx-auto max-w-3xl p-4 pb-24">
    <router-link to="/" class="text-indigo-400 text-sm">← Open another</router-link>

    <p v-if="loading" class="mt-8 text-gray-400">Loading…</p>
    <p v-else-if="error" class="mt-8 text-red-400">{{ error }}</p>

    <article v-else-if="asset" class="mt-3 flex flex-col gap-4">
      <h1 class="text-xl font-semibold leading-snug">{{ asset.name }}</h1>
      <div class="text-sm text-gray-400 flex flex-wrap gap-x-3 gap-y-1">
        <span v-if="asset.publisher">{{ asset.publisher }}</span>
        <span v-if="asset.category">· {{ asset.category }}</span>
        <span v-if="asset.rating">· ★ {{ asset.rating }} ({{ asset.reviewCount }})</span>
        <span v-if="asset.downloadSize">· {{ asset.downloadSize }}</span>
      </div>
      <div class="text-lg">
        <template v-if="asset.price.isFree">Free</template>
        <template v-else>
          <span class="font-semibold">${{ asset.price.finalPrice }}</span>
          <span v-if="asset.price.onSale" class="ml-2 text-gray-500 line-through">${{ asset.price.originalPrice }}</span>
        </template>
      </div>

      <Gallery v-if="asset.images.length" :images="asset.images" :alt="asset.name" />

      <section v-if="asset.description">
        <h2 class="text-sm uppercase tracking-wide text-gray-500 mb-1">Description</h2>
        <div class="prose-invert text-sm leading-relaxed break-words" v-html="clean(asset.description)" />
      </section>
      <section v-if="asset.keyFeatures">
        <h2 class="text-sm uppercase tracking-wide text-gray-500 mb-1">Key Features</h2>
        <div class="prose-invert text-sm leading-relaxed break-words" v-html="clean(asset.keyFeatures)" />
      </section>
      <Reviews :asset-id="props.id" :rating="asset.rating" :review-count="asset.reviewCount" />
      <section v-if="asset.tags.length" class="flex flex-wrap gap-2">
        <span v-for="t in asset.tags" :key="t" class="rounded-full bg-gray-800 px-3 py-1 text-xs">{{ t }}</span>
      </section>
    </article>
  </main>
</template>
