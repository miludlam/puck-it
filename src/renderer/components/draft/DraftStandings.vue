<script setup lang="ts">
import { computed } from 'vue';
import { useFranchiseStore, usePickStore, useStandingsStore } from '@/stores';
import { Pick, TeamStanding } from '@/types';
import { autoInLottery, draftSlot, lotteryRange, lotteryTeamCount, overallPick } from '@/utils/draftOrder';

// League position of every team whose pick I hold this draft. Saving re-estimates the
// projected position of those picks, unless the pick is locked.
const props = defineProps<{ picks: Pick[] }>(); // my picks in this draft

const franchiseStore = useFranchiseStore();
const pickStore = usePickStore();
const standingsStore = useStandingsStore();

const roundLabel = (r: number) => ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th'][r - 1] ?? `${r}th`;
const teamName = (id: string) => franchiseStore.teams.find(t => t.id === id)?.name ?? id;
const ordinal = (n: number) => {
    const teen = n % 100 >= 11 && n % 100 <= 13;
    return `${n}${teen ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
};

const teamCount = computed(() => franchiseStore.teams.length || 32);
const season = computed(() => franchiseStore.franchise?.season ?? null);
const myTeam = computed(() => franchiseStore.franchise?.team_id ?? null);

const inLottery = (s: TeamStanding | null) =>
    s?.in_lottery ?? (s?.position ? autoInLottery(s.position) : false);

const rows = computed(() => {
    if (season.value === null) return [];
    const byTeam = new Map<string, Pick[]>();
    for (const p of props.picks) byTeam.set(p.original_owner, [...(byTeam.get(p.original_owner) ?? []), p]);

    return [...byTeam].map(([teamID, picks]) => {
        const standing = standingsStore.forTeam(season.value!, teamID);
        const lottery = inLottery(standing);
        const slot = standing?.position ? draftSlot(standing.position, lottery, teamCount.value) : null;
        return {
            teamID,
            standing,
            lottery,
            slot,
            range: slot && lottery ? lotteryRange(slot, teamCount.value) : null,
            picks: [...picks].sort((a, b) => a.round - b.round),
        };
    }).sort((a, b) => (a.teamID === myTeam.value ? -1 : b.teamID === myTeam.value ? 1 : teamName(a.teamID).localeCompare(teamName(b.teamID))));
});

const numberOrNull = (raw: string, min: number, max: number) => {
    const n = Math.round(Number(raw));
    return raw === '' || Number.isNaN(n) ? null : Math.min(max, Math.max(min, n));
};

async function save(teamID: string, patch: Partial<TeamStanding>) {
    if (season.value === null) return;
    const current = standingsStore.forTeam(season.value, teamID);
    const next: TeamStanding = {
        season: season.value,
        team_id: teamID,
        position: current?.position ?? null,
        in_lottery: current?.in_lottery ?? null,
        lottery_pick: current?.lottery_pick ?? null,
        ...patch,
    };
    if (!inLottery(next)) next.lottery_pick = null;
    await standingsStore.save(next);
    await applyEstimates(teamID, next);
}

// Re-project this team's unlocked picks
async function applyEstimates(teamID: string, standing: TeamStanding) {
    if (!standing.position) return;
    const slot = draftSlot(standing.position, inLottery(standing), teamCount.value);
    const updates = props.picks
        .filter(p => p.original_owner === teamID && !p.locked)
        .map(p => ({ p, projected: overallPick(p.round, slot, teamCount.value, standing.lottery_pick) }))
        .filter(({ p, projected }) => p.projected_pick !== projected);
    await Promise.all(updates.map(({ p, projected }) => pickStore.update(p.id, { projected_pick: projected })));
}

const inputClass = "w-14 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-sky-500";
</script>

<template>
    <div v-if="rows.length" class="space-y-2">
        <div class="flex items-baseline justify-between">
            <h3 class="text-xs font-medium text-slate-500 uppercase tracking-wider">Standings → Pick Position</h3>
            <span class="text-[10px] text-slate-600">
                League position, 1 = best record · locked picks aren't changed
            </span>
        </div>
        <div class="rounded-lg border border-slate-700/50 divide-y divide-slate-800">
            <div
                v-for="r in rows"
                :key="r.teamID"
                class="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3 py-2 text-xs"
            >
                <span class="w-40 truncate text-sm text-slate-200">
                    {{ teamName(r.teamID) }}
                    <span v-if="r.teamID === myTeam" class="text-[10px] text-slate-500">own</span>
                </span>

                <label class="flex items-center gap-1.5 text-slate-500">
                    Position
                    <input
                        type="number"
                        min="1"
                        :max="teamCount"
                        :value="r.standing?.position ?? ''"
                        :placeholder="`1–${teamCount}`"
                        :class="inputClass"
                        @change="save(r.teamID, { position: numberOrNull(($event.target as HTMLInputElement).value, 1, teamCount) })"
                    />
                </label>

                <button
                    type="button"
                    class="px-2 py-0.5 rounded border transition-colors"
                    :class="r.lottery
                        ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                        : 'border-slate-700 text-slate-500 hover:text-slate-300'"
                    :title="r.standing?.in_lottery === null || !r.standing
                        ? 'Judged from position (outside the top 16) — click to set'
                        : 'Set by hand'"
                    @click="save(r.teamID, { in_lottery: !r.lottery })"
                >{{ r.lottery ? 'In lottery' : 'Playoff team' }}<span v-if="r.standing?.in_lottery == null" class="text-slate-600"> · auto</span></button>

                <label v-if="r.lottery" class="flex items-center gap-1.5 text-slate-500" title="Once drawn: the 1st-round pick this team ended up with">
                    Post-lottery #
                    <input
                        type="number"
                        min="1"
                        :max="lotteryTeamCount(teamCount)"
                        :value="r.standing?.lottery_pick ?? ''"
                        placeholder="—"
                        :class="inputClass"
                        @change="save(r.teamID, { lottery_pick: numberOrNull(($event.target as HTMLInputElement).value, 1, lotteryTeamCount(teamCount)) })"
                    />
                </label>

                <span class="ml-auto text-slate-400">
                    <template v-if="r.slot">
                        Picks {{ ordinal(r.slot) }} each round
                        <span v-if="r.range && !r.standing?.lottery_pick" class="text-amber-400/80">
                            · 1st could land #{{ r.range.best }}–#{{ r.range.worst }}
                        </span>
                    </template>
                    <span v-else class="text-slate-600">Enter position to estimate</span>
                </span>

                <div class="basis-full flex flex-wrap gap-1.5 pl-40 ml-4">
                    <span
                        v-for="p in r.picks"
                        :key="p.id"
                        class="px-1.5 py-0.5 rounded bg-slate-800/60 text-[10px] text-slate-400"
                        :title="p.locked ? 'Locked — not re-estimated' : ''"
                    >
                        {{ roundLabel(p.round) }}
                        <template v-if="p.projected_pick"> #{{ p.projected_pick }}</template>
                        <template v-if="p.locked"> 🔒</template>
                    </span>
                </div>
            </div>
        </div>
    </div>
</template>
