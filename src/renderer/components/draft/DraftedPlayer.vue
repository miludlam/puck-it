<script setup lang="ts">
import { computed } from 'vue';
import { usePlayerStore } from '@/stores';
import { positionBadge } from '@/utils/draftTargets';

// Who a used pick took — read live from the roster, so potential stays current
const props = defineProps<{ playerId: number }>();
const playerStore = usePlayerStore();
const player = computed(() => playerStore.players.find(p => p.id === props.playerId) ?? null);
</script>

<template>
    <span v-if="player" class="inline-flex flex-wrap items-baseline justify-center gap-x-1.5 text-xs">
        <span class="text-slate-200">{{ player.first_name.charAt(0) }}. {{ player.last_name }}</span>
        <span class="px-1.5 rounded text-[10px] font-medium" :class="positionBadge(player.position)">{{ player.position }}</span>
        <span v-if="player.potential_level" class="text-slate-400">
            {{ player.potential_level }}<span v-if="player.potential_chance" class="text-slate-600"> ({{ player.potential_chance }})</span>
        </span>
    </span>
    <span v-else class="text-xs text-slate-500 italic">Used · no longer on the roster</span>
</template>
