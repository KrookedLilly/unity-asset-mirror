<script setup lang="ts">
import { ref, reactive } from 'vue';
import PhotoSwipeLightbox from 'photoswipe/lightbox';
import 'photoswipe/style.css';
import type { AssetImage } from '../api.js';

const props = defineProps<{ images: AssetImage[]; alt: string }>();

// ratio[i] = naturalWidth/naturalHeight, captured when a thumbnail loads.
const ratios = reactive<Record<number, number>>({});
const stripEl = ref<HTMLElement | null>(null);

function onThumbLoad(e: Event, i: number) {
  const img = e.target as HTMLImageElement;
  if (img.naturalWidth && img.naturalHeight) ratios[i] = img.naturalWidth / img.naturalHeight;
}

function openAt(index: number) {
  const W = 1600;
  const lightbox = new PhotoSwipeLightbox({
    dataSource: props.images.map((im, i) => {
      const r = ratios[i] ?? 16 / 9;
      return { src: im.imageUrl, width: W, height: Math.round(W / r), alt: props.alt };
    }),
    pswpModule: () => import('photoswipe'),
    wheelToZoom: true,
  });
  lightbox.init();
  lightbox.loadAndOpen(index);
  lightbox.on('destroy', () => lightbox.destroy());
}
</script>

<template>
  <div ref="stripEl" class="-mx-4 px-4 flex gap-2 overflow-x-auto snap-x snap-mandatory">
    <button v-for="(im, i) in images" :key="im.index" type="button"
            class="snap-start shrink-0 rounded-lg overflow-hidden bg-gray-800 active:scale-95"
            @click="openAt(i)">
      <img :src="im.thumbnailUrl" :alt="alt" loading="lazy"
           class="h-40 w-auto object-cover" @load="onThumbLoad($event, i)" />
    </button>
  </div>
</template>
