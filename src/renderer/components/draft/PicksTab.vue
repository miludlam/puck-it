<script setup lang="ts">
import { computed, ref } from 'vue';
import { usePickStore, useFranchiseStore } from '@/stores';
import { Pick, DraftRound } from '@/types';
import PickModal from '@/components/draft/PickModal.vue';

const pickStore = usePickStore();
const franchiseStore = useFranchiseStore();

const showModal = ref(false);
const selectedPick = ref<Pick | undefined>(undefined);

function teamName(id: string): string {
    return franchiseStore.teams.find(t => t.id === id)?.name ?? id;
}

const roundLabel = (r: number) =>
    ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th'][r - 1] ?? `${r}th`;

function normalizeYear(y: number): number {
    return y < 100 ? 2000 + y : y;
}

function openAdd() {
    selectedPick.value = undefined;
    showModal.value = true;
}
function openEdit(pick: Pick) {
    selectedPick.value = pick;
    showModal.value = true;
}
function onClose() {
    showModal.value = false;
    selectedPick.value = undefined;
}

// Owned = picks where current_owner is my team
// Traded Away = picks where original_owner is my team but current_owner is not
const owned = computed(() => {
    const id = franchiseStore.franchise?.team_id;
    if (!id) return [];
    return pickStore.picks
        .filter(p => p.current_owner === id)
        .map(p => ({ ...p, year: normalizeYear(p.year) }))
        .sort((a, b) => a.year !== b.year ? a.year - b.year : a.round - b.round);
});

const tradedAway = computed(() => {
    const id = franchiseStore.franchise?.team_id;
    if (!id) return [];
    return pickStore.picks
        .filter(p => p.original_owner === id && p.current_owner !== id)
        .map(p => ({ ...p, year: normalizeYear(p.year) }))
        .sort((a, b) => a.year !== b.year ? a.year - b.year : a.round - b.round);
});

// Group owned picks by year for the grid display
const years = computed(() => {
    const ys = new Set(owned.value.map(p => p.year));
    return [...ys].sort();
});

const rounds: DraftRound[] = [1, 2, 3, 4, 5, 6, 7];

function picksForCell(year: number, round: DraftRound): Pick[] {
    return owned.value
        .filter(p => p.year === year && p.round === round)
        .sort((a, b) => teamName(a.original_owner).localeCompare(teamName(b.original_owner)));
}

function isAcquired(pick: Pick): boolean {
    return pick.original_owner !== franchiseStore.franchise?.team_id;
}

function teamColor(id: string): string {
    return franchiseStore.teams.find(t => t.id === id)?.colors.primary ?? '#334155';
}
</script>

<template>
    <div class="space-y-8">
        <!-- Header row -->
        <div class="flex items-center justify-between">
            <h2 class="text-sm font-medium text-slate-400 uppercase tracking-wider">Pick Inventory</h2>
            <button
                class="px-4 py-2 rounded-lg text-sm font-medium bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
                @click="openAdd"
            >+ Add Pick</button>
        </div>

        <!-- Owned picks grid -->
        <div v-if="owned.length">
            <table class="w-full text-sm border-collapse">
                <thead>
                    <tr class="border-b border-slate-700">
                        <th class="px-3 py-2 text-center text-xs font-medium text-slate-500 uppercase tracking-wider w-16">Round</th>
                        <th
                            v-for="year in years"
                            :key="year"
                            class="px-3 py-2 text-center text-xs font-medium text-slate-500 uppercase tracking-wider"
                        >{{ year }}</th>
                    </tr>
                </thead>
                <tbody>
                    <tr
                        v-for="round in rounds"
                        :key="round"
                        class="border-b border-slate-800/60"
                    >
                        <td class="px-3 py-2 text-xs font-medium text-slate-500 text-center">{{ roundLabel(round) }}</td>
                        <td
                            v-for="year in years"
                            :key="year"
                            class="px-3 py-2 text-center"
                        >
                            <div class="flex flex-col items-center gap-1">
                                <button
                                    v-for="pick in picksForCell(year, round)"
                                    :key="pick.id"
                                    class="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium transition-opacity hover:opacity-75 text-white w-full justify-center"
                                    :style="{ backgroundColor: teamColor(pick.original_owner) }"
                                    @click="openEdit(pick)"
                                >
                                    {{ teamName(pick.original_owner) }}
                                </button>
                                <span v-if="picksForCell(year, round).length === 0" class="text-slate-700 text-xs">—</span>
                            </div>
                        </td>
                    </tr>
                </tbody>
                <tfoot>
                    <tr class="border-t border-slate-700">
                        <td class="px-3 py-2 text-xs font-medium text-slate-500 text-center uppercase tracking-wider"># Picks</td>
                        <td
                            v-for="year in years"
                            :key="year"
                            class="px-3 py-2 text-center text-xs font-medium text-slate-400"
                        >{{ owned.filter(p => p.year === year).length }}</td>
                    </tr>
                </tfoot>
            </table>
        </div>
        <div v-else class="rounded-xl border border-dashed border-slate-700 p-12 text-center text-slate-500 text-sm">
            No picks in inventory. Add picks or set up your franchise to generate them.
        </div>

        <!-- Traded Away -->
        <div v-if="tradedAway.length">
            <h2 class="text-sm font-medium text-slate-400 uppercase tracking-wider mb-3">Traded Away</h2>
            <div class="space-y-1">
                <div
                    v-for="pick in tradedAway"
                    :key="pick.id"
                    class="flex items-center gap-3 px-4 py-2.5 bg-slate-800/40 border border-slate-700/50 rounded-lg cursor-pointer hover:bg-slate-800/70 transition-colors"
                    @click="openEdit(pick)"
                >
                    <span class="text-sm font-medium text-slate-400">{{ roundLabel(pick.round) }}</span>
                    <span class="text-slate-600">·</span>
                    <span class="text-sm text-slate-300">{{ pick.year }}</span>
                    <span class="text-slate-600">·</span>
                    <span class="text-sm text-slate-300">{{ teamName(pick.original_owner) }}</span>
                    <span class="ml-auto text-xs text-slate-500">to {{ teamName(pick.current_owner) }}</span>
                    <span v-if="pick.notes" class="text-xs text-slate-500 italic">{{ pick.notes }}</span>
                </div>
            </div>
        </div>

        <PickModal
            v-if="showModal"
            :pick="selectedPick"
            @close="onClose"
            @saved="onClose"
        />
    </div>
</template>
