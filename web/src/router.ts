import { createRouter, createWebHistory } from 'vue-router';
import BrowseView from './views/BrowseView.vue';
import AssetDetail from './views/AssetDetail.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: BrowseView },
    { path: '/asset/:id', component: AssetDetail, props: true },
  ],
});
