<script setup lang="ts">
import type { SearchResult } from '../api.js';
import ResultCard from './ResultCard.vue';
defineProps<{ results: SearchResult[] }>();
</script>

<template>
  <div class="flex flex-col gap-2">
    <ResultCard v-for="r in results" :key="r.id" :result="r" />
  </div>
</template>
