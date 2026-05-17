<script setup lang="ts">
import { computed } from "vue";
import { LineLeague, Player } from "@/types";
import LineBuilderSlot from "./LineBuilderSlot.vue";

const props = defineProps<{
    slotMap: Record<string, Player | null>;
    league: LineLeague;
}>();

const emit = defineEmits<{
    drop: [
        playerID: number,
        fromSlot: string | null,
        toSlot: string,
    ];
}>();

const scratches = computed(() => [
    `${props.league}-S1`,
    `${props.league}-S2`,
    `${props.league}-S3`,
]);
</script>

<template>
    <div class="space-y-4">

        <!-- Scratches -->
        <div>
            <h3 class="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Scratches</h3>
            <div class="flex gap-2">
                <LineBuilderSlot
                    v-for="slotKey in scratches"
                    :key="slotKey"
                    :slotKey="slotKey"
                    :player="slotMap[slotKey] ?? null"
                    :league="league"
                    class="flex-1"
                    @drop="(playerID, fromSlot) => emit('drop', playerID, fromSlot, slotKey)"
                />
            </div>
        </div>

    </div>
</template>
