<script setup lang="ts">
import { computed, ref } from 'vue';
import { useFranchiseStore, usePickStore, usePlayerStore, useScoutedPlayerStore } from '@/stores';
import { Pick, ScoutedPlayer } from '@/types';
import { analyzeRoster, FALLER_MARGIN, planPicks, PickPlan } from '@/utils/draftTargets';
import LockIcon from '@/components/LockIcon.vue';
import ScoutedPlayerModal from '@/components/draft/ScoutedPlayerModal.vue';

const franchiseStore = useFranchiseStore();
const pickStore = usePickStore();
const playerStore = usePlayerStore();
const scoutedStore = useScoutedPlayerStore();

const normalizeYear = (y: number) => y < 100 ? 2000 + y : y;
const roundLabel = (r: number) => ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th'][r - 1] ?? `${r}th`;
const teamName = (id: string) => franchiseStore.teams.find(t => t.id === id)?.name ?? id;

const teamCount = computed(() => franchiseStore.teams.length || 32);
const draftSize = computed(() => teamCount.value * 7);

// Season 25 = 2025-26, whose draft is in 2026
const draftYear = computed(() =>
    franchiseStore.franchise ? normalizeYear(franchiseStore.franchise.season + 1) : null
);

// My picks in this year's draft: projected ones in pick order, unset last
const myPicks = computed(() => {
    const team = franchiseStore.franchise?.team_id;
    return pickStore.picks
        .filter(p => p.current_owner === team && normalizeYear(p.year) === draftYear.value)
        .sort((a, b) =>
            (a.projected_pick ?? Infinity) - (b.projected_pick ?? Infinity) || a.round - b.round
        );
});

const needs = computed(() => analyzeRoster(playerStore.players));
const positionNeeds = computed(() =>
    Object.values(needs.value.positions).filter(n => n.score > 0).sort((a, b) => b.score - a.score)
);
const typeNeeds = computed(() =>
    needs.value.types.filter(t => t.score > 0).sort((a, b) => b.score - a.score)
);

const ranked = computed(() => scoutedStore.scoutedPlayers.filter(p => p.cs_rank !== null));
const unrankedCount = computed(() => scoutedStore.scoutedPlayers.length - ranked.value.length);

// Plan targets for every projected pick, keyed by pick id
const plans = computed(() => {
    const projected = myPicks.value.filter(p => p.projected_pick !== null);
    const result = planPicks(projected.map(p => p.projected_pick!), ranked.value, needs.value, draftSize.value);
    // planPicks returns plans in pick order, matching `projected` (already sorted)
    return new Map<number, PickPlan>(projected.map((p, i) => [p.id, result[i]]));
});

// Valid overall numbers for a pick's round
const roundRange = (round: number) => ({
    min: (round - 1) * teamCount.value + 1,
    max: round * teamCount.value,
});

function setProjected(pick: Pick, raw: string) {
    const value = Number(raw);
    if (!raw || Number.isNaN(value)) return pickStore.update(pick.id, { projected_pick: null });
    const { min, max } = roundRange(pick.round);
    pickStore.update(pick.id, { projected_pick: Math.min(max, Math.max(min, Math.round(value))) });
}

const pickInRound = (pick: Pick) =>
    pick.projected_pick ? pick.projected_pick - (pick.round - 1) * teamCount.value : null;

const editingProspect = ref<ScoutedPlayer | null>(null);
</script>

