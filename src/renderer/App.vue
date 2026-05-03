<script setup lang="ts">
import {onMounted} from 'vue';
import {usePlayerStore, useFranchiseStore} from "@/stores";

const playerStore = usePlayerStore();
const franchiseStore = useFranchiseStore();

onMounted(async () => {
    await Promise.all([
        franchiseStore.load(),
        playerStore.load(),
    ]);
})
</script>

<template>
    <div class="flex h-screen bg-slate-950 text-slate-100 items-center justify-center">
        <div class="text-center space-y-2">
            <h1 class="text-3xl font-semibold tracking-tight">🏒 Puck It</h1>
            <p class="text-slate-500 text-sm">GM companion — scaffold ready</p>
        </div>
    </div>
</template>
