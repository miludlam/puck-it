<script setup lang="ts">
import { Player } from '@/types';

const props = defineProps<{
    player: Player;
    fromSlot: string | null;
}>();

function onDragStart(event: DragEvent) {
    event.dataTransfer?.setData('text/plain', JSON.stringify({
        playerId: props.player.id,
        fromSlot: props.fromSlot,
    }));
}
</script>

<template>
    <div
        draggable="true"
        @dragstart="onDragStart"
        class="flex items-center gap-2 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg cursor-grab active:cursor-grabbing select-none"
    >
        <!-- Position badge -->
        <span
            class="px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0"
            :class="{
                'bg-sky-500/20 text-sky-300':     ['C', 'LW', 'RW'].includes(props.player.position),
                'bg-amber-500/20 text-amber-300': ['LD', 'RD'].includes(props.player.position),
                'bg-emerald-500/20 text-emerald-300': props.player.position === 'G',
            }"
        >
            {{ props.player.position }}{{ props.player.position2 ? `/${props.player.position2}` : '' }}
        </span>

        <!-- Name -->
        <span class="text-sm text-slate-200 flex-1 truncate">
            {{ props.player.first_name.charAt(0) }}. {{ props.player.last_name }}
        </span>

        <!-- Overall -->
        <span class="text-xs font-semibold text-slate-400 flex-shrink-0">
            {{ props.player.overall }}
        </span>
    </div>
</template>
