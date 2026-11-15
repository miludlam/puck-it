<script setup lang="ts">
import { computed, ref } from 'vue';
import { useContractStore, useFranchiseStore } from '@/stores';
import { FreeAgent, FreeAgentStatus } from '@/types';
import { capCharge } from '@/utils/contracts';
import { formatCap } from '@/utils/league';
import FreeAgentModal from '@/components/contracts/FreeAgentModal.vue';

const contractStore = useContractStore();
const franchiseStore = useFranchiseStore();

const STATUSES: FreeAgentStatus[] = ['Shortlisted', 'Offered', 'Accepted', 'Declined', 'Signed elsewhere'];
// Live deals first: accepted (ready to sign), offered, shortlisted, then closed
const STATUS_ORDER: Record<FreeAgentStatus, number> = {
    'Accepted': 0, 'Offered': 1, 'Shortlisted': 2, 'Declined': 3, 'Signed elsewhere': 4,
};
const STATUS_CLASS: Record<FreeAgentStatus, string> = {
    'Shortlisted': 'text-slate-300',
    'Offered': 'text-amber-300',
    'Accepted': 'text-emerald-300',
    'Declined': 'text-rose-300',
    'Signed elsewhere': 'text-slate-500',
};
const closed = (fa: FreeAgent) => fa.status === 'Declined' || fa.status === 'Signed elsewhere';

const agents = computed(() =>
    [...contractStore.freeAgents].sort((a, b) =>
        STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || (b.overall ?? 0) - (a.overall ?? 0)
    )
);

const openOffers = computed(() => contractStore.freeAgents.filter(f => f.status === 'Offered' && f.offer_aav !== null));
const openCap = computed(() => openOffers.value.reduce((sum, f) => sum + capCharge(f.target_league, f.offer_aav!), 0));
const closedCount = computed(() => contractStore.freeAgents.filter(closed).length);

const teamName = (id: string | null) => franchiseStore.teams.find(t => t.id === id)?.name ?? id ?? '';
const terms = (aav: number | null, years: number | null) =>
    aav !== null && years !== null ? `${formatCap(aav)} × ${years}` : aav !== null ? formatCap(aav) : '—';

// Modal: undefined = closed, null = adding
const editing = ref<FreeAgent | null | undefined>(undefined);

const setStatus = (fa: FreeAgent, status: string) =>
    contractStore.updateFreeAgent(fa.id, { status: status as FreeAgentStatus });

const signingId = ref<number | null>(null);
async function sign(fa: FreeAgent) {
    await contractStore.signFreeAgent(fa.id);
    signingId.value = null;
}

const confirmClear = ref(false);
async function clearClosed() {
    await Promise.all(contractStore.freeAgents.filter(closed).map(f => contractStore.removeFreeAgent(f.id)));
    confirmClear.value = false;
}
</script>

