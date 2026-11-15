<script setup lang="ts">
import { computed, ref } from 'vue';
import { useDraftSettingsStore, useFranchiseStore } from '@/stores';
import { DraftQuality, DraftSettings } from '@/types';
import { DRAFT_QUALITIES, qualityFor, rollD100 } from '@/utils/draftSettings';

// Season settings that randomize every year: Draft Class Quality and Generated Prospect Quality
const franchiseStore = useFranchiseStore();
const settingsStore = useDraftSettingsStore();

const normalizeYear = (y: number) => y < 100 ? 2000 + y : y;
const season = computed(() => franchiseStore.franchise?.season ?? null);
const current = computed(() => season.value === null ? null : settingsStore.forSeason(season.value));

type Field = 'class' | 'prospect';
const FIELDS: { key: Field; label: string }[] = [
    { key: 'class', label: 'Draft Class Quality' },
    { key: 'prospect', label: 'Generated Prospect Quality' },
];

const quality = (s: DraftSettings | null, field: Field) =>
    s ? (field === 'class' ? s.class_quality : s.prospect_quality) : null;
const roll = (s: DraftSettings | null, field: Field) =>
    s ? (field === 'class' ? s.class_roll : s.prospect_roll) : null;

const qualityClass: Record<DraftQuality, string> = {
    Low: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    Medium: 'bg-slate-700/50 text-slate-200 border-slate-600',
    High: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
};

function save(patch: Partial<Omit<DraftSettings, 'season' | 'updated_at'>>) {
    if (season.value === null) return;
    const base = current.value;
    return settingsStore.save({
        season: season.value,
        class_quality: base?.class_quality ?? null,
        class_roll: base?.class_roll ?? null,
        prospect_quality: base?.prospect_quality ?? null,
        prospect_roll: base?.prospect_roll ?? null,
        ...patch,
    });
}

const rollFields = (fields: Field[]) => {
    const patch: Partial<DraftSettings> = {};
    for (const field of fields) {
        const value = rollD100();
        if (field === 'class') Object.assign(patch, { class_roll: value, class_quality: qualityFor(value) });
        else Object.assign(patch, { prospect_roll: value, prospect_quality: qualityFor(value) });
    }
    confirmReroll.value = false;
    return save(patch);
};

// Set by hand (e.g. to match the game) — no roll recorded
const setManually = (field: Field, value: DraftQuality) =>
    save(field === 'class' ? { class_quality: value, class_roll: null } : { prospect_quality: value, prospect_roll: null });

const unrolled = computed(() => FIELDS.filter(f => !quality(current.value, f.key)).map(f => f.key));
const confirmReroll = ref(false);

// Earlier seasons, for the hover history
const history = computed(() =>
    settingsStore.settings
        .filter(s => s.season !== season.value)
        .map(s => `${normalizeYear(s.season + 1)}: Class ${s.class_quality ?? '—'} · Prospects ${s.prospect_quality ?? '—'}`)
        .join('\n')
);
</script>

<template>
    <div v-if="season !== null" class="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <span class="text-slate-500 cursor-default" :title="history || 'No earlier seasons recorded'">
            {{ normalizeYear(season + 1) }} draft
        </span>

        <div v-for="f in FIELDS" :key="f.key" class="flex items-center gap-1.5">
            <span class="text-slate-400">{{ f.label }}</span>
            <select
                :value="quality(current, f.key) ?? ''"
                class="px-1.5 py-0.5 rounded border text-xs font-medium focus:outline-none appearance-none cursor-pointer"
                :class="quality(current, f.key) ? qualityClass[quality(current, f.key)!] : 'bg-slate-900 border-slate-700 text-slate-500'"
                :title="roll(current, f.key) !== null ? `Rolled ${roll(current, f.key)} of 100` : 'Set by hand — or roll'"
                @change="setManually(f.key, ($event.target as HTMLSelectElement).value as DraftQuality)"
            >
                <option value="" disabled>Not set</option>
                <option v-for="q in DRAFT_QUALITIES" :key="q" :value="q">{{ q }}</option>
            </select>
            <span v-if="roll(current, f.key) !== null" class="text-slate-600">({{ roll(current, f.key) }})</span>
        </div>

        <button
            v-if="unrolled.length"
            class="px-2.5 py-1 rounded-md border border-slate-600 text-slate-300 hover:bg-slate-800 transition-colors"
            title="d100: 1–25 Low, 26–75 Medium, 76–100 High"
            @click="rollFields(unrolled)"
        >Roll {{ unrolled.length === 2 ? 'both' : '' }}</button>
        <template v-else>
            <template v-if="confirmReroll">
                <span class="text-slate-400">Re-roll this season's settings?</span>
                <button class="px-2.5 py-1 rounded-md bg-amber-600 hover:bg-amber-700 text-white" @click="rollFields(['class', 'prospect'])">Re-roll</button>
                <button class="text-slate-500 hover:text-slate-300" @click="confirmReroll = false">Cancel</button>
            </template>
            <button
                v-else
                class="text-slate-500 hover:text-slate-300 transition-colors"
                title="d100: 1–25 Low, 26–75 Medium, 76–100 High"
                @click="confirmReroll = true"
            >Re-roll</button>
        </template>
    </div>
</template>
