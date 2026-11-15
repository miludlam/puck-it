<script setup lang="ts">
import { computed } from 'vue';
import { useScoutedPlayerStore, useScoutStore } from '@/stores';
import { JuniorLeague, Scout, SHORTLIST_MAX } from '@/types';
import { ALLOTMENT } from '@/utils/scoutAssignment';
import ScoutShortlist from '@/components/draft/ScoutShortlist.vue';

const scoutStore = useScoutStore();
const scoutedStore = useScoutedPlayerStore();

const regionOrder = Object.keys(ALLOTMENT) as JuniorLeague[];

// Hired scouts grouped by region in allotment order; unassigned / unallotted last
const scouts = computed(() => {
    const index = (s: Scout) => {
        const i = s.region ? regionOrder.indexOf(s.region) : -1;
        return i === -1 ? Infinity : i;
    };
    return [...scoutStore.hired].sort((a, b) =>
        index(a) - index(b) || a.last_name.localeCompare(b.last_name)
    );
});

const totalShortlisted = computed(() =>
    scouts.value.reduce((n, s) => n + scoutedStore.forScout(s.id).length, 0)
);

// Assignment end is month/day only, stored as 'MM-DD'
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; // no year, so allow Feb 29

function parseEnd(scout: Scout): { month: number | null; day: number | null } {
    const [m, d] = (scout.assignment_end ?? '').split('-').map(Number);
    return m && d ? { month: m, day: d } : { month: null, day: null };
}

const pad = (n: number) => String(n).padStart(2, '0');

// Picking a month alone defaults the day to the 1st; clamp the day if the new month is shorter
function setEndMonth(scout: Scout, month: number | null) {
    if (!month) return scoutStore.update(scout.id, { assignment_end: null });
    const day = Math.min(parseEnd(scout).day ?? 1, DAYS_IN_MONTH[month - 1]);
    scoutStore.update(scout.id, { assignment_end: `${pad(month)}-${pad(day)}` });
}

function setEndDay(scout: Scout, day: number) {
    const { month } = parseEnd(scout);
    if (month) scoutStore.update(scout.id, { assignment_end: `${pad(month)}-${pad(day)}` });
}
</script>

<template>
    <div class="space-y-6">
        <h2 class="text-sm font-medium text-slate-400 uppercase tracking-wider">
            Shortlists
            <span class="ml-2 text-slate-600 font-normal normal-case">
                {{ totalShortlisted }} player{{ totalShortlisted === 1 ? '' : 's' }} across {{ scouts.length }} scout{{ scouts.length === 1 ? '' : 's' }}
            </span>
        </h2>

        <div v-if="!scouts.length"
             class="rounded-xl border border-dashed border-slate-700 p-12 text-center text-slate-500 text-sm">
            No scouts on the payroll yet. Add scouts in the Scouts tab.
        </div>

        <div v-else class="grid gap-4 xl:grid-cols-2">
            <section
                v-for="scout in scouts"
                :key="scout.id"
                class="bg-slate-800/40 border border-slate-700/50 rounded-lg"
            >
                <header class="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 border-b border-slate-700/50">
                    <div class="min-w-0">
                        <p class="text-sm font-medium text-slate-200">
                            {{ scout.first_name }} {{ scout.last_name }}
                            <span v-if="scout.overall_rating" class="ml-1 text-xs text-slate-500">({{ scout.overall_rating }})</span>
                        </p>
                        <p class="text-xs text-slate-500">
                            {{ scout.region ?? 'Unassigned' }}
                            <span v-if="scout.region && scout.region_ratings[scout.region]" class="ml-1 text-slate-400">
                                {{ scout.region_ratings[scout.region] }}
                            </span>
                            · {{ scoutedStore.forScout(scout.id).length }}/{{ SHORTLIST_MAX }} shortlisted
                        </p>
                    </div>
                    <button
                        type="button"
                        class="ml-auto px-2 py-0.5 rounded border text-xs transition-colors"
                        :class="scout.obligations_done
                            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                            : 'border-slate-700 text-slate-500 hover:text-slate-300'"
                        :title="scout.obligations_done ? 'Free to fill Board gaps — click to put back on assignment' : 'Mark the assignment finished — the Board will suggest them for unscouted prospects'"
                        @click="scoutStore.update(scout.id, { obligations_done: !scout.obligations_done })"
                    >{{ scout.obligations_done ? '✓ Obligations done' : 'On assignment' }}</button>
                    <div class="flex items-center gap-2 text-xs text-slate-500">
                        Assignment ends
                        <select
                            :value="parseEnd(scout).month ?? ''"
                            class="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
                            @change="setEndMonth(scout, Number(($event.target as HTMLSelectElement).value) || null)"
                        >
                            <option value="">—</option>
                            <option v-for="(name, i) in MONTHS" :key="name" :value="i + 1">{{ name }}</option>
                        </select>
                        <select
                            :value="parseEnd(scout).day ?? ''"
                            :disabled="!parseEnd(scout).month"
                            class="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-sky-500 disabled:opacity-40"
                            @change="setEndDay(scout, Number(($event.target as HTMLSelectElement).value))"
                        >
                            <option v-if="!parseEnd(scout).month" value="">—</option>
                            <option
                                v-for="d in DAYS_IN_MONTH[(parseEnd(scout).month ?? 1) - 1]"
                                :key="d"
                                :value="d"
                            >{{ d }}</option>
                        </select>
                    </div>
                </header>
                <div class="px-4 py-3">
                    <ScoutShortlist :scout-id="scout.id" />
                </div>
            </section>
        </div>
    </div>
</template>
