<script setup lang="ts">
import { ref, reactive, onUnmounted } from 'vue';
import PhotoSwipeLightbox from 'photoswipe/lightbox';
import 'photoswipe/style.css';
import type { AssetImage } from '../api.js';

const props = defineProps<{ images: AssetImage[]; alt: string }>();

// ratio[i] = naturalWidth/naturalHeight, captured when a thumbnail loads.
const ratios = reactive<Record<number, number>>({});
const stripEl = ref<HTMLElement | null>(null);
// Most-recently-opened lightbox, kept so we can tear it down on unmount.
const activeLightbox = ref<InstanceType<typeof PhotoSwipeLightbox> | null>(null);

function onThumbLoad(e: Event, i: number) {
  const img = e.target as HTMLImageElement;
  if (img.naturalWidth && img.naturalHeight) ratios[i] = img.naturalWidth / img.naturalHeight;
}

function openAt(index: number) {
  // Virtual display width to derive slide height from aspect ratio; PhotoSwipe rescales to viewport.
  const SLIDE_VIRTUAL_WIDTH = 1600;
  const lightbox = new PhotoSwipeLightbox({
    dataSource: props.images.map((im, i) => {
      const r = ratios[i] ?? (16 / 9); // fallback if thumbnail hasn't loaded yet
      return { src: im.imageUrl, width: SLIDE_VIRTUAL_WIDTH, height: Math.round(SLIDE_VIRTUAL_WIDTH / r), alt: props.alt };
    }),
    pswpModule: () => import('photoswipe'),
    wheelToZoom: true,
  });
  activeLightbox.value = lightbox;
  lightbox.init();
  lightbox.loadAndOpen(index);
  // No manual lightbox.destroy() needed: PhotoSwipe's built-in destroy handler clears
  // window.pswp and lightbox.pswp; calling lightbox.destroy() inside the 'destroy' event
  // causes infinite recursion (pswp.dispatch('destroy') → lightbox.destroy() → pswp.destroy()
  // → dispatch('destroy') → …). The lightbox GCs naturally after pswp clears its listeners.
}

// PhotoSwipe appends to document.body, outside Vue's tree, so it survives this component's
// teardown unless we close it explicitly. Cover two cases when the view unmounts:
//   Gap A: tapped a thumbnail, navigated away before import('photoswipe') resolved — the async
//          open would otherwise fire on the new page. shouldOpen=false suppresses it (PSL v5
//          gates the post-import open on this.shouldOpen; see lightbox.js loadAndOpen→_openPhotoswipe).
//   Gap B: browser Back while the gallery is open — pswp.close() runs PhotoSwipe's internal
//          destroy so the .pswp element is removed instead of being stranded on the new view.
onUnmounted(() => {
  const lb = activeLightbox.value;
  if (!lb) return;
  lb.shouldOpen = false;
  lb.pswp?.close();
});
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
