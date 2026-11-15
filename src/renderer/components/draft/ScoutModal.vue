<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useScoutStore } from '@/stores';
import { JuniorLeague, Scout, ScoutRating, ScoutStatus } from '@/types';

const scoutStore = useScoutStore();

// `status` sets the starting status for a new scout (ignored when editing)
const props = defineProps<{ scout?: Scout; status?: ScoutStatus }>();
const emit = defineEmits<{ close: []; saved: [] }>();

const inputClass = "w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-sky-500";
const showDeleteConfirm = ref(false);

const ratings: ScoutRating[] = [
    'A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'E',
];

const regions: JuniorLeague[] = [
    'OHL', 'QMJHL', 'WHL', 'US Central', 'US East', 'US West',
    'Allsvenskan', 'Liiga', 'SHL', 'DEL', 'Extraliga', 'ICE', 'NLA', 'Russia', 'ROW',
];

const formGroupHeader = "text-xs font-medium text-slate-500 uppercase tracking-wider mb-3";

const form = reactive({
    first_name: props.scout?.first_name ?? '',
    last_name: props.scout?.last_name ?? '',
    overall_rating: props.scout?.overall_rating ?? null as ScoutRating | null,
    region: props.scout?.region ?? null as JuniorLeague | null,
    region_locked: props.scout?.region_locked ?? false,
    status: props.scout?.status ?? props.status ?? 'hired' as ScoutStatus,
    assignment_end: props.scout?.assignment_end ?? null,
    region_ratings: { ...(props.scout?.region_ratings ?? {}) } as Partial<Record<JuniorLeague, ScoutRating>>,
});

async function save() {
    const payload = {
        ...form,
        region_ratings: Object.fromEntries(
            Object.entries(form.region_ratings).filter(([, v]) => v !== undefined)
        ),
    };
    if (props.scout) {
        await scoutStore.update(props.scout.id, payload);
    } else {
        await scoutStore.add(payload);
    }
    emit('saved');
    emit('close');
}

async function remove() {
    await scoutStore.remove(props.scout!.id);
    emit('close');
}
</script>

<template>
    <div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
        <div class="bg-slate-900 rounded-xl w-[560px] max-h-[90vh] overflow-y-auto p-6 space-y-6">
            <div class="flex items-center justify-between">
                <h2 class="text-base font-semibold">
                    {{ props.scout ? 'Edit Scout' : form.status === 'offered' ? 'Offer Contract' : 'Add Scout' }}
                </h2>
                <button class="text-slate-400 hover:text-slate-200 transition-colors" @click="emit('close')">✕</button>
            </div>

            <!-- Identity -->
            <div>
                <h3 :class="formGroupHeader">Identity</h3>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-xs text-slate-400 mb-1">First name</label>
                        <input v-model="form.first_name" :class="inputClass" />
                    </div>
                    <div>
                        <label class="block text-xs text-slate-400 mb-1">Last name</label>
                        <input v-model="form.last_name" :class="inputClass" />
                    </div>
                    <div>
                        <label class="block text-xs text-slate-400 mb-1">Overall Rating</label>
                        <select v-model="form.overall_rating" :class="inputClass">
                            <option :value="null">—</option>
                            <option v-for="r in ratings" :key="r" :value="r">{{ r }}</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs text-slate-400 mb-1">Status</label>
                        <select v-model="form.status" :class="inputClass">
                            <option value="hired">On payroll</option>
                            <option value="offered">Contract offered</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs text-slate-400 mb-1">
                            {{ form.status === 'offered' ? 'Target Region' : 'Assigned Region' }}
                        </label>
                        <select v-model="form.region" :class="inputClass">
                            <option :value="null">— Unassigned —</option>
                            <option v-for="region in regions" :key="region" :value="region">{{ region }}</option>
                        </select>
                    </div>
                </div>
            </div>

            <!-- Regional Ratings -->
            <div>
                <h3 :class="formGroupHeader">Regional Ratings</h3>
                <div class="grid grid-cols-3 gap-3">
                    <div v-for="region in regions" :key="region">
                        <label class="block text-xs text-slate-400 mb-1">{{ region }}</label>
                        <select v-model="form.region_ratings[region]" :class="inputClass">
                            <option :value="undefined">—</option>
                            <option v-for="r in ratings" :key="r" :value="r">{{ r }}</option>
                        </select>
                    </div>
                </div>
            </div>

            <!-- Delete -->
            <div v-if="props.scout" class="pt-3 border-t border-slate-700">
                <div v-if="!showDeleteConfirm">
                    <button class="text-xs text-rose-400 hover:text-rose-300 transition-colors" @click="showDeleteConfirm = true">Delete scout</button>
                </div>
                <div v-else class="flex items-center gap-3">
                    <span class="text-xs text-slate-400">Are you sure?</span>
                    <button class="px-3 py-1.5 rounded-lg text-xs bg-rose-600 hover:bg-rose-700 text-white transition-colors" @click="remove">Confirm</button>
                    <button class="px-3 py-1.5 rounded-lg text-xs border border-slate-600 text-slate-400 hover:text-slate-200 transition-colors" @click="showDeleteConfirm = false">Cancel</button>
                </div>
            </div>

            <!-- Footer -->
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
