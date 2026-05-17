<script setup lang="ts">
import { LineLeague, Player } from "@/types";
import { computed } from "vue";
import LineBuilderSlot from './LineBuilderSlot.vue';

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

const forwardLines = computed(() => [
    { label: 'Line 1', slots: [`${props.league}-F1-LW`, `${props.league}-F1-C`, `${props.league}-F1-RW`] },
    { label: 'Line 2', slots: [`${props.league}-F2-LW`, `${props.league}-F2-C`, `${props.league}-F2-RW`] },
    { label: 'Line 3', slots: [`${props.league}-F3-LW`, `${props.league}-F3-C`, `${props.league}-F3-RW`] },
    { label: 'Line 4', slots: [`${props.league}-F4-LW`, `${props.league}-F4-C`, `${props.league}-F4-RW`] },
]);

const defencePairs = computed(() => [
    { label: 'Pair 1', slots: [`${props.league}-D1-LD`, `${props.league}-D1-RD`] },
    { label: 'Pair 2', slots: [`${props.league}-D2-LD`, `${props.league}-D2-RD`] },
    { label: 'Pair 3', slots: [`${props.league}-D3-LD`, `${props.league}-D3-RD`] },
]);

const goalies = computed(() => [`${props.league}-G1`, `${props.league}-G2`]);
</script>

<template>
    <div class="space-y-4">

        <!-- Forward lines -->
        <div>
            <h3 class="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Forwards</h3>
            <div class="space-y-2">
                <div v-for="line in forwardLines" :key="line.label" class="flex items-center gap-2">
                    <span class="text-xs text-slate-600 w-12 flex-shrink-0">{{ line.label }}</span>
                    <div class="flex gap-2 flex-1">
                        <LineBuilderSlot
                            v-for="slotKey in line.slots"
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
        </div>

        <!-- Defence pairs -->
        <div>
            <h3 class="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Defence</h3>
            <div class="space-y-2">
                <div v-for="pair in defencePairs" :key="pair.label" class="flex items-center gap-2">
                    <span class="text-xs text-slate-600 w-12 flex-shrink-0">{{ pair.label }}</span>
                    <div class="flex gap-2 flex-1">
                        <LineBuilderSlot
                            v-for="slotKey in pair.slots"
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
        </div>

        <!-- Goalies -->
        <div>
            <h3 class="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Goalies</h3>
            <div class="flex gap-2">
                <LineBuilderSlot
                    v-for="slotKey in goalies"
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
