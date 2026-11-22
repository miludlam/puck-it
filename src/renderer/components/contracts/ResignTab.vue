<script setup lang="ts">
import { computed, ref } from 'vue';
import { useContractStore, useFranchiseStore, usePlayerStore } from '@/stores';
import { Extension, ExtensionStatus, Player } from '@/types';
import { faStatusOf, seasonLabel } from '@/utils/contracts';
import { formatCap } from '@/utils/league';
import ExtensionModal from '@/components/contracts/ExtensionModal.vue';

const playerStore = usePlayerStore();
const contractStore = useContractStore();
const franchiseStore = useFranchiseStore();

const season = computed(() => franchiseStore.franchise?.season ?? 25);

// Deals ending after this season, or after next season
const horizon = ref<1 | 2>(1);
const horizons = computed(() => [
    { value: 1 as const, label: `End of ${seasonLabel(season.value)}` },
    { value: 2 as const, label: `End of ${seasonLabel(season.value + 1)}` },
]);

interface Row { player: Player; ext: Extension | null; fa: ReturnType<typeof faStatusOf> }

// Expiring players, plus anyone already in talks (an early extension). Looking two seasons
// out leaves off this season's expiring deals — without a new deal they're already gone.
const rows = computed<Row[]>(() =>
    playerStore.players
        .filter(p => {
            if (horizon.value === 2 && p.years_remaining < 2) return false;
            const ext = contractStore.extensionFor(p.id);
            if (ext) return p.years_remaining <= horizon.value || ext.status === 'Accepted' || ext.status === 'Offered';
            return p.aav > 0 && p.years_remaining <= horizon.value;
        })
        .map(p => {
            const ext = contractStore.extensionFor(p.id);
            return { player: p, ext, fa: faStatusOf(p, ext) };
        })
        .sort((a, b) =>
            a.player.years_remaining - b.player.years_remaining
            || b.player.overall - a.player.overall
        )
);

const summary = computed(() => {
    const count = (fn: (r: Row) => boolean) => rows.value.filter(fn).length;
    return [
        { label: 'UFA', value: count(r => r.fa.status === 'UFA') },
        { label: 'RFA', value: count(r => r.fa.status === 'RFA') },
        { label: 'No talks', value: count(r => !r.ext) },
        { label: 'Offered', value: count(r => r.ext?.status === 'Offered') },
        { label: 'Extended', value: count(r => r.ext?.status === 'Accepted') },
    ];
});

const STATUS_CLASS: Record<ExtensionStatus, string> = {
    'Negotiating': 'bg-slate-700 text-slate-300',
    'Offered': 'bg-amber-500/15 text-amber-300',
    'Accepted': 'bg-emerald-500/15 text-emerald-300',
    'Declined': 'bg-rose-500/15 text-rose-300',
    'Letting go': 'bg-slate-800 text-slate-500',
};

const terms = (aav: number | null, years: number | null) =>
    aav !== null && years !== null ? `${formatCap(aav)} × ${years}` : aav !== null ? formatCap(aav) : '—';

const editing = ref<Player | null>(null);

// Accepted deals start the season after the current one ends
const startsIn = (p: Player) => seasonLabel(season.value + Math.max(0, p.years_remaining));
const confirmStartId = ref<number | null>(null);
async function startDeal(p: Player) {
    await contractStore.startExtension(p.id);
    confirmStartId.value = null;
}
</script>

