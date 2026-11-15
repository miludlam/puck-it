<script setup lang="ts">
import { ref } from 'vue';
import PicksTab from '@/components/draft/PicksTab.vue';
import PipelineTab from '@/components/draft/PipelineTab.vue';
import BoardTab from '@/components/draft/BoardTab.vue';
import ScoutsTab from '@/components/draft/ScoutsTab.vue';
import ShortlistsTab from '@/components/draft/ShortlistsTab.vue';

type DraftTab = 'picks' | 'pipeline' | 'board' | 'scouts' | 'shortlists';
const activeTab = ref<DraftTab>('picks');

const tabs: { key: DraftTab; label: string }[] = [
    { key: 'picks',    label: 'Picks'    },
    { key: 'pipeline', label: 'Pipeline' },
    { key: 'board',    label: 'Board'    },
    { key: 'scouts',   label: 'Scouts'   },
    { key: 'shortlists', label: 'Shortlists' },
];
</script>

<template>
    <div class="p-6">
        <div class="flex items-center justify-between mb-6">
            <div class="flex gap-1 p-1 bg-slate-800/50 rounded-lg">
                <button
                    v-for="tab in tabs"
                    :key="tab.key"
                    class="px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize"
                    :class="activeTab === tab.key
                        ? 'bg-slate-700 text-slate-100'
                        : 'text-slate-400 hover:text-slate-200'"
                    @click="activeTab = tab.key"
                >{{ tab.label }}</button>
            </div>
        </div>

        <PicksTab    v-if="activeTab === 'picks'"    />
        <PipelineTab v-else-if="activeTab === 'pipeline'" />
        <BoardTab    v-else-if="activeTab === 'board'"    />
        <ScoutsTab   v-else-if="activeTab === 'scouts'"   />
        <ShortlistsTab v-else-if="activeTab === 'shortlists'" />
    </div>
</template>
