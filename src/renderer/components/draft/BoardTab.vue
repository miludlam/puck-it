<script setup lang="ts">
import { computed, ref } from 'vue';
import { useScoutedPlayerStore, useScoutStore, usePlayerStore } from '@/stores';
import { GemBust, isRefined, Player, PlayerType, PotentialChance, PotentialLevel, ScoutedPlayer } from '@/types';
import ScoutedPlayerModal from '@/components/draft/ScoutedPlayerModal.vue';
import PlayerModal from '@/components/roster/PlayerModal.vue';

const scoutedStore = useScoutedPlayerStore();
const scoutStore = useScoutStore();
const playerStore = usePlayerStore();

const showModal = ref(false);
const selectedPlayer = ref<ScoutedPlayer | undefined>(undefined);
const draftConfirmId = ref<number | null>(null);
// Overall is always known once a player is drafted in-game, so it's entered at confirm
const draftOverall = ref<number | ''>('');
const validOverall = computed(() =>
    typeof draftOverall.value === 'number' && draftOverall.value >= 1 && draftOverall.value <= 99
);

function startDraft(sp: ScoutedPlayer) {
    draftConfirmId.value = sp.id;
    draftOverall.value = sp.overall ?? '';
}

// Unknown fields left after the overall entered at confirm
const hasUnknownsBesidesOverall = (sp: ScoutedPlayer) => !isRefined({ ...sp, overall: 0 });
// Newly drafted player opened for editing when the prospect had unknown fields
const draftedPlayer = ref<Player | null>(null);

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

// Fog of war: prospects can be drafted with fields still unknown. Drafted players always
// enter ITS with no contract. Overall comes from the confirm prompt; other unknowns get
// placeholders (blank potential/type) and the new player's edit form opens to fill them in.
async function draftPlayer(sp: ScoutedPlayer) {
    if (!validOverall.value) return;
    const created = await playerStore.add({
        first_name: sp.first_name,
        last_name: sp.last_name,
        position: sp.position ?? 'C',
        position2: sp.position2,
        age: sp.age ?? 17,
        roster_league: 'ITS',
        junior_league: sp.junior_league,
        overall: draftOverall.value as number,
        potential_level: sp.potential_level ?? '' as PotentialLevel,
        potential_chance: sp.potential_chance ?? '' as PotentialChance,
        player_type: sp.player_type ?? '' as PlayerType,
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
    if (hasUnknownsBesidesOverall(sp)) draftedPlayer.value = created;
}

const gemBustClass: Record<GemBust, string> = {
    Gem: 'px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/15 text-emerald-300',
    Bust: 'px-1.5 py-0.5 rounded text-[10px] font-medium bg-rose-500/15 text-rose-300',
};

const positionColor = (pos: string | null) => {
    if (!pos) return 'bg-slate-700/60 text-slate-400';
    if (['C', 'LW', 'RW'].includes(pos)) return 'bg-sky-500/20 text-sky-300';
    if (['LD', 'RD'].includes(pos)) return 'bg-amber-500/20 text-amber-300';
    return 'bg-emerald-500/20 text-emerald-300';
};

// Central Scouting order (projected pick), unranked last, then by name
const sorted = computed(() =>
    [...scoutedStore.scoutedPlayers].sort((a, b) =>
        (a.cs_rank ?? Infinity) - (b.cs_rank ?? Infinity)
        || a.last_name.localeCompare(b.last_name)
    )
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
                    <th class="px-3 py-2 text-center text-xs font-medium text-slate-500">CS #</th>
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
                    <td class="px-3 py-2 text-center text-slate-400">{{ sp.cs_rank ?? '—' }}</td>
                    <td class="px-3 py-2 cursor-pointer" @click="openEdit(sp)">
                        {{ sp.first_name.charAt(0) }}. {{ sp.last_name }}
                        <span v-if="sp.gem_bust" :class="['ml-1.5', gemBustClass[sp.gem_bust]]">{{ sp.gem_bust }}</span>
                    </td>
                    <td class="px-3 py-2 text-center">
                        <span class="px-2 py-0.5 rounded text-xs font-medium" :class="positionColor(sp.position)">
                            {{ sp.position ?? '—' }}{{ sp.position2 ? `/${sp.position2}` : '' }}
                        </span>
                    </td>
                    <td class="px-3 py-2 text-center text-slate-300">{{ sp.overall ?? '—' }}</td>
                    <td class="px-3 py-2 text-center text-slate-400">{{ sp.age ?? '—' }}</td>
                    <td class="px-3 py-2 text-slate-300">
                        <template v-if="sp.potential_level">
                            {{ sp.potential_level }}
                            <span v-if="sp.potential_chance" class="text-slate-500 text-xs">({{ sp.potential_chance }})</span>
                        </template>
                        <span v-else class="text-xs text-amber-400/80 cursor-pointer" @click="openEdit(sp)">Needs refining</span>
                    </td>
                    <td class="px-3 py-2 text-slate-400 text-xs">{{ sp.junior_league ?? '—' }}</td>
                    <td class="px-3 py-2 text-slate-400 text-xs">{{ sp.nhl_readiness ?? '—' }}</td>
                    <td class="px-3 py-2 text-slate-400 text-xs">{{ scoutName(sp.scout_id) }}</td>
                    <td class="px-3 py-2 text-right">
                        <template v-if="draftConfirmId === sp.id">
                            <span class="text-xs text-slate-400 mr-2">
                                Draft this player?
                                <span v-if="hasUnknownsBesidesOverall(sp)" class="text-amber-400/80">Some fields unknown</span>
                            </span>
                            <label class="text-xs text-slate-500 mr-2">
                                OVR
                                <input
                                    v-model.number="draftOverall"
                                    type="number"
                                    min="1"
                                    max="99"
                                    class="ml-1 w-14 bg-slate-900 border rounded px-1.5 py-0.5 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
                                    :class="validOverall ? 'border-slate-700' : 'border-amber-500/60'"
                                    @keydown.enter="draftPlayer(sp)"
                                />
                            </label>
                            <button
                                :disabled="!validOverall"
                                :title="validOverall ? undefined : 'Enter the overall shown in-game after the draft'"
                                class="px-2.5 py-1 rounded text-xs font-medium bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white transition-colors mr-1"
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
                            @click="startDraft(sp)"
                        >Draft</button>
                    </td>
                </tr>
            </tbody>
        </table>

        <ScoutedPlayerModal v-if="showModal" :player="selectedPlayer" @close="onClose" @saved="onClose" />
        <PlayerModal v-if="draftedPlayer" :player="draftedPlayer" @close="draftedPlayer = null" />
    </div>
</template>
