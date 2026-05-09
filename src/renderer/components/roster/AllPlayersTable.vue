<script setup lang="ts">
import { computed, ref, Ref } from "vue";
import { usePlayerStore } from "@/stores";
import { League, Player, PlayerStatus, Position } from "@/types";

const playerStore = usePlayerStore();

type SortableColumn = 'name' | 'position' | 'overall' | 'potential_level' |
    'potential_chance' | 'player_type' | 'age' | 'aav' | 'years_remaining' |
    'roster_league' | 'status' | 'role' | 'contract_type' | 'clause' |
    'waiver_eligible' | 'line_slot';

interface Column {
    key: SortableColumn | 'position2' | 'notes';
    label: string;
    visible: Ref<boolean>;
    sortable: boolean;
}

const columns: Column[] = [
    { key: 'name',             label: 'Name',            visible: ref(true), sortable: true  },
    { key: 'position',         label: 'Position',        visible: ref(true), sortable: true  },
    { key: 'roster_league',    label: 'League',          visible: ref(true), sortable: true  },
    { key: 'overall',          label: 'OVR',             visible: ref(true), sortable: true  },
    { key: 'potential_level',  label: 'Potential',       visible: ref(true), sortable: true  },
    { key: 'player_type',      label: 'Type',            visible: ref(true), sortable: true  },
    { key: 'role',             label: 'Role',            visible: ref(true), sortable: true  },
    { key: 'age',              label: 'Age',             visible: ref(true), sortable: true  },
    { key: 'aav',              label: 'AAV',             visible: ref(true), sortable: true  },
    { key: 'years_remaining',  label: 'Yrs',             visible: ref(true), sortable: true  },
    { key: 'contract_type',    label: 'Contract Type',   visible: ref(true), sortable: true  },
    { key: 'clause',           label: 'Trade Clause',    visible: ref(true), sortable: true  },
    { key: 'waiver_eligible',  label: 'Waiver Eligible', visible: ref(true), sortable: true  },
    { key: 'line_slot',        label: 'Line',            visible: ref(true), sortable: true  },
    { key: 'status',           label: 'Status',          visible: ref(true), sortable: true  },
    { key: 'notes',            label: 'Notes',           visible: ref(true), sortable: false },
];

type SortDirection = 'asc' | 'desc';

interface SortField {
    key: SortableColumn;
    direction: SortDirection;
}

const forwardPotentialRank: Record<string, number> = {
    'Franchise': 0, 'Elite': 1, 'Top 6': 2, 'Top 9': 3, 'Bottom 6': 4,
    'AHL Top 6': 5, 'AHL Bottom 6': 6, 'AHL 4th Line': 7, 'AHL Extra': 8, 'AHL Other': 9,
};
const defensePotentialRank: Record<string, number> = {
    'Franchise': 0, 'Elite': 1, 'Top 4': 2, 'Top 6': 3, '7th': 4,
    'AHL Top 2': 5, 'AHL Top 4': 6, 'AHL Top 6': 7, 'AHL 7th': 8, 'AHL Other': 9,
};
const goaliePotentialRank: Record<string, number> = {
    'Franchise': 0, 'Elite': 1, 'Starter': 2, 'Fringe': 3, 'Backup': 4,
    'AHL Starter': 5, 'AHL Fringe': 6, 'AHL Backup': 7, 'AHL Extra': 8, 'AHL Other': 9,
};

const potentialChanceRank: Record<string, number> = {
    'High': 0, 'Med': 1, 'Low': 2, 'Exact': 3
};

const search = ref('');
const filterPositionGroup = ref<'FWD' | 'DEF' | 'G' | 'All'>('All');
const filterLeague = ref<League | 'All'>('All');
const filterStatus = ref<PlayerStatus | 'All'>('All');
const sortFields = ref<SortField[]>([]);
const showColumnMenu = ref(false);

const emit = defineEmits<{
    editPlayer: [player: Player];
}>();

function getPositionGroup(position: Position): 'FWD' | 'DEF' | 'G' {
    if (['C', 'LW', 'RW'].includes(position)) return 'FWD';
    if (['LD', 'RD'].includes(position)) return 'DEF';
    return 'G';
}

function getPotentialRank(player: Player): number {
    const group = getPositionGroup(player.position);
    const rank = group === 'FWD' ? forwardPotentialRank
        : group === 'DEF' ? defensePotentialRank
            : goaliePotentialRank;
    return rank[player.potential_level] ?? 99;
}

const positionGroupRank: Record<string, number> = { 'FWD': 0, 'DEF': 1, 'G': 2 };
const positionRank: Record<string, number> = { 'C': 0, 'LW': 1, 'RW': 2, 'LD': 3, 'RD': 4, 'G': 5 };

