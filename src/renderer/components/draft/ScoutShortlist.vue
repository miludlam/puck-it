<script setup lang="ts">
import { computed, ref } from 'vue';
import { useFranchiseStore, useScoutedPlayerStore } from '@/stores';
import { ScoutedPlayer, SHORTLIST_MAX } from '@/types';
import ShortlistPlayerModal from '@/components/draft/ShortlistPlayerModal.vue';

const props = defineProps<{ scoutId: number }>();

const scoutedStore = useScoutedPlayerStore();
const franchiseStore = useFranchiseStore();

const players = computed(() => scoutedStore.forScout(props.scoutId));
const isFull = computed(() => players.value.length >= SHORTLIST_MAX);

// CS rank ≈ projected pick, so round = ceil(rank / teams in the league)
const teamCount = computed(() => franchiseStore.teams?.length || 32);
const projectedRound = (rank: number) => Math.ceil(rank / teamCount.value);

// undefined = closed, null = adding, player = editing
const modalPlayer = ref<ScoutedPlayer | null | undefined>(undefined);
</script>

<template>
    <div class="space-y-2" @click.stop>
        <table v-if="players.length" class="w-full text-xs border-collapse">
            <thead>
                <tr class="text-slate-500 border-b border-slate-700/60">
                    <th class="px-2 py-1 text-left font-medium w-14">CS #</th>
                    <th class="px-2 py-1 text-left font-medium">Name</th>
                    <th class="px-2 py-1 text-left font-medium w-12">Pos</th>
                    <th class="px-2 py-1 text-left font-medium w-12">Age</th>
                    <th class="px-2 py-1 text-left font-medium w-14">Proj.</th>
                    <th class="px-2 py-1 text-left font-medium w-12" title="Overall, once refined on the Board">Ovr</th>
                </tr>
            </thead>
            <tbody>
                <tr
                    v-for="player in players"
                    :key="player.id"
                    class="border-b border-slate-800/60 cursor-pointer hover:bg-slate-800/60 transition-colors"
                    @click="modalPlayer = player"
                >
                    <td class="px-2 py-1 font-medium text-slate-300">{{ player.cs_rank ?? '—' }}</td>
                    <td class="px-2 py-1 text-slate-200">{{ player.first_name }} {{ player.last_name }}</td>
                    <td class="px-2 py-1 text-slate-400">{{ player.position ?? '—' }}</td>
                    <td class="px-2 py-1 text-slate-400">{{ player.age ?? '—' }}</td>
                    <td class="px-2 py-1 text-slate-500">{{ player.cs_rank ? `Rd ${projectedRound(player.cs_rank)}` : '—' }}</td>
                    <td class="px-2 py-1 text-slate-500">{{ player.overall ?? '—' }}</td>
                </tr>
            </tbody>
        </table>
        <p v-else class="text-xs text-slate-600">No players shortlisted.</p>

        <div class="flex items-center gap-3">
            <button
                :disabled="isFull"
                class="px-3 py-1 rounded text-xs font-medium bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-slate-200 transition-colors"
                @click="modalPlayer = null"
            >+ Add player</button>
            <span class="text-xs" :class="isFull ? 'text-amber-400' : 'text-slate-600'">
                {{ players.length }} / {{ SHORTLIST_MAX }}{{ isFull ? ' — full' : '' }}
            </span>
        </div>

        <ShortlistPlayerModal
            v-if="modalPlayer !== undefined"
            :scout-id="props.scoutId"
            :player="modalPlayer ?? undefined"
            @close="modalPlayer = undefined"
        />
    </div>
</template>
