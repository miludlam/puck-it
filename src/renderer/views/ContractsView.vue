<script setup lang="ts">
import { ref } from 'vue';
import CapOutlookTab from '@/components/contracts/CapOutlookTab.vue';
import ResignTab from '@/components/contracts/ResignTab.vue';
import FreeAgentsTab from '@/components/contracts/FreeAgentsTab.vue';

type ContractTab = 'outlook' | 'resign' | 'free-agents';
const activeTab = ref<ContractTab>('outlook');

const tabs: { key: ContractTab; label: string }[] = [
    { key: 'outlook',     label: 'Cap Outlook' },
    { key: 'resign',      label: 'Re-sign'     },
    { key: 'free-agents', label: 'Free Agents' },
];
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

        <CapOutlookTab v-if="activeTab === 'outlook'" />
        <ResignTab v-else-if="activeTab === 'resign'" />
        <FreeAgentsTab v-else-if="activeTab === 'free-agents'" />
    </div>
</template>