function defaultSort(a: Player, b: Player): number {
    // 1. Position group
    const groupDiff = positionGroupRank[getPositionGroup(a.position)] -
        positionGroupRank[getPositionGroup(b.position)];
    if (groupDiff !== 0) return groupDiff;

    // 2. Primary position
    const posDiff = positionRank[a.position] - positionRank[b.position];
    if (posDiff !== 0) return posDiff;

    // 3. Overall descending
    const ovrDiff = b.overall - a.overall;
    if (ovrDiff !== 0) return ovrDiff;

    // 4. Potential level
    const potDiff = getPotentialRank(a) - getPotentialRank(b);
    if (potDiff !== 0) return potDiff;

    // 5. Potential chance
    const chanceDiff = potentialChanceRank[a.potential_chance] -
        potentialChanceRank[b.potential_chance];
    if (chanceDiff !== 0) return chanceDiff;

    // 6. Age ascending
    return a.age - b.age;
}

function handleColumnClick(key: SortableColumn, event: MouseEvent) {
    if (event.shiftKey) {
        const existing = sortFields.value.find(s => s.key === key);
        if (existing) {
            existing.direction = existing.direction === 'asc' ? 'desc' : 'asc';
        } else {
            sortFields.value.push({ key, direction: 'desc' });
        }
    } else {
        const existing = sortFields.value.find(s => s.key === key);
        if (existing && sortFields.value.length === 1) {
            existing.direction = existing.direction === 'asc' ? 'desc' : 'asc';
        } else {
            sortFields.value = [{ key, direction: 'desc' }];
        }
    }
}

function resetSort() {
    sortFields.value = [];
}

function formatCell(player: Player, key: string): string {
    switch (key) {
        case 'name':            return `${player.first_name.charAt(0)}. ${player.last_name}`;
        case 'aav':             return player.aav ? `$${player.aav.toFixed(3)}M` : '—';
        case 'waiver_eligible': return player.waiver_eligible ? 'Y' : 'N';
        case 'potential_level': return `${player.potential_level} (${player.potential_chance})`;
        case 'clause':          return player.clause ?? '—';
        case 'position2':       return player.position2 ?? '—';
        case 'notes':           return player.notes ?? '—';
        default:                return String((player as any)[key] ?? '—');
    }
}

const isDefaultSort = computed(() => sortFields.value.length === 0);

const filteredAndSorted = computed(() => {
    let result = [...playerStore.players];

    // Filters
    if (search.value.trim()) {
        const query = search.value.trim().toLowerCase();
        result = result.filter(p =>
            p.first_name.toLowerCase().includes(query) ||
            p.last_name.toLowerCase().includes(query)
        );
    }
    if (filterPositionGroup.value !== 'All') {
        result = result.filter(p =>
            getPositionGroup(p.position) === filterPositionGroup.value
        );
    }
    if (filterLeague.value !== 'All') {
        result = result.filter(p => p.roster_league === filterLeague.value);
    }
    if (filterStatus.value !== 'All') {
        result = result.filter(p => p.status === filterStatus.value);
    }

    // Sort
    if (isDefaultSort.value) {
        return result.sort(defaultSort);
    }

    return result.sort((a, b) => {
        for (const field of sortFields.value) {
            let av: unknown;
            let bv: unknown;

            // Handle composite fields
            if (field.key === 'name') {
                av = `${a.last_name} ${a.first_name}`;
                bv = `${b.last_name} ${b.first_name}`;
            } else {
                av = a[field.key as keyof Player];
                bv = b[field.key as keyof Player];
            }

            if (av === bv) continue;
            const dir = field.direction === 'asc' ? 1 : -1;
            if (typeof av === 'number' && typeof bv === 'number') {
                return (av - bv) * dir;
            }
            return String(av).localeCompare(String(bv)) * dir;
        }
        return 0;
    });
});
</script>

