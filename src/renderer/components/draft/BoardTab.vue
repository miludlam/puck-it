<script setup lang="ts">
import { computed, ref } from 'vue';
import { useFranchiseStore, useScoutedPlayerStore, useScoutStore, usePlayerStore } from '@/stores';
import { GemBust, isRefined, Player, PlayerType, PotentialChance, PotentialLevel, ScoutedPlayer } from '@/types';
import { groupOf, PLAYER_TYPES } from '@/utils/draftTargets';
import ScoutedPlayerModal from '@/components/draft/ScoutedPlayerModal.vue';
import PlayerModal from '@/components/roster/PlayerModal.vue';
import GapFillPanel from '@/components/draft/GapFillPanel.vue';
import { isUnscouted, rankScoutsFor } from '@/utils/gapFill';

const scoutedStore = useScoutedPlayerStore();
const scoutStore = useScoutStore();
const playerStore = usePlayerStore();
const franchiseStore = useFranchiseStore();

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
    draftOverall.value = '';
}

// Scoutable fields still unknown at the draft (overall is entered at confirm)
const hasUnknowns = (sp: ScoutedPlayer) => !isRefined(sp);
// Newly drafted player opened for editing when the prospect had unknown fields
const draftedPlayer = ref<Player | null>(null);

function scoutName(id: number | null): string {
    if (!id) return '—';
    const s = scoutStore.scouts.find(s => s.id === id);
    return s ? `${s.first_name.charAt(0)}. ${s.last_name}` : '—';
}

const addRank = ref<number | undefined>(undefined);
// Best free scout for an unscouted prospect's league (null when nobody's free)
const suggestedScout = (sp: ScoutedPlayer) => {
    if (!isUnscouted(sp)) return null;
    const best = rankScoutsFor(sp.junior_league, scoutStore.hired, id => scoutedStore.forScout(id).length)[0];
    return best?.free ? best : null;
};
const assignScout = (sp: ScoutedPlayer, scoutID: number) => scoutedStore.update(sp.id, { scout_id: scoutID });
const setType = (sp: ScoutedPlayer, value: string) =>
    scoutedStore.update(sp.id, { player_type: (value || null) as PlayerType | null });

