<script setup lang="ts">
import { computed, ref } from 'vue';
import { useFranchiseStore, usePlayerStore } from '@/stores';
import FranchiseModal from "@/components/franchise/FranchiseModal.vue";
import { CAP_CEILING, formatCap, MAX_CONTRACTS, MAX_EXEMPT_CONTRACTS, MAX_ROSTER } from '@/utils/league';

// Load the stores
const franchiseStore = useFranchiseStore();
const playerStore = usePlayerStore();

const teamName = computed(() =>
    franchiseStore.currentTeam?.name ?? 'No team selected'
);
const contractCount = computed(() =>
    playerStore.contractCount
);
const exemptContractCount = computed(() =>
    playerStore.exemptContractCount
);
const nhlCapHit = computed(() =>
    formatCap(playerStore.nhlCapHit)
);
const nhlRosterCount = computed(() =>
    playerStore.nhlRosterCount
);
const capSpace = computed(() =>
    formatCap(CAP_CEILING - playerStore.nhlCapHit)
);
const capSpaceNegative = computed(() =>
    playerStore.nhlCapHit > CAP_CEILING
);

const showModal = ref(false);
</script>

<template>
    <header
        class="h-12 bg-slate-900 flex items-center pr-6 gap-x-8 border-b-2"
        :style="{ borderColor: 'var(--team-primary)' }"
    >
        <div class="w-20 flex-shrink-0 drag-region" />
        <span
            class="text-sm font-medium cursor-pointer hover:text-slate-300 transition-colors no-drag"
            @click="showModal = true"
        >{{ teamName }} · {{ franchiseStore.formattedSeason }}</span>
        <span class="text-sm font-medium">Contracts: {{ contractCount }} / {{ MAX_CONTRACTS }}</span>
        <span class="text-sm font-medium">Exempt: {{ exemptContractCount }} / {{ MAX_EXEMPT_CONTRACTS }}</span>
        <span class="text-sm font-medium">Cap: {{ nhlCapHit }} / {{ formatCap(CAP_CEILING) }}</span>
        <span
            class="text-sm font-medium"
            :class="capSpaceNegative ? 'text-rose-400' : 'text-emerald-400'"
        >Space: {{ capSpace }}</span>
        <span class="text-sm font-medium">NHL Players: {{ nhlRosterCount }} / {{ MAX_ROSTER }}</span>
    </header>
    <FranchiseModal v-if="showModal" @close="showModal = false" />
</template>