<template>
    <div>
        <!-- Toolbar -->
        <div class="flex items-center gap-3 mb-4">
            <!-- Search -->
            <input
                v-model="search"
                type="text"
                placeholder="Search..."
                class="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 w-48"
            />
            <!-- Position Group Filter -->
            <div class="flex bg-slate-800/50 rounded-lg p-0.5">
                <button v-for="option in (['All', 'FWD', 'DEF', 'G'] as const)"
                        :key="option"
                        @click="filterPositionGroup = option"
                        :class="filterPositionGroup === option
                        ? 'bg-slate-700 text-slate-100'
                        : 'text-slate-400 hover:text-slate-200'"
                        class="px-3 py-1 rounded-md text-xs font-medium transition-colors"
                >
                    {{ option }}
                </button>
            </div>
            <!-- League Filter -->
            <div class="flex bg-slate-800/50 rounded-lg p-0.5">
                <button v-for="option in (['All', 'NHL', 'AHL', 'ITS'] as const)"
                        :key="option"
                        @click="filterLeague = option"
                        :class="filterLeague === option
                        ? 'bg-slate-700 text-slate-100'
                        : 'text-slate-400 hover:text-slate-200'"
                        class="px-3 py-1 rounded-md text-xs font-medium transition-colors"
                >
                    {{ option }}
                </button>
            </div>
            <!-- Status Filter -->
            <div class="flex bg-slate-800/50 rounded-lg p-0.5">
                <button v-for="option in (['All', 'Active', 'Healthy Scratch', 'Injured'] as const)"
                        :key="option"
                        @click="filterStatus = option"
                        :class="filterStatus === option
                        ? 'bg-slate-700 text-slate-100'
                        : 'text-slate-400 hover:text-slate-200'"
                        class="px-3 py-1 rounded-md text-xs font-medium transition-colors"
                >
                    {{ option }}
                </button>
            </div>
            <!-- Spacer -->
            <div class="flex-1" />
            <!-- Reset Sort -->
            <button
                v-if="!isDefaultSort"
                @click="resetSort"
                class="px-3 py-1.5 rounded-lg text-xs border border-slate-600 text-slate-400 hover:text-slate-200 transition-colors"
            >
                Reset sort
            </button>
            <!-- Column Visibility -->
            <div class="relative">
                <button
                    @click="showColumnMenu = !showColumnMenu"
                    class="px-3 py-1.5 rounded-lg text-xs border border-slate-600 text-slate-400 hover:text-slate-200 transition-colors"
                >
                    Columns ▾
                </button>
                <div
                    v-if="showColumnMenu"
                    class="absolute right-0 top-8 bg-slate-800 border border-slate-700 rounded-lg p-3 z-10 w-40 space-y-2 shadow-xl"
                >
                    <label
                        v-for="col in columns.slice(1)"
                        :key="col.key"
                        class="flex items-center gap-2 text-xs text-slate-400 cursor-pointer hover:text-slate-200"
                    >
                        <input type="checkbox" v-model="col.visible.value" class="accent-sky-500" />
                        {{ col.label }}
                    </label>
                </div>
            </div>
            <!-- Player count -->
            <span class="text-xs text-slate-500">{{ filteredAndSorted.length }} players</span>
        </div>
        <!-- Table -->
        <table class="w-full text-sm border-collapse">
            <thead>
            <tr class="border-b border-slate-700">
                <th
                    v-for="col in columns.filter(c => c.visible.value)"
                    :key="col.key"
                    @click="col.sortable ? handleColumnClick(col.key as SortableColumn, $event) : null"
                    class="px-3 py-2 text-left text-xs font-medium text-slate-400 whitespace-nowrap"
                    :class="[
                        col.key === 'name' ? 'text-left' : 'text-center',
                        col.sortable ? 'cursor-pointer hover:text-slate-200' : ''
                    ]"
                >
                    {{ col.label }}
                    <!-- sort indicator -->
                    <span v-if="col.sortable">
                        <template v-for="(field, index) in sortFields" :key="field.key">
                            <span v-if="field.key === col.key" class="ml-1 text-sky-400">
                                {{ field.direction === 'asc' ? '↑' : '↓' }}{{ sortFields.length > 1 ? index + 1 : '' }}
                            </span>
                        </template>
                    </span>
                </th>
            </tr>
            </thead>
            <tbody>
            <tr v-if="filteredAndSorted.length === 0">
                <td
                    :colspan="columns.filter(c => c.visible.value).length"
                    class="px-3 py-8 text-center text-slate-500 text-sm"
                >
                    No players match the current filters.
                </td>
            </tr>
            <template v-else>
                <tr
                    v-for="player in filteredAndSorted"
                    :key="player.id"
                    @click="emit('editPlayer', player)"
                    class="cursor-pointer border-b border-slate-800 hover:bg-slate-800/50 transition-colors"
                >
                    <td
                        v-for="col in columns.filter(c => c.visible.value)"
                        :key="col.key"
                        class="px-3 py-2 whitespace-nowrap"
                        :class="col.key === 'name' ? 'text-left' : 'text-center'"
                    >
                        <template v-if="col.key === 'roster_league'">
                            <span
                                class="px-2 py-0.5 rounded text-xs font-medium"
                                :class="{
                                    'bg-blue-500/20 text-blue-300':   player.roster_league === 'NHL',
                                    'bg-violet-500/20 text-violet-300': player.roster_league === 'AHL',
                                    'bg-slate-500/20 text-slate-400':  player.roster_league === 'ITS',
                                }"
                            >{{ player.roster_league }}</span>
                        </template>
                        <template v-else-if="col.key === 'position'">
                            <span
                                class="px-2 py-0.5 rounded text-xs font-medium"
                                :class="{
                                    'bg-blue-500/20 text-blue-300':   getPositionGroup(player.position) === 'FWD',
                                    'bg-violet-500/20 text-violet-300':  getPositionGroup(player.position) === 'DEF',
                                    'bg-slate-500/20 text-slate-400':  getPositionGroup(player.position) === 'G',
                                }"
                            >{{ player.position }}{{ player.position2 ? ` / ${player.position2}` : '' }}</span>
                        </template>
                        <template v-else>
                            {{ formatCell(player, col.key) }}
                        </template>
                    </td>
                </tr>
            </template>
            </tbody>
        </table>
    </div>
</template>
