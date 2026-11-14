<script setup lang="ts">
import { onMounted } from 'vue';
import AppHeader from '@/components/AppHeader.vue';
import AppSidebar from '@/components/AppSidebar.vue';

import { useTeamTheme } from '@/composables/useTeamTheme';
useTeamTheme();

import { usePlayerStore, useFranchiseStore, usePickStore, useScoutStore, useScoutedPlayerStore } from "@/stores";

const playerStore = usePlayerStore();
const franchiseStore = useFranchiseStore();
const pickStore = usePickStore();
const scoutStore = useScoutStore();
const scoutedPlayerStore = useScoutedPlayerStore();

onMounted(async () => {
    await Promise.all([
        franchiseStore.load(),
        franchiseStore.loadTeams(),
        playerStore.load(),
        pickStore.load(),
        scoutStore.load(),
        scoutedPlayerStore.load(),
    ]);
})
</script>

<template>
    <div class="flex flex-col h-screen">
        <AppHeader />
        <div class="flex flex-1 overflow-hidden">
            <AppSidebar />
            <main class="flex-1 overflow-y-auto">
                <RouterView />
            </main>
        </div>
    </div>
</template>
