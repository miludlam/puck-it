<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useCapStore, useContractStore, useFranchiseStore, usePlayerStore } from '@/stores';
import { Clause, ContractType, Extension, ExtensionStatus, FAStatus, Player } from '@/types';
import { ageAtExpiry, faStatusOf, MAX_TERM_RESIGN, offerImpact, seasonLabel } from '@/utils/contracts';
import { formatCap } from '@/utils/league';
import OfferImpact from '@/components/contracts/OfferImpact.vue';

const props = defineProps<{ player: Player }>();
const emit = defineEmits<{ close: [] }>();

const contractStore = useContractStore();
const capStore = useCapStore();
const playerStore = usePlayerStore();
const franchiseStore = useFranchiseStore();

const inputClass = "w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-sky-500";
const formGroupHeader = "text-xs font-medium text-slate-500 uppercase tracking-wider mb-3";

const STATUSES: ExtensionStatus[] = ['Negotiating', 'Offered', 'Accepted', 'Declined', 'Letting go'];
const contractTypes: ContractType[] = ['1-way', '2-way'];
const clauses: Clause[] = ['NMC', 'M-NTC', 'NTC'];

const existing = contractStore.extensionFor(props.player.id);
const form = reactive<Extension>({
    player_id: props.player.id,
    fa_status: null,
    asking_aav: null,
    asking_years: null,
    offer_aav: null,
    offer_years: null,
    offer_type: props.player.contract_type,
    offer_clause: null,
    status: 'Negotiating',
    notes: null,
    ...existing,
});

const season = computed(() => franchiseStore.franchise?.season ?? 25);
const autoStatus = computed(() => faStatusOf(props.player, null).status);
const startSeason = computed(() => season.value + Math.max(0, props.player.years_remaining));

// Blank number inputs come back as '' — store them as null
const num = (v: unknown) => typeof v === 'number' && !Number.isNaN(v) ? v : null;

const impact = computed(() => offerImpact({
    players: playerStore.players,
    extensions: contractStore.extensions,
    freeAgents: contractStore.freeAgents,
    season: season.value,
    ceilingFor: capStore.ceilingFor,
    excludePlayerId: props.player.id,
    aav: num(form.offer_aav),
    years: num(form.offer_years),
    askingAav: num(form.asking_aav),
    askingYears: num(form.asking_years),
    league: props.player.roster_league,
    position: props.player.position,
    startOffset: Math.max(0, props.player.years_remaining),
    currentAav: props.player.aav,
    isNewContract: false,
    rfaCompensation: false,
    myPicks: [],
    myTeam: null,
    draftYear: 0,
}));

const error = ref<string | null>(null);
async function save() {
    error.value = null;
    const payload: Extension = {
        ...form,
        asking_aav: num(form.asking_aav),
        asking_years: num(form.asking_years),
        offer_aav: num(form.offer_aav),
        offer_years: num(form.offer_years),
    };
    if ((payload.status === 'Offered' || payload.status === 'Accepted') && (payload.offer_aav === null || payload.offer_years === null)) {
        error.value = `An ${payload.status.toLowerCase()} deal needs an AAV and years`;
        return;
    }
    await contractStore.saveExtension(payload);
    emit('close');
}

const confirmDelete = ref(false);
async function remove() {
    await contractStore.removeExtension(props.player.id);
    emit('close');
}
</script>

<template>
    <div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
        <div class="bg-slate-900 rounded-xl w-[640px] max-h-[90vh] overflow-y-auto p-6 space-y-6">
            <div class="flex items-center justify-between">
                <div>
                    <h2 class="text-base font-semibold">Re-sign {{ props.player.first_name }} {{ props.player.last_name }}</h2>
                    <p class="text-xs text-slate-500 mt-0.5">
                        {{ props.player.position }} · {{ props.player.age }} · {{ props.player.overall }} OVR · {{ props.player.roster_league }}
                        · {{ props.player.aav > 0 ? `${formatCap(props.player.aav)} × ${props.player.years_remaining}` : 'No contract' }}
                    </p>
                </div>
                <button class="text-slate-400 hover:text-slate-200 transition-colors" @click="emit('close')">✕</button>
            </div>

            <div>
                <h3 :class="formGroupHeader">Status</h3>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-xs text-slate-400 mb-1">Free agent status</label>
                        <select v-model="form.fa_status" :class="inputClass">
                            <option :value="null">Auto — {{ autoStatus }} ({{ ageAtExpiry(props.player) }} at expiry)</option>
                            <option v-for="s in (['RFA', 'UFA'] as FAStatus[])" :key="s" :value="s">{{ s }}</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs text-slate-400 mb-1">Talks</label>
                        <select v-model="form.status" :class="inputClass">
                            <option v-for="s in STATUSES" :key="s" :value="s">{{ s }}</option>
                        </select>
                    </div>
                </div>
            </div>

            <div>
                <h3 :class="formGroupHeader">Asking</h3>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-xs text-slate-400 mb-1">AAV ($M)</label>
                        <input v-model.number="form.asking_aav" type="number" min="0" step="0.025" :class="inputClass" />
                    </div>
                    <div>
                        <label class="block text-xs text-slate-400 mb-1">Years</label>
                        <input v-model.number="form.asking_years" type="number" min="1" :max="MAX_TERM_RESIGN" :class="inputClass" />
                    </div>
                </div>
            </div>

            <div>
                <h3 :class="formGroupHeader">
                    Offer
                    <span class="ml-1 normal-case font-normal text-slate-600">starts {{ seasonLabel(startSeason) }}</span>
                </h3>
                <div class="grid grid-cols-4 gap-4">
                    <div>
                        <label class="block text-xs text-slate-400 mb-1">AAV ($M)</label>
                        <input v-model.number="form.offer_aav" type="number" min="0" step="0.025" :class="inputClass" />
                    </div>
                    <div>
                        <label class="block text-xs text-slate-400 mb-1">Years</label>
                        <input v-model.number="form.offer_years" type="number" min="1" :max="MAX_TERM_RESIGN" :class="inputClass" />
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
                </div>
                <div class="mt-3">
                    <OfferImpact :notes="impact" />
                </div>
            </div>

            <div>
                <h3 :class="formGroupHeader">Notes</h3>
                <textarea v-model="form.notes" :class="inputClass" rows="2" />
            </div>

            <div v-if="existing" class="pt-4 border-t border-slate-700">
                <button v-if="!confirmDelete" class="text-xs text-rose-400 hover:text-rose-300 transition-colors" @click="confirmDelete = true">Clear talks</button>
                <div v-else class="flex items-center gap-3">
                    <span class="text-xs text-slate-400">Forget the ask and offer?</span>
                    <button class="px-3 py-1.5 rounded-lg text-xs bg-rose-600 hover:bg-rose-700 text-white transition-colors" @click="remove">Confirm</button>
                    <button class="px-3 py-1.5 rounded-lg text-xs border border-slate-600 text-slate-400 hover:text-slate-200 transition-colors" @click="confirmDelete = false">Cancel</button>
                </div>
            </div>

            <p v-if="error" class="text-xs text-rose-400">{{ error }}</p>
            <div class="flex justify-end gap-3 pt-4 border-t border-slate-700">
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
