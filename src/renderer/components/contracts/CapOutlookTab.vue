<script setup lang="ts">
import { computed } from 'vue';
import { useCapStore, useContractStore, useFranchiseStore, usePlayerStore } from '@/stores';
import { capOutlook, OutlookYear, seasonLabel } from '@/utils/contracts';
import { ahlCapExemption, formatCap, MAX_CONTRACTS, MAX_EXEMPT_CONTRACTS } from '@/utils/league';

const playerStore = usePlayerStore();
const contractStore = useContractStore();
const franchiseStore = useFranchiseStore();
const capStore = useCapStore();

const outlook = computed(() => capOutlook({
    players: playerStore.players,
    extensions: contractStore.extensions,
    freeAgents: contractStore.freeAgents,
    season: franchiseStore.franchise?.season ?? 25,
    ceilingFor: capStore.ceilingFor,
    retainedFor: capStore.retainedFor,
}));

// Blank clears the season back to carrying the previous cap forward
function setCap(season: number, raw: string) {
    const value = raw.trim() === '' ? null : Number(raw);
    if (value !== null && (!Number.isFinite(value) || value <= 0)) return;
    capStore.save(season, value);
}

// Blank or zero clears the season
function setRetained(season: number, raw: string) {
    const value = raw.trim() === '' ? null : Number(raw);
    if (value !== null && (!Number.isFinite(value) || value < 0)) return;
    capStore.saveRetained(season, value);
}

// Cap figures in $M, three decimals like the rest of the app
const money = (v: number) => v === 0 ? '—' : v.toFixed(3);
const spaceClass = (v: number) => v < 0 ? 'text-rose-400' : v < 2 ? 'text-amber-400' : 'text-emerald-400';

interface Row {
    label: string;
    value: (y: OutlookYear) => string;
    class?: string | ((y: OutlookYear) => string);
    title?: string;
    indent?: boolean;
    divider?: boolean; // rule above the row
}

const committedRows: Row[] = [
    { label: 'Forwards', value: y => money(y.nhl.FWD), indent: true, class: 'text-slate-400' },
    { label: 'Defence', value: y => money(y.nhl.DEF), indent: true, class: 'text-slate-400' },
    { label: 'Goalies', value: y => money(y.nhl.G), indent: true, class: 'text-slate-400' },
    { label: 'NHL', value: y => money(y.nhlTotal), class: 'text-slate-200' },
    { label: 'Buried AHL', value: y => money(y.buried), class: 'text-slate-400', title: `AHL salary above the ${formatCap(ahlCapExemption())} exemption` },
    { label: 'Extensions & signings', value: y => money(y.extensions), class: 'text-sky-300', title: 'Accepted extensions (from the season after the current deal) and accepted free agents not yet signed' },
    { label: 'Committed', value: y => money(y.committed), class: 'text-slate-100 font-medium', divider: true },
];

// Below the editable Cap row
const spaceRows: Row[] = [
    { label: 'Space', value: y => y.space.toFixed(3), class: y => `font-medium ${spaceClass(y.space)}` },
    { label: 'Open offers', value: y => money(y.pending), class: 'text-amber-300/80', divider: true, title: 'Extension and free-agent offers still waiting on an answer' },
    { label: 'Space if accepted', value: y => y.spaceIfAccepted.toFixed(3), class: y => spaceClass(y.spaceIfAccepted) },
];

const otherRows: Row[] = [
    { label: 'AHL salary', value: y => money(y.ahlSalary), class: 'text-slate-400' },
    { label: 'ITS salary', value: y => money(y.itsSalary), class: 'text-slate-400' },
    {
        label: 'Contracts', value: y => `${y.contracts}/${MAX_CONTRACTS}`, divider: true,
        class: y => y.contracts > MAX_CONTRACTS ? 'text-rose-400' : 'text-slate-300', title: 'NHL and AHL contracts',
    },
    {
        label: 'Exempt', value: y => `${y.exempt}/${MAX_EXEMPT_CONTRACTS}`,
        class: y => y.exempt > MAX_EXEMPT_CONTRACTS ? 'text-rose-400' : 'text-slate-400', title: 'Signed ITS players',
    },
    { label: 'Expiring after', value: y => y.expiring ? String(y.expiring) : '—', class: 'text-slate-400', title: 'Contracts ending after this season with no extension agreed' },
];

const inputClass = 'w-20 bg-transparent hover:bg-slate-900 focus:bg-slate-900 border border-transparent hover:border-slate-700 rounded px-2 py-0.5 text-right text-sm tabular-nums focus:outline-none focus:border-sky-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none';

