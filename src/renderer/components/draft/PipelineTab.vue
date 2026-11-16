<script setup lang="ts">
import { POTENTIAL_TIERS } from '@/utils/draftTargets';
import { computed } from 'vue';
import { usePlayerStore } from '@/stores';
import { Player, PotentialLevel } from '@/types';

const playerStore = usePlayerStore();

type PositionGroup = 'FWD' | 'DEF' | 'G';

function group(p: Player): PositionGroup {
    if (['C', 'LW', 'RW'].includes(p.position)) return 'FWD';
    if (['LD', 'RD'].includes(p.position)) return 'DEF';
    return 'G';
}

const fwdPotentials: PotentialLevel[] = POTENTIAL_TIERS.FWD;
const defPotentials: PotentialLevel[] = POTENTIAL_TIERS.DEF;
const goaliePotentials: PotentialLevel[] = POTENTIAL_TIERS.G;

const sections: { label: string; group: PositionGroup; potentials: PotentialLevel[] }[] = [
    { label: 'Forwards',  group: 'FWD', potentials: fwdPotentials    },
    { label: 'Defence',   group: 'DEF', potentials: defPotentials     },
    { label: 'Goalies',   group: 'G',   potentials: goaliePotentials  },
];

const pipeline = computed(() => {
    const its = playerStore.its;
    return sections.map(section => {
        const players = its.filter(p => group(p) === section.group);
        const byPotential = section.potentials
            .map(pot => ({
                potential: pot,
                players: players.filter(p => p.potential_level === pot)
                    .sort((a, b) => b.overall - a.overall),
            }))
            .filter(row => row.players.length > 0);

        return { ...section, byPotential, total: players.length };
    });
});
</script>

<template>
    <div class="space-y-8">
        <div v-if="playerStore.its.length === 0"
             class="rounded-xl border border-dashed border-slate-700 p-12 text-center text-slate-500 text-sm">
            No prospects in the system yet.
        </div>

        <div v-for="section in pipeline" v-else :key="section.group">
            <div class="flex items-center gap-3 mb-3">
                <h2 class="text-sm font-medium text-slate-400 uppercase tracking-wider">{{ section.label }}</h2>
                <span class="text-xs text-slate-600">{{ section.total }} total</span>
            </div>

            <div v-if="section.byPotential.length === 0" class="text-xs text-slate-600 pl-1">None</div>

            <div v-else class="space-y-2">
                <div
                    v-for="row in section.byPotential"
                    :key="row.potential"
                    class="flex items-start gap-4 px-4 py-3 bg-slate-800/40 border border-slate-700/50 rounded-lg"
                >
                    <div class="w-32 flex-shrink-0">
                        <span class="text-xs font-medium text-slate-300">{{ row.potential }}</span>
                        <span class="ml-2 text-xs text-slate-600">×{{ row.players.length }}</span>
                    </div>
                    <div class="flex flex-wrap gap-1.5">
                        <span
                            v-for="p in row.players"
                            :key="p.id"
                            class="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-700/60 rounded text-xs text-slate-300"
                            :title="`${p.first_name} ${p.last_name} · OVR ${p.overall} · Age ${p.age}`"
                        >
                            <span class="text-slate-500">{{ p.position }}</span>
                            {{ p.first_name.charAt(0) }}. {{ p.last_name }}
                            <span class="text-slate-500">{{ p.overall }}</span>
                        </span>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
