<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useCapStore, useFranchiseStore, usePickStore, usePlayerStore, useTradeStore } from '@/stores';
import {
    Clause, ContractType, IncomingPlayer, League, Pick, Player, PlayerType, Position,
    PotentialChance, PotentialLevel,
} from '@/types';
import { groupOf, POTENTIAL_TIERS } from '@/utils/draftTargets';
import { formatCap, MAX_CONTRACTS, MAX_EXEMPT_CONTRACTS } from '@/utils/league';
import { evaluateTradeBlock } from '@/utils/tradeBlock';
import { assessRoster } from '@/utils/rosterCore';
import { analyzeTrade, Verdict } from '@/utils/tradeAnalysis';

const props = defineProps<{ initialPlayerIds: number[]; initialPickIds: number[] }>();
const emit = defineEmits<{ executed: [] }>();

const franchiseStore = useFranchiseStore();
const playerStore = usePlayerStore();
const pickStore = usePickStore();
const tradeStore = useTradeStore();
const capStore = useCapStore();
// What our contracts can take up this season once retained salary is counted
const capLimit = computed(() => capStore.current - capStore.currentRetained);

const inputClass = "bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-sky-500";
const sectionHeader = "text-xs font-medium text-slate-500 uppercase tracking-wider mb-2";

const positions: Position[] = ['C', 'LW', 'RW', 'LD', 'RD', 'G'];
const leagues: League[] = ['NHL', 'AHL', 'ITS'];
const chances: PotentialChance[] = ['Exact', 'High', 'Med', 'Low'];
const contractTypes: ContractType[] = ['1-way', '2-way'];
const clauses: Clause[] = ['NMC', 'M-NTC', 'NTC'];
const TYPES: Record<'FWD' | 'DEF' | 'G', PlayerType[]> = {
    FWD: ['ENF', 'GRN', 'PLY', 'PWF', 'SNP', 'TWF'],
    DEF: ['DFD', 'ENF', 'OFD', 'TWD'],
    G: ['BF', 'HYB', 'SU'],
};

const normalizeYear = (y: number) => y < 100 ? 2000 + y : y;
const roundLabel = (r: number) => ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th'][r - 1] ?? `${r}th`;
const myTeam = computed(() => franchiseStore.franchise?.team_id ?? null);
const draftYear = computed(() => normalizeYear((franchiseStore.franchise?.season ?? 25) + 1));
const partners = computed(() =>
    franchiseStore.teams.filter(t => t.id !== myTeam.value).sort((a, b) => a.name.localeCompare(b.name))
);

const partner = ref('');
const notes = ref('');

/* ---------- Sending ---------- */
const outPlayerIds = ref(new Set(props.initialPlayerIds));
const outPickIds = ref(new Set(props.initialPickIds));
// Replace the Set so the refs trigger (templates auto-unwrap, so no ref params)
const toggled = (set: Set<number>, id: number) => {
    const next = new Set(set);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
};
const togglePlayer = (id: number) => { outPlayerIds.value = toggled(outPlayerIds.value, id); };
const togglePick = (id: number) => { outPickIds.value = toggled(outPickIds.value, id); };

const myPicks = computed(() =>
    pickStore.picks
        .filter(p => p.current_owner === myTeam.value && p.drafted_player_id === null)
        .sort((a, b) => normalizeYear(a.year) - normalizeYear(b.year) || a.round - b.round)
);

// Players kept on the block from the Trade Block tab, keyed by id → reasons (hover text)
const blockReasons = computed(() => {
    const report = evaluateTradeBlock(
        playerStore.players,
        franchiseStore.franchise?.team_status ?? 'Bubble',
        capLimit.value - playerStore.nhlCapHit,
        myPicks.value,
        draftYear.value,
    );
    return new Map(report.candidates.filter(c => c.manual).map(c => [c.player.id, c.reasons]));
});

