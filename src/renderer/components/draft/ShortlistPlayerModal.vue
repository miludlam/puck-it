<script setup lang="ts">
import { computed, nextTick, reactive, ref } from 'vue';
import { useScoutedPlayerStore, useScoutStore } from '@/stores';
import { Position, ScoutedPlayer, SHORTLIST_MAX } from '@/types';

// Quick add to a scout's shortlist. Creates a board prospect with just the identity
// fields; everything else is refined later on the Board.
const props = defineProps<{
    scoutId?: number;        // preselected scout when adding
    player?: ScoutedPlayer;  // edit an existing shortlist entry
}>();
const emit = defineEmits<{ close: [] }>();

const scoutStore = useScoutStore();
const scoutedStore = useScoutedPlayerStore();

const inputClass = "w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-sky-500";
const positions: Position[] = ['C', 'LW', 'RW', 'LD', 'RD', 'G'];

const blank = () => ({
    first_name: '',
    last_name: '',
    position: null as Position | null,
    age: 17 as number | null, // typical draft-eligible age
    cs_rank: null as number | null,
});

const form = reactive({
    scout_id: props.player?.scout_id ?? props.scoutId ?? null as number | null,
    first_name: props.player?.first_name ?? '',
    last_name: props.player?.last_name ?? '',
    position: props.player?.position ?? null as Position | null,
    age: props.player?.age ?? 17 as number | null,
    cs_rank: props.player?.cs_rank ?? null as number | null,
});

const error = ref<string | null>(null);
const added = ref(0); // count for "Save & add another" feedback
const firstNameInput = ref<HTMLInputElement | null>(null);

const shortlistCount = (scoutID: number) => scoutedStore.forScout(scoutID).length;

// A scout is full unless the player being edited is already on their list
const isFull = (scoutID: number) =>
    shortlistCount(scoutID) >= SHORTLIST_MAX && props.player?.scout_id !== scoutID;

const canSave = computed(() =>
    form.scout_id !== null
    && !isFull(form.scout_id)
    && !!form.position
    && !!(form.first_name.trim() || form.last_name.trim())
);

// Empty number inputs come back as '' from v-model.number
const numberOrNull = (v: unknown) => typeof v === 'number' && !Number.isNaN(v) ? v : null;

async function save(addAnother = false) {
    if (!canSave.value) return;
    error.value = null;
    // League defaults to the scout's region. Prospects never change leagues, so a known
    // one is kept when the scout changes or is removed.
    const league = props.player?.junior_league ?? null;
    const payload = {
        scout_id: form.scout_id,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        position: form.position,
        age: numberOrNull(form.age),
        cs_rank: numberOrNull(form.cs_rank),
        junior_league: league ?? scoutStore.regionOf(form.scout_id),
    };
    try {
        if (props.player) {
            await scoutedStore.update(props.player.id, payload);
        } else {
            await scoutedStore.add(payload);
        }
    } catch (e) {
        error.value = e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e);
        return;
    }

    if (!addAnother) return emit('close');

    // Keep the scout, clear the player, ready for the next entry
    added.value++;
    Object.assign(form, blank());
    await nextTick();
    firstNameInput.value?.focus();
}

// Leaves the prospect on the Board, just unassigned from this scout
async function removeFromShortlist() {
    await scoutedStore.update(props.player!.id, { scout_id: null });
    emit('close');
}
</script>

<template>
    <div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" @keydown.esc="emit('close')">
        <form class="bg-slate-900 rounded-xl w-[480px] max-h-[90vh] overflow-y-auto p-6 space-y-5" @submit.prevent="save()">
            <div class="flex items-center justify-between">
                <h2 class="text-base font-semibold">{{ props.player ? 'Edit Shortlist Player' : 'Add to Shortlist' }}</h2>
                <button type="button" class="text-slate-400 hover:text-slate-200 transition-colors" @click="emit('close')">✕</button>
            </div>

            <div>
                <label class="block text-xs text-slate-400 mb-1">Scout</label>
                <select v-model="form.scout_id" :class="inputClass">
                    <option :value="null" disabled>Select a scout</option>
                    <option v-for="s in scoutStore.hired" :key="s.id" :value="s.id" :disabled="isFull(s.id)">
                        {{ s.first_name }} {{ s.last_name }}{{ s.region ? ` — ${s.region}` : '' }}
                        ({{ shortlistCount(s.id) }}/{{ SHORTLIST_MAX }}{{ isFull(s.id) ? ', full' : '' }})
                    </option>
                </select>
            </div>

            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="block text-xs text-slate-400 mb-1">First name</label>
                    <input ref="firstNameInput" v-model="form.first_name" :class="inputClass" autofocus />
                </div>
                <div>
                    <label class="block text-xs text-slate-400 mb-1">Last name</label>
                    <input v-model="form.last_name" :class="inputClass" />
                </div>
                <div>
                    <label class="block text-xs text-slate-400 mb-1">Position</label>
                    <select v-model="form.position" :class="inputClass">
                        <option :value="null" disabled>—</option>
                        <option v-for="p in positions" :key="p" :value="p">{{ p }}</option>
                    </select>
                </div>
                <div>
                    <label class="block text-xs text-slate-400 mb-1">Age</label>
                    <input v-model.number="form.age" type="number" min="15" max="25" :class="inputClass" />
                </div>
                <div>
                    <label class="block text-xs text-slate-400 mb-1">CS Ranking</label>
                    <input v-model.number="form.cs_rank" type="number" min="1" placeholder="Projected pick" :class="inputClass" />
                </div>
            </div>

            <p class="text-xs text-slate-500">Also added to the Board, where you can refine type, potential and more.</p>
            <p v-if="error" class="text-xs text-rose-400">{{ error }}</p>

            <div class="flex items-center gap-3 pt-3 border-t border-slate-700">
                <button
                    v-if="props.player"
                    type="button"
                    class="text-xs text-rose-400 hover:text-rose-300 transition-colors"
                    title="Unassign from this scout — the prospect stays on the Board"
                    @click="removeFromShortlist"
                >Remove from shortlist</button>
                <span v-else-if="added" class="text-xs text-emerald-400">{{ added }} added</span>

                <button type="button" class="ml-auto px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-slate-200 transition-colors" @click="emit('close')">
                    {{ added ? 'Done' : 'Cancel' }}
                </button>
                <button
                    v-if="!props.player"
                    type="button"
                    :disabled="!canSave"
                    class="px-4 py-2 rounded-lg text-sm font-medium border border-slate-600 text-slate-200 hover:bg-slate-800 disabled:opacity-40 transition-colors"
                    @click="save(true)"
                >Save &amp; add another</button>
                <button
                    type="submit"
                    :disabled="!canSave"
                    class="px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:opacity-90 disabled:opacity-40"
                    :style="{ backgroundColor: 'var(--team-primary)', color: 'var(--team-on-primary)' }"
                >Save</button>
            </div>
        </form>
    </div>
</template>
