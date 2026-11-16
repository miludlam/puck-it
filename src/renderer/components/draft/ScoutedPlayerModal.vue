<script setup lang="ts">
import { POTENTIAL_TIERS } from '@/utils/draftTargets';
import { computed, reactive, ref, watch } from 'vue';
import { useScoutedPlayerStore, useScoutStore } from '@/stores';
import {
    JuniorLeague, NHLReadiness, Position, PotentialChance,
    PotentialLevel, PlayerType, ScoutedPlayer, SHORTLIST_MAX,
} from '@/types';

const scoutedStore = useScoutedPlayerStore();
const scoutStore = useScoutStore();

const props = defineProps<{
    player?: ScoutedPlayer;
    csRank?: number; // prefill when adding into a gap on the Board
}>();
const emit = defineEmits<{ close: []; saved: [] }>();

const inputClass = "w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-sky-500";
const formGroupHeader = "text-xs font-medium text-slate-500 uppercase tracking-wider mb-3";
const showDeleteConfirm = ref(false);
const error = ref<string | null>(null);

const positions: Position[] = ['C', 'LW', 'RW', 'LD', 'RD', 'G'];
const juniorLeagues: JuniorLeague[] = [
    'OHL', 'QMJHL', 'WHL', 'US Central', 'US East', 'US West',
    'Allsvenskan', 'Liiga', 'SHL', 'DEL', 'Extraliga', 'ICE', 'NLA', 'Russia', 'ROW',
];
const potentialChances: PotentialChance[] = ['Exact', 'High', 'Med', 'Low'];
const nhlReadinessOptions: NHLReadiness[] = [
    'NHL Ready', '1 Year', '2 Years', '3 Years', '4 Years', '5 Years',
];

const fwdPotentials: PotentialLevel[] = POTENTIAL_TIERS.FWD;
const defPotentials: PotentialLevel[] = POTENTIAL_TIERS.DEF;
const goaliePotentials: PotentialLevel[] = POTENTIAL_TIERS.G;
const fwdTypes: PlayerType[] = ['ENF', 'GRN', 'PLY', 'PWF', 'SNP', 'TWF'];
const defTypes: PlayerType[] = ['DFD', 'ENF', 'OFD', 'TWD'];
const goalieTypes: PlayerType[] = ['BF', 'HYB', 'SU'];

const form = reactive<Omit<ScoutedPlayer, 'id' | 'taken'>>({
    first_name:      props.player?.first_name      ?? '',
    last_name:       props.player?.last_name       ?? '',
    position:        props.player?.position        ?? 'C',
    position2:       props.player?.position2       ?? null,
    age:             props.player?.age             ?? 17,
    junior_league:   props.player?.junior_league   ?? null,
    cs_rank:         props.player?.cs_rank         ?? props.csRank ?? null,
    original_cs_rank: props.player?.original_cs_rank ?? null,
    overall:         null, // only revealed once drafted — entered at the draft confirm
    // Blank potential = "needs refining" (fog of war); chosen once scouting reveals it
    potential_level: props.player?.potential_level ?? null,
    potential_chance:props.player?.potential_chance?? null,
    player_type:     props.player?.player_type     ?? null,
    nhl_readiness:   props.player?.nhl_readiness   ?? null,
    scout_id:        props.player?.scout_id        ?? null,
    notes:           props.player?.notes           ?? null,
    gem_bust:        props.player?.gem_bust        ?? null,
});

const positionGroup = computed(() => {
    const position = form.position ?? 'C';
    if (['C', 'LW', 'RW'].includes(position)) return 'FWD';
    if (['LD', 'RD'].includes(position)) return 'DEF';
    return 'G';
});

// Shortlist cap — a scout is full unless this prospect is already theirs
const shortlistCount = (scoutID: number) => scoutedStore.forScout(scoutID).length;
const isFull = (scoutID: number) =>
    shortlistCount(scoutID) >= SHORTLIST_MAX && props.player?.scout_id !== scoutID;

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

// League follows the scout's region unless set to something else by hand
watch(() => form.scout_id, (scoutID, previousID) => {
    if (form.junior_league === null || form.junior_league === scoutStore.regionOf(previousID)) {
        form.junior_league = scoutStore.regionOf(scoutID);
    }
});