// Block players first, then the rest of the roster by league
const search = ref('');
const rosterGroups = computed(() => {
    const q = search.value.trim().toLowerCase();
    const match = (p: Player) => !q || `${p.first_name} ${p.last_name}`.toLowerCase().includes(q);
    const byOverall = (a: Player, b: Player) => b.overall - a.overall;
    const onBlock = playerStore.players.filter(p => blockReasons.value.has(p.id) && match(p));
    const rest = playerStore.players.filter(p => !blockReasons.value.has(p.id) && match(p));
    return [
        { label: 'On the Block', block: true, players: onBlock.sort(byOverall) },
        ...leagues.map(league => ({
            label: league,
            block: false,
            players: rest.filter(p => p.roster_league === league).sort(byOverall),
        })),
    ].filter(g => g.players.length);
});

// Pick cards grouped by draft year, rounds in order
const picksByYear = computed(() => {
    const years = new Map<number, Pick[]>();
    for (const p of myPicks.value) {
        const year = normalizeYear(p.year);
        years.set(year, [...(years.get(year) ?? []), p]);
    }
    return [...years].map(([year, picks]) => ({ year, picks }));
});
const pickLabel = (p: Pick) =>
    `${normalizeYear(p.year)} ${roundLabel(p.round)}${p.original_owner !== myTeam.value ? ` (via ${p.original_owner})` : ''}`;

const outPlayers = computed(() => playerStore.players.filter(p => outPlayerIds.value.has(p.id)));
const outPicks = computed(() => myPicks.value.filter(p => outPickIds.value.has(p.id)));

/* ---------- Receiving ---------- */
type IncomingRow = Omit<IncomingPlayer, 'potential_level' | 'potential_chance' | 'player_type'> & {
    potential_level: PotentialLevel | '';
    potential_chance: PotentialChance | '';
    player_type: PlayerType | '';
};
const inPlayers = ref<IncomingRow[]>([]);
function addInPlayer() {
    inPlayers.value.push({
        first_name: '', last_name: '', position: 'C', age: 25, roster_league: 'NHL', overall: 75,
        aav: 1, years_remaining: 1, potential_level: '', potential_chance: '', player_type: '',
        contract_type: '1-way', clause: null,
    });
}

// Incoming picks: original owner defaults to the partner but is often someone else
const inPicks = ref<{ year: number; round: number; original_owner: string }[]>([]);
function addInPick() {
    inPicks.value.push({ year: draftYear.value, round: 1, original_owner: partner.value });
}
// Follow partner changes for picks whose owner hasn't been changed by hand
watch(partner, (next, prev) => {
    for (const pick of inPicks.value) if (!pick.original_owner || pick.original_owner === prev) pick.original_owner = next;
});
const pickYears = computed(() => Array.from({ length: 6 }, (_, i) => draftYear.value + i));

/* ---------- Impact ---------- */
// NHL cap moves with NHL salaries; AHL salaries over the exemption also count (approximated here)
const hasContract = (p: { aav: number }) => p.aav > 0;
const impact = computed(() => {
    const capOut = outPlayers.value.filter(p => p.roster_league === 'NHL').reduce((s, p) => s + p.aav, 0);
    const capIn = inPlayers.value.filter(p => p.roster_league === 'NHL').reduce((s, p) => s + (Number(p.aav) || 0), 0);
    const capHit = playerStore.nhlCapHit - capOut + capIn;
    const contracts = playerStore.contractCount
        - outPlayers.value.filter(p => p.roster_league !== 'ITS' && hasContract(p)).length
        + inPlayers.value.filter(p => p.roster_league !== 'ITS' && hasContract(p)).length;
    const exempt = playerStore.exemptContractCount
        - outPlayers.value.filter(p => p.roster_league === 'ITS' && hasContract(p)).length
        + inPlayers.value.filter(p => p.roster_league === 'ITS' && hasContract(p)).length;
    return { capDelta: capIn - capOut, capHit, contracts, exempt };
});

