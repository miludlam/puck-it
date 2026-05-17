<script setup lang="ts">
import { computed } from "vue";
import { LineLeague, Player } from "@/types";
import { usePlayerStore } from '@/stores';
import LineBuilderLines from './LineBuilderLines.vue';
import LineBuilderPool from './LineBuilderPool.vue';
import LineBuilderScratches from "./LineBuilderScratches.vue";

const playerStore = usePlayerStore();

const props = defineProps<{
    league: LineLeague;
}>();

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
</template>
