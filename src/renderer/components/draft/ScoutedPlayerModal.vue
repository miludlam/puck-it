<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useScoutedPlayerStore, useScoutStore } from '@/stores';
import {
    JuniorLeague, NHLReadiness, Position, PotentialChance,
    PotentialLevel, PlayerType, ScoutedPlayer,
} from '@/types';

const scoutedStore = useScoutedPlayerStore();
const scoutStore = useScoutStore();

const props = defineProps<{ player?: ScoutedPlayer }>();
const emit = defineEmits<{ close: []; saved: [] }>();

const inputClass = "w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-sky-500";
const formGroupHeader = "text-xs font-medium text-slate-500 uppercase tracking-wider mb-3";
const showDeleteConfirm = ref(false);

const positions: Position[] = ['C', 'LW', 'RW', 'LD', 'RD', 'G'];
const juniorLeagues: JuniorLeague[] = [
    'OHL', 'QMJHL', 'WHL', 'US Central', 'US East', 'US West',
    'Allsvenskan', 'Liiga', 'SHL', 'DEL', 'Extraliga', 'ICE', 'NLA', 'Russia', 'ROW',
];
const potentialChances: PotentialChance[] = ['Exact', 'High', 'Med', 'Low'];
const nhlReadinessOptions: NHLReadiness[] = [
    'NHL Ready', '1 Year', '2 Years', '3 Years', '4 Years', '5 Years',
];

const fwdPotentials: PotentialLevel[] = [
    'Franchise', 'Elite', 'Top 6', 'Top 9', 'Bottom 6',
    'AHL Top 6', 'AHL Bottom 6', 'AHL 4th Line', 'AHL Extra', 'AHL Other',
];
const defPotentials: PotentialLevel[] = [
    'Franchise', 'Elite', 'Top 4', 'Top 6', '7th',
    'AHL Top 2', 'AHL Top 4', 'AHL Top 6', 'AHL 7th', 'AHL Other',
];
const goaliePotentials: PotentialLevel[] = [
    'Franchise', 'Elite', 'Starter', 'Fringe', 'Backup',
    'AHL Starter', 'AHL Fringe', 'AHL Backup', 'AHL Extra', 'AHL Other',
];
const fwdTypes: PlayerType[] = ['ENF', 'GRN', 'PLY', 'PWF', 'SNP', 'TWF'];
const defTypes: PlayerType[] = ['DFD', 'ENF', 'OFD', 'TWD'];
const goalieTypes: PlayerType[] = ['BF', 'HYB', 'SU'];

const form = reactive<Omit<ScoutedPlayer, 'id'>>({
    first_name:      props.player?.first_name      ?? '',
    last_name:       props.player?.last_name       ?? '',
    position:        props.player?.position        ?? 'C',
    position2:       props.player?.position2       ?? null,
    age:             props.player?.age             ?? 18,
    junior_league:   props.player?.junior_league   ?? null,
    overall:         props.player?.overall         ?? 70,
    potential_level: props.player?.potential_level ?? 'Top 6',
    potential_chance:props.player?.potential_chance?? 'Med',
    player_type:     props.player?.player_type     ?? 'TWF',
    nhl_readiness:   props.player?.nhl_readiness   ?? null,
    scout_id:        props.player?.scout_id        ?? null,
    notes:           props.player?.notes           ?? null,
});

const positionGroup = computed(() => {
    if (['C', 'LW', 'RW'].includes(form.position)) return 'FWD';
    if (['LD', 'RD'].includes(form.position)) return 'DEF';
    return 'G';
});

const potentialOptions = computed(() =>
    positionGroup.value === 'FWD' ? fwdPotentials
    : positionGroup.value === 'DEF' ? defPotentials
    : goaliePotentials
);

const typeOptions = computed(() =>
    positionGroup.value === 'FWD' ? fwdTypes
    : positionGroup.value === 'DEF' ? defTypes
    : goalieTypes
);

const position2Options = computed(() =>
    positions.filter(p => {
        if (positionGroup.value === 'FWD') return ['C', 'LW', 'RW'].includes(p);
        if (positionGroup.value === 'DEF') return ['LD', 'RD'].includes(p);
        return false;
    }).filter(p => p !== form.position)
);

watch(positionGroup, () => {
    form.potential_level = potentialOptions.value[0];
    form.player_type = typeOptions.value[0];
    form.position2 = null;
});

