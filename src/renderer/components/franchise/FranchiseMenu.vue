<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useFranchiseStore } from '@/stores';
import type { FranchiseFile } from '@/types';

const franchiseStore = useFranchiseStore();

const emit = defineEmits<{
    close: [];
    setup: []; // edit the open franchise's name, team and season
}>();

const files = ref<FranchiseFile[]>([]);
const error = ref<string | null>(null);
const busy = ref(false);
const confirmDelete = ref<string | null>(null);
const creating = ref(false);
const newName = ref('');
const nameInput = ref<HTMLInputElement | null>(null);

async function refresh() {
    files.value = await window.db['library:list']() as FranchiseFile[];
}

const teamName = (id: string | null) => franchiseStore.teams.find(t => t.id === id)?.name ?? null;
const label = (f: FranchiseFile) => f.name ?? teamName(f.team_id) ?? 'New franchise';
const seasonLabel = (season: number | null) => season === null ? null : `${season}/${String(season + 1).slice(-2)}`;

function ago(iso: string) {
    const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} hr ago`;
    const days = Math.round(hours / 24);
    if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
    return new Date(iso).toLocaleDateString();
}

function detail(f: FranchiseFile) {
    if (f.newer) return 'Saved by a newer version of Puck It';
    if (f.unreadable) return "Couldn't be read";
    const parts = [f.name ? teamName(f.team_id) : null, seasonLabel(f.season), f.current ? 'open now' : ago(f.modified)];
    return parts.filter(Boolean).join(' · ');
}

// Every store loads fresh from the new file on reload
async function run(action: () => Promise<unknown>, reload: boolean) {
    error.value = null;
    busy.value = true;
    try {
        const done = await action();
        if (reload && done !== false) window.location.reload();
        else await refresh();
    } catch (e) {
        // IPC errors arrive prefixed with the channel ("Error invoking remote method ...: Error: ...")
        error.value = String((e as Error).message ?? e).replace(/^.*Error: /, '');
    } finally {
        busy.value = false;
    }
}

const switchTo = (f: FranchiseFile) => {
    if (!f.current && !f.newer && !f.unreadable) run(() => window.db['library:open'](f.file), true);
};
const exportFile = (f: FranchiseFile) => run(() => window.db['library:export'](f.file, label(f)), false);
const importFile = () => run(() => window.db['library:import'](), true);
const remove = (f: FranchiseFile) => run(async () => {
    confirmDelete.value = null;
    await window.db['library:delete'](f.file);
}, false);
const create = () => run(() => window.db['library:create'](newName.value.trim() || null), true);

async function startCreate() {
    creating.value = true;
    await nextTick();
    nameInput.value?.focus();
}

const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') emit('close'); };
onMounted(() => {
    refresh();
    window.addEventListener('keydown', onKey);
});
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));

const actionClass = "w-full px-3 py-1.5 text-left text-xs text-slate-200 hover:bg-slate-700 transition-colors disabled:text-slate-600 disabled:hover:bg-transparent";
</script>

<template>
    <!-- Click-away layer -->
    <div class="fixed inset-0 z-40" @mousedown="emit('close')" />
    <div class="absolute left-0 top-full mt-2 z-50 w-80 py-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl shadow-black/40 no-drag">
        <div class="px-3 pt-1.5 pb-1 text-[10px] font-medium text-slate-500 uppercase tracking-wider">Franchises</div>
        <div class="max-h-80 overflow-y-auto">
            <div
                v-for="f in files"
                :key="f.file"
                class="group flex items-center gap-2 px-3 py-1.5"
                :class="f.current ? 'bg-slate-700/50' : f.newer || f.unreadable ? '' : 'hover:bg-slate-700 cursor-pointer'"
                @click="switchTo(f)"
            >
                <span
                    class="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    :style="{ backgroundColor: f.current ? 'var(--team-primary)' : 'transparent' }"
                />
                <div class="flex-1 min-w-0">
                    <div class="text-xs truncate" :class="f.newer || f.unreadable ? 'text-slate-500' : 'text-slate-100'">{{ label(f) }}</div>
                    <div class="text-[11px] truncate" :class="f.newer || f.unreadable ? 'text-amber-400/80' : 'text-slate-500'">{{ detail(f) }}</div>
                </div>
                <template v-if="confirmDelete === f.file">
                    <span class="text-[11px] text-slate-400">Move to Trash?</span>
                    <button class="text-[11px] text-rose-400 hover:text-rose-300" :disabled="busy" @click.stop="remove(f)">Delete</button>
                    <button class="text-[11px] text-slate-400 hover:text-slate-200" @click.stop="confirmDelete = null">Keep</button>
                </template>
                <template v-else>
                    <button
                        v-if="!f.unreadable"
                        class="text-[11px] text-slate-400 hover:text-slate-200 opacity-0 group-hover:opacity-100 transition-opacity"
                        :disabled="busy"
                        @click.stop="exportFile(f)"
                    >Export</button>
                    <button
                        v-if="!f.current"
                        class="text-[11px] text-slate-400 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity"
                        @click.stop="confirmDelete = f.file"
                    >Delete</button>
                </template>
            </div>
        </div>

        <div class="my-1 border-t border-slate-700" />
        <form v-if="creating" class="flex items-center gap-2 px-3 py-1.5" @submit.prevent="create">
            <input
                ref="nameInput"
                v-model="newName"
                type="text"
                placeholder="Name (optional)"
                class="flex-1 min-w-0 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
            />
            <button type="submit" class="text-xs text-sky-400 hover:text-sky-300" :disabled="busy">Create</button>
            <button type="button" class="text-xs text-slate-400 hover:text-slate-200" @click="creating = false">Cancel</button>
        </form>
        <button v-else :class="actionClass" :disabled="busy" @click="startCreate">New franchise…</button>
        <button :class="actionClass" :disabled="busy" @click="importFile">Import…</button>
        <button :class="actionClass" @click="emit('setup')">Name, team &amp; season…</button>

        <p v-if="error" class="px-3 py-1.5 text-[11px] text-rose-400">{{ error }}</p>
    </div>
</template>
