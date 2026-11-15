<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useCapStore, useContractStore, useFranchiseStore, usePickStore, usePlayerStore } from '@/stores';
import { Clause, ContractType, FAStatus, FreeAgent, FreeAgentStatus, LineLeague, Position, PotentialChance } from '@/types';
import { MAX_TERM_FA, offerImpact } from '@/utils/contracts';
import { groupOf, PLAYER_TYPES, POTENTIAL_TIERS } from '@/utils/draftTargets';
import OfferImpact from '@/components/contracts/OfferImpact.vue';

const props = defineProps<{ agent?: FreeAgent }>();
const emit = defineEmits<{ close: [] }>();

const contractStore = useContractStore();
const capStore = useCapStore();
const playerStore = usePlayerStore();
const pickStore = usePickStore();
const franchiseStore = useFranchiseStore();

const inputClass = "w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-sky-500";
const formGroupHeader = "text-xs font-medium text-slate-500 uppercase tracking-wider mb-3";

const positions: Position[] = ['C', 'LW', 'RW', 'LD', 'RD', 'G'];
const chances: PotentialChance[] = ['Exact', 'High', 'Med', 'Low'];
const contractTypes: ContractType[] = ['1-way', '2-way'];
const clauses: Clause[] = ['NMC', 'M-NTC', 'NTC'];
const leagues: LineLeague[] = ['NHL', 'AHL'];
const STATUSES: FreeAgentStatus[] = ['Shortlisted', 'Offered', 'Accepted', 'Declined', 'Signed elsewhere'];

type Form = Omit<FreeAgent, 'id' | 'created_at'>;
const form = reactive<Form>({
    first_name: '',
    last_name: '',
    position: 'C',
    age: null,
    overall: null,
    potential_level: null,
    potential_chance: null,
    player_type: null,
    role: null,
    fa_type: 'UFA',
    rights_team: null,
    asking_aav: null,
    asking_years: null,
    offer_aav: null,
    offer_years: null,
    offer_type: '1-way',
    offer_clause: null,
    target_league: 'NHL',
    status: 'Shortlisted',
    notes: null,
    ...(props.agent ? (({ id, created_at, ...rest }) => rest)(props.agent) : {}),
});

const group = computed(() => groupOf(form.position));
watch(group, () => {
    if (form.potential_level && !POTENTIAL_TIERS[group.value].includes(form.potential_level)) form.potential_level = null;
    if (form.player_type && !PLAYER_TYPES[group.value].includes(form.player_type)) form.player_type = null;
});

const myTeam = computed(() => franchiseStore.franchise?.team_id ?? null);
const otherTeams = computed(() => franchiseStore.teams.filter(t => t.id !== myTeam.value));
const season = computed(() => franchiseStore.franchise?.season ?? 25);

const num = (v: unknown) => typeof v === 'number' && !Number.isNaN(v) ? v : null;

const impact = computed(() => offerImpact({
    players: playerStore.players,
    extensions: contractStore.extensions,
    freeAgents: contractStore.freeAgents,
    season: season.value,
    ceilingFor: capStore.ceilingFor,
    excludeFreeAgentId: props.agent?.id,
    aav: num(form.offer_aav),
    years: num(form.offer_years),
    askingAav: num(form.asking_aav),
    askingYears: num(form.asking_years),
    league: form.target_league,
    position: form.position,
    startOffset: 0,
    isNewContract: true,
    rfaCompensation: form.fa_type === 'RFA',
    myPicks: pickStore.owned,
    myTeam: myTeam.value,
    draftYear: 2000 + season.value + 1,
}));

const error = ref<string | null>(null);
async function save() {
    error.value = null;
    if (!form.last_name.trim()) { error.value = 'Last name is required'; return; }
    const payload: Form = {
        ...form,
        age: num(form.age),
        overall: num(form.overall),
        asking_aav: num(form.asking_aav),
        asking_years: num(form.asking_years),
        offer_aav: num(form.offer_aav),
        offer_years: num(form.offer_years),
        potential_chance: form.potential_level ? form.potential_chance : null,
        rights_team: form.fa_type === 'RFA' ? form.rights_team : null,
    };
    if ((payload.status === 'Offered' || payload.status === 'Accepted') && (payload.offer_aav === null || payload.offer_years === null)) {
        error.value = `An ${payload.status.toLowerCase()} deal needs an AAV and years`;
        return;
    }
    if (props.agent) await contractStore.updateFreeAgent(props.agent.id, payload);
    else await contractStore.addFreeAgent(payload);
    emit('close');
}

const confirmDelete = ref(false);
async function remove() {
    await contractStore.removeFreeAgent(props.agent!.id);
    emit('close');
}
</script>

