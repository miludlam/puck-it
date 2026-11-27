<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useFranchiseStore, usePickStore, usePlayerStore, useScoutedPlayerStore } from '@/stores';
import { isRefined, Player, PotentialChance, PotentialLevel, ScoutedPlayer } from '@/types';
import { positionBadge } from '@/utils/draftTargets';
import { draftNote } from '@/utils/draftOrder';

// Drafting a prospect: overall is revealed in-game once they're drafted, so it's entered
// here, along with the pick used. The pick and readiness go into the new player's notes.
const props = defineProps<{ prospect: ScoutedPlayer }>();
const emit = defineEmits<{ close: []; drafted: [player: Player, needsEdit: boolean] }>();

const franchiseStore = useFranchiseStore();
const pickStore = usePickStore();
const playerStore = usePlayerStore();
const scoutedStore = useScoutedPlayerStore();

const sp = props.prospect;
const teamCount = computed(() => franchiseStore.teams.length || 32);

const overall = ref<number | ''>('');
const validOverall = computed(() => typeof overall.value === 'number' && overall.value >= 1 && overall.value <= 99);
const overallInput = ref<HTMLInputElement | null>(null);
onMounted(() => overallInput.value?.focus());

// Season 25 = 2025-26, whose draft is in 2026
const normalizeYear = (y: number) => y < 100 ? 2000 + y : y;
const draftYear = computed(() => normalizeYear((franchiseStore.franchise?.season ?? 25) + 1));
// This year's picks not yet used, earliest first
const myPicks = computed(() =>
    pickStore.owned
        .filter(p => normalizeYear(p.year) === draftYear.value && p.drafted_player_id === null)
        .sort((a, b) => a.round - b.round || (a.projected_pick ?? Infinity) - (b.projected_pick ?? Infinity))
);
const pickId = ref<number | ''>('');
const pickNumber = ref<number | ''>('');
const pick = computed(() => myPicks.value.find(p => p.id === pickId.value) ?? null);
const pickRange = (round: number) => ({ min: (round - 1) * teamCount.value + 1, max: round * teamCount.value });
const validPickNumber = computed(() => {
    if (!pick.value || pickNumber.value === '') return true;
    const { min, max } = pickRange(pick.value.round);
    return pickNumber.value >= min && pickNumber.value <= max;
});
function choosePick(id: number | '') {
    pickId.value = id;
    pickNumber.value = pick.value?.projected_pick ?? '';
}
choosePick(myPicks.value[0]?.id ?? '');

const note = computed(() => draftNote(
    draftYear.value,
    pick.value && { round: pick.value.round, overall: pickNumber.value || null },
    teamCount.value,
    sp.nhl_readiness,
));

// Fog of war: prospects can be drafted with fields still unknown. Those get placeholders
// (blank potential/type) and the new player's edit form opens next to fill them in.
const hasUnknowns = !isRefined(sp);
const canDraft = computed(() => validOverall.value && validPickNumber.value);
const busy = ref(false);

// Drafted players always enter ITS with no contract
async function draft() {
    if (!canDraft.value || busy.value) return;
    busy.value = true;
    try {
        const created = await playerStore.add({
            first_name: sp.first_name,
            last_name: sp.last_name,
            position: sp.position ?? 'C',
            position2: sp.position2,
            age: sp.age ?? 17,
            roster_league: 'ITS',
            junior_league: sp.junior_league,
            overall: overall.value as number,
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
            notes: [note.value, sp.notes].filter(Boolean).join('\n'),
            line_slot: null,
            line_league: null,
        });
        // The pick is spent: it shows who it took, and the number entered becomes its final spot
        if (pick.value) {
            await pickStore.update(pick.value.id, {
                drafted_player_id: created.id,
                ...(pickNumber.value !== '' && { projected_pick: pickNumber.value, locked: true }),
            });
        }
        await scoutedStore.remove(sp.id);
        emit('drafted', created, hasUnknowns);
    } finally {
        busy.value = false;
    }
}