/* ---------- Analysis ---------- */
// Incoming rows shaped like roster players so the roster can be compared before and after
const incomingAsPlayers = computed<Player[]>(() => inPlayers.value.map((p, i) => ({
    ...p,
    id: -(i + 1),
    position2: null,
    junior_league: null,
    overall: Number(p.overall) || 0,
    age: Number(p.age) || 0,
    aav: Number(p.aav) || 0,
    years_remaining: Number(p.years_remaining) || 0,
    potential_level: p.potential_level as PotentialLevel,
    potential_chance: p.potential_chance as PotentialChance,
    player_type: p.player_type as PlayerType,
    contract_type: p.contract_type ?? null,
    clause: p.clause ?? null,
    role: '',
    waiver_eligible: 1,
    status: 'Active',
    notes: null,
    line_slot: null,
    line_league: null,
    on_block: 0,
    created_at: '',
})));

const analysis = computed(() => {
    if (!outPlayerIds.value.size && !outPickIds.value.size && !inPlayers.value.length && !inPicks.value.length) return null;
    return analyzeTrade({
        players: playerStore.players,
        outPlayerIds: outPlayerIds.value,
        inPlayers: incomingAsPlayers.value,
        outPicks: outPicks.value,
        inPicks: inPicks.value,
        blockIds: new Set(blockReasons.value.keys()),
        status: franchiseStore.franchise?.team_status ?? 'Bubble',
        capBefore: playerStore.nhlCapHit,
        capAfter: impact.value.capHit,
        capCeiling: capLimit.value,
    });
});