<template>
    <div v-if="draftYear" class="space-y-4">
        <div class="flex items-baseline justify-between">
            <h2 class="text-sm font-medium text-slate-400 uppercase tracking-wider">{{ draftYear }} Draft Plan</h2>
            <span class="text-xs text-slate-600">
                Targets from {{ ranked.length }} ranked Board prospect{{ ranked.length === 1 ? '' : 's' }}
                <template v-if="unrankedCount"> · {{ unrankedCount }} without a CS rank ignored</template>
            </span>
        </div>

        <!-- Roster gaps the targets are weighed against -->
        <div class="flex flex-wrap items-center gap-2 text-xs">
            <span class="text-slate-500">Roster gaps:</span>
            <span
                v-for="n in positionNeeds"
                :key="n.position"
                class="px-2 py-0.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-300"
                :title="n.reasons.join('\n')"
            >{{ n.position }}</span>
            <span
                v-for="t in typeNeeds"
                :key="t.type"
                class="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300"
                :title="`${t.have} of ${t.want} wanted`"
            >{{ t.type }} {{ t.have }}/{{ t.want }}</span>
            <span v-if="!positionNeeds.length && !typeNeeds.length" class="text-slate-600">none flagged</span>
        </div>

        <div v-if="!myPicks.length"
             class="rounded-xl border border-dashed border-slate-700 p-8 text-center text-slate-500 text-sm">
            No picks in the {{ draftYear }} draft.
        </div>

        <div v-else class="space-y-2">
            <div
                v-for="pick in myPicks"
                :key="pick.id"
                class="flex flex-wrap items-start gap-4 px-4 py-3 bg-slate-800/40 border border-slate-700/50 rounded-lg"
            >
                <!-- Pick and its projected / locked position -->
                <div class="w-44 flex-shrink-0 space-y-1.5">
                    <p class="text-sm font-medium text-slate-200">
                        {{ roundLabel(pick.round) }} round
                        <span v-if="pick.original_owner !== franchiseStore.franchise?.team_id" class="text-xs font-normal text-slate-500">
                            via {{ teamName(pick.original_owner) }}
                        </span>
                    </p>
                    <div class="flex items-center gap-1.5">
                        <span class="text-xs text-slate-500">#</span>
                        <input
                            type="number"
                            :value="pick.projected_pick ?? ''"
                            :min="roundRange(pick.round).min"
                            :max="roundRange(pick.round).max"
                            :disabled="pick.locked"
                            :placeholder="`${roundRange(pick.round).min}–${roundRange(pick.round).max}`"
                            class="w-20 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-sky-500 disabled:opacity-60"
                            @change="setProjected(pick, ($event.target as HTMLInputElement).value)"
                        />
                        <button
                            class="p-1 rounded transition-colors"
                            :class="pick.locked ? 'text-amber-400 hover:text-amber-300' : 'text-slate-600 hover:text-slate-400'"
                            :title="pick.locked ? 'Locked — standings final' : 'Projected — lock once standings are final'"
                            @click="pickStore.update(pick.id, { locked: !pick.locked })"
                        >
                            <LockIcon :locked="pick.locked" class="w-3.5 h-3.5" />
                        </button>
                    </div>
                    <p class="text-[10px] text-slate-500">
                        <template v-if="pick.projected_pick">
                            {{ pick.locked ? 'Locked' : 'Projected' }} · pick {{ pickInRound(pick) }} of round
                        </template>
                        <template v-else>Set a projected pick for targets</template>
                    </p>
                </div>

                <!-- Targets -->
                <div v-if="plans.get(pick.id)" class="flex-1 min-w-0 space-y-1.5">
                    <p class="text-[10px] text-slate-600">
                        CS rank {{ plans.get(pick.id)!.window.from }}–{{ plans.get(pick.id)!.window.to ?? 'end' }}
                        (from {{ FALLER_MARGIN }} before the pick to before your next)
                    </p>
                    <div
                        v-for="t in plans.get(pick.id)!.targets"
                        :key="t.prospect.id"
                        class="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-1.5 rounded-md bg-slate-900/50 border border-slate-700/40 cursor-pointer hover:border-slate-500 transition-colors"
                        @click="editingProspect = t.prospect"
                    >
                        <span class="text-xs font-medium text-slate-400 w-10">CS {{ t.prospect.cs_rank }}</span>
                        <span class="text-sm text-slate-200">{{ t.prospect.first_name }} {{ t.prospect.last_name }}</span>
                        <span class="text-xs text-slate-400">
                            {{ t.prospect.position ?? '—' }}<template v-if="t.prospect.player_type"> · {{ t.prospect.player_type }}</template>
                        </span>
                        <span
                            v-if="t.prospect.gem_bust"
                            class="px-1.5 py-0.5 rounded text-[10px] font-medium"
                            :class="t.prospect.gem_bust === 'Gem' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'"
                        >{{ t.prospect.gem_bust }}</span>
                        <span v-if="t.mayBeGone" class="text-[10px] text-amber-400/80">may be gone</span>
                        <p class="basis-full text-[11px] text-slate-500 pl-[3.25rem]">
                            {{ t.reasons.length ? t.reasons.join(' · ') : 'Best ranked available — potential unknown' }}
                        </p>
                    </div>
                    <p v-if="!plans.get(pick.id)!.targets.length" class="text-xs text-slate-600">
                        No ranked prospects in this window yet.
                    </p>
                </div>
            </div>
        </div>

        <ScoutedPlayerModal
            v-if="editingProspect"
            :player="editingProspect"
            @close="editingProspect = null"
            @saved="editingProspect = null"
        />
    </div>
</template>
