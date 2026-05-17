<script setup lang="ts">
import { computed, ref } from "vue";
import { LineLeague, Player } from "@/types";
import { usePlayerStore } from '@/stores';
import LineBuilderLines from './LineBuilderLines.vue';
import LineBuilderPool from './LineBuilderPool.vue';
import LineBuilderScratches from "./LineBuilderScratches.vue";

const playerStore = usePlayerStore();

const props = defineProps<{
    league: LineLeague;
}>();

const confirmClear = ref(false);

const poolPlayers = computed(() =>
    playerStore.players.filter(p =>
        p.roster_league === props.league && p.line_slot === null
    )
);

const slotMap = computed(() => {
    const map: Record<string, Player | null> = {};
    for (const player of playerStore.players) {
        if (player.line_slot && player.line_league === props.league) {
            map[player.line_slot] = player;
        }
    }
    return map;
});

const nhlSlottedCount = computed(() =>
    props.league === 'NHL'
        ? playerStore.players.filter(p => p.line_slot !== null && p.line_league === 'NHL').length
        : null
);

async function handleDrop(playerID: number, fromSlot: string | null, toSlot: string | null) {
    const player = playerStore.players.find(p => p.id === playerID);
    if (!player) return;

    const occupant = toSlot ? slotMap.value[toSlot] ?? null : null;

    await playerStore.assignSlot(
        playerID,
        toSlot,
        toSlot ? props.league : null,
        occupant?.id ?? null,
        fromSlot,
        fromSlot ? props.league : null,
    );
}
</script>

<template>
    <div>
        <div class="flex items-center justify-between mb-4">
            <div
                v-if="props.league === 'NHL' && nhlSlottedCount !== null"
                class="flex items-center justify-between px-4 py-2 rounded-lg mb-4 text-xs font-medium"
                :class="{
                'bg-emerald-500/10 text-emerald-400': nhlSlottedCount <= 20,
                'bg-amber-500/10 text-amber-400':     nhlSlottedCount > 20 && nhlSlottedCount < 23,
                'bg-rose-500/10 text-rose-400':       nhlSlottedCount >= 23,
            }"
            >
                <span>NHL Roster: {{ nhlSlottedCount }} / 23</span>
                <span v-if="nhlSlottedCount >= 23">Roster full</span>
            </div>
            <div v-else />

            <!-- Clear Lines button -->
            <button
                class="px-3 py-1.5 rounded-lg text-xs border border-slate-600 text-slate-400 hover:text-rose-400 hover:border-rose-400 transition-colors"
                @click="confirmClear = true"
            >
                Clear lines
            </button>
        </div>
        <div class="flex gap-6 p-6">

            <!-- Left column — lines + scratches -->
            <div class="flex-1 space-y-6">
                <LineBuilderLines
                    :slotMap="slotMap"
                    :league="league"
                    @drop="(playerID, fromSlot, toSlot) => handleDrop(playerID, fromSlot, toSlot)"
                />

                <LineBuilderScratches
                    v-if="league === 'NHL'"
                    :slotMap="slotMap"
                    :league="league"
                    @drop="(playerID, fromSlot, toSlot) => handleDrop(playerID, fromSlot, toSlot)"
                />
            </div>

            <!-- Right column — pool -->
            <div class="w-64 flex-shrink-0">
                <h3 class="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Pool</h3>
                <LineBuilderPool
                    :players="poolPlayers"
                    :league="league"
                    @drop="(playerID, fromSlot) => handleDrop(playerID, fromSlot, null)"
                />
            </div>

        </div>
        <!-- Confirmation -->
        <div v-if="confirmClear" class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
            <div class="bg-slate-900 border border-slate-700 rounded-xl p-6 w-80">
                <h3 class="text-base font-semibold mb-2">Clear all lines?</h3>
                <p class="text-sm text-slate-400 mb-5">
                    All {{ props.league }} players will be moved back to the pool.
                </p>
                <div class="flex gap-3">
                    <button
                        class="flex-1 px-4 py-2 rounded-lg text-sm border border-slate-600 text-slate-400 hover:text-slate-200 transition-colors"
                        @click="confirmClear = false"
                    >Cancel</button>
                    <button
                        class="flex-1 px-4 py-2 rounded-lg text-sm bg-rose-600 hover:bg-rose-500 text-white font-medium transition-colors"
                        @click="async () => { await playerStore.clearLines(props.league); confirmClear = false; }"
                    >Clear</button>
                </div>
            </div>
        </div>
    </div>
</template>
