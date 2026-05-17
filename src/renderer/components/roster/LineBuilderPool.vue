<script setup lang="ts">
import { LineLeague, Player } from "@/types";
import { ref } from "vue";
import PlayerChip from './PlayerChip.vue';

const props = defineProps<{
    players: Player[];
    league: LineLeague;
}>();

const emit = defineEmits<{
    drop: [
        playerID: number,
        fromSlot: string | null
    ];
}>();

const isDragOver = ref(false);

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

    const { playerID, fromSlot } = JSON.parse(raw);

    emit('drop', playerID, fromSlot);
}
</script>

<template>
    <div
        class="flex flex-col gap-2 p-3 rounded-lg border-2 border-dashed min-h-[200px] transition-colors overflow-y-auto"
        :class="{
            'border-slate-700 bg-slate-800/20': !isDragOver,
            'border-[var(--team-primary)] bg-slate-800/40': isDragOver,
        }"
        @dragover="onDragOver"
        @dragleave="onDragLeave"
        @drop="onDrop"
    >
        <p v-if="!props.players.length" class="text-xs text-slate-600 text-center mt-4">
            All players assigned
        </p>
        <PlayerChip
            v-for="player in props.players"
            :key="player.id"
            :player="player"
            :fromSlot="null"
        />
    </div>
</template>
