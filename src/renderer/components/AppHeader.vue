<script setup lang="ts">
import { computed, ref } from 'vue';
import { useFranchiseStore, usePlayerStore } from '@/stores';
import FranchiseModal from "@/components/franchise/FranchiseModal.vue";

// Load the stores
const franchiseStore = useFranchiseStore();
const playerStore = usePlayerStore();

// Constants
const CAP_CEILING = 88;
const MAX_CONTRACTS = 50;
const MAX_ROSTER = 23;

/* Helpers */
// Contracts display three significant figures
function formatCap(value: number): string {
    return `$${value.toFixed(3)}M`;
}

const teamName = computed(() =>
    franchiseStore.currentTeam?.name ?? 'No team selected'
);
const contractCount = computed(() =>
    playerStore.contractCount
);
const nhlCapHit = computed(() =>
    formatCap(playerStore.nhlCapHit)
);
const nhlRosterCount = computed(() =>
    playerStore.nhlRosterCount
);

const showModal = ref(false);
</script>

<template>
    <header class="h-12 bg-slate-900 flex items-center pr-6 gap-x-8">
        <div class="w-20 flex-shrink-0 drag-region" />
        <span
            class="text-sm font-medium cursor-pointer hover:text-slate-300 transition-colors no-drag"
            @click="showModal = true"
        >{{ teamName }} · {{ franchiseStore.formattedSeason }}</span>
        <span class="text-sm font-medium">Contracts: {{ contractCount }} / {{ MAX_CONTRACTS }}</span>
        <span class="text-sm font-medium">Cap: {{ nhlCapHit }} / {{ formatCap(CAP_CEILING) }}</span>
        <span class="text-sm font-medium">NHL Players: {{ nhlRosterCount }} / {{ MAX_ROSTER }}</span>
    </header>
    <FranchiseModal v-if="showModal" @close="showModal = false" />
</template>