<template>
    <div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
        <div class="bg-slate-900 rounded-xl w-[680px] max-h-[90vh] overflow-y-auto p-6 space-y-6">
            <div class="flex items-center justify-between">
                <h2 class="text-base font-semibold">{{ props.agent ? 'Edit Free Agent' : 'Add Free Agent' }}</h2>
                <button class="text-slate-400 hover:text-slate-200 transition-colors" @click="emit('close')">✕</button>
            </div>

            <div>
                <h3 :class="formGroupHeader">Player</h3>
                <div class="grid grid-cols-4 gap-4">
                    <div class="col-span-2">
                        <label class="block text-xs text-slate-400 mb-1">First name</label>
                        <input v-model="form.first_name" :class="inputClass" />
                    </div>
                    <div class="col-span-2">
                        <label class="block text-xs text-slate-400 mb-1">Last name</label>
                        <input v-model="form.last_name" :class="inputClass" />
                    </div>
                    <div>
                        <label class="block text-xs text-slate-400 mb-1">Position</label>
                        <select v-model="form.position" :class="inputClass">
                            <option v-for="p in positions" :key="p" :value="p">{{ p }}</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs text-slate-400 mb-1">Age</label>
                        <input v-model.number="form.age" type="number" min="18" max="45" :class="inputClass" />
                    </div>
                    <div>
                        <label class="block text-xs text-slate-400 mb-1">Overall</label>
                        <input v-model.number="form.overall" type="number" min="40" max="99" :class="inputClass" />
                    </div>
                    <div>
                        <label class="block text-xs text-slate-400 mb-1">Type</label>
                        <select v-model="form.player_type" :class="inputClass">
                            <option :value="null">—</option>
                            <option v-for="t in PLAYER_TYPES[group]" :key="t" :value="t">{{ t }}</option>
                        </select>
                    </div>
                    <div class="col-span-2">
                        <label class="block text-xs text-slate-400 mb-1">Potential</label>
                        <select v-model="form.potential_level" :class="inputClass">
                            <option :value="null">—</option>
                            <option v-for="lvl in POTENTIAL_TIERS[group]" :key="lvl" :value="lvl">{{ lvl }}</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs text-slate-400 mb-1">Chance</label>
                        <select v-model="form.potential_chance" :class="inputClass" :disabled="!form.potential_level">
                            <option :value="null">—</option>
                            <option v-for="c in chances" :key="c" :value="c">{{ c }}</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs text-slate-400 mb-1">Role</label>
                        <input v-model="form.role" :class="inputClass" />
                    </div>
                </div>
            </div>

            <div>
                <h3 :class="formGroupHeader">Free Agency</h3>
                <div class="grid grid-cols-4 gap-4">
                    <div>
                        <label class="block text-xs text-slate-400 mb-1">Status</label>
                        <select v-model="form.fa_type" :class="inputClass">
                            <option v-for="s in (['UFA', 'RFA'] as FAStatus[])" :key="s" :value="s">{{ s }}</option>
                        </select>
                    </div>
                    <div class="col-span-2">
                        <label class="block text-xs text-slate-400 mb-1">Rights held by</label>
                        <select v-model="form.rights_team" :class="inputClass" :disabled="form.fa_type !== 'RFA'">
                            <option :value="null">—</option>
                            <option v-for="t in otherTeams" :key="t.id" :value="t.id">{{ t.name }}</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs text-slate-400 mb-1">Would play in</label>
                        <select v-model="form.target_league" :class="inputClass">
                            <option v-for="l in leagues" :key="l" :value="l">{{ l }}</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs text-slate-400 mb-1">Asking AAV ($M)</label>
                        <input v-model.number="form.asking_aav" type="number" min="0" step="0.025" :class="inputClass" />
                    </div>
                    <div>
                        <label class="block text-xs text-slate-400 mb-1">Years wanted</label>
                        <input v-model.number="form.asking_years" type="number" min="1" :max="MAX_TERM_FA" :class="inputClass" />
                    </div>
                </div>
            </div>

            <div>
                <h3 :class="formGroupHeader">Offer</h3>
                <div class="grid grid-cols-5 gap-4">
                    <div>
                        <label class="block text-xs text-slate-400 mb-1">AAV ($M)</label>
                        <input v-model.number="form.offer_aav" type="number" min="0" step="0.025" :class="inputClass" />
                    </div>
                    <div>
                        <label class="block text-xs text-slate-400 mb-1">Years</label>
                        <input v-model.number="form.offer_years" type="number" min="1" :max="MAX_TERM_FA" :class="inputClass" />
                    </div>
                    <div>
                        <label class="block text-xs text-slate-400 mb-1">Type</label>
                        <select v-model="form.offer_type" :class="inputClass">
                            <option :value="null">—</option>
                            <option v-for="t in contractTypes" :key="t" :value="t">{{ t }}</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs text-slate-400 mb-1">Clause</label>
                        <select v-model="form.offer_clause" :class="inputClass">
                            <option :value="null">None</option>
                            <option v-for="c in clauses" :key="c" :value="c">{{ c }}</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs text-slate-400 mb-1">Decision</label>
                        <select v-model="form.status" :class="inputClass">
                            <option v-for="s in STATUSES" :key="s" :value="s">{{ s }}</option>
                        </select>
                    </div>
                </div>
                <div class="mt-3">
                    <OfferImpact :notes="impact" />
                </div>
            </div>

            <div>
                <h3 :class="formGroupHeader">Notes</h3>
                <textarea v-model="form.notes" :class="inputClass" rows="2" />
            </div>

            <div v-if="props.agent" class="pt-4 border-t border-slate-700">
                <button v-if="!confirmDelete" class="text-xs text-rose-400 hover:text-rose-300 transition-colors" @click="confirmDelete = true">Remove from shortlist</button>
                <div v-else class="flex items-center gap-3">
                    <span class="text-xs text-slate-400">Are you sure?</span>
                    <button class="px-3 py-1.5 rounded-lg text-xs bg-rose-600 hover:bg-rose-500 text-white transition-colors" @click="remove">Confirm</button>
                    <button class="px-3 py-1.5 rounded-lg text-xs border border-slate-600 text-slate-400 hover:text-slate-200 transition-colors" @click="confirmDelete = false">Cancel</button>
                </div>
            </div>

            <p v-if="error" class="text-xs text-rose-400">{{ error }}</p>
            <div class="flex justify-end gap-3 pt-4 border-t border-slate-700">
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
