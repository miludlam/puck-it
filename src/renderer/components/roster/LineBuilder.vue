<script setup lang="ts">
import { computed, ref } from "vue";
import { LineLeague, Player, Position } from "@/types";
import { usePlayerStore } from '@/stores';
import LineBuilderLines from './LineBuilderLines.vue';
import LineBuilderPool from './LineBuilderPool.vue';
import LineBuilderScratches from "./LineBuilderScratches.vue";
import LineBuilderIR from './LineBuilderIR.vue';
import ContextMenu, { ContextMenuItem } from '@/components/ContextMenu.vue';
import PlayerModal from './PlayerModal.vue';
import { MAX_ROSTER, MIN_ROSTER } from '@/utils/league';

const playerStore = usePlayerStore();

const props = defineProps<{
    league: LineLeague;
}>();

const confirmClear = ref(false);

// Injured reserve shares one slot key; any number of players can hold it
const irSlot = computed(() => `${props.league}-IR`);
const isIR = (slot: string | null) => slot === irSlot.value;

const irPlayers = computed(() =>
    playerStore.players
        .filter(p => p.line_league === props.league && isIR(p.line_slot))
        .sort((a, b) => b.overall - a.overall)
);

// Unslotted players, highest overall first
const poolPlayers = computed(() =>
    playerStore.players
        .filter(p => p.roster_league === props.league && p.line_slot === null)
        .sort((a, b) => b.overall - a.overall)
);

const slotMap = computed(() => {
    const map: Record<string, Player | null> = {};
    for (const player of playerStore.players) {
        if (player.line_slot && player.line_league === props.league && !isIR(player.line_slot)) {
            map[player.line_slot] = player;
        }
    }
    return map;
});

// NHL roster: everyone on lines, scratched or in the pool. IR and injured players don't count
// (matches the header).
const nhlRoster = computed(() => {
    if (props.league !== 'NHL') return null;
    const counted = (p: Player | null): p is Player => !!p && p.status !== 'Injured';
    const slotted = Object.values(slotMap.value).filter(counted);
    const scratched = slotted.filter(p => scratchSlots.value.includes(p.line_slot!)).length;
    const pool = poolPlayers.value.filter(counted).length;
    const count = playerStore.nhlRosterCount;
    const state = count > MAX_ROSTER ? 'over' : count < MIN_ROSTER ? 'under' : 'ok';
    return {
        count,
        state,
        dressed: slotted.length - scratched,
        scratched,
        pool,
        ir: irPlayers.value.length,
    };
});

// Slot keys in line order — mirrors the layouts in LineBuilderLines / LineBuilderScratches
function slotsFor(position: Position): string[] {
    const l = props.league;
    if (position === 'G') return [`${l}-G1`, `${l}-G2`];
    if (position === 'LD' || position === 'RD') return [1, 2, 3].map(n => `${l}-D${n}-${position}`);
    return [1, 2, 3, 4].map(n => `${l}-F${n}-${position}`);
}
const scratchSlots = computed(() =>
    props.league === 'NHL' ? [1, 2, 3].map(n => `${props.league}-S${n}`) : []
);

const firstOpen = (slots: string[]) => slots.find(s => !slotMap.value[s]) ?? null;

// Right-click menus
const menu = ref<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);
const viewingPlayer = ref<Player | null>(null);

const viewInfoItem = (player: Player): ContextMenuItem => ({
    label: 'View Player Info',
    action: () => { viewingPlayer.value = player; },
});

// Promote AHL → NHL / demote NHL → AHL; the player leaves their line and lands in the other pool
const moveItem = (player: Player): ContextMenuItem => {
    const to: LineLeague = props.league === 'NHL' ? 'AHL' : 'NHL';
    return {
        label: to === 'NHL' ? 'Promote to NHL' : 'Demote to AHL',
        hint: to === 'AHL' && player.waiver_eligible ? 'waivers' : undefined,
        action: () => playerStore.update(player.id, { roster_league: to, line_slot: null, line_league: null }),
    };
};

const irItem = (player: Player, fromSlot: string | null): ContextMenuItem => ({
    label: 'Place on IR',
    action: () => handleDrop(player.id, fromSlot, irSlot.value),
});

// Slotted players (lines and scratches)
function openSlotMenu(player: Player, event: MouseEvent) {
    menu.value = {
        x: event.clientX,
        y: event.clientY,
        items: [irItem(player, player.line_slot), moveItem(player), viewInfoItem(player)],
    };
}

// Injured reserve players
function openIRMenu(player: Player, event: MouseEvent) {
    const items: ContextMenuItem[] = [{
        label: 'Activate from IR',
        action: () => handleDrop(player.id, irSlot.value, null),
    }];
    items.push(moveItem(player), viewInfoItem(player));
    menu.value = { x: event.clientX, y: event.clientY, items };
}

function openPoolMenu(player: Player, event: MouseEvent) {
    const positions = [player.position, player.position2].filter((p): p is Position => !!p);
    const items: ContextMenuItem[] = positions.map(position => {
        const slot = firstOpen(slotsFor(position));
        return {
            label: `Slot as ${position}`,
            disabled: !slot,
            hint: slot ? undefined : 'full',
            action: () => handleDrop(player.id, null, slot),
        };
    });

    if (scratchSlots.value.length) {
        const slot = firstOpen(scratchSlots.value);
        items.push({
            label: 'Scratch player',
            disabled: !slot,
            hint: slot ? undefined : 'full',
            action: () => handleDrop(player.id, null, slot),
        });
    }

    items.push(irItem(player, null), moveItem(player), viewInfoItem(player));
    menu.value = { x: event.clientX, y: event.clientY, items };
}

