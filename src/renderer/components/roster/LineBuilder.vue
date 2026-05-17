<script setup lang="ts">
import { computed } from "vue";
import { LineLeague, Player } from "@/types";
import { usePlayerStore } from '@/stores';
import LineBuilderLines from './LineBuilderLines.vue';
import LineBuilderPool from './LineBuilderPool.vue';

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

async function handleDrop(playerID: number, fromSlot: string | null, toSlot: string | null) {
    const player = playerStore.players.find(p => p.id === playerID);
    if (!player) return;

    // Who currently occupies the target slot?
    const occupant = toSlot ? slotMap.value[toSlot] ?? null : null;

    // Assign player to target slot
    await playerStore.update(playerID, {
        line_slot: toSlot,
        line_league: toSlot ? props.league : null,
    });

    // If there was an occupant, send them to where the dragged player came from
    if (occupant) {
        await playerStore.update(occupant.id, {
            line_slot: fromSlot,
            line_league: fromSlot ? props.league : null,
        });
    }
}
</script>

<template>
    <div class="flex gap-6 p-6">

        <!-- Left column — lines + scratches -->
        <div class="flex-1 space-y-6">
            <LineBuilderLines
                :slotMap="slotMap"
                :league="league"
                @drop="(playerID, fromSlot, toSlot) => handleDrop(playerID, fromSlot, toSlot)"
            />

            <!-- Scratches — NHL only, coming next -->
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