const inputClass = 'w-full bg-slate-800 border rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-sky-500';
</script>

<template>
    <div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" @keydown.esc="emit('close')">
        <form class="bg-slate-900 border border-slate-700 rounded-xl w-[440px] p-6 space-y-5" @submit.prevent="draft">
            <div class="flex items-start justify-between gap-4">
                <div>
                    <h2 class="text-base font-semibold">Draft {{ sp.first_name }} {{ sp.last_name }}</h2>
                    <p class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
                        <span v-if="sp.cs_rank">CS {{ sp.cs_rank }}</span>
                        <span class="px-1.5 rounded text-[10px] font-medium" :class="positionBadge(sp.position)">
                            {{ sp.position ?? '—' }}{{ sp.position2 ? `/${sp.position2}` : '' }}
                        </span>
                        <span v-if="sp.player_type">{{ sp.player_type }}</span>
                        <span v-if="sp.potential_level" class="text-slate-200">
                            {{ sp.potential_level }}<span v-if="sp.potential_chance" class="text-slate-500"> ({{ sp.potential_chance }})</span>
                        </span>
                        <span v-if="sp.nhl_readiness">{{ sp.nhl_readiness }}</span>
                        <span v-if="sp.junior_league" class="text-slate-500">{{ sp.junior_league }}</span>
                    </p>
                </div>
                <button type="button" class="text-slate-400 hover:text-slate-200 transition-colors" @click="emit('close')">✕</button>
            </div>

            <div>
                <label class="block text-xs text-slate-400 mb-1">Overall <span class="text-slate-600">— shown in-game once drafted</span></label>
                <input
                    ref="overallInput"
                    v-model.number="overall"
                    type="number"
                    min="1"
                    max="99"
                    placeholder="1–99"
                    :class="[inputClass, overall === '' || validOverall ? 'border-slate-700' : 'border-amber-500/60']"
                />
            </div>

            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="block text-xs text-slate-400 mb-1">Pick used</label>
                    <select
                        :value="pickId"
                        :class="[inputClass, 'border-slate-700']"
                        @change="choosePick(($event.target as HTMLSelectElement).value ? Number(($event.target as HTMLSelectElement).value) : '')"
                    >
                        <option v-for="p in myPicks" :key="p.id" :value="p.id">
                            Round {{ p.round }}{{ p.original_owner !== franchiseStore.franchise?.team_id ? ` (via ${p.original_owner})` : '' }}
                        </option>
                        <option value="">No pick info</option>
                    </select>
                </div>
                <div v-if="pick">
                    <label class="block text-xs text-slate-400 mb-1">Overall pick #</label>
                    <input
                        v-model.number="pickNumber"
                        type="number"
                        :min="pickRange(pick.round).min"
                        :max="pickRange(pick.round).max"
                        :placeholder="`${pickRange(pick.round).min}–${pickRange(pick.round).max}`"
                        :class="[inputClass, validPickNumber ? 'border-slate-700' : 'border-amber-500/60']"
                    />
                </div>
            </div>
            <p v-if="!validPickNumber" class="-mt-3 text-xs text-amber-400/80">Pick #{{ pickNumber }} isn't in round {{ pick?.round }}.</p>

            <div class="rounded-lg bg-slate-800/50 px-3 py-2 text-xs">
                <span class="text-slate-500">Roster note:</span>
                <span class="text-slate-300"> {{ note }}</span>
            </div>
            <p v-if="hasUnknowns" class="text-xs text-amber-400/80">
                Some scouting fields are still unknown — the player's form opens next to fill them in.
            </p>

            <div class="flex justify-end gap-3 pt-3 border-t border-slate-700">
                <button type="button" class="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-slate-200 transition-colors" @click="emit('close')">Cancel</button>
                <button
                    type="submit"
                    :disabled="!canDraft || busy"
                    class="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white transition-colors"
                    :title="validOverall ? undefined : 'Enter the overall shown in-game after the draft'"
                >Draft to roster</button>
            </div>
        </form>
    </div>
</template>
