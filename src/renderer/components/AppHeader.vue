<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useCapStore, useFranchiseStore, usePlayerStore } from '@/stores';
import FranchiseModal from "@/components/franchise/FranchiseModal.vue";
import FranchiseMenu from "@/components/franchise/FranchiseMenu.vue";
import { formatCap, MAX_CONTRACTS, MAX_EXEMPT_CONTRACTS, MAX_ROSTER } from '@/utils/league';

// Load the stores
const franchiseStore = useFranchiseStore();
const playerStore = usePlayerStore();
const capStore = useCapStore();

const teamName = computed(() =>
    franchiseStore.franchise?.name ?? franchiseStore.currentTeam?.name ?? 'No team selected'
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
    formatCap(capStore.current - capStore.currentRetained - playerStore.nhlCapHit)
);
const capSpaceNegative = computed(() =>
    playerStore.nhlCapHit + capStore.currentRetained > capStore.current
);

const showModal = ref(false);
const showMenu = ref(false);

function openSetup() {
    showMenu.value = false;
    showModal.value = true;
}

// A new franchise starts with setup
watch(() => franchiseStore.franchise, (franchise, before) => {
    if (franchise && !before && !franchise.team_id) showModal.value = true;
});
</script>

<template>
    <header
        class="h-12 bg-slate-900 flex items-center pr-6 gap-x-8 border-b-2"
        :style="{ borderColor: 'var(--team-primary)' }"
    >
        <div class="w-20 flex-shrink-0 drag-region" />
        <div class="relative no-drag">
            <span
                class="text-sm font-medium cursor-pointer hover:text-slate-300 transition-colors"
                @click="showMenu = !showMenu"
            >{{ teamName }} · {{ franchiseStore.formattedSeason }} <span class="text-slate-500">▾</span></span>
            <FranchiseMenu v-if="showMenu" @close="showMenu = false" @setup="openSetup" />
        </div>
        <span class="text-sm font-medium">Contracts: {{ contractCount }} / {{ MAX_CONTRACTS }}</span>
        <span class="text-sm font-medium">Exempt: {{ exemptContractCount }} / {{ MAX_EXEMPT_CONTRACTS }}</span>
        <span class="text-sm font-medium">Cap: {{ nhlCapHit }} / {{ formatCap(capStore.current) }}</span>
        <span
            class="text-sm font-medium"
            :class="capSpaceNegative ? 'text-rose-400' : 'text-emerald-400'"
        >Space: {{ capSpace }}</span>
        <span class="text-sm font-medium">NHL Players: {{ nhlRosterCount }} / {{ MAX_ROSTER }}</span>
    </header>
    <FranchiseModal v-if="showModal" @close="showModal = false" />
</template>
