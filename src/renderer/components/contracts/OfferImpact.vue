<script setup lang="ts">
import { ImpactNote, ImpactTone } from '@/utils/contracts';

defineProps<{ notes: ImpactNote[] }>();

const TONE: Record<ImpactTone, { icon: string; class: string }> = {
    good: { icon: '✓', class: 'text-emerald-400' },
    warn: { icon: '!', class: 'text-amber-400' },
    bad:  { icon: '✕', class: 'text-rose-400' },
    info: { icon: '·', class: 'text-slate-500' },
};
</script>

<template>
    <ul class="space-y-1 rounded-lg bg-slate-800/40 border border-slate-700/50 px-3 py-2.5">
        <li v-for="note in notes" :key="note.text" class="flex gap-2 text-xs text-slate-300">
            <span class="w-3 flex-shrink-0 text-center font-bold" :class="TONE[note.tone].class">{{ TONE[note.tone].icon }}</span>
            <span>{{ note.text }}</span>
        </li>
    </ul>
</template>
