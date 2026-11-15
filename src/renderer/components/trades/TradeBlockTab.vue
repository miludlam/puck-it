<script setup lang="ts">
import { computed, ref } from 'vue';
import { useFranchiseStore, usePickStore, usePlayerStore } from '@/stores';
import { Pick, Player, TeamStatus } from '@/types';
import { evaluateTradeBlock, statusSummary } from '@/utils/tradeBlock';
import { CAP_CEILING, formatCap } from '@/utils/league';

const emit = defineEmits<{ trade: [playerIds: number[], pickIds: number[]] }>();

const franchiseStore = useFranchiseStore();
const playerStore = usePlayerStore();
const pickStore = usePickStore();

const STATUSES: TeamStatus[] = ['Contender', 'Bubble', 'Rebuild'];
const status = computed(() => franchiseStore.franchise?.team_status ?? 'Bubble');

const normalizeYear = (y: number) => y < 100 ? 2000 + y : y;
const roundLabel = (r: number) => ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th'][r - 1] ?? `${r}th`;
const draftYear = computed(() => normalizeYear((franchiseStore.franchise?.season ?? 25) + 1));
const myTeam = computed(() => franchiseStore.franchise?.team_id ?? null);
const myPicks = computed(() => pickStore.picks.filter(p => p.current_owner === myTeam.value));

const capSpace = computed(() => CAP_CEILING - playerStore.nhlCapHit);

const report = computed(() =>
    evaluateTradeBlock(playerStore.players, status.value, capSpace.value, myPicks.value, draftYear.value)
);

const pickLabel = (p: Pick) =>
    `${normalizeYear(p.year)} ${roundLabel(p.round)}${p.original_owner !== myTeam.value ? ` (${p.original_owner})` : ''}`;

// Selection carried into the trade form
const selectedPlayers = ref(new Set<number>());
const selectedPicks = ref(new Set<number>());
// Replace the Set so the refs trigger (templates auto-unwrap, so no ref params)
const toggled = (set: Set<number>, id: number) => {
    const next = new Set(set);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
};
const togglePlayer = (id: number) => { selectedPlayers.value = toggled(selectedPlayers.value, id); };
const togglePick = (id: number) => { selectedPicks.value = toggled(selectedPicks.value, id); };
const selectionCount = computed(() => selectedPlayers.value.size + selectedPicks.value.size);

function setOnBlock(player: Player, on: boolean) {
    playerStore.update(player.id, { on_block: on ? 1 : 0 });
}

// Manually add any roster player to the block
const addingId = ref<number | ''>('');
const offBlock = computed(() =>
    [...playerStore.players.filter(p => !p.on_block)].sort((a, b) => a.last_name.localeCompare(b.last_name))
);
function addToBlock() {
    const player = playerStore.players.find(p => p.id === addingId.value);
    if (player) setOnBlock(player, true);
    addingId.value = '';
}

const stateClass: Record<string, string> = {
    surplus: 'text-amber-400',
    short: 'text-rose-400',
    ok: 'text-emerald-400',
};
</script>

