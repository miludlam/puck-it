<script setup lang="ts">
import { computed, ref } from 'vue';
import { useScoutStore } from '@/stores';
import { JuniorLeague, Scout, ScoutRating } from '@/types';
import ScoutModal from '@/components/draft/ScoutModal.vue';

const scoutStore = useScoutStore();

const showModal = ref(false);
const selectedScout = ref<Scout | undefined>(undefined);

const MAX_SCOUTS = 20;
const canAdd = computed(() => scoutStore.scouts.length < MAX_SCOUTS);

// Target allotment per region
const ALLOTMENT: Partial<Record<JuniorLeague, number>> = {
    'OHL':        3,
    'QMJHL':      2,
    'WHL':        2,
    'US Central': 2,
    'Russia':     2,
    'SHL':        2,
    'Liiga':      2,
    'US West':    1,
    'US East':    1,
    'Extraliga':  1,
    'NLA':        1,
    'DEL':        1,
};

const allotmentRegions = Object.keys(ALLOTMENT) as JuniorLeague[];

function openAdd() {
    selectedScout.value = undefined;
    showModal.value = true;
}
function openEdit(scout: Scout) {
    selectedScout.value = scout;
    showModal.value = true;
}
function onClose() {
    showModal.value = false;
    selectedScout.value = undefined;
}

const ratingColor: Record<string, string> = {
    'A+': 'text-emerald-300', 'A': 'text-emerald-300', 'A-': 'text-emerald-400',
    'B+': 'text-sky-300',     'B': 'text-sky-300',     'B-': 'text-sky-400',
    'C+': 'text-yellow-300',  'C': 'text-yellow-300',  'C-': 'text-yellow-400',
    'D+': 'text-orange-400',  'D': 'text-orange-400',  'D-': 'text-orange-500',
    'E':  'text-rose-500',    'F': 'text-rose-400',
};

// Rank a letter rating numerically (lower = better)
const ratingRank: Record<string, number> = {
    'A+': 0, 'A': 1, 'A-': 2,
    'B+': 3, 'B': 4, 'B-': 5,
    'C+': 6, 'C': 7, 'C-': 8,
    'D+': 9, 'D': 10, 'D-': 11,
    'E': 12, 'F': 13,
};

// Scouts currently assigned to a given region
function assignedTo(region: JuniorLeague): Scout[] {
    return scoutStore.scouts.filter(s => s.region === region);
}

const unassigned = computed(() =>
    scoutStore.scouts.filter(s => !s.region)
);

// Allotment status per region
const allotmentStatus = computed(() =>
    allotmentRegions.map(region => {
        const target = ALLOTMENT[region]!;
        const scouts = assignedTo(region);
        const diff = scouts.length - target;
        return { region, target, current: scouts.length, diff, scouts };
    })
);

// Compare two scouts for a region: negative = a is better, positive = b is better
function compareForRegion(a: Scout, b: Scout, region: JuniorLeague): number {
    const ra = ratingRank[a.region_ratings[region] ?? 'F'] ?? 13;
    const rb = ratingRank[b.region_ratings[region] ?? 'F'] ?? 13;
    if (ra !== rb) return ra - rb;
    const oa = ratingRank[a.overall_rating ?? 'F'] ?? 13;
    const ob = ratingRank[b.overall_rating ?? 'F'] ?? 13;
    return oa - ob;
}

interface Suggestion {
    region: JuniorLeague;
    rating: ScoutRating | null;
    displaces: Scout | null; // null = open slot
}

// For each unassigned scout: best open slot, or best region where they'd displace a weaker scout
function bestSuggestion(scout: Scout): Suggestion | null {
    const candidates: Suggestion[] = [];

    for (const { region, diff, scouts } of allotmentStatus.value) {
        if (diff < 0) {
            // Under-filled — open slot, no displacement
            candidates.push({ region, rating: scout.region_ratings[region] ?? null, displaces: null });
        } else {
            // At/over capacity — only viable if scout beats the weakest assigned scout
            const weakest = [...scouts].sort((a, b) => compareForRegion(b, a, region))[0];
            if (weakest && compareForRegion(scout, weakest, region) < 0) {
                candidates.push({ region, rating: scout.region_ratings[region] ?? null, displaces: weakest });
            }
        }
    }

    if (!candidates.length) return null;

    // Pick the candidate where the unassigned scout has the best region rating, tiebreak overall
    return candidates.sort((a, b) => {
        const ra = ratingRank[a.rating ?? 'F'] ?? 13;
        const rb = ratingRank[b.rating ?? 'F'] ?? 13;
        if (ra !== rb) return ra - rb;
        const oa = ratingRank[scout.overall_rating ?? 'F'] ?? 13;
        return oa - oa; // same scout, no tiebreak needed
    })[0];
}

