<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { usePickStore, useFranchiseStore, usePlayerStore } from '@/stores';
import { DraftRound, Pick } from '@/types';

const pickStore = usePickStore();
const franchiseStore = useFranchiseStore();
const playerStore = usePlayerStore();

const props = defineProps<{ pick?: Pick }>();
const emit = defineEmits<{ close: []; saved: [] }>();

const inputClass = "w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-sky-500";
const showDeleteConfirm = ref(false);

const myTeamID = franchiseStore.franchise?.team_id ?? '';

const form = reactive({
    year: props.pick?.year ?? (franchiseStore.franchise?.season ?? 25) + 1,
    round: props.pick?.round ?? 1 as DraftRound,
    original_owner: props.pick?.original_owner ?? myTeamID,
    current_owner: props.pick?.current_owner ?? myTeamID,
    notes: props.pick?.notes ?? null as string | null,
    drafted_player_id: props.pick?.drafted_player_id ?? null as number | null,
});

// Who the pick took: young players (or whoever is set already), youngest first
const draftees = computed(() =>
    playerStore.players
        .filter(p => p.age <= 21 || p.id === form.drafted_player_id)
        .sort((a, b) => a.age - b.age || a.last_name.localeCompare(b.last_name))
);

const rounds: DraftRound[] = [1, 2, 3, 4, 5, 6, 7];
const roundLabel = (r: number) => ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th'][r - 1] ?? `${r}th`;

function normalizeYear(y: number): number {
    return y < 100 ? 2000 + y : y;
}

async function save() {
    const payload = { ...form, year: normalizeYear(form.year) };
    if (props.pick) {
        await pickStore.update(props.pick.id, payload);
    } else {
        const { drafted_player_id: _, ...fields } = payload;
        await pickStore.add(fields);
    }
    emit('saved');
    emit('close');
}

async function remove() {
    await pickStore.remove(props.pick!.id);
    emit('close');
}
</script>

<template>
    <div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
        <div class="bg-slate-900 rounded-xl w-[480px] p-6 space-y-5">
            <div class="flex items-center justify-between">
                <h2 class="text-base font-semibold">{{ props.pick ? 'Edit Pick' : 'Add Pick' }}</h2>
                <button class="text-slate-400 hover:text-slate-200 transition-colors" @click="emit('close')">✕</button>
            </div>

            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="block text-xs text-slate-400 mb-1">Year</label>
                    <input v-model.number="form.year" type="number" min="2025" max="2040" :class="inputClass" />
                </div>
                <div>
                    <label class="block text-xs text-slate-400 mb-1">Round</label>
                    <select v-model.number="form.round" :class="inputClass">
                        <option v-for="r in rounds" :key="r" :value="r">{{ roundLabel(r) }}</option>
                    </select>
                </div>
                <div>
                    <label class="block text-xs text-slate-400 mb-1">Original Owner</label>
                    <select v-model="form.original_owner" :class="inputClass">
                        <option v-for="team in franchiseStore.teams" :key="team.id" :value="team.id">
                            {{ team.name }}
                        </option>
                    </select>
                </div>
                <div>
                    <label class="block text-xs text-slate-400 mb-1">Current Owner</label>
                    <select v-model="form.current_owner" :class="inputClass">
                        <option v-for="team in franchiseStore.teams" :key="team.id" :value="team.id">
                            {{ team.name }}
                        </option>
                    </select>
                </div>
            </div>

            <div>
                <label class="block text-xs text-slate-400 mb-1">Notes</label>
                <input v-model="form.notes" :class="inputClass" placeholder="e.g. acquired via trade for M. Ludlam" />
            </div>

            <div v-if="props.pick">
                <label class="block text-xs text-slate-400 mb-1">Drafted player</label>
                <select v-model="form.drafted_player_id" :class="inputClass">
                    <option :value="null">Not used yet</option>
                    <option v-for="p in draftees" :key="p.id" :value="p.id">
                        {{ p.first_name }} {{ p.last_name }} · {{ p.position }} · {{ p.age }}{{ p.potential_level ? ` · ${p.potential_level}` : '' }}
                    </option>
                </select>
            </div>

            <div v-if="props.pick" class="pt-3 border-t border-slate-700">
                <div v-if="!showDeleteConfirm">
                    <button class="text-xs text-rose-400 hover:text-rose-300 transition-colors" @click="showDeleteConfirm = true">
                        Delete pick
                    </button>
                </div>
                <div v-else class="flex items-center gap-3">
                    <span class="text-xs text-slate-400">Are you sure?</span>
                    <button class="px-3 py-1.5 rounded-lg text-xs bg-rose-600 hover:bg-rose-700 text-white transition-colors" @click="remove">Confirm</button>
                    <button class="px-3 py-1.5 rounded-lg text-xs border border-slate-600 text-slate-400 hover:text-slate-200 transition-colors" @click="showDeleteConfirm = false">Cancel</button>
                </div>
            </div>

            <div class="flex justify-end gap-3 pt-3 border-t border-slate-700">
                <button class="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-slate-200 transition-colors" @click="emit('close')">Cancel</button>
                <button
                    class="px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:opacity-90"
                    :style="{ backgroundColor: 'var(--team-primary)', color: 'var(--team-on-primary)' }"
                    @click="save"
                >Save</button>
            </div>
        </div>
    </div>
</template>
