<script setup lang="ts">
import { ref } from 'vue';
import { useFranchiseStore } from '@/stores';

const franchiseStore = useFranchiseStore();

const season = ref<number>(franchiseStore.franchise?.season ?? 25);
const selectedTeamID = ref<string | null>(franchiseStore.franchise?.team_id ?? null);

// CSS constants
const inputClass = "w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-sky-500";
const formGroupHeader = "text-xs font-medium text-slate-500 uppercase tracking-wider mb-3";

const emit = defineEmits<{
    close: [];
}>();

async function save() {
    if (selectedTeamID.value && season.value) {
        await franchiseStore.update(selectedTeamID.value, season.value);
        emit('close');
    }
}
</script>

<template>
    <!-- Modal overlay -->
    <div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
        <!-- Modal panel -->
        <div class="bg-slate-900 rounded-xl w-[640px] max-h-[90vh] overflow-y-auto p-6 space-y-6">
            <!-- Header -->
            <div class="flex items-center justify-between">
                <h2 class="text-base font-semibold">Franchise Setup</h2>
                <button
                    class="text-slate-400 hover:text-slate-200 transition-colors"
                    @click="emit('close')"
                >✕</button>
            </div>
            <!-- Group 1: Team & Season -->
            <div>
                <h3 :class="formGroupHeader">Team & Season</h3>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-xs text-slate-400 mb-1">Team</label>
                        <select v-model="selectedTeamID" :class="inputClass">
                            <option v-for="team in franchiseStore.teams" :key="team.id" :value="team.id">{{ team.name }}</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs text-slate-400 mb-1">Season</label>
                        <input
                            v-model.number="season"
                            type="number"
                            min="25"
                            step="1"
                            :class="inputClass"
                        />
                    </div>
                </div>
            </div>
            <!-- Footer buttons -->
            <div class="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-700">
                <button
                    class="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-slate-200 transition-colors"
                    @click="emit('close')"
                >Cancel</button>
                <button
                    class="px-4 py-2 rounded-lg text-sm bg-sky-600 hover:bg-sky-500 text-white font-medium transition-colors"
                    @click="save"
                >Save</button>
            </div>
        </div>
    </div>
</template>