// For over-allotted regions, flag the weakest scout
const offloadSuggestions = computed(() =>
    allotmentStatus.value
        .filter(s => s.diff > 0)
        .flatMap(s => {
            // Sort by ascending rating (worst first)
            const sorted = [...s.scouts].sort((a, b) => {
                const ra = ratingRank[a.region_ratings[s.region] ?? 'F'] ?? 13;
                const rb = ratingRank[b.region_ratings[s.region] ?? 'F'] ?? 13;
                return rb - ra; // worst first
            });
            return sorted.slice(0, s.diff).map(scout => ({ scout, region: s.region }));
        })
);
</script>

<template>
    <div class="space-y-8">

        <!-- Header -->
        <div class="flex items-center justify-between">
            <h2 class="text-sm font-medium text-slate-400 uppercase tracking-wider">
                Scouts
                <span class="ml-2 text-slate-600 font-normal normal-case">{{ scoutStore.scouts.length }} / {{ MAX_SCOUTS }}</span>
            </h2>
            <button
                v-if="canAdd"
                class="px-4 py-2 rounded-lg text-sm font-medium bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
                @click="openAdd"
            >+ Add Scout</button>
        </div>

        <!-- Allotment overview -->
        <div>
            <h3 class="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">Allotment</h3>
            <table class="w-full text-sm border-collapse">
                <thead>
                    <tr class="border-b border-slate-700">
                        <th class="px-3 py-2 text-left text-xs font-medium text-slate-500">Region</th>
                        <th class="px-3 py-2 text-center text-xs font-medium text-slate-500">Target</th>
                        <th class="px-3 py-2 text-center text-xs font-medium text-slate-500">Current</th>
                        <th class="px-3 py-2 text-left text-xs font-medium text-slate-500">Assigned</th>
                    </tr>
                </thead>
                <tbody>
                    <tr
                        v-for="row in allotmentStatus"
                        :key="row.region"
                        class="border-b border-slate-800/60"
                    >
                        <td class="px-3 py-2 text-sm text-slate-300">{{ row.region }}</td>
                        <td class="px-3 py-2 text-center text-sm text-slate-500">{{ row.target }}</td>
                        <td class="px-3 py-2 text-center text-sm font-medium"
                            :class="row.diff > 0 ? 'text-amber-400' : row.diff < 0 ? 'text-rose-400' : 'text-emerald-400'"
                        >
                            {{ row.current }}
                            <span v-if="row.diff !== 0" class="text-xs ml-1">
                                ({{ row.diff > 0 ? '+' : '' }}{{ row.diff }})
                            </span>
                        </td>
                        <td class="px-3 py-2">
                            <div class="flex flex-wrap gap-1">
                                <span
                                    v-for="scout in row.scouts"
                                    :key="scout.id"
                                    class="text-xs text-slate-400 cursor-pointer hover:text-slate-200 transition-colors"
                                    @click="openEdit(scout)"
                                >{{ scout.first_name.charAt(0) }}. {{ scout.last_name }}<span v-if="scout.overall_rating" :class="['ml-1', ratingColor[scout.overall_rating]]">({{ scout.overall_rating }})</span></span>
                                <span v-if="!row.scouts.length" class="text-xs text-slate-700">—</span>
                            </div>
                        </td>
                    </tr>
                </tbody>
                <tfoot>
                    <tr class="border-t border-slate-700">
                        <td class="px-3 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">Total</td>
                        <td class="px-3 py-2 text-center text-xs font-medium text-slate-400">{{ allotmentStatus.reduce((s, r) => s + r.target, 0) }}</td>
                        <td class="px-3 py-2 text-center text-xs font-medium text-slate-400">{{ scoutStore.scouts.length }}</td>
                        <td></td>
                    </tr>
                </tfoot>
            </table>
        </div>

        <!-- Unassigned scouts with suggestions -->
        <div v-if="unassigned.length">
            <h3 class="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">Unassigned</h3>
            <div class="space-y-2">
                <div
                    v-for="scout in unassigned"
                    :key="scout.id"
                    class="flex items-center gap-4 px-4 py-3 bg-slate-800/40 border border-slate-700/50 rounded-lg cursor-pointer hover:bg-slate-800/70 transition-colors"
                    @click="openEdit(scout)"
                >
                    <span class="text-sm font-medium text-slate-200 w-36 flex-shrink-0">
                        {{ scout.first_name }} {{ scout.last_name }}
                        <span v-if="scout.overall_rating" :class="['text-xs ml-1', ratingColor[scout.overall_rating]]">({{ scout.overall_rating }})</span>
                    </span>
                    <template v-if="bestSuggestion(scout)">
                        <span class="text-xs text-slate-500">Best fit →</span>
                        <span class="text-xs font-medium text-sky-300">{{ bestSuggestion(scout)!.region }}</span>
                        <span v-if="bestSuggestion(scout)!.rating"
                              :class="['text-xs', ratingColor[bestSuggestion(scout)!.rating!]]">
                            {{ bestSuggestion(scout)!.rating }}
                        </span>
                        <template v-if="bestSuggestion(scout)!.displaces">
                            <span class="text-xs text-slate-600">· displaces</span>
                            <span class="text-xs text-slate-400">
                                {{ bestSuggestion(scout)!.displaces!.first_name.charAt(0) }}. {{ bestSuggestion(scout)!.displaces!.last_name }}
                            </span>
                            <span v-if="bestSuggestion(scout)!.displaces!.region_ratings[bestSuggestion(scout)!.region]"
                                  :class="['text-xs', ratingColor[bestSuggestion(scout)!.displaces!.region_ratings[bestSuggestion(scout)!.region]!]]">
                                {{ bestSuggestion(scout)!.displaces!.region_ratings[bestSuggestion(scout)!.region] }}
                            </span>
                        </template>
                    </template>
                    <span v-else class="text-xs text-slate-600">No better fit found</span>
                </div>
            </div>
        </div>

        <!-- Offload suggestions -->
        <div v-if="offloadSuggestions.length">
            <h3 class="text-xs font-medium text-amber-500/70 uppercase tracking-wider mb-3">Consider Offloading</h3>
            <div class="space-y-2">
                <div
                    v-for="{ scout, region } in offloadSuggestions"
                    :key="scout.id"
                    class="flex items-center gap-4 px-4 py-3 bg-amber-500/5 border border-amber-500/20 rounded-lg cursor-pointer hover:bg-amber-500/10 transition-colors"
                    @click="openEdit(scout)"
                >
                    <span class="text-sm font-medium text-slate-200 w-36 flex-shrink-0">
                        {{ scout.first_name }} {{ scout.last_name }}
                    </span>
                    <span class="text-xs text-slate-500">{{ region }} is over-allotted</span>
                    <span v-if="scout.region_ratings[region]"
                          :class="['text-xs ml-auto', ratingColor[scout.region_ratings[region]!]]">
                        {{ scout.region_ratings[region] }} in {{ region }}
                    </span>
                </div>
            </div>
        </div>

        <!-- Full scout list -->
        <div v-if="scoutStore.scouts.length === 0"
             class="rounded-xl border border-dashed border-slate-700 p-12 text-center text-slate-500 text-sm">
            No scouts assigned. Add up to {{ MAX_SCOUTS }}.
        </div>
        <div v-else>
            <h3 class="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">All Scouts</h3>
            <div class="space-y-2">
                <div
                    v-for="scout in scoutStore.scouts"
                    :key="scout.id"
                    class="flex items-start gap-4 px-4 py-3 bg-slate-800/40 border border-slate-700/50 rounded-lg cursor-pointer hover:bg-slate-800/70 transition-colors"
                    @click="openEdit(scout)"
                >
                    <div class="w-40 flex-shrink-0">
                        <p class="text-sm font-medium text-slate-200">{{ scout.first_name }} {{ scout.last_name }}</p>
                        <p class="text-xs mt-0.5 space-x-2">
                            <span v-if="scout.overall_rating">
                                <span class="text-slate-500">Ovr</span>
                                <span :class="['ml-1 font-medium', ratingColor[scout.overall_rating]]">{{ scout.overall_rating }}</span>
                            </span>
                            <span v-if="scout.region">
                                <span class="text-slate-400">{{ scout.region }}</span>
                                <span v-if="scout.region_ratings[scout.region]"
                                      :class="['ml-1 font-medium', ratingColor[scout.region_ratings[scout.region]!]]">
                                    {{ scout.region_ratings[scout.region] }}
                                </span>
                            </span>
                            <span v-else class="text-slate-700">Unassigned</span>
                        </p>
                    </div>
                    <div class="flex flex-wrap gap-1.5">
                        <span
                            v-for="(rating, region) in scout.region_ratings"
                            :key="region"
                            class="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-700/60 rounded text-xs"
                        >
                            <span class="text-slate-400">{{ region }}</span>
                            <span :class="['font-medium', ratingColor[rating!] ?? 'text-slate-300']">{{ rating }}</span>
                        </span>
                    </div>
                </div>
            </div>
        </div>

        <ScoutModal v-if="showModal" :scout="selectedScout" @close="onClose" @saved="onClose" />
    </div>
</template>