watch(positionGroup, () => {
    // Tiers differ by group (Top 6 F ≠ Top 6 D) — keep only ones valid for the new group
    if (form.potential_level && !potentialOptions.value.includes(form.potential_level)) form.potential_level = null;
    if (form.player_type && !typeOptions.value.includes(form.player_type)) form.player_type = null;
    form.position2 = null;
});

async function save() {
    error.value = null;
    // Empty number inputs come back as '' from v-model.number
    const payload = {
        ...form,
        cs_rank: typeof form.cs_rank === 'number' ? form.cs_rank : null,
        // Blank original = take the current rank as the first assessment
        original_cs_rank: typeof form.original_cs_rank === 'number'
            ? form.original_cs_rank
            : typeof form.cs_rank === 'number' ? form.cs_rank : null,
        // A chance only means something alongside a potential level
        potential_chance: form.potential_level ? form.potential_chance : null,
    };
    try {
        if (props.player) {
            await scoutedStore.update(props.player.id, payload);
        } else {
            await scoutedStore.add(payload);
        }
    } catch (e) {
        error.value = e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e);
        return;
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
                        <label class="block text-xs text-slate-400 mb-1">CS Ranking</label>
                        <input v-model.number="form.cs_rank" type="number" min="1" placeholder="Projected pick" :class="inputClass" />
                    </div>
                    <div>
                        <label class="block text-xs text-slate-400 mb-1">Original CS Ranking</label>
                        <input v-model.number="form.original_cs_rank" type="number" min="1" placeholder="Same as current" :class="inputClass" />
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
                            <option :value="null">—</option>
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
                        <label class="block text-xs text-slate-400 mb-1">Potential</label>
                        <select v-model="form.potential_level" :class="inputClass">
                            <option :value="null">— Needs refining</option>
                            <option v-for="lvl in potentialOptions" :key="lvl" :value="lvl">{{ lvl }}</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs text-slate-400 mb-1">Chance</label>
                        <select v-model="form.potential_chance" :class="inputClass" :disabled="!form.potential_level">
                            <option :value="null">—</option>
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
                            <option v-for="s in scoutStore.hired" :key="s.id" :value="s.id" :disabled="isFull(s.id)">
                                {{ s.first_name }} {{ s.last_name }} ({{ shortlistCount(s.id) }}/{{ SHORTLIST_MAX }})
                            </option>
                        </select>
                    </div>
                </div>
            </div>

            <!-- Gem / Bust -->
            <div>
                <h3 :class="formGroupHeader">Scouting Verdict</h3>
                <div class="flex gap-1 p-1 bg-slate-800/50 rounded-lg w-fit">
                    <button
                        v-for="option in ([null, 'Gem', 'Bust'] as const)"
                        :key="option ?? 'none'"
                        type="button"
                        class="px-3 py-1 rounded-md text-xs font-medium transition-colors"
                        :class="form.gem_bust === option
                            ? option === 'Gem' ? 'bg-emerald-600/80 text-white'
                              : option === 'Bust' ? 'bg-rose-600/80 text-white'
                              : 'bg-slate-700 text-slate-100'
                            : 'text-slate-400 hover:text-slate-200'"
                        @click="form.gem_bust = option"
                    >{{ option ?? 'Unknown' }}</button>
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
                    <button class="px-3 py-1.5 rounded-lg text-xs bg-rose-600 hover:bg-rose-700 text-white transition-colors" @click="remove">Confirm</button>
                    <button class="px-3 py-1.5 rounded-lg text-xs border border-slate-600 text-slate-400 hover:text-slate-200 transition-colors" @click="showDeleteConfirm = false">Cancel</button>
                </div>
            </div>

            <!-- Footer -->
            <p v-if="error" class="text-xs text-rose-400">{{ error }}</p>
            <div class="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-700">
                <button class="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-slate-200 transition-colors" @click="emit('close')">Cancel</button>
                <button
                    class="px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:opacity-90"
                    :style="{ backgroundColor: 'var(--team-primary)', color: 'var(--team-on-primary)' }"
                    @click="save"
                >Save</button>
            </div>
        </div>
    </div>
</template>