async function handleDrop(playerID: number, fromSlot: string | null, toSlot: string | null) {
    const player = playerStore.players.find(p => p.id === playerID);
    if (!player) return;

    // IR holds any number of players, so nobody is displaced into or out of it
    const occupant = toSlot && !isIR(toSlot) ? slotMap.value[toSlot] ?? null : null;
    const occupantSlot = isIR(fromSlot) ? null : fromSlot;

    await playerStore.assignSlot(
        playerID,
        toSlot,
        toSlot ? props.league : null,
        occupant?.id ?? null,
        occupantSlot,
        occupantSlot ? props.league : null,
    );

    // Keep the player's status in step with IR (the header roster count skips Injured)
    if (isIR(toSlot) && player.status !== 'Injured') {
        await playerStore.update(playerID, { status: 'Injured' });
    } else if (isIR(fromSlot) && !isIR(toSlot) && player.status === 'Injured') {
        await playerStore.update(playerID, { status: 'Active' });
    }
}
</script>

<template>
    <div>
        <div class="flex items-center justify-between mb-4">
            <div
                v-if="nhlRoster"
                class="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2 rounded-lg mb-4 text-xs"
                :class="{
                    'bg-emerald-500/10 text-emerald-400': nhlRoster.state === 'ok',
                    'bg-amber-500/10 text-amber-400':     nhlRoster.state === 'under',
                    'bg-rose-500/10 text-rose-400':       nhlRoster.state === 'over',
                }"
            >
                <span class="font-medium">NHL Roster: {{ nhlRoster.count }} / {{ MAX_ROSTER }}</span>
                <span v-if="nhlRoster.state === 'over'" class="font-medium">
                    Over by {{ nhlRoster.count - MAX_ROSTER }} — demote or place on IR
                </span>
                <span v-else-if="nhlRoster.state === 'under'" class="font-medium">
                    Under the {{ MIN_ROSTER }}-player minimum by {{ MIN_ROSTER - nhlRoster.count }}
                </span>
                <span class="text-slate-500">
                    {{ nhlRoster.dressed }} dressed · {{ nhlRoster.scratched }} scratched · {{ nhlRoster.pool }} in pool<template v-if="nhlRoster.ir"> · {{ nhlRoster.ir }} on IR (not counted)</template>
                </span>
            </div>
            <div v-else />

            <!-- Clear Lines button -->
            <button
                class="px-3 py-1.5 rounded-lg text-xs border border-slate-600 text-slate-400 hover:text-rose-400 hover:border-rose-400 transition-colors"
                @click="confirmClear = true"
            >
                Clear lines
            </button>
        </div>
        <div class="flex gap-6 p-6">

            <!-- Left column — lines + scratches -->
            <div class="flex-1 space-y-6">
                <LineBuilderLines
                    :slotMap="slotMap"
                    :league="league"
                    @drop="(playerID, fromSlot, toSlot) => handleDrop(playerID, fromSlot, toSlot)"
                    @contextmenu="openSlotMenu"
                />

                <LineBuilderScratches
                    v-if="league === 'NHL'"
                    :slotMap="slotMap"
                    :league="league"
                    @drop="(playerID, fromSlot, toSlot) => handleDrop(playerID, fromSlot, toSlot)"
                    @contextmenu="openSlotMenu"
                />

                <LineBuilderIR
                    :players="irPlayers"
                    :slotKey="irSlot"
                    :league="league"
                    @drop="(playerID, fromSlot) => handleDrop(playerID, fromSlot, irSlot)"
                    @contextmenu="openIRMenu"
                />
            </div>

            <!-- Right column — pool -->
            <div class="w-64 flex-shrink-0">
                <h3 class="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Pool</h3>
                <LineBuilderPool
                    :players="poolPlayers"
                    :league="league"
                    @drop="(playerID, fromSlot) => handleDrop(playerID, fromSlot, null)"
                    @contextmenu="openPoolMenu"
                />
            </div>

        </div>
        <ContextMenu
            v-if="menu"
            :x="menu.x"
            :y="menu.y"
            :items="menu.items"
            @close="menu = null"
        />
        <PlayerModal
            v-if="viewingPlayer"
            :player="viewingPlayer"
            readonly
            @close="viewingPlayer = null"
        />
        <!-- Confirmation -->
        <div v-if="confirmClear" class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
            <div class="bg-slate-900 border border-slate-700 rounded-xl p-6 w-80">
                <h3 class="text-base font-semibold mb-2">Clear all lines?</h3>
                <p class="text-sm text-slate-400 mb-5">
                    All {{ props.league }} players will be moved back to the pool. IR stays as is.
                </p>
                <div class="flex gap-3">
                    <button
                        class="flex-1 px-4 py-2 rounded-lg text-sm border border-slate-600 text-slate-400 hover:text-slate-200 transition-colors"
                        @click="confirmClear = false"
                    >Cancel</button>
                    <button
                        class="flex-1 px-4 py-2 rounded-lg text-sm bg-rose-600 hover:bg-rose-500 text-white font-medium transition-colors"
                        @click="async () => { await playerStore.clearLines(props.league); confirmClear = false; }"
                    >Clear</button>
                </div>
            </div>
        </div>
    </div>
</template>
