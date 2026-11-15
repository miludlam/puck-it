<script setup lang="ts">
import { LineLeague, Player } from "@/types";
import { ref } from "vue";
import PlayerChip from './PlayerChip.vue';

// Injured reserve: any number of players, outside the lineup and the roster count
const props = defineProps<{
    players: Player[];
    slotKey: string;
    league: LineLeague;
}>();

const emit = defineEmits<{
    drop: [
        playerID: number,
        fromSlot: string | null
    ];
    contextmenu: [
        player: Player,
        event: MouseEvent
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
    if (fromSlot === props.slotKey) return;

    emit('drop', playerID, fromSlot);
}
</script>

<template>
    <div>
        <h3 class="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
            IR <span class="normal-case tracking-normal text-slate-600">· doesn't count toward the roster</span>
        </h3>
        <div
            class="flex flex-wrap gap-2 p-2 rounded-lg border-2 border-dashed min-h-[60px] transition-colors"
            :class="{
                'border-rose-900/60 bg-rose-950/10': !isDragOver,
                'border-[var(--team-primary)] bg-slate-800/40': isDragOver,
            }"
            @dragover="onDragOver"
            @dragleave="onDragLeave"
            @drop="onDrop"
        >
            <span v-if="!props.players.length" class="m-auto text-xs text-slate-600">No injured players</span>
            <PlayerChip
                v-for="player in props.players"
                :key="player.id"
                :player="player"
                :fromSlot="props.slotKey"
                class="w-48"
                @contextmenu.prevent="emit('contextmenu', player, $event)"
            />
        </div>
    </div>
</template>
