<script setup lang="ts">
import { computed, ref } from 'vue';
import { useContractStore, useFranchiseStore, usePlayerStore } from '@/stores';
import { LineLeague, Player } from '@/types';
import { explainLineup, lineSlots, reviewLineup, suggestLineup } from '@/utils/lineSuggest';
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

// Why the lineup works — the suggestion while previewing, otherwise the lines as set
const plan = computed(() => explainLineup(suggestion.value ?? props.slotMap, props.league));
const planFor = (label: string) => plan.value.lines.find(l => l.label === label);
const hasPlan = computed(() => plan.value.lines.length > 0);

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
                            <template v-for="row in previewRows" :key="row.label">
                                <tr>
                                    <td class="pr-3 pt-1.5 text-slate-500 align-top">{{ row.label }}</td>
                                    <td
                                        v-for="key in row.keys"
                                        :key="key"
                                        class="pr-4 pt-1.5 whitespace-nowrap align-top"
                                        :class="changed(key) ? 'text-sky-300' : 'text-slate-400'"
                                    >
                                        <template v-if="suggestion[key]">
                                            {{ short(suggestion[key]) }}
                                            <span class="text-slate-500">{{ suggestion[key].player_type }} {{ suggestion[key].overall }}</span>
                                        </template>
                                        <span v-else class="text-slate-600">—</span>
                                    </td>
                                    <td v-if="row.keys.length === 2" />
                                    <td class="pt-1.5 align-top whitespace-nowrap">
                                        <template v-if="planFor(row.label)">
                                            <span class="text-slate-200">{{ planFor(row.label)!.identity }}</span>
                                            <span v-if="planFor(row.label)!.mentoring" class="ml-2 text-[10px] uppercase tracking-wider text-emerald-400/80">Mentoring</span>
                                        </template>
                                    </td>
                                </tr>
                                <tr v-if="planFor(row.label)?.reasons.length">
                                    <td />
                                    <td colspan="4" class="pb-1 text-slate-500">{{ planFor(row.label)!.reasons.join(' · ') }}</td>
                                </tr>
                            </template>
                        </tbody>
                    </table>
                </div>
                <p class="text-xs text-slate-500">
                    Best players highest, natural positions, and a mix of types: a playmaker and a shooter on each top-nine line,
                    offensive D with a defensive partner, and young players beside a veteran who covers for them.<template v-if="status === 'Rebuild'"> Rebuilding, so young players with NHL potential win close calls.</template>
                    The game doesn't publish line chemistry, so treat this as a starting point.
                </p>
            </div>

            <!-- The plan: line identities (for the lines as set), special teams, goalies, depth -->
            <div v-if="hasPlan" class="space-y-3">
                <h4 class="text-xs text-slate-500">Game plan{{ suggestion ? ' · for the suggested lines' : '' }}</h4>

                <ul v-if="!suggestion" class="space-y-1">
                    <li v-for="line in plan.lines" :key="line.label" class="text-sm">
                        <span class="text-slate-500 mr-2">{{ line.label }}</span>
                        <span class="text-slate-200">{{ line.identity }}</span>
                        <span v-if="line.mentoring" class="ml-2 text-[10px] uppercase tracking-wider text-emerald-400/80">Mentoring</span>
                        <span v-if="line.reasons.length" class="block pl-7 text-xs text-slate-500">{{ line.reasons.join(' · ') }}</span>
                    </li>
                </ul>

                <div class="grid gap-3 sm:grid-cols-2">
                    <div v-for="[title, units] in ([['Power play', plan.powerPlay], ['Penalty kill', plan.penaltyKill]] as const)" :key="title">
                        <h5 class="text-xs text-slate-500 mb-1">{{ title }}</h5>
                        <p v-for="unit in units" :key="unit.label" class="text-xs text-slate-400">
                            <span class="text-slate-500 mr-2">{{ unit.label }}</span>
                            <template v-for="(x, i) in unit.players" :key="x.player.id">
                                <span class="text-slate-200">{{ short(x.player) }}</span>
                                <span class="text-slate-500"> {{ x.role }}</span><template v-if="i < unit.players.length - 1">, </template>
                            </template>
                        </p>
                    </div>
                </div>

                <div v-if="plan.goalies.length || plan.depth.length">
                    <p v-for="text in [...plan.goalies, ...plan.depth]" :key="text" class="text-sm text-slate-400">{{ text }}</p>
                </div>
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
