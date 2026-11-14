<script setup lang="ts">
import { computed, ref } from 'vue';
import { useScoutedPlayerStore, useScoutStore, usePlayerStore } from '@/stores';
import { ScoutedPlayer } from '@/types';
import ScoutedPlayerModal from '@/components/draft/ScoutedPlayerModal.vue';

const scoutedStore = useScoutedPlayerStore();
const scoutStore = useScoutStore();
const playerStore = usePlayerStore();

const showModal = ref(false);
const selectedPlayer = ref<ScoutedPlayer | undefined>(undefined);
const draftConfirmId = ref<number | null>(null);

function scoutName(id: number | null): string {
    if (!id) return '—';
    const s = scoutStore.scouts.find(s => s.id === id);
    return s ? `${s.first_name.charAt(0)}. ${s.last_name}` : '—';
}

function openAdd() {
    selectedPlayer.value = undefined;
    showModal.value = true;
}
function openEdit(player: ScoutedPlayer) {
    selectedPlayer.value = player;
    showModal.value = true;
}
function onClose() {
    showModal.value = false;
    selectedPlayer.value = undefined;
}

async function draftPlayer(sp: ScoutedPlayer) {
    await playerStore.add({
        first_name: sp.first_name,
        last_name: sp.last_name,
        position: sp.position,
        position2: sp.position2,
        age: sp.age,
        roster_league: 'ITS',
        junior_league: sp.junior_league,
        overall: sp.overall,
        potential_level: sp.potential_level,
        potential_chance: sp.potential_chance,
        player_type: sp.player_type,
        role: '',
        aav: 0,
        years_remaining: 0,
        contract_type: null,
        clause: null,
        waiver_eligible: 1,
        status: 'Active',
        notes: sp.notes,
        line_slot: null,
        line_league: null,
    });
    await scoutedStore.remove(sp.id);
    draftConfirmId.value = null;
}

const positionColor = (pos: string) => {
    if (['C', 'LW', 'RW'].includes(pos)) return 'bg-sky-500/20 text-sky-300';
    if (['LD', 'RD'].includes(pos)) return 'bg-amber-500/20 text-amber-300';
    return 'bg-emerald-500/20 text-emerald-300';
};

const sorted = computed(() =>
    [...scoutedStore.scoutedPlayers].sort((a, b) => b.overall - a.overall)
);
</script>

<template>
    <div class="space-y-4">
        <div class="flex items-center justify-between">
            <h2 class="text-sm font-medium text-slate-400 uppercase tracking-wider">Draft Board</h2>
            <button
                class="px-4 py-2 rounded-lg text-sm font-medium bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
                @click="openAdd"
            >+ Add Prospect</button>
        </div>

        <div v-if="sorted.length === 0"
             class="rounded-xl border border-dashed border-slate-700 p-12 text-center text-slate-500 text-sm">
            No prospects scouted yet.
        </div>

        <table v-else class="w-full text-sm border-collapse">
            <thead>
                <tr class="border-b border-slate-700">
                    <th class="px-3 py-2 text-left text-xs font-medium text-slate-500">Name</th>
                    <th class="px-3 py-2 text-center text-xs font-medium text-slate-500">Pos</th>
                    <th class="px-3 py-2 text-center text-xs font-medium text-slate-500">OVR</th>
                    <th class="px-3 py-2 text-center text-xs font-medium text-slate-500">Age</th>
                    <th class="px-3 py-2 text-left text-xs font-medium text-slate-500">Potential</th>
                    <th class="px-3 py-2 text-left text-xs font-medium text-slate-500">League</th>
                    <th class="px-3 py-2 text-left text-xs font-medium text-slate-500">Readiness</th>
                    <th class="px-3 py-2 text-left text-xs font-medium text-slate-500">Scout</th>
                    <th class="px-3 py-2"></th>
                </tr>
            </thead>
            <tbody>
                <tr
                    v-for="sp in sorted"
                    :key="sp.id"
                    class="border-b border-slate-800 hover:bg-slate-800/40 transition-colors"
                >
                    <td class="px-3 py-2 cursor-pointer" @click="openEdit(sp)">
                        {{ sp.first_name.charAt(0) }}. {{ sp.last_name }}
                    </td>
                    <td class="px-3 py-2 text-center">
                        <span class="px-2 py-0.5 rounded text-xs font-medium" :class="positionColor(sp.position)">
                            {{ sp.position }}{{ sp.position2 ? `/${sp.position2}` : '' }}
                        </span>
                    </td>
                    <td class="px-3 py-2 text-center text-slate-300">{{ sp.overall }}</td>
                    <td class="px-3 py-2 text-center text-slate-400">{{ sp.age }}</td>
                    <td class="px-3 py-2 text-slate-300">
                        {{ sp.potential_level }}
                        <span class="text-slate-500 text-xs">({{ sp.potential_chance }})</span>
                    </td>
                    <td class="px-3 py-2 text-slate-400 text-xs">{{ sp.junior_league ?? '—' }}</td>
                    <td class="px-3 py-2 text-slate-400 text-xs">{{ sp.nhl_readiness ?? '—' }}</td>
                    <td class="px-3 py-2 text-slate-400 text-xs">{{ scoutName(sp.scout_id) }}</td>
                    <td class="px-3 py-2 text-right">
                        <template v-if="draftConfirmId === sp.id">
                            <span class="text-xs text-slate-400 mr-2">Draft this player?</span>
                            <button
                                class="px-2.5 py-1 rounded text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors mr-1"
                                @click="draftPlayer(sp)"
                            >Confirm</button>
                            <button
                                class="px-2.5 py-1 rounded text-xs font-medium bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
                                @click="draftConfirmId = null"
                            >Cancel</button>
                        </template>
                        <button
                            v-else
                            class="px-2.5 py-1 rounded text-xs font-medium bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
                            @click="draftConfirmId = sp.id"
                        >Draft</button>
                    </td>
                </tr>
            </tbody>
        </table>

        <ScoutedPlayerModal v-if="showModal" :player="selectedPlayer" @close="onClose" @saved="onClose" />
    </div>
</template>
