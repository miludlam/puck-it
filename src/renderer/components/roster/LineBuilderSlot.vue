<script setup lang="ts">
import { LineLeague, Player } from "@/types";
import { computed, ref } from "vue";
import PlayerChip from './PlayerChip.vue';

const props = defineProps<{
    player: Player | null;
    slotKey: string;
    league: LineLeague;
}>();

const emit = defineEmits<{
    drop: [
        playerID: number,
        fromSlot: string | null
    ];
}>();

const isDragOver = ref(false);

const slotPositionGroup = computed(() => {
    if (props.slotKey.includes('-F')) return 'FWD';
    if (props.slotKey.includes('-D')) return 'DEF';
    if (props.slotKey.includes('-G')) return 'G';
    return 'ANY';
});

function onDragOver(event: DragEvent) {
    event.preventDefault();
    isDragOver.value = true;
}

function onDragLeave() {
    isDragOver.value = false;
}

function onDrop(event: DragEvent) {
    isDragOver.value = false;
    const raw = event.dataTransfer?.getData('text/plain');
    if (!raw) return;

    const { playerID, fromSlot, positionGroup } = JSON.parse(raw);

    if (!isValidDrop(positionGroup)) return;

    emit('drop', playerID, fromSlot);
}

function isValidDrop(positionGroup: string): boolean {
    if (slotPositionGroup.value === 'ANY') return true;
    return slotPositionGroup.value === positionGroup;
}
</script>

<template>
    <div
        class="rounded-lg border-2 border-dashed transition-colors min-h-[60px] flex items-center justify-center"
        :class="{
            'border-slate-600 bg-slate-800/30':           !isDragOver && !props.player,
            'border-slate-500 bg-slate-800':              !isDragOver && !!props.player,
            'border-[var(--team-primary)] bg-slate-800/50': isDragOver,
        }"
        @dragover="onDragOver"
        @dragleave="onDragLeave"
        @drop="onDrop"
    >
        <!-- Occupied -->
        <PlayerChip
            v-if="props.player"
            :player="props.player"
            :fromSlot="props.slotKey"
            class="w-full"
        />

        <!-- Empty -->
        <span v-else class="text-xs text-slate-600">
            {{ slotPositionGroup === 'ANY' ? 'Any' : slotPositionGroup }}
        </span>
    </div>
</template>