<template>
    <div class="space-y-4">
        <div class="flex flex-wrap items-center gap-4">
            <h2 class="text-sm font-medium text-slate-400 uppercase tracking-wider">
                Free Agent Shortlist
                <span v-if="openOffers.length" class="ml-2 text-slate-600 font-normal normal-case">
                    {{ openOffers.length }} offer{{ openOffers.length === 1 ? '' : 's' }} out · {{ formatCap(openCap) }} cap if all accepted
                </span>
            </h2>
            <div class="ml-auto flex items-center gap-3">
                <template v-if="closedCount">
                    <button
                        v-if="!confirmClear"
                        class="px-3 py-2 rounded-lg text-xs border border-slate-600 text-slate-400 hover:text-rose-400 hover:border-rose-400 transition-colors"
                        @click="confirmClear = true"
                    >Clear declined / signed elsewhere ({{ closedCount }})</button>
                    <span v-else class="flex items-center gap-2 text-xs text-slate-400">
                        Remove {{ closedCount }}?
                        <button class="px-2.5 py-1 rounded text-xs bg-rose-600 hover:bg-rose-700 text-white transition-colors" @click="clearClosed">Confirm</button>
                        <button class="px-2.5 py-1 rounded text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors" @click="confirmClear = false">Cancel</button>
                    </span>
                </template>
                <button
                    class="px-4 py-2 rounded-lg text-sm font-medium bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
                    @click="editing = null"
                >+ Add Free Agent</button>
            </div>
        </div>

        <div v-if="!agents.length"
             class="rounded-xl border border-dashed border-slate-700 p-12 text-center text-slate-500 text-sm">
            No free agents shortlisted yet.
        </div>

        <table v-else class="w-full text-sm border-collapse">
            <thead>
                <tr class="border-b border-slate-700 text-xs text-slate-500">
                    <th class="px-3 py-2 text-left font-medium">Name</th>
                    <th class="px-3 py-2 text-center font-medium">Pos</th>
                    <th class="px-3 py-2 text-center font-medium">Age</th>
                    <th class="px-3 py-2 text-center font-medium">OVR</th>
                    <th class="px-3 py-2 text-left font-medium">Potential</th>
                    <th class="px-3 py-2 text-center font-medium">Type</th>
                    <th class="px-3 py-2 text-left font-medium">FA</th>
                    <th class="px-3 py-2 text-left font-medium">Asking</th>
                    <th class="px-3 py-2 text-left font-medium">Offer</th>
                    <th class="px-3 py-2 text-left font-medium">Decision</th>
                    <th class="px-3 py-2"></th>
                </tr>
            </thead>
            <tbody>
                <tr
                    v-for="fa in agents"
                    :key="fa.id"
                    class="border-b border-slate-800 hover:bg-slate-800/40 transition-colors"
                    :class="{ 'opacity-50': closed(fa) }"
                >
                    <td class="px-3 py-2 text-slate-200 cursor-pointer" @click="editing = fa">
                        {{ fa.first_name }} {{ fa.last_name }}
                        <span v-if="fa.target_league === 'AHL'" class="ml-1 text-[10px] text-slate-500">AHL</span>
                    </td>
                    <td class="px-3 py-2 text-center text-slate-400">{{ fa.position }}</td>
                    <td class="px-3 py-2 text-center text-slate-400">{{ fa.age ?? '—' }}</td>
                    <td class="px-3 py-2 text-center text-slate-300">{{ fa.overall ?? '—' }}</td>
                    <td class="px-3 py-2 text-slate-400 text-xs">
                        {{ fa.potential_level ?? '—' }}
                        <span v-if="fa.potential_chance" class="text-slate-600">({{ fa.potential_chance }})</span>
                    </td>
                    <td class="px-3 py-2 text-center text-slate-400 text-xs">{{ fa.player_type ?? '—' }}</td>
                    <td class="px-3 py-2 text-xs whitespace-nowrap">
                        <span
                            class="px-1.5 py-0.5 rounded text-[10px] font-medium"
                            :class="fa.fa_type === 'UFA' ? 'bg-rose-500/15 text-rose-300' : 'bg-sky-500/15 text-sky-300'"
                        >{{ fa.fa_type }}</span>
                        <span v-if="fa.fa_type === 'RFA' && fa.rights_team" class="ml-1 text-slate-500">{{ teamName(fa.rights_team) }}</span>
                    </td>
                    <td class="px-3 py-2 text-slate-400 text-xs whitespace-nowrap">{{ terms(fa.asking_aav, fa.asking_years) }}</td>
                    <td class="px-3 py-2 text-slate-300 text-xs whitespace-nowrap">{{ terms(fa.offer_aav, fa.offer_years) }}</td>
                    <td class="px-3 py-1">
                        <select
                            :value="fa.status"
                            class="bg-transparent hover:bg-slate-900 border border-transparent hover:border-slate-700 rounded px-1 py-0.5 text-xs focus:outline-none focus:border-sky-500 cursor-pointer"
                            :class="STATUS_CLASS[fa.status]"
                            @change="setStatus(fa, ($event.target as HTMLSelectElement).value)"
                        >
                            <option v-for="s in STATUSES" :key="s" :value="s" :disabled="(s === 'Offered' || s === 'Accepted') && (fa.offer_aav === null || fa.offer_years === null)">{{ s }}</option>
                        </select>
                    </td>
                    <td class="px-3 py-2 text-right whitespace-nowrap">
                        <template v-if="signingId === fa.id">
                            <span class="text-xs text-slate-400 mr-2">Add to the {{ fa.target_league }} roster at {{ terms(fa.offer_aav, fa.offer_years) }}?</span>
                            <button class="px-2.5 py-1 rounded text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white transition-colors mr-1" @click="sign(fa)">Confirm</button>
                            <button class="px-2.5 py-1 rounded text-xs font-medium bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors" @click="signingId = null">Cancel</button>
                        </template>
                        <template v-else>
                            <button
                                v-if="fa.status === 'Accepted'"
                                class="mr-3 px-2.5 py-1 rounded text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
                                @click="signingId = fa.id"
                            >Sign to roster</button>
                            <button class="text-xs text-slate-400 hover:text-slate-200 transition-colors" @click="editing = fa">
                                {{ fa.offer_aav === null ? 'Make offer' : 'Edit' }}
                            </button>
                        </template>
                    </td>
                </tr>
            </tbody>
        </table>

        <FreeAgentModal v-if="editing !== undefined" :agent="editing ?? undefined" @close="editing = undefined" />
    </div>
</template>
