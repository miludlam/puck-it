<script setup lang="ts">
import { computed, ref } from 'vue';
import { useScoutedPlayerStore, useScoutStore } from '@/stores';
import { JuniorLeague, MAX_SCOUTS, Scout, ScoutRating, ScoutStatus, SHORTLIST_MAX } from '@/types';
import ScoutModal from '@/components/draft/ScoutModal.vue';
import ImportModal from '@/components/ImportModal.vue';
import ShortlistPlayerModal from '@/components/draft/ShortlistPlayerModal.vue';
import LockIcon from '@/components/LockIcon.vue';
import ScoutPhases from '@/components/draft/ScoutPhases.vue';
import { ALLOTMENT, autoAssignScouts, planHiring, suggestLockedMoves } from '@/utils/scoutAssignment';

const scoutStore = useScoutStore();
const scoutedStore = useScoutedPlayerStore();

// Shortlist quick add for a scout's row (undefined = closed)
const shortlistScoutId = ref<number | undefined>(undefined);

const showModal = ref(false);
const selectedScout = ref<Scout | undefined>(undefined);

const showImport = ref(false);
const canAdd = computed(() => scoutStore.hired.length < MAX_SCOUTS);

const allotmentRegions = Object.keys(ALLOTMENT) as JuniorLeague[];

const assigning = ref(false);
const assignResult = ref<string | null>(null);

async function autoAssign() {
    assigning.value = true;
    try {
        const moves = autoAssignScouts(scoutStore.hired, ALLOTMENT);
        await Promise.all(moves.map(m => scoutStore.update(m.scout.id, { region: m.to })));
        assignResult.value = moves.length
            ? `Moved ${moves.length} scout${moves.length === 1 ? '' : 's'}`
            : 'Already optimal';
    } finally {
        assigning.value = false;
    }
}

// Better layout available if locks were lifted — suggested only, never applied by auto-assign
const lockSuggestion = computed(() => suggestLockedMoves(scoutStore.hired, ALLOTMENT));

// Explicit opt-in: apply the unconstrained layout, keeping each scout's lock flag
async function applyLockSuggestion() {
    const suggestion = lockSuggestion.value;
    if (!suggestion) return;
    assigning.value = true;
    try {
        await Promise.all(suggestion.moves.map(m => scoutStore.update(m.scout.id, { region: m.to })));
        assignResult.value = `Moved ${suggestion.moves.length} scout${suggestion.moves.length === 1 ? '' : 's'}`;
    } finally {
        assigning.value = false;
    }
}

function toggleLock(scout: Scout) {
    scoutStore.update(scout.id, { region_locked: !scout.region_locked });
}

// Drag scout cards between allotment rows (null target = unassign)
type DropKey = JuniorLeague | 'unassigned';
const draggingId = ref<number | null>(null);
const dropTarget = ref<DropKey | null>(null);
const draggedScout = computed(() => scoutStore.scouts.find(s => s.id === draggingId.value) ?? null);

function onDragStart(e: DragEvent, scout: Scout) {
    draggingId.value = scout.id;
    if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(scout.id));
    }
}

function onDragEnd() {
    draggingId.value = null;
    dropTarget.value = null;
}

// Ignore leave events fired when moving between a drop zone's own children
function onDragLeave(e: DragEvent, key: DropKey) {
    const zone = e.currentTarget as HTMLElement;
    if (dropTarget.value === key && !zone.contains(e.relatedTarget as Node | null)) {
        dropTarget.value = null;
    }
}

async function onDrop(region: JuniorLeague | null) {
    const scout = draggedScout.value;
    onDragEnd();
    if (!scout || scout.region === region) return;
    assignResult.value = null;
    await scoutStore.update(scout.id, { region });
}

const newScoutStatus = ref<ScoutStatus>('hired');

function openAdd(status: ScoutStatus = 'hired') {
    selectedScout.value = undefined;
    newScoutStatus.value = status;
    showModal.value = true;
}

// Offers and shortlist planned together against the payroll
const hiringPlan = computed(() => planHiring(scoutStore.scouts, ALLOTMENT, MAX_SCOUTS));

