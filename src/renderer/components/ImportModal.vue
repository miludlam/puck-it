<script setup lang="ts">
import { computed, ref } from 'vue';
import { useContractStore, usePlayerStore, useScoutedPlayerStore, useScoutStore } from '@/stores';
import { MAX_SCOUTS } from '@/types';
import { formatCap } from '@/utils/league';
import {
    ImportKind, ImportResult, parsePlayers, parseScouts, PlayerImport, ScoutImport, template,
} from '@/utils/csvImport';

const props = defineProps<{ kind: ImportKind }>();
const emit = defineEmits<{ close: [] }>();

const playerStore = usePlayerStore();
const scoutStore = useScoutStore();
const contractStore = useContractStore();
const scoutedPlayerStore = useScoutedPlayerStore();

const noun = props.kind === 'players' ? 'player' : 'scout';
const plural = (n: number) => `${n} ${noun}${n === 1 ? '' : 's'}`;

const text = ref('');
const fileName = ref<string | null>(null);
const replace = ref(false);
const busy = ref(false);
const error = ref<string | null>(null);

const result = computed<ImportResult<PlayerImport | ScoutImport> | null>(() => {
    if (!text.value.trim()) return null;
    return props.kind === 'players' ? parsePlayers(text.value) : parseScouts(text.value);
});

const nameKey = (first: string, last: string) => `${first} ${last}`.trim().toLowerCase();
const existingNames = computed(() => new Set(props.kind === 'players'
    ? playerStore.players.map(p => nameKey(p.first_name, p.last_name))
    : scoutStore.scouts.map(s => nameKey(s.first_name, s.last_name))));

// Rows as previewed: adding someone already here is allowed, but flagged
const rows = computed(() => (result.value?.rows ?? []).map(row => {
    const data = row.data;
    const duplicate = !replace.value && !!data && existingNames.value.has(nameKey(data.first_name, data.last_name));
    return { ...row, warnings: duplicate ? [...row.warnings, 'Already here, would be added again'] : row.warnings };
}));
const ready = computed(() => rows.value.filter(r => r.data));
const problems = computed(() => rows.value.filter(r => !r.data));
const currentCount = computed(() => props.kind === 'players' ? playerStore.players.length : scoutStore.scouts.length);

// Hired scouts can't pass the staff limit
const hiredAfter = computed(() => {
    if (props.kind !== 'scouts') return 0;
    const imported = ready.value.filter(r => (r.data as ScoutImport).status === 'hired').length;
    return imported + (replace.value ? 0 : scoutStore.hired.length);
});
const overLimit = computed(() => props.kind === 'scouts' && hiredAfter.value > MAX_SCOUTS);

async function chooseFile(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    fileName.value = file.name;
    text.value = await file.text();
    (event.target as HTMLInputElement).value = '';
}

function clearSource() {
    text.value = '';
    fileName.value = null;
}

