<script setup lang="ts">
import { computed, ref, Ref } from "vue";
import { usePlayerStore } from "@/stores";
import { League, Player, PlayerStatus, Position } from "@/types";

const playerStore = usePlayerStore();

type SortableColumn = 'last_name' | 'position' | 'overall' | 'potential_level' |
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
    { key: 'last_name',        label: 'Name',      visible: ref(true), sortable: true  },
    { key: 'position',         label: 'Pos',       visible: ref(true), sortable: true  },
    { key: 'position2',        label: 'Pos 2',     visible: ref(true), sortable: false },
    { key: 'roster_league',    label: 'League',    visible: ref(true), sortable: true  },
    { key: 'overall',          label: 'OVR',       visible: ref(true), sortable: true  },
    { key: 'potential_level',  label: 'Potential', visible: ref(true), sortable: true  },
    { key: 'potential_chance', label: 'Chance',    visible: ref(true), sortable: true  },
    { key: 'player_type',      label: 'Type',      visible: ref(true), sortable: true  },
    { key: 'role',             label: 'Role',      visible: ref(true), sortable: true  },
    { key: 'age',              label: 'Age',       visible: ref(true), sortable: true  },
    { key: 'aav',              label: 'AAV',       visible: ref(true), sortable: true  },
    { key: 'years_remaining',  label: 'Yrs',       visible: ref(true), sortable: true  },
    { key: 'contract_type',    label: 'Contract',  visible: ref(true), sortable: true  },
    { key: 'clause',           label: 'Clause',    visible: ref(true), sortable: true  },
    { key: 'waiver_eligible',  label: 'Waiver',    visible: ref(true), sortable: true  },
    { key: 'line_slot',        label: 'Line',      visible: ref(true), sortable: false },
    { key: 'status',           label: 'Status',    visible: ref(true), sortable: true  },
    { key: 'notes',            label: 'Notes',     visible: ref(true), sortable: false },
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

const isDefaultSort = computed(() => sortFields.value.length === 0);

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

const filteredAndSorted = computed(() => {
    let result = [...playerStore.players];

    // Filters
    if (search.value.trim()) {
        const q = search.value.trim().toLowerCase();
        result = result.filter(p =>
            p.first_name.toLowerCase().includes(q) ||
            p.last_name.toLowerCase().includes(q)
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
            const av = a[field.key as keyof Player];
            const bv = b[field.key as keyof Player];
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

</template>