function setTarget(scout: Scout, region: JuniorLeague, status: ScoutStatus) {
    scoutStore.update(scout.id, { status, region });
}

const initial = (s: Scout) => `${s.first_name.charAt(0)}. ${s.last_name}`;

// Offer accepted — scout joins the payroll, starting in their target region (unlocked, so auto-assign can move them)
function signOffer(scout: Scout) {
    scoutStore.update(scout.id, { status: 'hired' });
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
    return scoutStore.hired.filter(s => s.region === region);
}

// Best overall first (unrated last), then last name
const sortedScouts = computed(() =>
    [...scoutStore.hired].sort((a, b) =>
        (ratingRank[a.overall_rating ?? 'F'] ?? 13) - (ratingRank[b.overall_rating ?? 'F'] ?? 13)
        || a.last_name.localeCompare(b.last_name)
    )
);

const unassigned = computed(() =>
    scoutStore.hired.filter(s => !s.region)
);

// Allotment status per region (offers are shown but don't count toward the target)
const allotmentStatus = computed(() =>
    allotmentRegions.map(region => {
        const target = ALLOTMENT[region]!;
        const scouts = assignedTo(region);
        const offers = scoutStore.offered.filter(s => s.region === region);
        const diff = scouts.length - target;
        return { region, target, current: scouts.length, diff, scouts, offers };
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

// Best region rating a scout can actually hold: their current region, an open slot,
// or a region where they'd beat out an unlocked scout already assigned there
function bestFit(scout: Scout): { region: JuniorLeague | null; rating: ScoutRating | null } {
    const candidates: JuniorLeague[] = scout.region ? [scout.region] : [];
    for (const { region, diff, scouts } of allotmentStatus.value) {
        if (region === scout.region) continue;
        if (diff < 0 || scouts.some(s => !s.region_locked && compareForRegion(scout, s, region) < 0)) {
            candidates.push(region);
        }
    }

    const region = candidates.sort((a, b) =>
        (ratingRank[scout.region_ratings[a] ?? 'F'] ?? 13) - (ratingRank[scout.region_ratings[b] ?? 'F'] ?? 13)
    )[0] ?? null;
    return { region, rating: region ? scout.region_ratings[region] ?? null : null };
}

// Scouts worth replacing: best fit of C+ or lower, or an overall of C- or lower
const fireSuggestions = computed(() =>
    scoutStore.hired
        .map(scout => {
            const fit = bestFit(scout);
            return {
                scout,
                fit,
                weakFit: (ratingRank[fit.rating ?? 'F'] ?? 13) >= ratingRank['C+'],
                weakOverall: !!scout.overall_rating && ratingRank[scout.overall_rating] >= ratingRank['C-'],
            };
        })
        .filter(s => s.weakFit || s.weakOverall)
);

// Regions short of an A+ in every slot: open slots, plus any scout below A+ (locked
// scouts included — a lock pins the region during auto-assign, not the scout's job)
interface UpgradeTarget {
    region: JuniorLeague;
    target: number;
    open: number;
    weak: Scout[];   // worst first
    offers: Scout[]; // contracts already out for this region
}

const upgradeTargets = computed<UpgradeTarget[]>(() => {
    const worst = (t: UpgradeTarget) =>
        t.open ? 13 : ratingRank[t.weak[0].region_ratings[t.region] ?? 'F'] ?? 13;

    return allotmentStatus.value
        .map(({ region, target, diff, scouts, offers }) => ({
            region,
            target,
            open: Math.max(0, -diff),
            weak: scouts
                .filter(s => s.region_ratings[region] !== 'A+')
                .sort((a, b) => compareForRegion(b, a, region)),
            offers,
        }))
        .filter(t => t.open || t.weak.length)
        // Empty slots first, then higher-target regions, then the weakest coverage
        .sort((a, b) =>
            Number(b.open > 0) - Number(a.open > 0)
            || b.target - a.target
            || worst(b) - worst(a)
        );
});

// Upgrade targets are only meaningful once the current roster is optimally placed
const pendingMoves = computed(() => autoAssignScouts(scoutStore.hired, ALLOTMENT).length);

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
                <span class="ml-2 text-slate-600 font-normal normal-case">{{ scoutStore.hired.length }} / {{ MAX_SCOUTS }}</span>
                <span v-if="scoutStore.offered.length" class="ml-1 text-amber-500/70 font-normal normal-case">
                    · {{ scoutStore.offered.length }} offered
                </span>
                <span v-if="scoutStore.shortlisted.length" class="ml-1 text-violet-400/70 font-normal normal-case">
                    · {{ scoutStore.shortlisted.length }} shortlisted
                </span>
            </h2>
            <!-- Data in, then the hiring pipeline in order (shortlist → offer → payroll), then placement -->
            <div class="flex items-center gap-3">
                <button
                    class="px-4 py-2 rounded-lg text-sm font-medium bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
                    @click="showImport = true"
                >Import…</button>
                <span class="h-6 w-px bg-slate-700" aria-hidden="true" />
                <button
                    class="px-4 py-2 rounded-lg text-sm font-medium border border-violet-500/40 text-violet-300 hover:bg-violet-500/10 transition-colors"
                    @click="openAdd('shortlisted')"
                >+ Shortlist Scout</button>
                <button
                    class="px-4 py-2 rounded-lg text-sm font-medium border border-amber-500/40 text-amber-300 hover:bg-amber-500/10 transition-colors"
                    @click="openAdd('offered')"
                >+ Offer Contract</button>
                <button
                    v-if="canAdd"
                    class="px-4 py-2 rounded-lg text-sm font-medium bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
                    @click="openAdd()"
                >+ Add Scout</button>
                <template v-if="scoutStore.hired.length">
                    <span class="h-6 w-px bg-slate-700" aria-hidden="true" />
                    <span v-if="assignResult" class="text-xs text-slate-500">{{ assignResult }}</span>
                    <button
                        :disabled="assigning"
                        class="px-4 py-2 rounded-lg text-sm font-medium bg-sky-700 hover:bg-sky-600 disabled:opacity-50 text-white transition-colors"
                        title="Assign unlocked scouts to maximize region-rating coverage. Ties go to the higher-overall scout, then to better ratings in higher-target regions."
                        @click="autoAssign"
                    >Auto-assign</button>
                </template>
            </div>
        </div>

        <ScoutPhases />

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
                        class="border-b border-slate-800/60 transition-colors"
                        :class="dropTarget === row.region && 'bg-sky-500/10'"
                        @dragover.prevent="dropTarget = row.region"
                        @dragleave="onDragLeave($event, row.region)"
                        @drop.prevent="onDrop(row.region)"
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
                            <span v-if="row.offers.length" class="block text-xs font-normal text-amber-500/80">
                                +{{ row.offers.length }} offered
                            </span>
                        </td>
                        <td class="px-3 py-2">
                            <div class="flex flex-wrap gap-1.5">
                                <div
                                    v-for="scout in row.scouts"
                                    :key="scout.id"
                                    draggable="true"
                                    class="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-800 border border-slate-700 text-xs cursor-grab active:cursor-grabbing hover:border-slate-500 transition-colors"
                                    :class="draggingId === scout.id && 'opacity-40'"
                                    title="Drag to another region, or click to edit"
                                    @dragstart="onDragStart($event, scout)"
                                    @dragend="onDragEnd"
                                    @click="openEdit(scout)"
                                >
                                    <span class="text-slate-300">{{ scout.first_name.charAt(0) }}. {{ scout.last_name }}</span>
                                    <span v-if="scout.overall_rating" :class="ratingColor[scout.overall_rating]">({{ scout.overall_rating }})</span>
                                    <span v-if="scout.region_ratings[row.region]"
                                          :class="['font-medium', ratingColor[scout.region_ratings[row.region]!]]">
                                        {{ scout.region_ratings[row.region] }}
                                    </span>
                                    <button
                                        class="transition-colors"
                                        :class="scout.region_locked ? 'text-amber-400 hover:text-amber-300' : 'text-slate-600 hover:text-slate-400'"
                                        @click.stop="toggleLock(scout)"
                                    >
                                        <LockIcon :locked="scout.region_locked" class="w-3 h-3" />
                                    </button>
                                </div>
                                <!-- Outstanding offers for this region -->
                                <div
                                    v-for="scout in row.offers"
                                    :key="scout.id"
                                    draggable="true"
                                    class="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-dashed border-amber-500/50 bg-amber-500/5 text-xs cursor-grab active:cursor-grabbing hover:border-amber-400 transition-colors"
                                    :class="draggingId === scout.id && 'opacity-40'"
                                    title="Contract offered — drag to change the target region, or click to edit"
                                    @dragstart="onDragStart($event, scout)"
                                    @dragend="onDragEnd"
                                    @click="openEdit(scout)"
                                >
                                    <span class="text-amber-400/80 font-medium uppercase tracking-wide text-[10px]">Offer</span>
                                    <span class="text-slate-300">{{ scout.first_name.charAt(0) }}. {{ scout.last_name }}</span>
                                    <span v-if="scout.overall_rating" :class="ratingColor[scout.overall_rating]">({{ scout.overall_rating }})</span>
                                    <span v-if="scout.region_ratings[row.region]"
                                          :class="['font-medium', ratingColor[scout.region_ratings[row.region]!]]">
                                        {{ scout.region_ratings[row.region] }}
                                    </span>
                                </div>
                                <!-- Preview of the dragged scout's rating for the hovered region -->
                                <div
                                    v-if="dropTarget === row.region && draggedScout && draggedScout.region !== row.region"
                                    class="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-dashed border-sky-400/60 bg-sky-500/10 text-xs pointer-events-none"
                                >
                                    <span class="text-slate-300">{{ draggedScout.first_name.charAt(0) }}. {{ draggedScout.last_name }}</span>
                                    <span v-if="draggedScout.region_ratings[row.region]"
                                          :class="['font-medium', ratingColor[draggedScout.region_ratings[row.region]!]]">
                                        {{ draggedScout.region_ratings[row.region] }}
                                    </span>
                                    <span v-else class="text-slate-500">unrated</span>
                                </div>
                                <span v-else-if="!row.scouts.length && !row.offers.length" class="text-xs text-slate-700 py-1">—</span>
                            </div>
                        </td>
                    </tr>
                </tbody>
                <tfoot>
                    <tr class="border-t border-slate-700">
                        <td class="px-3 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">Total</td>
                        <td class="px-3 py-2 text-center text-xs font-medium text-slate-400">{{ allotmentStatus.reduce((s, r) => s + r.target, 0) }}</td>
                        <td class="px-3 py-2 text-center text-xs font-medium text-slate-400">{{ scoutStore.hired.length }}</td>
                        <td></td>
                    </tr>
                </tfoot>
            </table>
            <div
                v-if="draggingId !== null"
                class="mt-3 rounded-lg border border-dashed px-4 py-3 text-center text-xs transition-colors"
                :class="dropTarget === 'unassigned' ? 'border-rose-400/60 bg-rose-500/10 text-rose-300' : 'border-slate-700 text-slate-500'"
                @dragover.prevent="dropTarget = 'unassigned'"
                @dragleave="onDragLeave($event, 'unassigned')"
                @drop.prevent="onDrop(null)"
            >Drop here to unassign</div>
        </div>

        <!-- Locked scouts that would be better placed elsewhere -->
        <div v-if="lockSuggestion">
            <h3 class="text-xs font-medium text-amber-500/70 uppercase tracking-wider mb-3">Lock Review</h3>
            <div class="px-4 py-3 bg-amber-500/5 border border-amber-500/20 rounded-lg space-y-2">
                <p class="text-xs text-slate-400">
                    <template v-if="lockSuggestion.gain > 0">
                        Moving locked scouts would improve coverage by
                        <span class="font-medium text-emerald-400">+{{ lockSuggestion.gain }}</span>
                        rating step{{ lockSuggestion.gain === 1 ? '' : 's' }}.
                    </template>
                    <template v-else>
                        Same coverage, but better tiebreak placement (higher-overall scouts into higher-target regions).
                    </template>
                </p>
                <div
                    v-for="m in lockSuggestion.lockedMoves"
                    :key="m.scout.id"
                    class="flex items-center gap-2 text-xs cursor-pointer hover:text-slate-200 transition-colors"
                    @click="openEdit(m.scout)"
                >
                    <span class="text-slate-200 font-medium">{{ m.scout.first_name }} {{ m.scout.last_name }}</span>
                    <LockIcon locked class="w-3 h-3 text-amber-400" />
                    <span class="text-slate-400">{{ m.from ?? 'Unassigned' }}</span>
                    <span v-if="m.from && m.scout.region_ratings[m.from]" :class="ratingColor[m.scout.region_ratings[m.from]!]">
                        {{ m.scout.region_ratings[m.from] }}
                    </span>
                    <span class="text-slate-600">→</span>
                    <span class="text-slate-400">{{ m.to ?? 'Unassigned' }}</span>
                    <span v-if="m.to && m.scout.region_ratings[m.to]" :class="ratingColor[m.scout.region_ratings[m.to]!]">
                        {{ m.scout.region_ratings[m.to] }}
                    </span>
                </div>
                <div class="flex items-center gap-3 pt-1">
                    <span v-if="lockSuggestion.moves.length > lockSuggestion.lockedMoves.length" class="text-xs text-slate-500">
                        + {{ lockSuggestion.moves.length - lockSuggestion.lockedMoves.length }} unlocked
                        scout{{ lockSuggestion.moves.length - lockSuggestion.lockedMoves.length === 1 ? '' : 's' }} would shift
                    </span>
                    <button
                        class="ml-auto px-3 py-1 rounded-md text-xs font-medium border border-amber-500/40 text-amber-300 hover:bg-amber-500/10 disabled:opacity-50 transition-colors"
                        :disabled="assigning"
                        title="Apply this layout once. Locks stay on, pinning scouts to their new regions."
                        @click="applyLockSuggestion"
                    >Apply layout</button>
                </div>
            </div>
        </div>

        <!-- Hiring plan: offers and shortlist judged together against the payroll -->
        <div v-if="hiringPlan.candidates.length">
            <h3 class="text-xs font-medium text-violet-400/70 uppercase tracking-wider mb-3">Hiring Plan</h3>
            <p class="text-xs text-slate-500 mb-3">
                Offers and shortlisted scouts weighed against each other and the payroll. Unseating a hired scout takes a
                marked improvement (2+ steps; 1 over an offer); locked scouts stay put.
                <template v-if="hiringPlan.gain > 0">
                    Signing the plan lifts coverage <span class="font-medium text-emerald-400">+{{ hiringPlan.gain }}</span>
                    step{{ hiringPlan.gain === 1 ? '' : 's' }} over the payroll alone.
                </template>
            </p>
            <div class="space-y-2">
                <div
                    v-for="a in hiringPlan.candidates"
                    :key="a.scout.id"
                    class="flex items-center gap-4 px-4 py-3 border border-dashed rounded-lg cursor-pointer transition-colors"
                    :class="a.scout.status === 'offered'
                        ? 'bg-amber-500/5 border-amber-500/30 hover:bg-amber-500/10'
                        : 'bg-violet-500/5 border-violet-500/30 hover:bg-violet-500/10'"
                    @click="openEdit(a.scout)"
                >
                    <span class="text-sm font-medium text-slate-200 w-44 flex-shrink-0">
                        <span
                            class="mr-1.5 font-medium uppercase tracking-wide text-[10px]"
                            :class="a.scout.status === 'offered' ? 'text-amber-400/80' : 'text-violet-400/80'"
                        >{{ a.scout.status === 'offered' ? 'Offer' : 'List' }}</span>
                        {{ a.scout.first_name }} {{ a.scout.last_name }}
                        <span v-if="a.scout.overall_rating" :class="['text-xs ml-1', ratingColor[a.scout.overall_rating]]">({{ a.scout.overall_rating }})</span>
                    </span>
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                        <template v-if="a.scout.status === 'offered'">
                            <span class="text-slate-500">Targeting</span>
                            <span class="text-slate-400">{{ a.scout.region ?? 'no region' }}</span>
                            <span v-if="a.scout.region && a.scout.region_ratings[a.scout.region]" :class="ratingColor[a.scout.region_ratings[a.scout.region]!]">
                                {{ a.scout.region_ratings[a.scout.region] }}
                            </span>
                            <span class="text-slate-600">·</span>
                        </template>
                        <template v-if="a.region">
                            <span class="text-slate-500">Plan →</span>
                            <span class="font-medium text-sky-300">{{ a.region }}</span>
                            <span :class="ratingColor[a.scout.region_ratings[a.region]!]">{{ a.scout.region_ratings[a.region] }}</span>
                            <template v-if="a.replaces">
                                <span class="text-slate-600">over</span>
                                <span class="text-slate-400">{{ initial(a.replaces) }}</span>
                                <span v-if="a.replaces.region_ratings[a.region]" :class="ratingColor[a.replaces.region_ratings[a.region]!]">
                                    {{ a.replaces.region_ratings[a.region] }}
                                </span>
                                <span v-else class="text-slate-600">unrated</span>
                                <span v-if="a.replaces.status === 'offered'" class="text-amber-500/70">(offer)</span>
                            </template>
                            <span v-else class="text-slate-600">open slot</span>
                            <span v-if="a.gain > 0" class="text-emerald-400">+{{ a.gain }}</span>
                        </template>
                        <span v-else class="text-slate-500">
                            {{ a.scout.status === 'offered' ? 'No place in the plan — others cover its regions better' : 'Not a marked improvement anywhere' }}
                        </span>
                        <template v-if="a.unlock">
                            <span class="text-slate-600">·</span>
                            <span class="text-amber-400/80">
                                Unlock {{ a.unlock.locked.map(initial).join(', ') }} to put them in {{ a.unlock.region }}
                                ({{ a.scout.region_ratings[a.unlock.region] }})
                            </span>
                        </template>
                    </div>
                    <div class="ml-auto flex flex-shrink-0 gap-2">
                        <button
                            v-if="a.scout.status === 'shortlisted' && a.region"
                            class="px-3 py-1 rounded-md text-xs font-medium border border-amber-500/40 text-amber-300 hover:bg-amber-500/10 transition-colors"
                            :title="`Mark a contract offered, targeting ${a.region}`"
                            @click.stop="setTarget(a.scout, a.region, 'offered')"
                        >Offer contract</button>
                        <button
                            v-if="a.scout.status === 'offered' && a.region && a.region !== a.scout.region"
                            class="px-3 py-1 rounded-md text-xs font-medium border border-sky-500/40 text-sky-300 hover:bg-sky-500/10 transition-colors"
                            @click.stop="setTarget(a.scout, a.region, 'offered')"
                        >Retarget</button>
                        <button
                            v-if="a.scout.status === 'offered'"
                            class="px-3 py-1 rounded-md text-xs font-medium bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 disabled:hover:bg-emerald-700 text-white transition-colors"
                            :disabled="!canAdd"
                            :title="canAdd ? 'Offer accepted — add to payroll' : 'Roster full — release a scout first'"
                            @click.stop="signOffer(a.scout)"
                        >Signed</button>
                    </div>
                </div>
            </div>

            <!-- What the payroll does to fit the plan's hires in -->
            <div v-if="hiringPlan.moves.length || hiringPlan.releases.length" class="mt-3 px-4 py-3 bg-slate-800/40 border border-slate-700/50 rounded-lg space-y-1.5">
                <p class="text-xs text-slate-500">To fit them in, once they sign:</p>
                <div v-for="m in hiringPlan.moves" :key="m.scout.id" class="flex items-center gap-2 text-xs">
                    <span class="text-slate-200 font-medium">{{ m.scout.first_name }} {{ m.scout.last_name }}</span>
                    <span class="text-slate-400">{{ m.from ?? 'Unassigned' }}</span>
                    <span v-if="m.from && m.scout.region_ratings[m.from]" :class="ratingColor[m.scout.region_ratings[m.from]!]">{{ m.scout.region_ratings[m.from] }}</span>
                    <span class="text-slate-600">→</span>
                    <span class="text-slate-400">{{ m.to }}</span>
                    <span v-if="m.to && m.scout.region_ratings[m.to]" :class="ratingColor[m.scout.region_ratings[m.to]!]">{{ m.scout.region_ratings[m.to] }}</span>
                </div>
                <div v-for="r in hiringPlan.releases" :key="r.id" class="flex items-center gap-2 text-xs">
                    <span class="text-rose-400/80">Release</span>
                    <span class="text-slate-200 font-medium">{{ r.first_name }} {{ r.last_name }}</span>
                    <span v-if="r.overall_rating" :class="ratingColor[r.overall_rating]">({{ r.overall_rating }})</span>
                    <span class="text-slate-500">no slot in the plan, payroll over {{ MAX_SCOUTS }}</span>
                    <span v-if="scoutedStore.forScout(r.id).length" class="text-slate-500">
                        · {{ scoutedStore.forScout(r.id).length }} prospects lose their scout
                    </span>
                </div>
            </div>
        </div>

        <!-- Unassigned scouts with suggestions -->
        <div v-if="unassigned.length">
            <h3 class="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">Unassigned</h3>
            <div class="space-y-2">
                <div
                    v-for="scout in unassigned"
                    :key="scout.id"
                    draggable="true"
                    class="flex items-center gap-4 px-4 py-3 bg-slate-800/40 border border-slate-700/50 rounded-lg cursor-grab active:cursor-grabbing hover:bg-slate-800/70 transition-colors"
                    :class="draggingId === scout.id && 'opacity-40'"
                    @dragstart="onDragStart($event, scout)"
                    @dragend="onDragEnd"
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

        <!-- Fire suggestions -->
        <div v-if="fireSuggestions.length">
            <h3 class="text-xs font-medium text-rose-500/70 uppercase tracking-wider mb-3">Consider Firing</h3>
            <div class="space-y-2">
                <div
                    v-for="{ scout, fit, weakFit, weakOverall } in fireSuggestions"
                    :key="scout.id"
                    class="flex items-center gap-4 px-4 py-3 bg-rose-500/5 border border-rose-500/20 rounded-lg cursor-pointer hover:bg-rose-500/10 transition-colors"
                    @click="openEdit(scout)"
                >
                    <span class="text-sm font-medium text-slate-200 w-36 flex-shrink-0">
                        {{ scout.first_name }} {{ scout.last_name }}
                        <span v-if="scout.overall_rating" :class="['text-xs ml-1', ratingColor[scout.overall_rating]]">({{ scout.overall_rating }})</span>
                        <LockIcon v-if="scout.region_locked" locked class="inline w-3 h-3 ml-0.5 -mt-0.5 text-amber-400" />
                    </span>
                    <template v-if="weakOverall">
                        <span class="text-xs text-rose-400">Low overall</span>
                        <!-- Skip when the best-fit display below already names the same region -->
                        <template v-if="scout.region && !(weakFit && fit.region === scout.region)">
                            <span class="text-xs text-slate-500">Assigned →</span>
                            <span class="text-xs text-slate-400">{{ scout.region }}</span>
                            <span v-if="scout.region_ratings[scout.region]"
                                  :class="['text-xs', ratingColor[scout.region_ratings[scout.region]!]]">
                                {{ scout.region_ratings[scout.region] }}
                            </span>
                        </template>
                    </template>
                    <template v-if="weakFit">
                        <template v-if="fit.region">
                            <span class="text-xs text-slate-500">Best fit →</span>
                            <span class="text-xs text-slate-400">{{ fit.region }}</span>
                            <span v-if="fit.rating" :class="['text-xs', ratingColor[fit.rating]]">{{ fit.rating }}</span>
                            <span v-else class="text-xs text-slate-600">unrated</span>
                        </template>
                        <span v-else class="text-xs text-slate-600">Can't beat out any assigned scout</span>
                    </template>
                </div>
            </div>
        </div>

        <!-- Upgrade targets -->
        <div v-if="upgradeTargets.length">
            <h3 class="text-xs font-medium text-sky-500/70 uppercase tracking-wider mb-3">Upgrade Targets</h3>
            <p v-if="pendingMoves" class="text-xs text-slate-500 mb-3">
                Auto-assign would make {{ pendingMoves }} move{{ pendingMoves === 1 ? '' : 's' }} — run it first so these reflect your best layout.
            </p>
            <p v-else-if="!canAdd" class="text-xs text-slate-500 mb-3">
                Roster full — each hire means releasing a scout.
            </p>
            <div class="space-y-2">
                <div
                    v-for="t in upgradeTargets"
                    :key="t.region"
                    class="flex items-center gap-4 px-4 py-3 bg-sky-500/5 border border-sky-500/20 rounded-lg"
                >
                    <span class="text-sm font-medium text-slate-200 w-36 flex-shrink-0">
                        {{ t.region }}
                        <span class="text-xs text-slate-500 font-normal ml-1">target {{ t.target }}</span>
                    </span>
                    <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
                        <span v-if="t.open > t.offers.length" class="text-xs font-medium text-rose-400">
                            {{ t.open - t.offers.length }} open — hire an A+ {{ t.region }} scout
                        </span>
                        <span
                            v-for="scout in t.offers"
                            :key="scout.id"
                            class="text-xs cursor-pointer hover:text-slate-200 transition-colors"
                            @click="openEdit(scout)"
                        >
                            <span class="text-amber-500/80">Offer out</span>
                            <span class="text-slate-400 ml-1">{{ scout.first_name.charAt(0) }}. {{ scout.last_name }}</span>
                            <span v-if="scout.region_ratings[t.region]"
                                  :class="['ml-1 font-medium', ratingColor[scout.region_ratings[t.region]!]]">
                                {{ scout.region_ratings[t.region] }}
                            </span>
                        </span>
                        <span
                            v-for="scout in t.weak"
                            :key="scout.id"
                            class="text-xs cursor-pointer hover:text-slate-200 transition-colors"
                            @click="openEdit(scout)"
                        >
                            <span class="text-slate-500">Upgrade</span>
                            <span class="text-slate-400 ml-1">{{ scout.first_name.charAt(0) }}. {{ scout.last_name }}</span>
                            <LockIcon v-if="scout.region_locked" locked class="inline w-3 h-3 ml-0.5 -mt-0.5 text-amber-400" />
                            <span v-if="scout.region_ratings[t.region]"
                                  :class="['ml-1 font-medium', ratingColor[scout.region_ratings[t.region]!]]">
                                {{ scout.region_ratings[t.region] }}
                            </span>
                            <span v-else class="ml-1 text-slate-600">unrated</span>
                        </span>
                    </div>
                </div>
            </div>
        </div>

        <!-- Full scout list -->
        <div v-if="scoutStore.hired.length === 0"
             class="rounded-xl border border-dashed border-slate-700 p-12 text-center text-slate-500 text-sm">
            No scouts assigned. Add up to {{ MAX_SCOUTS }}.
        </div>
        <div v-else>
            <h3 class="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">All Scouts</h3>
            <div class="space-y-2">
                <div
                    v-for="scout in sortedScouts"
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
                    <button
                        class="flex-shrink-0 mt-0.5 p-1 rounded transition-colors"
                        :class="scout.region_locked ? 'text-amber-400 hover:text-amber-300' : 'text-slate-600 hover:text-slate-400'"
                        :title="scout.region_locked ? 'Locked — auto-assign will keep this region' : 'Unlocked — auto-assign may move this scout'"
                        @click.stop="toggleLock(scout)"
                    >
                        <LockIcon :locked="scout.region_locked" class="w-4 h-4" />
                    </button>
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
                    <button
                        class="ml-auto flex-shrink-0 px-2 py-0.5 rounded text-xs text-slate-500 hover:text-sky-300 hover:bg-sky-500/10 disabled:opacity-50 disabled:hover:bg-transparent transition-colors"
                        :disabled="scoutedStore.forScout(scout.id).length >= SHORTLIST_MAX"
                        title="Add a player to this scout's shortlist"
                        @click.stop="shortlistScoutId = scout.id"
                    >+ Shortlist {{ scoutedStore.forScout(scout.id).length }}/{{ SHORTLIST_MAX }}</button>
                </div>
            </div>
        </div>

        <ShortlistPlayerModal
            v-if="shortlistScoutId !== undefined"
            :scout-id="shortlistScoutId"
            @close="shortlistScoutId = undefined"
        />

        <ImportModal v-if="showImport" kind="scouts" @close="showImport = false" />
        <ScoutModal v-if="showModal" :scout="selectedScout" :status="newScoutStatus" @close="onClose" @saved="onClose" />
    </div>
</template>
