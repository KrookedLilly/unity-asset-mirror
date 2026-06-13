<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { extractAssetId } from '../ids.js';

const input = ref('');
const error = ref('');
const router = useRouter();

function open() {
  const id = extractAssetId(input.value);
  if (!id) { error.value = 'Enter an asset id or store URL'; return; }
  router.push(`/asset/${id}`);
}
</script>

<template>
  <main class="mx-auto max-w-xl p-6 flex flex-col gap-4 min-h-full justify-center">
    <h1 class="text-2xl font-semibold">Unity Asset Mirror</h1>
    <p class="text-gray-400 text-sm">Paste an Asset Store URL or an asset id.</p>
    <form class="flex gap-2" @submit.prevent="open">
      <input v-model="input" placeholder="341308 or https://assetstore.unity.com/…"
             class="flex-1 rounded-lg bg-gray-800 px-4 py-3 outline-none focus:ring-2 ring-indigo-500" />
      <button class="rounded-lg bg-indigo-600 px-5 py-3 font-medium active:scale-95">Open</button>
    </form>
    <p v-if="error" class="text-red-400 text-sm">{{ error }}</p>
  </main>
</template>