function saveTemplate() {
    const url = URL.createObjectURL(new Blob([template(props.kind)], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `puck-it-${props.kind}-template.csv`;
    link.click();
    URL.revokeObjectURL(url);
}

async function runImport() {
    error.value = null;
    busy.value = true;
    try {
        const data = ready.value.map(r => r.data!);
        if (props.kind === 'players') {
            await playerStore.importAll(data as PlayerImport[], replace.value);
            // Replacing drops re-signing talks with the old roster
            if (replace.value) await contractStore.load();
        } else {
            await scoutStore.importAll(data as ScoutImport[], replace.value);
            // Replaced scouts' shortlists lose their scout
            if (replace.value) await scoutedPlayerStore.load();
        }
        emit('close');
    } catch (e) {
        error.value = String((e as Error).message ?? e).replace(/^.*Error: /, '');
    } finally {
        busy.value = false;
    }
}

function summary(data: PlayerImport | ScoutImport) {
    if (props.kind === 'players') {
        const p = data as PlayerImport;
        const potential = p.potential_level ? `${p.potential_level} (${p.potential_chance})` : '—';
        const contract = p.aav ? `${formatCap(p.aav)} × ${p.years_remaining}` : '—';
        return [p.roster_league, p.position2 ? `${p.position}/${p.position2}` : p.position, String(p.overall), potential, p.player_type || '—', contract];
    }
    const s = data as ScoutImport;
    return [
        s.status === 'offered' ? 'Offered' : 'Hired',
        s.overall_rating ?? '—',
        s.region ?? '—',
        `${Object.keys(s.region_ratings).length} regions rated`,
    ];
}
const previewColumns = props.kind === 'players'
    ? ['League', 'Pos', 'OVR', 'Potential', 'Type', 'Contract']
    : ['Status', 'Overall', 'Region', 'Ratings'];

const inputClass = "w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-sky-500";
const formGroupHeader = "text-xs font-medium text-slate-500 uppercase tracking-wider mb-3";
</script>

<template>
    <div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
        <div class="bg-slate-900 rounded-xl w-[880px] max-h-[90vh] overflow-y-auto p-6 space-y-6">
            <div class="flex items-center justify-between">
                <h2 class="text-base font-semibold">Import {{ noun }}s</h2>
                <button class="text-slate-400 hover:text-slate-200 transition-colors" aria-label="Close" @click="emit('close')">✕</button>
            </div>

            <!-- Source -->
            <div>
                <h3 :class="formGroupHeader">Source</h3>
                <div class="flex items-center gap-3 mb-3">
                    <label class="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-sky-500">
                        Choose CSV file…
                        <input type="file" accept=".csv,.tsv,.txt,text/csv" class="sr-only" @change="chooseFile" />
                    </label>
                    <button class="text-sm text-sky-400 hover:text-sky-300" @click="saveTemplate">Save template</button>
                    <span v-if="fileName" class="text-sm text-slate-400">
                        {{ fileName }}
                        <button class="ml-1 text-slate-500 hover:text-slate-300" aria-label="Clear file" @click="clearSource">✕</button>
                    </span>
                </div>
                <textarea
                    v-if="!fileName"
                    v-model="text"
                    rows="5"
                    :class="[inputClass, 'font-mono text-xs']"
                    aria-label="Rows to import"
                    placeholder="…or paste rows copied from a spreadsheet, including the header row"
                />
                <p class="mt-2 text-xs text-slate-500">
                    Columns are matched by header name, in any order; others are ignored.
                    <template v-if="props.kind === 'players'">Required: League, First, Last, Position, Overall, Age. Potential can be "Top 6 (Exact)" or split into Potential and Chance. Salary is in $M.</template>
                    <template v-else>Required: First, Last. One column per region for its rating (A+ to E); Assignment End as MM-DD.</template>
                </p>
            </div>

            <!-- Preview -->
            <template v-if="result">
                <p v-if="result.missing.length" class="text-sm text-rose-400">
                    Missing column{{ result.missing.length === 1 ? '' : 's' }}: {{ result.missing.join(', ') }}. Check the header row.
                </p>
                <p v-else-if="!rows.length" class="text-sm text-slate-400">No rows below the header.</p>
                <div v-else class="space-y-4">
                    <p class="text-sm text-slate-300">
                        <span class="text-emerald-400 font-medium">{{ ready.length }} ready</span>
                        <template v-if="problems.length"> · <span class="text-rose-400 font-medium">{{ problems.length }} with problems</span>, skipped unless fixed</template>
                    </p>

                    <ul v-if="problems.length" class="space-y-1 max-h-40 overflow-y-auto rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2">
                        <li v-for="row in problems" :key="row.line" class="text-xs">
                            <span class="text-slate-500">Row {{ row.line }}</span>
                            <span class="text-slate-200 mx-1.5">{{ row.label }}</span>
                            <span class="text-rose-300">{{ row.errors.join(' · ') }}</span>
                        </li>
                    </ul>

                    <div v-if="ready.length" class="max-h-72 overflow-auto rounded-lg border border-slate-700">
                        <table class="w-full text-xs">
                            <thead class="sticky top-0 bg-slate-800 text-slate-400">
                                <tr>
                                    <th class="px-3 py-1.5 text-left font-medium">Row</th>
                                    <th class="px-3 py-1.5 text-left font-medium">Name</th>
                                    <th v-for="col in previewColumns" :key="col" class="px-3 py-1.5 text-left font-medium">{{ col }}</th>
                                    <th class="px-3 py-1.5 text-left font-medium">Notes</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="row in ready" :key="row.line" class="border-t border-slate-800">
                                    <td class="px-3 py-1.5 text-slate-500">{{ row.line }}</td>
                                    <td class="px-3 py-1.5 text-slate-100">{{ row.label }}</td>
                                    <td v-for="(cell, i) in summary(row.data!)" :key="i" class="px-3 py-1.5 text-slate-300">{{ cell }}</td>
                                    <td class="px-3 py-1.5 text-amber-400">{{ row.warnings.join(' · ') }}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <!-- Mode -->
                    <fieldset>
                        <legend :class="formGroupHeader">Existing {{ noun }}s ({{ currentCount }})</legend>
                        <div class="space-y-2">
                            <label class="flex items-start gap-2 text-sm cursor-pointer">
                                <input v-model="replace" type="radio" :value="false" class="mt-1 accent-sky-500" />
                                <span><span class="text-slate-100">Add to them</span></span>
                            </label>
                            <label class="flex items-start gap-2 text-sm cursor-pointer">
                                <input v-model="replace" type="radio" :value="true" class="mt-1 accent-sky-500" />
                                <span>
                                    <span class="text-slate-100">Replace them</span>
                                    <span class="block text-xs text-slate-400">
                                        <template v-if="props.kind === 'players'">Removes all {{ plural(currentCount) }}, with their line slots and re-signing talks. Trade history is kept.</template>
                                        <template v-else>Removes all {{ plural(currentCount) }}. Their shortlisted prospects stay on the Board without a scout.</template>
                                    </span>
                                </span>
                            </label>
                        </div>
                    </fieldset>

                    <p v-if="overLimit" class="text-sm text-rose-400">
                        That makes {{ hiredAfter }} hired scouts; the limit is {{ MAX_SCOUTS }}. Mark some as Offered or remove rows.
                    </p>
                </div>
            </template>

            <p v-if="error" class="text-sm text-rose-400">{{ error }}</p>

            <div class="flex justify-end gap-3 pt-4 border-t border-slate-700">
                <button class="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-slate-200 transition-colors" @click="emit('close')">Cancel</button>
                <button
                    class="px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:opacity-90 disabled:opacity-40"
                    :style="{ backgroundColor: 'var(--team-primary)', color: 'var(--team-on-primary)' }"
                    :disabled="busy || !ready.length || overLimit"
                    @click="runImport"
                >{{ replace ? 'Replace with' : 'Import' }} {{ plural(ready.length) }}</button>
            </div>
        </div>
    </div>
</template>
