<script setup lang="ts">
import { computed, ref } from 'vue';
import { Player } from '@/types';
import { usePlayerStore } from "@/stores";
import AllPlayersTable from '@/components/roster/AllPlayersTable.vue';
import LineBuilder from '@/components/roster/LineBuilder.vue';
import PlayerModal from '@/components/roster/PlayerModal.vue';

type RosterTab = 'all' | 'nhl' | 'ahl' | 'its';
const activeTab = ref<RosterTab>('all');

const playerStore = usePlayerStore();

const showModal = ref(false);
const selectedPlayer = ref<Player | undefined>(undefined);

function openAdd() {
    selectedPlayer.value = undefined;
    showModal.value = true;
}

function openEdit(player: Player) {
    selectedPlayer.value = player;
    showModal.value = true;
}

function onClose() {
    showModal.value = false;
    selectedPlayer.value = undefined;
}

const itsByGroup = computed(() => {
    const sorted = [...playerStore.its].sort((a, b) => b.overall - a.overall);
    return {
        fwd: sorted.filter(p => ['C', 'LW', 'RW'].includes(p.position)),
        def: sorted.filter(p => ['LD', 'RD'].includes(p.position)),
        g:   sorted.filter(p => p.position === 'G'),
    };
});
</script>

<template>
    <div class="p-6">

        <!-- Header -->
        <div class="flex items-center justify-between mb-6">
            <div class="flex gap-1 p-1 bg-slate-800/50 rounded-lg">
                <button
                    v-for="tab in (['all', 'nhl', 'ahl', 'its'] as const)"
                    :key="tab"
                    class="px-4 py-1.5 rounded-md text-sm font-medium transition-colors uppercase"
                    :class="activeTab === tab
                        ? 'bg-slate-700 text-slate-100'
                        : 'text-slate-400 hover:text-slate-200'"
                    @click="activeTab = tab"
                >{{ tab }}</button>
            </div>
            <button
                class="px-4 py-2 rounded-lg text-sm text-white font-medium transition-colors"
                :style="{ backgroundColor: 'var(--team-primary)' }"
                @click="openAdd"
            >+ Add Player</button>
        </div>

        <!-- Views -->
        <AllPlayersTable v-if="activeTab === 'all'" @edit-player="openEdit" />
        <LineBuilder v-else-if="activeTab === 'nhl'" league="NHL" />
        <LineBuilder v-else-if="activeTab === 'ahl'" league="AHL" />

        <div v-else-if="activeTab === 'its'" class="space-y-6">
            <p class="text-xs text-slate-500">
                Players in the system ineligible for AHL assignment.
                Use the player modal to reassign when eligible.
            </p>

            <div v-if="!playerStore.its.length"
                 class="rounded-xl border border-dashed border-slate-700 p-12 text-center text-slate-500 text-sm">
                No players currently in the system.
            </div>

            <template v-else>
                <div v-for="group in [
            { label: 'Forwards', players: itsByGroup.fwd },
            { label: 'Defence',  players: itsByGroup.def },
            { label: 'Goalies',  players: itsByGroup.g   },
        ]" :key="group.label">
                    <template v-if="group.players.length">
                        <h3 class="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                            {{ group.label }}
                        </h3>
                        <div class="space-y-2">
                            <div
                                v-for="player in group.players"
                                :key="player.id"
                                class="flex items-center gap-3 px-4 py-3 bg-slate-800/40 border border-slate-700/50 rounded-lg cursor-pointer hover:bg-slate-800/70 transition-colors"
                                @click="openEdit(player)"
                            >
                        <span
                            class="px-2 py-0.5 rounded text-xs font-medium flex-shrink-0"
                            :class="{
                                'bg-sky-500/20 text-sky-300':         ['C', 'LW', 'RW'].includes(player.position),
                                'bg-amber-500/20 text-amber-300':     ['LD', 'RD'].includes(player.position),
                                'bg-emerald-500/20 text-emerald-300': player.position === 'G',
                            }"
                        >
                            {{ player.position }}{{ player.position2 ? `/${player.position2}` : '' }}
                        </span>
                                <span class="text-sm font-medium flex-1">
                            {{ player.first_name.charAt(0) }}. {{ player.last_name }}
                        </span>
                                <span class="text-xs text-slate-500">Age {{ player.age }}</span>
                                <span class="text-xs text-slate-400">
                            {{ player.potential_level }} ({{ player.potential_chance }})
                        </span>
                                <span v-if="player.junior_league" class="text-xs text-slate-500">
                            {{ player.junior_league }}
                        </span>
                                <span class="text-xs font-semibold text-slate-400">{{ player.overall }}</span>
                            </div>
                        </div>
                    </template>
                </div>
            </template>
        </div>

        <PlayerModal
            v-if="showModal"
            :player="selectedPlayer"
            @close="onClose"
            @saved="onClose"
        />
    </div>
</template>