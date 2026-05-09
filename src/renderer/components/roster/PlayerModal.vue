<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import {
    Clause,
    ContractType,
    JuniorLeague,
    League,
    Player,
    PlayerStatus,
    PlayerType,
    Position,
    PotentialLevel,
    PotentialChance,
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
const potentialChance: PotentialChance[] = ['Exact', 'High', 'Med', 'Low'];

const forwardPlayerTypes: PlayerType[] = ['ENF', 'GRN', 'PLY', 'PWF', 'SNP', 'TWF'];
const defensePlayerTypes: PlayerType[] = ['DFD', 'ENF', 'OFD', 'TWD'];
const goaliePlayerTypes: PlayerType[]  = ['BF', 'HYB', 'SU'];

const positions: Position[] = ['C', 'LW', 'RW', 'LD', 'RD', 'G'];
const juniorLeagues: JuniorLeague[] = [
    'OHL', 'QMJHL', 'WHL', 'US Central', 'US East', 'US West', 'Allsvenskan',
    'Liiga', 'SHL', 'DEL', 'Extraliga', 'ICE', 'NLA', 'Russia', 'ROW'
];

const rosterLeagues: League[] = ['NHL', 'AHL', 'ITS'];
const playerStatuses: PlayerStatus[] = ['Active', 'Injured', 'Healthy Scratch'];
const contractTypes: ContractType[] = ['1-way', '2-way'];
const contractClauses: Clause[] = ['NMC', 'NTC', 'M-NTC'];

// CSS constants
const inputClass = "w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-sky-500";
const formGroupHeader = "text-xs font-medium text-slate-500 uppercase tracking-wider mb-3";

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
    junior_league: null,
    overall: 75,
    potential_level: 'Top 6',
    potential_chance: 'Med',
    player_type: 'TWF',
    aav: 0,
    years_remaining: 0,
    contract_type: null,
    clause: null,
    waiver_eligible: 1,
    roster_league: 'NHL',
    role: '',
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

const position2Options = computed(() => {
    return positions.filter(pos => {
        if (positionGroup.value === 'FWD') return ['C', 'LW', 'RW'].includes(pos);
        if (positionGroup.value === 'DEF') return ['LD', 'RD'].includes(pos);
        return false; // Goalies have no valid secondary position
    }).filter(pos => pos !== form.position); // Filter position1 out of position2 options
});

const potentialLevelOptions = computed(() => {
    if (positionGroup.value === 'FWD') return forwardPotentialLevels;
    if (positionGroup.value === 'DEF') return defensePotentialLevels;
    return goaliePotentialLevels;
});

const playerTypeOptions = computed(() => {
    if (positionGroup.value === 'FWD') return forwardPlayerTypes;
    if (positionGroup.value === 'DEF') return defensePlayerTypes;
    return goaliePlayerTypes;
});

async function save() {
    const payload = { ...form };

    if (props.player) {
        const updated = await playerStore.update(props.player.id, payload);
        emit('saved', updated);
    } else {
        const created = await playerStore.add(payload);
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
    form.position2 = null; // reset secondary position when group changes
});
</script>

<template>
    <!-- Modal overlay -->
    <div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
        <!-- Modal panel -->
        <div class="bg-slate-900 rounded-xl w-[640px] max-h-[90vh] overflow-y-auto p-6 space-y-6">
            <!-- Header -->
            <div class="flex items-center justify-between">
                <h2 class="text-base font-semibold">
                    {{ props.player ? 'Edit Player' : 'Add Player' }}
                </h2>
                <button
                    class="text-slate-400 hover:text-slate-200 transition-colors"
                    @click="emit('close')"
                >✕</button>
            </div>
            <!-- Group 1: Player Identity -->
            <div>
                <h3 :class="formGroupHeader">Identity</h3>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-xs text-slate-400 mb-1">First name</label>
                        <input v-model="form.first_name" :class="inputClass" />
                    </div>
                    <div>
                        <label class="block text-xs text-slate-400 mb-1">Last name</label>
                        <input v-model="form.last_name" :class="inputClass" />
                    </div>
                    <div>
                        <label class="block text-xs text-slate-400 mb-1">Age</label>
                        <input v-model.number="form.age" type="number" min="16" max="45" :class="inputClass" />
                    </div>
                    <div>
                        <label class="block text-xs text-slate-400 mb-1">Junior League</label>
                        <select v-model="form.junior_league" :class="inputClass">
                            <option :value="null">—</option>
                            <option v-for="league in juniorLeagues" :key="league" :value="league">
                                {{ league }}
                            </option>
                        </select>
                    </div>
                </div>
            </div>
            <!-- Group 2: Position -->
            <div>
                <h3 :class="formGroupHeader">Position</h3>
                <div class="grid grid-cols-3 gap-4">
                    <div>
                        <label class="block text-xs text-slate-400 mb-1">Position</label>
                        <select v-model="form.position" :class="inputClass">
                            <option v-for="position in positions" :key="position" :value="position">
                                {{ position }}
                            </option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs text-slate-400 mb-1">Second Position</label>
                        <select v-model="form.position2" :class="inputClass" :disabled="positionGroup === 'G'">
                            <option :value="null">-</option>
                            <option v-for="position in position2Options" :key="position" :value="position">
                                {{ position }}
                            </option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs text-slate-400 mb-1">Type</label>
                        <select v-model="form.player_type" :class="inputClass">
                            <option v-for="type in playerTypeOptions" :key="type" :value="type">
                                {{ type }}
                            </option>
                        </select>
                    </div>
                </div>
            </div>
            <!-- Group 3: Quality -->
            <div>
                <h3 :class="formGroupHeader">Quality</h3>
                <div class="grid grid-cols-3 gap-4">
                    <div>
                        <label class="block text-xs text-slate-400 mb-1">Overall</label>
                        <input v-model.number="form.overall" type="number" min="45" max="99" :class="inputClass" />
                    </div>
                    <div>
                        <label class="block text-xs text-slate-400 mb-1">Potential</label>
                        <select v-model="form.potential_level" :class="inputClass">
                            <option v-for="level in potentialLevelOptions" :key="level" :value="level">
                                {{ level }}
                            </option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs text-slate-400 mb-1">Chance</label>
                        <select v-model="form.potential_chance" :class="inputClass">
                            <option v-for="chance in potentialChance" :key="chance" :value="chance">
                                {{ chance }}
                            </option>
                        </select>
                    </div>
                </div>
            </div>
            <!-- Group 4: Assignment -->
            <div>
                <h3 :class="formGroupHeader">Assignment</h3>
                <div class="grid grid-cols-3 gap-4">
                    <div>
                        <label class="block text-xs text-slate-400 mb-1">League</label>
                        <select v-model="form.roster_league" :class="inputClass">
                            <option v-for="league in rosterLeagues" :key="league" :value="league">
                                {{ league }}
                            </option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs text-slate-400 mb-1">Status</label>
                        <select v-model="form.status" :class="inputClass">
                            <option v-for="status in playerStatuses" :key="status" :value="status">
                                {{ status }}
                            </option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs text-slate-400 mb-1">Role</label>
                        <input v-model="form.role" :class="inputClass" />
                    </div>
                </div>
            </div>
            <!-- Group 5: Contract -->
            <div>
                <h3 :class="formGroupHeader">Contract</h3>
                <div class="grid grid-cols-3 gap-4">
                    <div>
                        <label class="block text-xs text-slate-400 mb-1">AAV</label>
                        <input v-model.number="form.aav" type="number" min="0.750" step="0.050" :class="inputClass" />
                    </div>
                    <div>
                        <label class="block text-xs text-slate-400 mb-1">Years Remaining</label>
                        <input v-model.number="form.years_remaining" type="number" min="0" max="10" :class="inputClass" />
                    </div>
                    <div>
                        <label class="block text-xs text-slate-400 mb-1">Type</label>
                        <select v-model="form.contract_type" :class="inputClass">
                            <option :value="null">-</option>
                            <option v-for="type in contractTypes" :key="type" :value="type">
                                {{ type }}
                            </option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs text-slate-400 mb-1">Trade Clause</label>
                        <select v-model="form.clause" :class="inputClass">
                            <option :value="null">-</option>
                            <option v-for="clause in contractClauses" :key="clause" :value="clause">
                                {{ clause }}
                            </option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs text-slate-400 mb-1">Waiver Eligible</label>
                        <select v-model="form.waiver_eligible" :class="inputClass">
                            <option :value="1">Yes</option>
                            <option :value="0">No</option>
                        </select>
                    </div>
                </div>
            </div>
            <!-- Group 6: Notes -->
            <div>
                <h3 :class="formGroupHeader">Notes</h3>
                <div>
                    <textarea v-model="form.notes" :class="inputClass" rows="3" />
                </div>
            </div>
            <!-- Delete confirmation -->
            <div v-if="props.player" class="pt-4 border-t border-slate-700">
                <div v-if="!showDeleteConfirm">
                    <button
                        class="text-xs text-rose-400 hover:text-rose-300 transition-colors"
                        @click="showDeleteConfirm = true"
                    >Delete player</button>
                </div>
                <div v-else class="flex items-center gap-3">
                    <span class="text-xs text-slate-400">Are you sure? This cannot be undone.</span>
                    <button
                        class="px-3 py-1.5 rounded-lg text-xs bg-rose-600 hover:bg-rose-500 text-white transition-colors"
                        @click="remove"
                    >Confirm</button>
                    <button
                        class="px-3 py-1.5 rounded-lg text-xs border border-slate-600 text-slate-400 hover:text-slate-200 transition-colors"
                        @click="showDeleteConfirm = false"
                    >Cancel</button>
                </div>
            </div>
            <!-- Footer buttons -->
            <div class="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-700">
                <button
                    class="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-slate-200 transition-colors"
                    @click="emit('close')"
                >Cancel</button>
                <button
                    class="px-4 py-2 rounded-lg text-sm hover:bg-sky-500 text-white font-medium transition-colors"
                    :style="{ backgroundColor: 'var(--team-primary)' }"
                    @click="save"
                >Save</button>
            </div>
        </div>
    </div>
</template>