async function save() {
    if (props.player) {
        await scoutedStore.update(props.player.id, { ...form });
    } else {
        await scoutedStore.add({ ...form });
    }
    emit('saved');
    emit('close');
}

async function remove() {
    await scoutedStore.remove(props.player!.id);
    emit('close');
}
</script>

<template>
    <div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
        <div class="bg-slate-900 rounded-xl w-[640px] max-h-[90vh] overflow-y-auto p-6 space-y-6">
            <div class="flex items-center justify-between">
                <h2 class="text-base font-semibold">{{ props.player ? 'Edit Prospect' : 'Add Prospect' }}</h2>
                <button class="text-slate-400 hover:text-slate-200 transition-colors" @click="emit('close')">✕</button>
            </div>

            <!-- Identity -->
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
                        <input v-model.number="form.age" type="number" min="16" max="22" :class="inputClass" />
                    </div>
                    <div>
                        <label class="block text-xs text-slate-400 mb-1">Junior League</label>
                        <select v-model="form.junior_league" :class="inputClass">
                            <option :value="null">—</option>
                            <option v-for="league in juniorLeagues" :key="league" :value="league">{{ league }}</option>
                        </select>
                    </div>
                </div>
            </div>

            <!-- Position -->
            <div>
                <h3 :class="formGroupHeader">Position</h3>
                <div class="grid grid-cols-3 gap-4">
                    <div>
                        <label class="block text-xs text-slate-400 mb-1">Position</label>
                        <select v-model="form.position" :class="inputClass">
                            <option v-for="p in positions" :key="p" :value="p">{{ p }}</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs text-slate-400 mb-1">Second Position</label>
                        <select v-model="form.position2" :class="inputClass" :disabled="positionGroup === 'G'">
                            <option :value="null">—</option>
                            <option v-for="p in position2Options" :key="p" :value="p">{{ p }}</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs text-slate-400 mb-1">Type</label>
                        <select v-model="form.player_type" :class="inputClass">
                            <option v-for="t in typeOptions" :key="t" :value="t">{{ t }}</option>
                        </select>
                    </div>
                </div>
            </div>

            <!-- Quality -->
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
                            <option v-for="lvl in potentialOptions" :key="lvl" :value="lvl">{{ lvl }}</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs text-slate-400 mb-1">Chance</label>
                        <select v-model="form.potential_chance" :class="inputClass">
                            <option v-for="c in potentialChances" :key="c" :value="c">{{ c }}</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs text-slate-400 mb-1">NHL Readiness</label>
                        <select v-model="form.nhl_readiness" :class="inputClass">
                            <option :value="null">—</option>
                            <option v-for="r in nhlReadinessOptions" :key="r" :value="r">{{ r }}</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs text-slate-400 mb-1">Scout</label>
                        <select v-model="form.scout_id" :class="inputClass">
                            <option :value="null">—</option>
                            <option v-for="s in scoutStore.scouts" :key="s.id" :value="s.id">
                                {{ s.first_name }} {{ s.last_name }}
                            </option>
                        </select>
                    </div>
                </div>
            </div>

            <!-- Notes -->
            <div>
                <h3 :class="formGroupHeader">Notes</h3>
                <textarea v-model="form.notes" :class="inputClass" rows="3" />
            </div>

            <!-- Delete -->
            <div v-if="props.player" class="pt-4 border-t border-slate-700">
                <div v-if="!showDeleteConfirm">
                    <button class="text-xs text-rose-400 hover:text-rose-300 transition-colors" @click="showDeleteConfirm = true">Delete prospect</button>
                </div>
                <div v-else class="flex items-center gap-3">
                    <span class="text-xs text-slate-400">Are you sure?</span>
                    <button class="px-3 py-1.5 rounded-lg text-xs bg-rose-600 hover:bg-rose-500 text-white transition-colors" @click="remove">Confirm</button>
                    <button class="px-3 py-1.5 rounded-lg text-xs border border-slate-600 text-slate-400 hover:text-slate-200 transition-colors" @click="showDeleteConfirm = false">Cancel</button>
                </div>
            </div>

            <!-- Footer -->
            <div class="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-700">
                <button class="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-slate-200 transition-colors" @click="emit('close')">Cancel</button>
                <button
                    class="px-4 py-2 rounded-lg text-sm text-white font-medium transition-colors hover:opacity-90"
                    :style="{ backgroundColor: 'var(--team-primary)' }"
                    @click="save"
                >Save</button>
            </div>
        </div>
    </div>
</template>
