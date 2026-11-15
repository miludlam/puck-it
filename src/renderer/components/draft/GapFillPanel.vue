<script setup lang="ts">
import { computed, ref } from 'vue';
import { useScoutedPlayerStore, useScoutStore } from '@/stores';
import { Scout, ScoutedPlayer } from '@/types';
import { leagueGaps, ScoutOption } from '@/utils/gapFill';

// Who to send where once scouts wrap up their assignments: unscouted Board prospects by
// league, with the best free scout for each (regional rating, then overall).
const scoutStore = useScoutStore();
const scoutedStore = useScoutedPlayerStore();

const shortlistCount = (id: number) => scoutedStore.forScout(id).length;
const gaps = computed(() => leagueGaps(scoutedStore.scoutedPlayers, scoutStore.hired, shortlistCount));
const freeScouts = computed(() => scoutStore.hired.filter(s => s.obligations_done));
const unscoutedCount = computed(() => gaps.value.reduce((n, g) => n + g.prospects.length, 0));

const open = ref(true);
const busy = ref(false);
const error = ref<string | null>(null);

const scoutLabel = (s: Scout) => `${s.first_name.charAt(0)}. ${s.last_name}`;
const best = (options: ScoutOption[]) => options[0] ?? null;

// Fill the scout's shortlist with this league's unscouted prospects, best CS rank first
async function assign(option: ScoutOption, prospects: ScoutedPlayer[]) {
    busy.value = true;
    error.value = null;
    try {
        for (const p of prospects.slice(0, option.room)) {
            await scoutedStore.update(p.id, { scout_id: option.scout.id });
        }
    } catch (e) {
        error.value = e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e);
    } finally {
        busy.value = false;
    }
}
</script>

<template>
    <section v-if="unscoutedCount" class="rounded-lg border border-slate-700/50 bg-slate-800/30">
        <button
            type="button"
            class="w-full flex flex-wrap items-baseline gap-x-3 px-4 py-2.5 text-left"
            @click="open = !open"
        >
            <span class="text-xs font-medium text-slate-400 uppercase tracking-wider">Gap-fill Scouting</span>
            <span class="text-xs text-slate-500">
                {{ unscoutedCount }} unscouted prospect{{ unscoutedCount === 1 ? '' : 's' }} ·
                <template v-if="freeScouts.length">
                    {{ freeScouts.length }} scout{{ freeScouts.length === 1 ? '' : 's' }} free:
                    {{ freeScouts.map(scoutLabel).join(', ') }}
                </template>
                <template v-else>no scouts free yet — mark them done on the Shortlists tab</template>
            </span>
            <span class="ml-auto text-xs text-slate-600">{{ open ? 'Hide' : 'Show' }}</span>
        </button>

        <div v-if="open" class="border-t border-slate-700/50 divide-y divide-slate-800">
            <div
                v-for="g in gaps"
                :key="g.league ?? 'none'"
                class="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-xs"
            >
                <span class="w-28 text-sm text-slate-200">{{ g.league ?? 'No league' }}</span>
                <span
                    class="w-40 text-slate-400"
                    :title="g.prospects.map(p => `${p.cs_rank ?? '—'}  ${p.first_name} ${p.last_name}`).join('\n')"
                >
                    {{ g.prospects.length }} unscouted
                    <span v-if="g.prospects[0]?.cs_rank" class="text-slate-600">· top CS {{ g.prospects[0].cs_rank }}</span>
                </span>

                <template v-if="best(g.options)?.free">
                    <span class="text-slate-300">
                        Send <span class="font-medium text-slate-100">{{ scoutLabel(best(g.options)!.scout) }}</span>
                        <span class="text-emerald-400">{{ best(g.options)!.rating ?? 'unrated' }}</span>
                        <span v-if="!g.league" class="text-slate-600">(by overall {{ best(g.options)!.scout.overall_rating ?? '—' }})</span>
                    </span>
                    <span
                        v-if="g.options[1]?.free"
                        class="text-slate-500"
                    >or {{ scoutLabel(g.options[1].scout) }} {{ g.options[1].rating ?? 'unrated' }}</span>
                    <button
                        type="button"
                        :disabled="busy"
                        class="ml-auto px-2.5 py-1 rounded-md border border-slate-600 text-slate-300 hover:bg-slate-800 disabled:opacity-40 transition-colors"
                        :title="`Adds up to ${best(g.options)!.room} to their shortlist, best CS rank first`"
                        @click="assign(best(g.options)!, g.prospects)"
                    >Assign {{ Math.min(g.prospects.length, best(g.options)!.room) }}</button>
                </template>
                <span v-else-if="best(g.options)" class="text-slate-500">
                    No free scout · best once free: {{ scoutLabel(best(g.options)!.scout) }} {{ best(g.options)!.rating ?? 'unrated' }}
                </span>
                <span v-else class="text-slate-600">Every scout's shortlist is full</span>
            </div>
            <p v-if="error" class="px-4 py-2 text-xs text-rose-400">{{ error }}</p>
        </div>
    </section>
</template>
