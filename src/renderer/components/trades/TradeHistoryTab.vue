<script setup lang="ts">
import { ref } from 'vue';
import { useFranchiseStore, useTradeStore } from '@/stores';
import { Trade, TradeAsset } from '@/types';
import { formatCap } from '@/utils/league';

const tradeStore = useTradeStore();
const franchiseStore = useFranchiseStore();

const teamName = (id: string) => franchiseStore.teams.find(t => t.id === id)?.name ?? id;
const normalizeYear = (y: number) => y < 100 ? 2000 + y : y;
const roundLabel = (r: number) => ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th'][r - 1] ?? `${r}th`;
const seasonLabel = (s: number) => `${s}/${String(s + 1).slice(-2)}`;

const sent = (t: Trade) => t.assets.filter(a => a.direction === 'out');
const received = (t: Trade) => t.assets.filter(a => a.direction === 'in');

function describe(a: TradeAsset): { main: string; detail: string } {
    if (a.kind === 'player') {
        const p = a.player;
        return {
            main: `${p.position} ${p.first_name} ${p.last_name}`,
            detail: [
                `${p.age}`, `${p.overall} OVR`,
                p.potential_level && `${p.potential_level}${p.potential_chance ? ` (${p.potential_chance})` : ''}`,
                p.aav > 0 ? `${formatCap(p.aav)} × ${p.years_remaining}` : 'no contract',
                p.clause, p.roster_league,
            ].filter(Boolean).join(' · '),
        };
    }
    return {
        main: `${normalizeYear(a.year)} ${roundLabel(a.round)}`,
        detail: `originally ${a.original_owner} · ${a.from_owner} → ${a.to_owner}`,
    };
}

const confirmDeleteId = ref<number | null>(null);
</script>

<template>
    <div class="space-y-4">
        <h2 class="text-sm font-medium text-slate-400 uppercase tracking-wider">Trade History</h2>

        <div v-if="!tradeStore.trades.length"
             class="rounded-xl border border-dashed border-slate-700 p-12 text-center text-slate-500 text-sm">
            No trades yet.
        </div>

        <article
            v-for="t in tradeStore.trades"
            :key="t.id"
            class="p-4 bg-slate-800/40 border border-slate-700/50 rounded-lg space-y-3"
        >
            <header class="flex flex-wrap items-baseline gap-x-3">
                <span class="text-sm font-medium text-slate-200">with {{ teamName(t.partner) }}</span>
                <span class="text-xs text-slate-500">{{ seasonLabel(t.season) }} · {{ t.created_at.slice(0, 10) }}</span>
                <span v-if="t.notes" class="text-xs text-slate-400 italic">{{ t.notes }}</span>
                <span class="ml-auto">
                    <template v-if="confirmDeleteId === t.id">
                        <span class="text-xs text-slate-400 mr-2">Delete log entry? (doesn't undo the trade)</span>
                        <button class="text-xs text-rose-400 hover:text-rose-300 mr-2" @click="tradeStore.remove(t.id)">Delete</button>
                        <button class="text-xs text-slate-500 hover:text-slate-300" @click="confirmDeleteId = null">Cancel</button>
                    </template>
                    <button v-else class="text-xs text-slate-600 hover:text-slate-400" @click="confirmDeleteId = t.id">Delete</button>
                </span>
            </header>

            <div class="grid gap-4 md:grid-cols-2">
                <div v-for="side in [{ label: 'Sent', cls: 'text-rose-300', assets: sent(t) }, { label: 'Received', cls: 'text-emerald-300', assets: received(t) }]" :key="side.label">
                    <p class="text-xs font-medium uppercase tracking-wider mb-1" :class="side.cls">{{ side.label }}</p>
                    <ul class="space-y-1">
                        <li v-for="(a, i) in side.assets" :key="i" class="text-xs">
                            <span class="text-slate-200">{{ describe(a).main }}</span>
                            <span class="text-slate-500 ml-2">{{ describe(a).detail }}</span>
                        </li>
                        <li v-if="!side.assets.length" class="text-xs text-slate-600">Nothing</li>
                    </ul>
                </div>
            </div>
        </article>
    </div>
</template>
