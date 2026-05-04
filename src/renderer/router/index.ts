import {createRouter, createWebHashHistory } from 'vue-router';

const RosterView    = () => import('@/views/RosterView.vue');
const ContractsView = () => import('@/views/ContractsView.vue');
const DraftView     = () => import('@/views/DraftView.vue');
const TradesView    = () => import('@/views/TradesView.vue');

const routes = [
    { path: '/',          redirect: '/roster' },
    { path: '/roster',    component: RosterView },
    { path: '/contracts', component: ContractsView },
    { path: '/draft',     component: DraftView },
    { path: '/trades',    component: TradesView },
];

const router = createRouter({
    history: createWebHashHistory(),
    routes,
});

export default router;
