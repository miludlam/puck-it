<script setup lang="ts">
import { ref } from 'vue';
import TradeBlockTab from '@/components/trades/TradeBlockTab.vue';
import TradeForm from '@/components/trades/TradeForm.vue';
import TradeHistoryTab from '@/components/trades/TradeHistoryTab.vue';

type TradeTab = 'block' | 'trade' | 'history';
const activeTab = ref<TradeTab>('block');

const tabs: { key: TradeTab; label: string }[] = [
    { key: 'block',   label: 'Trade Block' },
    { key: 'trade',   label: 'Make Trade'  },
    { key: 'history', label: 'History'     },
];

// Assets handed from the Trade Block to the trade form; the key remounts the form
const preload = ref({ playerIds: [] as number[], pickIds: [] as number[], key: 0 });

function startTrade(playerIds: number[], pickIds: number[]) {
    preload.value = { playerIds, pickIds, key: preload.value.key + 1 };
    activeTab.value = 'trade';
}

function onExecuted() {
    preload.value = { playerIds: [], pickIds: [], key: preload.value.key + 1 };
    activeTab.value = 'history';
}
</script>

<template>
    <div class="p-6">
        <div class="flex items-center justify-between mb-6">
            <div class="flex gap-1 p-1 bg-slate-800/50 rounded-lg">
                <button
                    v-for="tab in tabs"
                    :key="tab.key"
                    class="px-4 py-1.5 rounded-md text-sm font-medium transition-colors"
                    :class="activeTab === tab.key
                        ? 'bg-slate-700 text-slate-100'
                        : 'text-slate-400 hover:text-slate-200'"
                    @click="activeTab = tab.key"
                >{{ tab.label }}</button>
            </div>
        </div>

        <TradeBlockTab v-if="activeTab === 'block'" @trade="startTrade" />
        <TradeForm
            v-else-if="activeTab === 'trade'"
            :key="preload.key"
            :initial-player-ids="preload.playerIds"
            :initial-pick-ids="preload.pickIds"
            @executed="onExecuted"
        />
        <TradeHistoryTab v-else-if="activeTab === 'history'" />
    </div>
</template>
