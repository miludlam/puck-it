<script setup lang="ts">
import { computed } from 'vue';
import { useContractStore, useFranchiseStore, usePlayerStore } from '@/stores';
import { Player, TeamStatus } from '@/types';
import { formatCap } from '@/utils/league';
import { assessRoster, CORE_TIERS, CoreTier } from '@/utils/rosterCore';

const emit = defineEmits<{ editPlayer: [player: Player] }>();

const playerStore = usePlayerStore();
const contractStore = useContractStore();
const franchiseStore = useFranchiseStore();

const STATUSES: TeamStatus[] = ['Contender', 'Bubble', 'Rebuild'];
const status = computed(() => franchiseStore.franchise?.team_status ?? 'Bubble');

const report = computed(() => assessRoster(playerStore.players, status.value, contractStore.extensions));

const byTier = computed(() => CORE_TIERS.map(tier => ({
    tier,
    assessments: report.value.assessments.filter(a => a.tier === tier),
})));

const TIER_INFO: Record<CoreTier, { blurb: string; class: string }> = {
    Core: { blurb: 'Build around them — extend, protect in trades', class: 'text-emerald-400' },
    Keep: { blurb: 'Solid pieces worth holding unless the return is strong', class: 'text-sky-400' },
    Replaceable: { blurb: 'Useful, but the system or the market can cover them', class: 'text-slate-300' },
    Expendable: { blurb: 'Depth and long shots — fine to move or let walk', class: 'text-slate-400' },
};

// Insight lists, shown only when they have something in them
const insights = computed(() => [
    { title: 'Extend soon', hint: 'Core and Keep players whose deals end this season', items: report.value.extendSoon },
    {
        title: 'Ready for a call-up', hint: 'AHL players rated above the weakest non-core NHL player at their position',
        items: report.value.lineupMoves.map(m => ({ player: m.up, note: m.note })),
    },
    { title: 'Bargain contracts', hint: 'Two or more years left, well under what that overall usually costs', items: report.value.bargains },
    { title: 'Contract burdens', hint: 'Two or more years left, well over what that overall usually costs', items: report.value.burdens },
    { title: 'Succession gaps', hint: 'Valued veterans with no young NHL-calibre player coming at their position', items: report.value.succession },
].filter(i => i.items.length));

const name = (p: Player) => `${p.first_name} ${p.last_name}`;
const positionLabel = (p: Player) => p.position2 ? `${p.position}/${p.position2}` : p.position;
const potentialLabel = (p: Player) => p.potential_level ? `${p.potential_level}${p.potential_chance ? ` (${p.potential_chance})` : ''}` : '—';
const contractLabel = (p: Player) => p.aav > 0 ? `${formatCap(p.aav)} × ${p.years_remaining}` : '—';
</script>

<template>
    <div class="space-y-8">
        <!-- Team direction sets the weighting -->
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
                <p class="text-xs text-slate-500">{{ report.summary }}</p>
            </div>
        </div>

        <div v-if="!playerStore.players.length"
             class="rounded-xl border border-dashed border-slate-700 p-12 text-center text-slate-500 text-sm">
            Add players to see the analysis.
        </div>

        <template v-else>
            <!-- Things to act on -->
            <div v-if="insights.length" class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div v-for="insight in insights" :key="insight.title" class="p-4 bg-slate-800/40 border border-slate-700/50 rounded-lg">
                    <h3 class="text-xs font-medium text-slate-400 uppercase tracking-wider" :title="insight.hint">{{ insight.title }}</h3>
                    <p class="text-xs text-slate-500 mt-0.5 mb-3">{{ insight.hint }}</p>
                    <ul class="space-y-1.5">
                        <li v-for="item in insight.items" :key="item.player.id" class="text-sm">
                            <button class="text-slate-100 hover:underline" @click="emit('editPlayer', item.player)">{{ name(item.player) }}</button>
                            <span class="text-xs text-slate-500 ml-1.5">{{ positionLabel(item.player) }} · {{ item.player.age }}</span>
                            <span class="block text-xs text-slate-400">{{ item.note }}</span>
                        </li>
                    </ul>
                </div>
            </div>

            <!-- Tiers -->
            <section v-for="group in byTier" :key="group.tier">
                <details :open="group.tier === 'Core' || group.tier === 'Keep'" class="group">
                    <summary class="flex items-baseline gap-3 mb-2 cursor-pointer list-none">
                        <span class="text-xs text-slate-500 transition-transform group-open:rotate-90">▶</span>
                        <h3 class="text-sm font-medium uppercase tracking-wider" :class="TIER_INFO[group.tier].class">{{ group.tier }}</h3>
                        <span class="text-xs text-slate-500">{{ group.assessments.length }} · {{ TIER_INFO[group.tier].blurb }}</span>
                    </summary>
                    <p v-if="!group.assessments.length" class="text-xs text-slate-500 pl-6">Nobody.</p>
                    <div v-else class="overflow-x-auto">
                        <!-- Fixed widths line the columns up across tiers -->
                        <table class="w-full min-w-[60rem] table-fixed text-sm border-collapse">
                            <thead>
                                <tr class="border-b border-slate-700 text-xs text-slate-500">
                                    <th class="w-48 px-3 py-2 text-left font-medium">Player</th>
                                    <th class="w-20 px-3 py-2 text-left font-medium">Pos</th>
                                    <th class="w-14 px-3 py-2 text-left font-medium">Lg</th>
                                    <th class="w-14 px-3 py-2 text-right font-medium">Age</th>
                                    <th class="w-14 px-3 py-2 text-right font-medium">OVR</th>
                                    <th class="w-36 px-3 py-2 text-left font-medium">Potential</th>
                                    <th class="w-32 px-3 py-2 text-left font-medium">Contract</th>
                                    <th class="px-3 py-2 text-left font-medium">Why</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr
                                    v-for="a in group.assessments"
                                    :key="a.player.id"
                                    class="border-b border-slate-800/60 hover:bg-slate-800/40 cursor-pointer"
                                    @click="emit('editPlayer', a.player)"
                                >
                                    <td class="px-3 py-1.5 text-slate-100 truncate">{{ name(a.player) }}</td>
                                    <td class="px-3 py-1.5 text-slate-400">{{ positionLabel(a.player) }}</td>
                                    <td class="px-3 py-1.5 text-slate-400">{{ a.player.roster_league }}</td>
                                    <td class="px-3 py-1.5 text-right text-slate-300 tabular-nums">{{ a.player.age }}</td>
                                    <td class="px-3 py-1.5 text-right text-slate-200 font-medium tabular-nums">{{ a.player.overall }}</td>
                                    <td class="px-3 py-1.5 text-slate-400 whitespace-nowrap">{{ potentialLabel(a.player) }}</td>
                                    <td class="px-3 py-1.5 text-slate-400 whitespace-nowrap tabular-nums">{{ contractLabel(a.player) }}</td>
                                    <td class="px-3 py-1.5 text-xs text-slate-400">{{ a.reasons.join(' · ') }}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </details>
            </section>

            <p class="text-xs text-slate-500">
                A guide, not a verdict. Each player is scored on overall today, potential (24 and under) and how long his
                value lasts with age, weighted by team status, then nudged by contract value and whether anyone in the
                system could replace him. "Usually costs" is a rough league-wide yardstick by overall.
            </p>
        </template>
    </div>
</template>