function openAdd(csRank?: number) {
    selectedPlayer.value = undefined;
    addRank.value = csRank;
    showModal.value = true;
}
function openEdit(player: ScoutedPlayer) {
    selectedPlayer.value = player;
    showModal.value = true;
}
function onClose() {
    showModal.value = false;
    selectedPlayer.value = undefined;
    addRank.value = undefined;
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
        player_type: sp.player_type ?? '',
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
    if (hasUnknowns(sp)) draftedPlayer.value = created;
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

// Drafted by another team: stays on the board (greyed) but out of the draft targets
const setTaken = (sp: ScoutedPlayer, taken: boolean) => scoutedStore.update(sp.id, { taken: taken ? 1 : 0 });
const showTaken = ref(false);
const takenCount = computed(() => scoutedStore.scoutedPlayers.filter(p => p.taken).length);

// Movement since the original CS assessment (lower rank = better)
type Trend = { icon: string; class: string; title: string };
function csTrend(sp: ScoutedPlayer): Trend | null {
    if (sp.cs_rank === null || sp.original_cs_rank === null) return null;
    const moved = sp.original_cs_rank - sp.cs_rank;
    if (moved > 0) return { icon: '▲', class: 'text-emerald-400', title: `Up ${moved} from ${sp.original_cs_rank}` };
    if (moved < 0) return { icon: '▼', class: 'text-rose-400', title: `Down ${-moved} from ${sp.original_cs_rank}` };
    return { icon: '↔', class: 'text-slate-600', title: `Unchanged since ${sp.original_cs_rank}` };
}

// Season rollover: clear the draft class once the draft is done
const confirmClearClass = ref(false);
const keepUndrafted = ref(false);
async function clearClass() {
    await scoutedStore.clearClass(keepUndrafted.value);
    confirmClearClass.value = false;
    keepUndrafted.value = false;
}

// Central Scouting order (projected pick), unranked last, then by name
const sorted = computed(() =>
    scoutedStore.scoutedPlayers.filter(p => showTaken.value || !p.taken).sort((a, b) =>
        (a.cs_rank ?? Infinity) - (b.cs_rank ?? Infinity)
        || a.last_name.localeCompare(b.last_name)
    )
);

// Gaps in the CS ranking, so missed prospects can be slotted in. Covers every pick in the
// draft; taken prospects still fill their rank even when hidden. Anyone ranked past the
// last pick sits in one plain section with no gaps or drop spots.
const showGaps = ref(true);
const teamCount = computed(() => franchiseStore.teams.length || 32);
const DRAFT_ROUNDS = 7;
const draftSize = computed(() => teamCount.value * DRAFT_ROUNDS);

// Drag a row to re-rank: drop on an open spot to take that rank, on another prospect to
// swap ranks, or on "No CS rank" to clear it. Gaps open up into single ranks mid-drag.
const draggingId = ref<number | null>(null);
const dropKey = ref<string | null>(null);

function onRowDragStart(event: DragEvent, sp: ScoutedPlayer) {
    event.dataTransfer?.setData('text/plain', String(sp.id));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    // Re-rendering during dragstart cancels the drag in Chromium, so expand gaps next tick
    setTimeout(() => { draggingId.value = sp.id; });
}
function onRowDragEnd() {
    draggingId.value = null;
    dropKey.value = null;
}
function onRowDragOver(event: DragEvent, key: string) {
    if (draggingId.value === null) return;
    event.preventDefault();
    dropKey.value = key;
}

async function dropAtRank(rank: number | null) {
    const dragged = scoutedStore.scoutedPlayers.find(p => p.id === draggingId.value);
    onRowDragEnd();
    if (dragged && dragged.cs_rank !== rank) await scoutedStore.update(dragged.id, { cs_rank: rank });
}
async function dropOnPlayer(target: ScoutedPlayer) {
    const dragged = scoutedStore.scoutedPlayers.find(p => p.id === draggingId.value);
    onRowDragEnd();
    if (!dragged || dragged.id === target.id || dragged.cs_rank === target.cs_rank) return;
    const [from, to] = [dragged.cs_rank, target.cs_rank];
    await Promise.all([
        scoutedStore.update(dragged.id, { cs_rank: to }),
        scoutedStore.update(target.id, { cs_rank: from }),
    ]);
}

const isPastDraft = (sp: ScoutedPlayer) => sp.cs_rank !== null && sp.cs_rank > draftSize.value;

type BoardRow =
    | { kind: 'round'; key: string; label: string }
    | { kind: 'gap'; key: string; from: number; to: number }
    | { kind: 'player'; key: string; sp: ScoutedPlayer };

const rows = computed<BoardRow[]>(() => {
    if (!showGaps.value) return sorted.value.map(sp => ({ kind: 'player', key: `p${sp.id}`, sp }));

    const occupied = new Set(scoutedStore.scoutedPlayers.map(p => p.cs_rank).filter((r): r is number => r !== null));
    const byRank = new Map<number, ScoutedPlayer[]>();
    for (const sp of sorted.value) {
        if (sp.cs_rank !== null) byRank.set(sp.cs_rank, [...(byRank.get(sp.cs_rank) ?? []), sp]);
    }
    const last = draftSize.value;
    const result: BoardRow[] = [];
    let gapStart: number | null = null;
    const closeGap = (end: number) => {
        if (gapStart === null) return;
        if (draggingId.value === null) {
            result.push({ kind: 'gap', key: `g${gapStart}`, from: gapStart, to: end });
        } else {
            for (let r = gapStart; r <= end; r++) result.push({ kind: 'gap', key: `g${r}`, from: r, to: r });
        }
        gapStart = null;
    };

    for (let rank = 1; rank <= last; rank++) {
        // Round breaks follow draft order (CS rank ≈ projected pick)
        if ((rank - 1) % teamCount.value === 0) {
            closeGap(rank - 1);
            const round = (rank - 1) / teamCount.value + 1;
            result.push({ kind: 'round', key: `r${round}`, label: `Round ${round} · picks ${rank}–${rank + teamCount.value - 1}` });
        }
        if (!occupied.has(rank)) {
            gapStart ??= rank;
            continue;
        }
        closeGap(rank - 1);
        for (const sp of byRank.get(rank) ?? []) result.push({ kind: 'player', key: `p${sp.id}`, sp });
    }
    closeGap(last);

    const pastDraft = sorted.value.filter(sp => sp.cs_rank !== null && sp.cs_rank > last);
    if (pastDraft.length) {
        result.push({ kind: 'round', key: 'past', label: `Past the draft · CS ${last + 1}+` });
        for (const sp of pastDraft) result.push({ kind: 'player', key: `p${sp.id}`, sp });
    }

    const unranked = sorted.value.filter(sp => sp.cs_rank === null);
    const draggingRanked = scoutedStore.scoutedPlayers.some(p => p.id === draggingId.value && p.cs_rank !== null);
    if (unranked.length || draggingRanked) {
        result.push({ kind: 'round', key: 'unranked', label: 'No CS rank' });
        for (const sp of unranked) result.push({ kind: 'player', key: `p${sp.id}`, sp });
    }
    return result;
});

const openSpots = computed(() =>
    rows.value.reduce((n, r) => n + (r.kind === 'gap' ? r.to - r.from + 1 : 0), 0)
);
</script>

<template>
    <div class="space-y-4">
        <div class="flex items-center justify-between">
            <h2 class="text-sm font-medium text-slate-400 uppercase tracking-wider">Draft Board</h2>
            <label class="ml-auto mr-4 flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer">
                <input v-model="showGaps" type="checkbox" class="accent-slate-500" />
                Show CS gaps<template v-if="showGaps"> ({{ openSpots }} open of {{ draftSize }})</template>
            </label>
            <label v-if="takenCount" class="mr-4 flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer">
                <input v-model="showTaken" type="checkbox" class="accent-slate-500" />
                Show taken ({{ takenCount }})
            </label>
            <button
                v-if="scoutedStore.scoutedPlayers.length"
                class="mr-3 px-3 py-2 rounded-lg text-xs border border-slate-600 text-slate-400 hover:text-rose-400 hover:border-rose-400 transition-colors"
                title="After the draft — clear the board for next season's class"
                @click="confirmClearClass = true"
            >Clear draft class</button>
            <button
                class="px-4 py-2 rounded-lg text-sm font-medium bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
                @click="openAdd()"
            >+ Add Prospect</button>
        </div>

        <GapFillPanel />

        <div v-if="sorted.length === 0 && !showGaps"
             class="rounded-xl border border-dashed border-slate-700 p-12 text-center text-slate-500 text-sm">
            No prospects scouted yet.
        </div>

        <table v-else class="w-full text-sm border-collapse">
            <thead>
                <tr class="border-b border-slate-700">
                    <th class="px-3 py-2 text-center text-xs font-medium text-slate-500">CS #</th>
                    <th class="px-3 py-2 text-left text-xs font-medium text-slate-500">Name</th>
                    <th class="px-3 py-2 text-center text-xs font-medium text-slate-500">Pos</th>
                    <th class="px-3 py-2 text-center text-xs font-medium text-slate-500">Type</th>
                    <th class="px-3 py-2 text-center text-xs font-medium text-slate-500">Age</th>
                    <th class="px-3 py-2 text-left text-xs font-medium text-slate-500">Potential</th>
                    <th class="px-3 py-2 text-left text-xs font-medium text-slate-500">League</th>
                    <th class="px-3 py-2 text-left text-xs font-medium text-slate-500">Readiness</th>
                    <th class="px-3 py-2 text-left text-xs font-medium text-slate-500">Scout</th>
                    <th class="px-3 py-2"></th>
                </tr>
            </thead>
            <tbody>
                <template v-for="row in rows" :key="row.key">
                <tr
                    v-if="row.kind === 'round'"
                    class="border-b border-slate-700/60"
                    @dragover="row.key === 'unranked' && onRowDragOver($event, row.key)"
                    @drop.prevent="row.key === 'unranked' && dropAtRank(null)"
                >
                    <td
                        colspan="10"
                        class="px-3 pt-4 pb-1.5 text-[10px] font-medium uppercase tracking-wider"
                        :class="dropKey === row.key ? 'text-sky-400' : 'text-slate-500'"
                    >
                        {{ row.label }}
                        <span v-if="row.key === 'unranked' && draggingId !== null" class="normal-case tracking-normal">· drop to clear the rank</span>
                    </td>
                </tr>
                <tr
                    v-else-if="row.kind === 'gap'"
                    class="border-b border-slate-800/60"
                    @dragover="onRowDragOver($event, row.key)"
                    @dragleave="dropKey === row.key && (dropKey = null)"
                    @drop.prevent="dropAtRank(row.from)"
                >
                    <td class="px-3 py-1 text-center text-xs text-slate-600">
                        {{ row.from === row.to ? row.from : `${row.from}–${row.to}` }}
                    </td>
                    <td colspan="9" class="px-3 py-1">
                        <div
                            class="flex items-center gap-3 border border-dashed rounded px-2 py-0.5 transition-colors"
                            :class="dropKey === row.key ? 'border-sky-500 bg-sky-500/10' : 'border-slate-800'"
                        >
                            <span class="text-xs text-slate-600">
                                {{ row.to - row.from + 1 }} open spot{{ row.from === row.to ? '' : 's' }}
                            </span>
                            <span v-if="draggingId !== null" class="ml-auto text-xs text-slate-500">Drop for #{{ row.from }}</span>
                            <button
                                v-else
                                class="ml-auto text-xs text-slate-500 hover:text-sky-400 transition-colors"
                                @click="openAdd(row.from)"
                            >+ Add at #{{ row.from }}</button>
                        </div>
                    </td>
                </tr>
                <tr
                    v-else
                    class="border-b border-slate-800 hover:bg-slate-800/40 transition-colors"
                    :class="{
                        'opacity-50': row.sp.taken || draggingId === row.sp.id,
                        'cursor-grab': draftConfirmId !== row.sp.id,
                        'bg-sky-500/10 outline outline-1 outline-sky-500': dropKey === row.key && draggingId !== row.sp.id,
                    }"
                    :draggable="draftConfirmId !== row.sp.id"
                    :title="draggingId === null ? 'Drag to change CS rank' : undefined"
                    @dragstart="onRowDragStart($event, row.sp)"
                    @dragend="onRowDragEnd"
                    @dragover="draggingId !== row.sp.id && !isPastDraft(row.sp) && onRowDragOver($event, row.key)"
                    @drop.prevent="!isPastDraft(row.sp) && dropOnPlayer(row.sp)"
                >
                    <td class="px-3 py-2 text-center text-slate-400 whitespace-nowrap">
                        {{ row.sp.cs_rank ?? '—' }}
                        <span
                            v-if="csTrend(row.sp)"
                            class="ml-0.5 text-[10px] cursor-default"
                            :class="csTrend(row.sp)!.class"
                            :title="csTrend(row.sp)!.title"
                        >{{ csTrend(row.sp)!.icon }}<template v-if="row.sp.original_cs_rank !== row.sp.cs_rank">{{ Math.abs(row.sp.original_cs_rank! - row.sp.cs_rank!) }}</template></span>
                    </td>
                    <td class="px-3 py-2 cursor-pointer" @click="openEdit(row.sp)">
                        {{ row.sp.first_name.charAt(0) }}. {{ row.sp.last_name }}
                        <span v-if="row.sp.gem_bust" :class="['ml-1.5', gemBustClass[row.sp.gem_bust]]">{{ row.sp.gem_bust }}</span>
                        <span v-if="row.sp.taken" class="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-700 text-slate-300">Taken</span>
                    </td>
                    <td class="px-3 py-2 text-center">
                        <span class="px-2 py-0.5 rounded text-xs font-medium" :class="positionColor(row.sp.position)">
                            {{ row.sp.position ?? '—' }}{{ row.sp.position2 ? `/${row.sp.position2}` : '' }}
                        </span>
                    </td>
                    <td class="px-3 py-1 text-center">
                        <select
                            v-if="row.sp.position"
                            :value="row.sp.player_type ?? ''"
                            class="bg-transparent hover:bg-slate-900 border border-transparent hover:border-slate-700 rounded px-1 py-0.5 text-xs focus:outline-none focus:border-sky-500 cursor-pointer"
                            :class="row.sp.player_type ? 'text-slate-200' : 'text-slate-500'"
                            title="Player type"
                            draggable="false"
                            @dragstart.stop.prevent
                            @change="setType(row.sp, ($event.target as HTMLSelectElement).value)"
                        >
                            <option value="">—</option>
                            <option v-for="t in PLAYER_TYPES[groupOf(row.sp.position)]" :key="t" :value="t">{{ t }}</option>
                        </select>
                        <span v-else class="text-slate-600" title="Set a position first">—</span>
                    </td>
                    <td class="px-3 py-2 text-center text-slate-400">{{ row.sp.age ?? '—' }}</td>
                    <td class="px-3 py-2 text-slate-300">
                        <template v-if="row.sp.potential_level">
                            {{ row.sp.potential_level }}
                            <span v-if="row.sp.potential_chance" class="text-slate-500 text-xs">({{ row.sp.potential_chance }})</span>
                        </template>
                        <span v-else class="text-xs text-amber-400/80 cursor-pointer" @click="openEdit(row.sp)">Needs refining</span>
                    </td>
                    <td class="px-3 py-2 text-slate-400 text-xs">{{ row.sp.junior_league ?? '—' }}</td>
                    <td class="px-3 py-2 text-slate-400 text-xs">{{ row.sp.nhl_readiness ?? '—' }}</td>
                    <td class="px-3 py-2 text-slate-400 text-xs">
                        <button
                            v-if="suggestedScout(row.sp)"
                            type="button"
                            class="text-sky-400/80 hover:text-sky-300 transition-colors"
                            :title="`Free scout with the best ${row.sp.junior_league ?? 'overall'} rating — click to assign`"
                            @click="assignScout(row.sp, suggestedScout(row.sp)!.scout.id)"
                        >→ {{ scoutName(suggestedScout(row.sp)!.scout.id) }} {{ suggestedScout(row.sp)!.rating ?? '' }}</button>
                        <template v-else>{{ scoutName(row.sp.scout_id) }}</template>
                    </td>
                    <td class="px-3 py-2 text-right">
                        <template v-if="draftConfirmId === row.sp.id">
                            <span class="text-xs text-slate-400 mr-2">
                                Draft this player?
                                <span v-if="hasUnknowns(row.sp)" class="text-amber-400/80">Some fields unknown</span>
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
                                    @keydown.enter="draftPlayer(row.sp)"
                                />
                            </label>
                            <button
                                :disabled="!validOverall"
                                :title="validOverall ? undefined : 'Enter the overall shown in-game after the draft'"
                                class="px-2.5 py-1 rounded text-xs font-medium bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white transition-colors mr-1"
                                @click="draftPlayer(row.sp)"
                            >Confirm</button>
                            <button
                                class="px-2.5 py-1 rounded text-xs font-medium bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
                                @click="draftConfirmId = null"
                            >Cancel</button>
                        </template>
                        <button
                            v-else-if="row.sp.taken"
                            class="px-2.5 py-1 rounded text-xs text-slate-400 hover:text-slate-200 transition-colors"
                            title="Mark as still available"
                            @click="setTaken(row.sp, false)"
                        >Undo taken</button>
                        <template v-else>
                            <button
                                class="px-2.5 py-1 rounded text-xs text-slate-400 hover:text-slate-200 transition-colors mr-1"
                                title="Drafted by another team — drops out of your draft targets"
                                @click="setTaken(row.sp, true)"
                            >Taken</button>
                            <button
                                class="px-2.5 py-1 rounded text-xs font-medium bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
                                @click="startDraft(row.sp)"
                            >Draft</button>
                        </template>
                    </td>
                </tr>
                </template>
            </tbody>
        </table>

        <!-- Clear draft class -->
        <div v-if="confirmClearClass" class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
            <div class="bg-slate-900 border border-slate-700 rounded-xl p-6 w-96 space-y-4">
                <h3 class="text-base font-semibold">Clear the draft class?</h3>
                <p class="text-sm text-slate-400">
                    Removes {{ keepUndrafted ? `the ${takenCount} prospects taken by other teams` : `all ${scoutedStore.scoutedPlayers.length} prospects` }}
                    from the Board and shortlists. Players you drafted are already on your roster.
                </p>
                <label class="flex items-start gap-2 text-sm text-slate-300 cursor-pointer">
                    <input v-model="keepUndrafted" type="checkbox" class="mt-0.5 accent-sky-500" />
                    <span>
                        Keep undrafted prospects
                        <span class="block text-xs text-slate-500">They carry into next year with their current CS rank as the new original.</span>
                    </span>
                </label>
                <div class="flex gap-3">
                    <button
                        class="flex-1 px-4 py-2 rounded-lg text-sm border border-slate-600 text-slate-400 hover:text-slate-200 transition-colors"
                        @click="confirmClearClass = false"
                    >Cancel</button>
                    <button
                        class="flex-1 px-4 py-2 rounded-lg text-sm bg-rose-600 hover:bg-rose-700 text-white font-medium transition-colors"
                        @click="clearClass"
                    >Clear</button>
                </div>
            </div>
        </div>

        <ScoutedPlayerModal v-if="showModal" :player="selectedPlayer" :csRank="addRank" @close="onClose" @saved="onClose" />
        <PlayerModal v-if="draftedPlayer" :player="draftedPlayer" @close="draftedPlayer = null" />
    </div>
</template>
