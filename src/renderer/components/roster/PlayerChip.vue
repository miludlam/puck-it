<script setup lang="ts">
import { Player } from '@/types';
import { positionBadge } from '@/utils/draftTargets';

const props = defineProps<{
    player: Player;
    fromSlot: string | null;
}>();

function getPositionGroup(position: string): string {
    if (['C', 'LW', 'RW'].includes(position)) return 'FWD';
    if (['LD', 'RD'].includes(position)) return 'DEF';
    return 'G';
}

function onDragStart(event: DragEvent) {
    event.dataTransfer?.setData('text/plain', JSON.stringify({
        playerID: props.player.id,
        fromSlot: props.fromSlot,
        positionGroup: getPositionGroup(props.player.position),
    }));
}
</script>

<template>
    <div
        draggable="true"
        @dragstart="onDragStart"
        class="flex items-center gap-2 px-3 py-2 bg-slate-800 border rounded-lg cursor-grab active:cursor-grabbing select-none"
        :style="{ borderColor: 'var(--team-primary)' }"
    >
        <!-- Position badge -->
        <span
            class="px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0"
            :class="positionBadge(props.player.position)"
        >
            {{ props.player.position }}{{ props.player.position2 ? `/${props.player.position2}` : '' }}
        </span>

        <!-- Name, with age and potential beneath -->
        <div class="flex-1 min-w-0 leading-tight">
            <p class="text-sm text-slate-200 truncate">
                {{ props.player.first_name.charAt(0) }}. {{ props.player.last_name }}
            </p>
            <p class="text-[10px] text-slate-500 truncate">
                {{ props.player.age }} · {{ props.player.potential_level }}
                <span class="text-slate-600">({{ props.player.potential_chance }})</span>
            </p>
        </div>

        <!-- Player type -->
        <span class="text-xs text-slate-500 flex-shrink-0">
            {{ props.player.player_type }}
        </span>

        <!-- Overall -->
        <span class="text-xs font-semibold text-slate-400 flex-shrink-0">
            {{ props.player.overall }}
        </span>
    </div>
</template>
