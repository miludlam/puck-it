<script setup lang="ts">
// Scouting focus to select, and the in-game date it runs through (from the NHL 26
// spreadsheet's Scouting tab). Month/day only — phases repeat every season.
interface ScoutPhase {
    focus: string;
    through: string | null; // null = no set date
    notes?: string[];
}

const PHASES: ScoutPhase[] = [
    { focus: 'Playing Style',        through: 'Oct 1' },
    { focus: 'Strength & Weak',      through: 'Nov 10' },
    { focus: 'Skills Assess',        through: 'Jan 22' },
    { focus: 'Pot & Comp',           through: 'May 31 – Jun 1' },
    { focus: 'Pot & Comp 2',         through: 'Jun 23', notes: ['Fill gaps'] },
    { focus: 'Interviews',           through: null,     notes: ['PS > Ready', 'PS > PS', 'Sk > Str'] },
    { focus: 'Draft',                through: 'Jun 23' },
];
</script>

<template>
    <div>
        <h3 class="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">Scouting Phases</h3>
        <ol class="flex flex-wrap gap-2">
            <li
                v-for="(phase, i) in PHASES"
                :key="phase.focus"
                class="flex items-start gap-2 px-3 py-2 bg-slate-800/40 border border-slate-700/50 rounded-lg"
            >
                <span class="text-[10px] font-medium text-slate-600 mt-0.5">{{ i + 1 }}</span>
                <div class="leading-tight">
                    <p class="text-xs font-medium text-slate-200">{{ phase.focus }}</p>
                    <p class="text-[10px] text-slate-500 mt-0.5">
                        {{ phase.through ? `through ${phase.through}` : 'no set date' }}
                    </p>
                    <p v-if="phase.notes" class="text-[10px] text-sky-300/80 mt-0.5">
                        {{ phase.notes.join(' · ') }}
                    </p>
                </div>
            </li>
        </ol>
    </div>
</template>