<template>
    <div class="space-y-4">
        <div class="flex flex-wrap items-center gap-4">
            <h2 class="text-sm font-medium text-slate-400 uppercase tracking-wider">Expiring Contracts</h2>
            <div class="flex gap-1 p-1 bg-slate-800/50 rounded-lg">
                <button
                    v-for="h in horizons"
                    :key="h.value"
                    class="px-3 py-1 rounded-md text-xs font-medium transition-colors"
                    :class="horizon === h.value ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'"
                    @click="horizon = h.value"
                >{{ h.label }}</button>
            </div>
            <div class="ml-auto flex gap-4 text-xs text-slate-500">
                <span v-for="s in summary" :key="s.label">{{ s.label }} <span class="text-slate-200">{{ s.value }}</span></span>
            </div>
        </div>

        <div v-if="!rows.length"
             class="rounded-xl border border-dashed border-slate-700 p-12 text-center text-slate-500 text-sm">
            No contracts expiring.
        </div>

        <table v-else class="w-full text-sm border-collapse">
            <thead>
                <tr class="border-b border-slate-700 text-xs text-slate-500">
                    <th class="px-3 py-2 text-left font-medium">Name</th>
                    <th class="px-3 py-2 text-center font-medium">Pos</th>
                    <th class="px-3 py-2 text-center font-medium">Age</th>
                    <th class="px-3 py-2 text-center font-medium">OVR</th>
                    <th class="px-3 py-2 text-center font-medium">League</th>
                    <th class="px-3 py-2 text-left font-medium">Current</th>
                    <th class="px-3 py-2 text-center font-medium" title="Free agent status at expiry — UFA at 27+">FA</th>
                    <th class="px-3 py-2 text-left font-medium">Asking</th>
                    <th class="px-3 py-2 text-left font-medium">Offer</th>
                    <th class="px-3 py-2 text-left font-medium">Talks</th>
                    <th class="px-3 py-2"></th>
                </tr>
            </thead>
            <tbody>
                <tr
                    v-for="{ player: p, ext, fa } in rows"
                    :key="p.id"
                    class="border-b border-slate-800 hover:bg-slate-800/40 transition-colors"
                    :class="{ 'opacity-50': ext?.status === 'Letting go' }"
                >
                    <td class="px-3 py-2 text-slate-200 cursor-pointer" @click="editing = p">{{ p.first_name }} {{ p.last_name }}</td>
                    <td class="px-3 py-2 text-center text-slate-400">{{ p.position }}</td>
                    <td class="px-3 py-2 text-center text-slate-400">{{ p.age }}</td>
                    <td class="px-3 py-2 text-center text-slate-300">{{ p.overall }}</td>
                    <td class="px-3 py-2 text-center text-slate-400 text-xs">{{ p.roster_league }}</td>
                    <td class="px-3 py-2 text-slate-400 text-xs whitespace-nowrap">
                        {{ p.aav > 0 ? `${formatCap(p.aav)} × ${p.years_remaining}` : 'No contract' }}
                    </td>
                    <td class="px-3 py-2 text-center">
                        <span
                            class="px-1.5 py-0.5 rounded text-[10px] font-medium"
                            :class="fa.status === 'UFA' ? 'bg-rose-500/15 text-rose-300' : 'bg-sky-500/15 text-sky-300'"
                            :title="fa.auto ? 'Judged from age at expiry — set it in the talks if it differs in-game' : 'Set by hand'"
                        >{{ fa.status }}{{ fa.auto ? '' : '*' }}</span>
                    </td>
                    <td class="px-3 py-2 text-slate-400 text-xs whitespace-nowrap">{{ terms(ext?.asking_aav ?? null, ext?.asking_years ?? null) }}</td>
                    <td class="px-3 py-2 text-slate-300 text-xs whitespace-nowrap">{{ terms(ext?.offer_aav ?? null, ext?.offer_years ?? null) }}</td>
                    <td class="px-3 py-2 text-xs">
                        <span v-if="ext" class="px-1.5 py-0.5 rounded text-[10px] font-medium" :class="STATUS_CLASS[ext.status]">{{ ext.status }}</span>
                        <span v-else class="text-slate-600">—</span>
                        <span v-if="ext?.status === 'Accepted'" class="ml-1.5 text-slate-500">from {{ startsIn(p) }}</span>
                    </td>
                    <td class="px-3 py-2 text-right whitespace-nowrap">
                        <template v-if="confirmStartId === p.id">
                            <span class="text-xs text-slate-400 mr-2">Replace {{ p.aav > 0 ? `${formatCap(p.aav)} × ${p.years_remaining}` : 'the current deal' }}?</span>
                            <button class="px-2.5 py-1 rounded text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white transition-colors mr-1" @click="startDeal(p)">Confirm</button>
                            <button class="px-2.5 py-1 rounded text-xs font-medium bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors" @click="confirmStartId = null">Cancel</button>
                        </template>
                        <template v-else>
                            <button
                                v-if="ext?.status === 'Accepted'"
                                class="mr-3 text-xs text-emerald-400/80 hover:text-emerald-300 transition-colors"
                                title="Once the old deal has run out — makes the extension the player's contract"
                                @click="confirmStartId = p.id"
                            >Start new deal</button>
                            <button class="text-xs text-slate-400 hover:text-slate-200 transition-colors" @click="editing = p">
                                {{ ext ? 'Edit talks' : 'Start talks' }}
                            </button>
                        </template>
                    </td>
                </tr>
            </tbody>
        </table>

        <p class="text-xs text-slate-600">
            Accepted extensions are added to the Cap Outlook from the season after the current deal ends. Use
            <span class="text-slate-400">Start new deal</span> once the old contract has run out.
        </p>

        <ExtensionModal v-if="editing" :player="editing" @close="editing = null" />
    </div>
</template>