const VERDICT_STYLE: Record<Verdict, { label: string; class: string }> = {
    Good: { label: 'Good for the organization', class: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
    Mixed: { label: 'Mixed — weigh the trade-offs', class: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
    Poor: { label: 'Works against your needs', class: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
    Neutral: { label: 'No real change to your needs', class: 'bg-slate-700/40 text-slate-300 border-slate-600' },
};

/* ---------- Validation & execute ---------- */
const duplicateInPick = computed(() => {
    const keys = inPicks.value.map(p => `${p.year}-${p.round}-${p.original_owner}`);
    return keys.length !== new Set(keys).size;
});
const ownedAlready = computed(() =>
    inPicks.value.some(ip => myPicks.value.some(p =>
        normalizeYear(p.year) === ip.year && p.round === ip.round && p.original_owner === ip.original_owner
    ))
);
const problems = computed(() => {
    const list: string[] = [];
    if (!partner.value) list.push('Choose a trade partner');
    if (!outPlayerIds.value.size && !outPickIds.value.size && !inPlayers.value.length && !inPicks.value.length) {
        list.push('Add at least one asset');
    }
    if (inPlayers.value.some(p => !(p.first_name.trim() || p.last_name.trim()))) list.push('Name every incoming player');
    if (inPicks.value.some(p => !p.original_owner)) list.push('Set the original owner of every incoming pick');
    if (duplicateInPick.value) list.push('The same incoming pick is listed twice');
    if (ownedAlready.value) list.push('You already own one of the incoming picks');
    return list;
});
const warnings = computed(() => {
    const list: string[] = [];
    if (impact.value.capHit > capLimit.value) list.push(`Over the cap after this trade (${formatCap(impact.value.capHit)})`);
    if (impact.value.contracts > MAX_CONTRACTS) list.push(`${impact.value.contracts} contracts — over the ${MAX_CONTRACTS} limit`);
    if (impact.value.exempt > MAX_EXEMPT_CONTRACTS) list.push(`${impact.value.exempt} exempt contracts — over ${MAX_EXEMPT_CONTRACTS}`);
    for (const p of outPlayers.value) if (p.clause) list.push(`${p.last_name} has a ${p.clause}`);
    if (outPlayers.value.length) {
        const status = franchiseStore.franchise?.team_status ?? 'Bubble';
        const core = assessRoster(playerStore.players, status).assessments.filter(a => a.tier === 'Core').map(a => a.player.id);
        for (const p of outPlayers.value) if (core.includes(p.id)) list.push(`${p.last_name} is a core piece (Roster → Analysis)`);
    }
    return list;
});

const confirming = ref(false);
const executing = ref(false);
const error = ref<string | null>(null);

async function execute() {
    executing.value = true;
    error.value = null;
    try {
        await tradeStore.execute({
            partner: partner.value,
            notes: notes.value.trim() || null,
            outPlayerIds: [...outPlayerIds.value],
            outPickIds: [...outPickIds.value],
            // Leave unset optional fields out so the DB defaults apply
            inPlayers: inPlayers.value.map(p => {
                const player: IncomingPlayer = {
                    first_name: p.first_name.trim(), last_name: p.last_name.trim(), position: p.position,
                    age: Number(p.age), roster_league: p.roster_league, overall: Number(p.overall),
                    aav: Number(p.aav) || 0, years_remaining: Number(p.years_remaining) || 0,
                    contract_type: p.contract_type ?? null, clause: p.clause ?? null,
                };
                if (p.potential_level) player.potential_level = p.potential_level;
                if (p.potential_chance) player.potential_chance = p.potential_chance;
                if (p.player_type) player.player_type = p.player_type;
                return player;
            }),
            inPicks: inPicks.value.map(p => ({ ...p })),
        });
        emit('executed');
    } catch (e) {
        error.value = e instanceof Error ? e.message.replace(/^.*Error: /, '') : String(e);
        confirming.value = false;
    } finally {
        executing.value = false;
    }
}

const teamName = (id: string) => franchiseStore.teams.find(t => t.id === id)?.name ?? id;
</script>

<template>
    <div class="space-y-6">
        <div class="flex flex-wrap items-center gap-3">
            <h2 class="text-sm font-medium text-slate-400 uppercase tracking-wider">Trade with</h2>
            <select v-model="partner" :class="[inputClass, 'text-sm py-1.5 w-64']">
                <option value="" disabled>Select a team</option>
                <option v-for="t in partners" :key="t.id" :value="t.id">{{ t.name }}</option>
            </select>
        </div>

        <!-- Impact + execute -->
        <section class="p-4 bg-slate-800/30 border border-slate-700/50 rounded-lg space-y-3">
            <div class="flex flex-wrap gap-x-8 gap-y-1 text-xs text-slate-400">
                <span>
                    NHL cap: {{ impact.capDelta >= 0 ? '+' : '−' }}{{ formatCap(Math.abs(impact.capDelta)) }}
                    → <span :class="impact.capHit > capLimit ? 'text-rose-400' : 'text-slate-200'">{{ formatCap(impact.capHit) }}</span>
                    / {{ formatCap(capStore.current) }}<template v-if="capStore.currentRetained"> ({{ formatCap(capStore.currentRetained) }} retained)</template>
                </span>
                <span>Contracts: <span :class="impact.contracts > MAX_CONTRACTS ? 'text-rose-400' : 'text-slate-200'">{{ impact.contracts }}</span> / {{ MAX_CONTRACTS }}</span>
                <span>Exempt: <span :class="impact.exempt > MAX_EXEMPT_CONTRACTS ? 'text-rose-400' : 'text-slate-200'">{{ impact.exempt }}</span> / {{ MAX_EXEMPT_CONTRACTS }}</span>
            </div>
            <!-- Analysis against organizational needs -->
            <div v-if="analysis" class="space-y-2">
                <div class="flex flex-wrap items-center gap-2">
                    <span class="px-2 py-0.5 rounded border text-xs font-medium" :class="VERDICT_STYLE[analysis.verdict].class">
                        {{ VERDICT_STYLE[analysis.verdict].label }}
                    </span>
                    <span class="text-[10px] text-slate-500">
                        Judged as a {{ franchiseStore.franchise?.team_status ?? 'Bubble' }} team · doesn't price the other side
                    </span>
                </div>
                <div v-if="analysis.resolves.length || analysis.creates.length" class="grid gap-3 sm:grid-cols-2 text-xs">
                    <div>
                        <p class="text-[10px] font-medium text-emerald-400/80 uppercase tracking-wider mb-1">Resolves</p>
                        <ul class="space-y-0.5">
                            <li v-for="e in analysis.resolves" :key="e.text" class="text-slate-300">+ {{ e.text }}</li>
                            <li v-if="!analysis.resolves.length" class="text-slate-600">Nothing</li>
                        </ul>
                    </div>
                    <div>
                        <p class="text-[10px] font-medium text-rose-400/80 uppercase tracking-wider mb-1">Creates</p>
                        <ul class="space-y-0.5">
                            <li v-for="e in analysis.creates" :key="e.text" class="text-slate-300">− {{ e.text }}</li>
                            <li v-if="!analysis.creates.length" class="text-slate-600">Nothing</li>
                        </ul>
                    </div>
                </div>
            </div>

            <ul v-if="warnings.length" class="text-xs text-amber-400 space-y-0.5">
                <li v-for="w in warnings" :key="w">{{ w }}</li>
            </ul>

            <input v-model="notes" placeholder="Notes (optional) — e.g. deadline sell, retained salary" :class="[inputClass, 'w-full text-sm py-1.5']" />

            <p v-if="error" class="text-xs text-rose-400">{{ error }}</p>
            <div class="flex flex-wrap items-center gap-3">
                <span v-if="problems.length" class="text-xs text-slate-500">{{ problems[0] }}</span>
                <template v-if="confirming">
                    <span class="ml-auto text-xs text-slate-300">
                        Execute trade with {{ teamName(partner) }}? Roster and picks update immediately.
                    </span>
                    <button
                        :disabled="executing"
                        class="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white transition-colors"
                        @click="execute"
                    >Confirm</button>
                    <button class="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-slate-200" @click="confirming = false">Cancel</button>
                </template>
                <button
                    v-else
                    :disabled="problems.length > 0"
                    class="ml-auto px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:opacity-90 disabled:opacity-40"
                    :style="{ backgroundColor: 'var(--team-primary)', color: 'var(--team-on-primary)' }"
                    @click="confirming = true"
                >Execute trade</button>
            </div>
        </section>

        <div class="grid gap-6 lg:grid-cols-2">
            <!-- Sending -->
            <section class="space-y-4 p-4 bg-slate-800/30 border border-slate-700/50 rounded-lg">
                <h3 class="text-sm font-semibold text-rose-300">Sending</h3>

                <!-- Everything selected so far, pinned above the pickers -->
                <div class="rounded-md border border-rose-500/30 bg-rose-500/5 p-2 space-y-1">
                    <p class="text-[10px] font-medium text-rose-300/80 uppercase tracking-wider">
                        Selected ({{ outPlayers.length + outPicks.length }})
                    </p>
                    <div
                        v-for="p in outPlayers"
                        :key="`player-${p.id}`"
                        class="flex items-center gap-2 px-2 py-1 rounded text-xs text-rose-100 bg-rose-500/10"
                    >
                        <span class="w-8 text-rose-300/70">{{ p.position }}</span>
                        <span class="flex-1 truncate font-medium">{{ p.first_name }} {{ p.last_name }}</span>
                        <span class="text-rose-300/70">{{ p.roster_league }} · {{ p.age }} · {{ p.overall }}</span>
                        <span class="w-24 text-right text-rose-300/70">{{ p.aav > 0 ? `${formatCap(p.aav)}×${p.years_remaining}` : '—' }}</span>
                        <span v-if="p.clause" class="text-amber-400">{{ p.clause }}</span>
                        <button type="button" class="text-rose-300/60 hover:text-rose-200" title="Remove" @click="togglePlayer(p.id)">✕</button>
                    </div>
                    <div
                        v-for="p in outPicks"
                        :key="`pick-${p.id}`"
                        class="flex items-center gap-2 px-2 py-1 rounded text-xs text-rose-100 bg-rose-500/10"
                    >
                        <span class="w-8 text-rose-300/70">Pick</span>
                        <span class="flex-1 truncate font-medium">{{ pickLabel(p) }}</span>
                        <button type="button" class="text-rose-300/60 hover:text-rose-200" title="Remove" @click="togglePick(p.id)">✕</button>
                    </div>
                    <p v-if="!outPlayers.length && !outPicks.length" class="text-xs text-slate-600 px-2">Nothing selected yet.</p>
                </div>

                <div>
                    <p :class="sectionHeader">Players</p>
                    <input v-model="search" placeholder="Search roster…" :class="[inputClass, 'w-full mb-2']" />
                    <div class="max-h-72 overflow-y-auto space-y-3 pr-1">
                        <div v-for="group in rosterGroups" :key="group.label">
                            <p
                                class="text-[10px] font-medium uppercase tracking-wider mb-1"
                                :class="group.block ? 'text-amber-400/80' : 'text-slate-600'"
                            >{{ group.label }}</p>
                            <label
                                v-for="p in group.players"
                                :key="p.id"
                                class="flex items-center gap-2 px-2 py-1 rounded text-xs cursor-pointer transition-colors"
                                :class="outPlayerIds.has(p.id) ? 'bg-rose-500/10 text-rose-200' : 'text-slate-300 hover:bg-slate-800'"
                            >
                                <input type="checkbox" class="accent-rose-500" :checked="outPlayerIds.has(p.id)" @change="togglePlayer(p.id)" />
                                <span class="w-8 text-slate-500">{{ p.position }}</span>
                                <span class="flex-1 truncate" :title="blockReasons.get(p.id)?.join('\n')">
                                    {{ p.first_name }} {{ p.last_name }}
                                    <span v-if="group.block" class="text-[10px] text-slate-500">{{ p.roster_league }}</span>
                                </span>
                                <span class="text-slate-500">{{ p.age }}</span>
                                <span class="w-8 text-right text-slate-400">{{ p.overall }}</span>
                                <span class="w-24 text-right text-slate-500">{{ p.aav > 0 ? `${formatCap(p.aav)}×${p.years_remaining}` : '—' }}</span>
                                <span v-if="p.clause" class="text-amber-400">{{ p.clause }}</span>
                            </label>
                        </div>
                    </div>
                </div>

                <div>
                    <p :class="sectionHeader">Picks</p>
                    <div class="space-y-2">
                        <div v-for="y in picksByYear" :key="y.year" class="flex items-start gap-3">
                            <span class="w-10 pt-1.5 text-xs font-medium text-slate-500">{{ y.year }}</span>
                            <div class="flex-1 grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-1.5">
                                <button
                                    v-for="p in y.picks"
                                    :key="p.id"
                                    type="button"
                                    class="px-2 py-1 rounded-md text-left border transition-colors"
                                    :class="outPickIds.has(p.id) ? 'border-rose-500/60 bg-rose-500/10 text-rose-200' : 'border-slate-700 text-slate-300 hover:border-slate-500'"
                                    @click="togglePick(p.id)"
                                >
                                    <span class="block text-xs font-medium">
                                        {{ roundLabel(p.round) }} round
                                        <span v-if="p.projected_pick" class="font-normal text-slate-500" :title="p.locked ? 'Locked' : 'Projected'">
                                            #{{ p.projected_pick }}{{ p.locked ? '' : '?' }}
                                        </span>
                                    </span>
                                    <span class="block text-[10px] truncate" :class="p.original_owner !== myTeam ? 'text-sky-400/80' : 'text-slate-600'">
                                        {{ p.original_owner !== myTeam ? `via ${teamName(p.original_owner)}` : 'Own' }}
                                    </span>
                                </button>
                            </div>
                        </div>
                        <span v-if="!myPicks.length" class="text-xs text-slate-600">No picks owned.</span>
                    </div>
                </div>
            </section>

            <!-- Receiving -->
            <section class="space-y-4 p-4 bg-slate-800/30 border border-slate-700/50 rounded-lg">
                <h3 class="text-sm font-semibold text-emerald-300">Receiving</h3>

                <div>
                    <div class="flex items-center justify-between mb-2">
                        <p :class="sectionHeader" class="!mb-0">Players</p>
                        <button type="button" class="text-xs text-slate-400 hover:text-slate-200" @click="addInPlayer">+ Add player</button>
                    </div>
                    <div class="space-y-2">
                        <div v-for="(p, i) in inPlayers" :key="i" class="p-2 rounded-md bg-slate-900/50 border border-slate-700/50 space-y-1.5">
                            <div class="flex flex-wrap gap-1.5">
                                <input v-model="p.first_name" placeholder="First" :class="[inputClass, 'w-24']" />
                                <input v-model="p.last_name" placeholder="Last" :class="[inputClass, 'w-28']" />
                                <select v-model="p.position" :class="[inputClass, 'w-16']" @change="p.potential_level = ''; p.player_type = ''">
                                    <option v-for="pos in positions" :key="pos" :value="pos">{{ pos }}</option>
                                </select>
                                <select v-model="p.roster_league" :class="[inputClass, 'w-16']" title="Where they'll play">
                                    <option v-for="l in leagues" :key="l" :value="l">{{ l }}</option>
                                </select>
                                <button type="button" class="ml-auto text-xs text-slate-600 hover:text-rose-400" @click="inPlayers.splice(i, 1)">✕</button>
                            </div>
                            <div class="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
                                Age <input v-model.number="p.age" type="number" min="16" max="45" :class="[inputClass, 'w-14']" />
                                OVR <input v-model.number="p.overall" type="number" min="1" max="99" :class="[inputClass, 'w-14']" />
                                AAV $M <input v-model.number="p.aav" type="number" min="0" step="0.025" :class="[inputClass, 'w-20']" />
                                Yrs <input v-model.number="p.years_remaining" type="number" min="0" max="8" :class="[inputClass, 'w-12']" />
                                <select v-model="p.contract_type" :class="[inputClass, 'w-16']">
                                    <option :value="null">—</option>
                                    <option v-for="c in contractTypes" :key="c" :value="c">{{ c }}</option>
                                </select>
                                <select v-model="p.clause" :class="[inputClass, 'w-20']">
                                    <option :value="null">No clause</option>
                                    <option v-for="c in clauses" :key="c" :value="c">{{ c }}</option>
                                </select>
                            </div>
                            <div class="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
                                <select v-model="p.potential_level" :class="[inputClass, 'w-28']">
                                    <option value="">Potential —</option>
                                    <option v-for="lvl in POTENTIAL_TIERS[groupOf(p.position)]" :key="lvl" :value="lvl">{{ lvl }}</option>
                                </select>
                                <select v-model="p.potential_chance" :class="[inputClass, 'w-20']">
                                    <option value="">Chance —</option>
                                    <option v-for="c in chances" :key="c" :value="c">{{ c }}</option>
                                </select>
                                <select v-model="p.player_type" :class="[inputClass, 'w-20']">
                                    <option value="">Type —</option>
                                    <option v-for="t in TYPES[groupOf(p.position)]" :key="t" :value="t">{{ t }}</option>
                                </select>
                            </div>
                        </div>
                        <p v-if="!inPlayers.length" class="text-xs text-slate-600">None.</p>
                    </div>
                </div>

                <div>
                    <div class="flex items-center justify-between mb-2">
                        <p :class="sectionHeader" class="!mb-0">Picks</p>
                        <button type="button" class="text-xs text-slate-400 hover:text-slate-200" @click="addInPick">+ Add pick</button>
                    </div>
                    <div class="space-y-1.5">
                        <div v-for="(p, i) in inPicks" :key="i" class="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
                            <select v-model.number="p.year" :class="[inputClass, 'w-20']">
                                <option v-for="y in pickYears" :key="y" :value="y">{{ y }}</option>
                            </select>
                            <select v-model.number="p.round" :class="[inputClass, 'w-16']">
                                <option v-for="r in 7" :key="r" :value="r">{{ roundLabel(r) }}</option>
                            </select>
                            originally
                            <select v-model="p.original_owner" :class="[inputClass, 'w-40']">
                                <option value="" disabled>Original owner</option>
                                <option v-for="t in franchiseStore.teams" :key="t.id" :value="t.id">{{ t.name }}</option>
                            </select>
                            <button type="button" class="ml-auto text-xs text-slate-600 hover:text-rose-400" @click="inPicks.splice(i, 1)">✕</button>
                        </div>
                        <p v-if="inPicks.length" class="text-[10px] text-slate-600">
                            Original owner = the team the pick first belonged to, which may not be {{ partner ? teamName(partner) : 'the partner' }}.
                        </p>
                        <p v-else class="text-xs text-slate-600">None.</p>
                    </div>
                </div>
            </section>
        </div>

    </div>
</template>