<template>
    <div class="space-y-8">

        <!-- Team direction -->
        <div class="space-y-2">
            <h2 class="text-sm font-medium text-slate-400 uppercase tracking-wider">Team Status</h2>
            <div class="flex flex-wrap items-center gap-3">
                <div class="flex gap-1 p-1 bg-slate-800/50 rounded-lg">
                    <button
                        v-for="s in STATUSES"
                        :key="s"
                        class="px-3 py-1 rounded-md text-xs font-medium transition-colors"
                        :class="status === s ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'"
                        @click="franchiseStore.setStatus(s)"
                    >{{ s }}</button>
                </div>
                <p class="text-xs text-slate-500">{{ statusSummary(status) }}</p>
            </div>
        </div>

        <div class="grid gap-8 lg:grid-cols-2">
            <!-- Depth vs. lineup -->
            <div>
                <h3 class="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">NHL Depth</h3>
                <table class="w-full text-sm border-collapse">
                    <thead>
                        <tr class="border-b border-slate-700 text-xs text-slate-500">
                            <th class="px-3 py-2 text-left font-medium">Pos</th>
                            <th class="px-3 py-2 text-center font-medium">NHL</th>
                            <th class="px-3 py-2 text-center font-medium">Spots</th>
                            <th class="px-3 py-2 text-center font-medium" title="AHL players at least as good as the weakest NHL player at the position">AHL ready</th>
                            <th class="px-3 py-2 text-left font-medium"></th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="d in report.depth" :key="d.position" class="border-b border-slate-800/60">
                            <td class="px-3 py-1.5 text-slate-300">{{ d.position }}</td>
                            <td class="px-3 py-1.5 text-center text-slate-300">{{ d.nhl }}</td>
                            <td class="px-3 py-1.5 text-center text-slate-500">{{ d.slots }}</td>
                            <td class="px-3 py-1.5 text-center text-slate-500">{{ d.ahlReady }}</td>
                            <td class="px-3 py-1.5 text-xs font-medium capitalize" :class="stateClass[d.state]">
                                {{ d.state === 'ok' ? 'covered' : d.state }}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <!-- What we want back -->
            <div>
                <h3 class="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">Looking For</h3>
                <ul class="space-y-1.5">
                    <li
                        v-for="want in report.wants"
                        :key="want"
                        class="px-3 py-2 text-sm text-slate-300 bg-slate-800/40 border border-slate-700/50 rounded-lg"
                    >{{ want }}</li>
                </ul>
                <p class="mt-3 text-xs text-slate-500">
                    Cap space: <span :class="capSpace < 0 ? 'text-rose-400' : 'text-emerald-400'">{{ formatCap(capSpace) }}</span>
                </p>
            </div>
        </div>

        <!-- Who's available -->
        <div class="space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-3">
                <h3 class="text-xs font-medium text-slate-500 uppercase tracking-wider">On the Block</h3>
                <div class="flex items-center gap-2">
                    <select
                        v-model="addingId"
                        class="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
                        @change="addToBlock"
                    >
                        <option value="">+ Put a player on the block…</option>
                        <option v-for="p in offBlock" :key="p.id" :value="p.id">
                            {{ p.last_name }}, {{ p.first_name }} · {{ p.position }} · {{ p.roster_league }}
                        </option>
                    </select>
                    <button
                        :disabled="!selectionCount"
                        class="px-4 py-1.5 rounded-lg text-xs font-medium bg-sky-700 hover:bg-sky-600 disabled:opacity-40 text-slate-100 transition-colors"
                        @click="emit('trade', [...selectedPlayers], [...selectedPicks])"
                    >Build trade{{ selectionCount ? ` (${selectionCount})` : '' }} →</button>
                </div>
            </div>

            <p v-if="!report.candidates.length" class="text-xs text-slate-600">
                Nobody flagged for a {{ status.toLowerCase() }} team. Put players on the block by hand above.
            </p>
            <div
                v-for="c in report.candidates"
                :key="c.player.id"
                class="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 bg-slate-800/40 border rounded-lg transition-colors"
                :class="selectedPlayers.has(c.player.id) ? 'border-sky-500/50' : 'border-slate-700/50'"
            >
                <input
                    type="checkbox"
                    :checked="selectedPlayers.has(c.player.id)"
                    class="accent-sky-500"
                    @change="togglePlayer(c.player.id)"
                />
                <span class="text-sm font-medium text-slate-200 w-40 truncate">{{ c.player.first_name }} {{ c.player.last_name }}</span>
                <span class="text-xs text-slate-400 w-48">
                    {{ c.player.position }} · {{ c.player.age }} · {{ c.player.overall }} OVR · {{ c.player.roster_league }}
                </span>
                <span class="text-xs text-slate-500 w-32">
                    {{ c.player.aav > 0 ? `${formatCap(c.player.aav)} × ${c.player.years_remaining}` : 'No contract' }}
                </span>
                <span class="text-xs text-slate-400 flex-1 min-w-[12rem]">{{ c.reasons.join(' · ') }}</span>
                <span v-if="c.clause" class="text-xs text-amber-400">{{ c.clause }}</span>
                <button
                    class="text-xs transition-colors"
                    :class="c.manual ? 'text-rose-400 hover:text-rose-300' : 'text-slate-500 hover:text-slate-300'"
                    @click="setOnBlock(c.player, !c.manual)"
                >{{ c.manual ? 'Remove from block' : 'Keep on block' }}</button>
            </div>
        </div>

        <!-- Picks worth offering -->
        <div v-if="report.pickChips.length" class="space-y-2">
            <h3 class="text-xs font-medium text-slate-500 uppercase tracking-wider">Picks to Offer</h3>
            <div class="flex flex-wrap gap-2">
                <button
                    v-for="p in report.pickChips"
                    :key="p.id"
                    class="px-3 py-1 rounded-md text-xs border transition-colors"
                    :class="selectedPicks.has(p.id)
                        ? 'border-sky-500/60 bg-sky-500/10 text-sky-200'
                        : 'border-slate-700 text-slate-300 hover:border-slate-500'"
                    @click="togglePick(p.id)"
                >{{ pickLabel(p) }}</button>
            </div>
        </div>
    </div>
</template>
