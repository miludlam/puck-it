<script setup lang="ts">
import { computed, ref } from 'vue';
import { useContractStore, useFranchiseStore, usePlayerStore } from '@/stores';
import { LineLeague, Player } from '@/types';
import { lineSlots, reviewLineup, suggestLineup } from '@/utils/lineSuggest';
import { assessRoster, LineupMove } from '@/utils/rosterCore';

const props = defineProps<{
    league: LineLeague;
    slotMap: Record<string, Player | null>;
}>();

const playerStore = usePlayerStore();
const contractStore = useContractStore();
const franchiseStore = useFranchiseStore();

const status = computed(() => franchiseStore.franchise?.team_status ?? 'Bubble');
const open = ref(true);

const notes = computed(() => reviewLineup(props.slotMap, playerStore.players, props.league));
const moves = computed(() => assessRoster(playerStore.players, status.value, contractStore.extensions).lineupMoves);

// Suggested lineup, previewed before it's applied
const suggestion = ref<Record<string, Player> | null>(null);
const slots = computed(() => lineSlots(props.league));
const changed = (slot: string) => suggestion.value?.[slot]?.id !== props.slotMap[slot]?.id;
const changeCount = computed(() => {
    const s = slots.value;
    return [...s.forwards.flat(), ...s.defence.flat(), ...s.goalies, ...s.scratches].filter(changed).length;
});
const previewRows = computed(() => {
    const s = slots.value;
    return [
        ...s.forwards.map((keys, i) => ({ label: `L${i + 1}`, keys })),
        ...s.defence.map((keys, i) => ({ label: `P${i + 1}`, keys })),
        { label: 'G', keys: s.goalies },
        ...(s.scratches.length ? [{ label: 'Scr', keys: s.scratches }] : []),
    ];
});

const busy = ref(false);
async function apply() {
    if (!suggestion.value) return;
    busy.value = true;
    try {
        await playerStore.setLines(props.league, suggestion.value);
        suggestion.value = null;
    } finally {
        busy.value = false;
    }
}

// Call up the AHL player and send the NHL player down, both off their lines
async function swap(move: LineupMove) {
    busy.value = true;
    try {
        await playerStore.update(move.up.id, { roster_league: 'NHL', line_slot: null, line_league: null });
        if (move.down) await playerStore.update(move.down.id, { roster_league: 'AHL', line_slot: null, line_league: null });
    } finally {
        busy.value = false;
    }
}

const short = (p: Player) => `${p.first_name.charAt(0)}. ${p.last_name}`;
const issueCount = computed(() => notes.value.length + moves.value.length);
</script>

<template>
    <section class="mx-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
        <div class="flex flex-wrap items-center gap-3 px-4 py-2.5">
            <button class="flex items-center gap-2 text-left" :aria-expanded="open" @click="open = !open">
                <span class="text-xs text-slate-500 transition-transform" :class="open ? 'rotate-90' : ''">▶</span>
                <h3 class="text-xs font-medium text-slate-400 uppercase tracking-wider">Line advice</h3>
                <span class="text-xs text-slate-500">{{ issueCount ? `${issueCount} to look at` : 'Nothing flagged' }}</span>
            </button>
            <div class="flex-1" />
            <button
                class="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
                @click="suggestion = suggestLineup(playerStore.players, league, status); open = true"
            >Suggest lines</button>
        </div>

        <div v-if="open" class="px-4 pb-4 space-y-4">
            <!-- Suggested lineup preview -->
            <div v-if="suggestion" class="rounded-lg border border-sky-500/40 bg-slate-900/40 p-3 space-y-3">
                <div class="flex flex-wrap items-center gap-3">
                    <p class="text-sm text-slate-200">
                        Suggested lines <span class="text-slate-500">· {{ changeCount }} change{{ changeCount === 1 ? '' : 's' }}, highlighted</span>
                    </p>
                    <div class="flex-1" />
                    <button class="text-xs text-slate-400 hover:text-slate-200" @click="suggestion = null">Dismiss</button>
                    <button
                        class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:opacity-90 disabled:opacity-40"
                        :style="{ backgroundColor: 'var(--team-primary)', color: 'var(--team-on-primary)' }"
                        :disabled="busy || !changeCount"
                        @click="apply"
                    >Apply</button>
                </div>
                <div class="overflow-x-auto">
                    <table class="text-xs border-collapse">
                        <tbody>
                            <tr v-for="row in previewRows" :key="row.label">
                                <td class="pr-3 py-0.5 text-slate-500">{{ row.label }}</td>
                                <td
                                    v-for="key in row.keys"
                                    :key="key"
                                    class="pr-4 py-0.5 whitespace-nowrap"
                                    :class="changed(key) ? 'text-sky-300' : 'text-slate-400'"
                                >
                                    <template v-if="suggestion[key]">
                                        {{ short(suggestion[key]) }}
                                        <span class="text-slate-500">{{ suggestion[key].player_type }} {{ suggestion[key].overall }}</span>
                                    </template>
                                    <span v-else class="text-slate-600">—</span>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <p class="text-xs text-slate-500">
                    Best players highest, natural positions, and a mix of types: a playmaker and a shooter on each top-nine line,
                    offensive D with a defensive partner.<template v-if="status === 'Rebuild'"> Rebuilding, so young players with NHL potential win close calls.</template>
                    The game doesn't publish line chemistry, so treat this as a starting point.
                </p>
            </div>

            <!-- Call-ups -->
            <div v-if="moves.length">
                <h4 class="text-xs text-slate-500 mb-1.5">Call-ups</h4>
                <ul class="space-y-1">
                    <li v-for="m in moves" :key="m.up.id" class="flex flex-wrap items-center gap-x-3 text-sm">
                        <span class="text-slate-200">
                            {{ short(m.up) }} <span class="text-slate-500">(AHL)</span>
                            <template v-if="m.down"> for {{ short(m.down) }}</template>
                        </span>
                        <span class="text-xs text-slate-400">{{ m.note }}</span>
                        <button
                            class="text-xs text-sky-400 hover:text-sky-300 disabled:opacity-40"
                            :disabled="busy"
                            @click="swap(m)"
                        >{{ m.down ? 'Swap them' : 'Call up' }}</button>
                    </li>
                </ul>
            </div>

            <!-- Notes on the lines as set -->
            <ul v-if="notes.length" class="space-y-1">
                <li v-for="note in notes" :key="note.text" class="text-sm flex gap-2">
                    <span :class="note.tone === 'warn' ? 'text-amber-400' : 'text-slate-500'" aria-hidden="true">•</span>
                    <span :class="note.tone === 'warn' ? 'text-slate-200' : 'text-slate-400'">{{ note.text }}</span>
                </li>
            </ul>
            <p v-else-if="!moves.length && !suggestion" class="text-sm text-slate-500">The lines look balanced.</p>
        </div>
    </section>
</template>
