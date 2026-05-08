<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import {
    Player,
    PlayerType,
    PotentialLevel,
} from "@/types";
import { usePlayerStore } from '@/stores';

const playerStore = usePlayerStore();

const forwardPotentialLevels: PotentialLevel[] = [
    'Franchise', 'Elite', 'Top 6', 'Top 9', 'Bottom 6',
    'AHL Top 6', 'AHL Bottom 6', 'AHL 4th Line', 'AHL Extra', 'AHL Other',
];
const defensePotentialLevels: PotentialLevel[] = [
    'Franchise', 'Elite', 'Top 4', 'Top 6', '7th',
    'AHL Top 2', 'AHL Top 4', 'AHL Top 6', 'AHL 7th', 'AHL Other',
];
const goaliePotentialLevels: PotentialLevel[] = [
    'Franchise', 'Elite', 'Starter', 'Fringe', 'Backup',
    'AHL Starter', 'AHL Fringe', 'AHL Backup', 'AHL Extra', 'AHL Other',
];

const forwardPlayerTypes: PlayerType[] = ['ENF', 'GRN', 'PLY', 'PWF', 'SNP', 'TWF'];
const defensePlayerTypes: PlayerType[] = ['DFD', 'ENF', 'OFD', 'TWD'];
const goaliePlayerTypes: PlayerType[]  = ['BF', 'HYB', 'SU'];

const props = defineProps<{
    player?: Player;
}>();

const emit = defineEmits<{
    close: [];
    saved: [player: Player];
}>();

const showDeleteConfirm = ref(false);

const form = reactive<Omit<Player, 'id' | 'created_at'>>({
    first_name: '',
    last_name: '',
    position: 'C',
    position2: null,
    age: 25,
    roster_league: 'NHL',
    junior_league: null,
    overall: 75,
    potential_level: 'Top 6',
    potential_chance: 'Med',
    player_type: 'TWF',
    role: '',
    aav: 0,
    years_remaining: 0,
    contract_type: null,
    clause: null,
    waiver_eligible: true,
    status: 'Active',
    notes: null,
    line_slot: null,
    line_league: null,
});

if (props.player) {
    Object.assign(form, props.player);
}

const positionGroup = computed(() => {
    if (['C', 'LW', 'RW'].includes(form.position)) return 'FWD';
    if (['LD', 'RD'].includes(form.position)) return 'DEF';
    return 'G';
});

const playerTypeOptions = computed(() => {
    if (positionGroup.value === 'FWD') return forwardPlayerTypes;
    if (positionGroup.value === 'DEF') return defensePlayerTypes;
    return goaliePlayerTypes;
});

const potentialLevelOptions = computed(() => {
    if (positionGroup.value === 'FWD') return forwardPotentialLevels;
    if (positionGroup.value === 'DEF') return defensePotentialLevels;
    return goaliePotentialLevels;
});

async function save() {
    if (props.player) {
        const updated = await playerStore.update(props.player.id, form);
        emit('saved', updated);
    } else {
        const created = await playerStore.add(form);
        emit('saved', created);
    }
    emit('close');
}

async function remove() {
    await playerStore.remove(props.player!.id);
    emit('close');
}

watch(positionGroup, () => {
    form.potential_level = potentialLevelOptions.value[0];
    form.player_type = playerTypeOptions.value[0];
});
</script>

<template>

</template>

<style scoped>

</style>