const cellClass = (row: Row, y: OutlookYear) => typeof row.class === 'function' ? row.class(y) : row.class ?? '';
const usedPct = (y: OutlookYear) => Math.min(100, ((y.committed + y.retained) / y.cap) * 100);
</script>

<template>
    <div class="space-y-4">
        <h2 class="text-sm font-medium text-slate-400 uppercase tracking-wider">
            Cap Outlook
            <span class="ml-2 text-slate-600 font-normal normal-case">$M · click a season's cap to change it</span>
        </h2>

        <div class="overflow-x-auto">
            <table class="w-full text-sm border-collapse tabular-nums">
                <thead>
                    <tr class="border-b border-slate-700 text-xs text-slate-500">
                        <th class="px-3 py-2 text-left font-medium w-48"></th>
                        <th v-for="(y, i) in outlook" :key="y.season" class="px-3 py-2 text-right font-medium">
                            <span :class="i === 0 ? 'text-slate-300' : ''">{{ seasonLabel(y.season) }}</span>
                            <div class="mt-1.5 h-1 rounded bg-slate-800 overflow-hidden" :title="`${usedPct(y).toFixed(0)}% of the cap committed or retained`">
                                <div
                                    class="h-full rounded"
                                    :class="y.space < 0 ? 'bg-rose-500' : y.space < 2 ? 'bg-amber-500' : 'bg-sky-600'"
                                    :style="{ width: `${usedPct(y)}%` }"
                                />
                            </div>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    <template v-for="(group, gi) in [committedRows, spaceRows]" :key="gi">
                        <!-- Retained and Cap rows sit between what's committed and the space left -->
                        <tr v-if="gi === 1">
                            <td class="px-3 py-1 text-xs text-slate-400" title="Salary retained on players traded away, entered per season">Retained salary</td>
                            <td v-for="y in outlook" :key="y.season" class="px-1 py-1 text-right">
                                <input
                                    :value="y.retained ? y.retained.toFixed(3) : ''"
                                    placeholder="—"
                                    type="number"
                                    min="0"
                                    step="0.1"
                                    :class="[inputClass, 'text-slate-200 placeholder:text-slate-500']"
                                    :aria-label="`Retained salary ${seasonLabel(y.season)}`"
                                    title="Type the retained amount for this season — clear to remove"
                                    @change="setRetained(y.season, ($event.target as HTMLInputElement).value)"
                                    @keydown.enter="($event.target as HTMLInputElement).blur()"
                                />
                            </td>
                        </tr>
                        <tr v-if="gi === 1">
                            <td class="px-3 py-1 text-xs text-slate-400" title="Blank a season to carry the previous season's cap forward">Cap</td>
                            <td v-for="y in outlook" :key="y.season" class="px-1 py-1 text-right">
                                <input
                                    :value="capStore.isSet(y.season) ? y.cap.toFixed(3) : ''"
                                    :placeholder="y.cap.toFixed(3)"
                                    type="number"
                                    min="0"
                                    step="0.1"
                                    :class="[inputClass, capStore.isSet(y.season) ? 'text-slate-200' : 'text-slate-500 placeholder:text-slate-500']"
                                    :title="capStore.isSet(y.season) ? 'Set for this season — clear to carry the previous cap' : 'Carried from the previous season — type to set'"
                                    @change="setCap(y.season, ($event.target as HTMLInputElement).value)"
                                    @keydown.enter="($event.target as HTMLInputElement).blur()"
                                />
                            </td>
                        </tr>
                        <tr
                            v-for="row in group"
                            :key="row.label"
                            :class="row.divider ? 'border-t border-slate-700' : ''"
                        >
                            <td class="px-3 py-1.5 text-xs" :class="row.indent ? 'pl-6 text-slate-500' : 'text-slate-400'" :title="row.title">
                                {{ row.label }}
                            </td>
                            <td v-for="y in outlook" :key="y.season" class="px-3 py-1.5 text-right" :class="cellClass(row, y)">
                                {{ row.value(y) }}
                            </td>
                        </tr>
                    </template>
                    <tr><td :colspan="outlook.length + 1" class="py-3"></td></tr>
                    <tr
                        v-for="row in otherRows"
                        :key="row.label"
                        :class="row.divider ? 'border-t border-slate-700' : ''"
                    >
                        <td class="px-3 py-1.5 text-xs text-slate-400" :title="row.title">{{ row.label }}</td>
                        <td v-for="y in outlook" :key="y.season" class="px-3 py-1.5 text-right" :class="cellClass(row, y)">
                            {{ row.value(y) }}
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>

        <p class="text-xs text-slate-600">
            A contract with N years remaining covers this season and the next N − 1. Seasons you haven't set carry the previous cap forward. Future seasons assume today's roster placement.
        </p>
    </div>
</template>
