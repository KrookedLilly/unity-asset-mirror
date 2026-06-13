import { createRouter, createWebHistory } from 'vue-router';
import OpenAsset from './views/OpenAsset.vue';
import AssetDetail from './views/AssetDetail.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: OpenAsset },
    { path: '/asset/:id', component: AssetDetail, props: true },
  ],
});
