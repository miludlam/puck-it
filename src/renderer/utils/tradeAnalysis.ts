import { Player, Position, TeamStatus } from '@/types';
import { analyzeRoster, groupOf, isNhlPotential, PIPELINE_TARGET, POTENTIAL_TIERS, TYPE_NAMES } from '@/utils/draftTargets';
import { NHL_SLOTS } from '@/utils/tradeBlock';
import { formatCap, MAX_CONTRACTS, MAX_EXEMPT_CONTRACTS } from '@/utils/league';

const POSITIONS = Object.keys(NHL_SLOTS) as Position[];
const VETERAN_AGE = 28;     // a rebuild sells players this age and up
const QUALITY_STEP = 0.5;   // lineup average change worth mentioning

// How much each kind of effect matters for the team's direction
const WEIGHTS: Record<TeamStatus, { lineup: number; future: number; picks: number }> = {
    Contender: { lineup: 2, future: 0.5, picks: 0.5 },
    Bubble: { lineup: 1, future: 1, picks: 1 },
    Rebuild: { lineup: 0.5, future: 2, picks: 1.5 },
};

export interface TradePickRef { year: number; round: number }

export interface TradeAnalysisInput {
    players: Player[];
    outPlayerIds: Set<number>;
    inPlayers: Player[];        // incoming players shaped as roster players
    outPicks: TradePickRef[];
    inPicks: TradePickRef[];
    blockIds: Set<number>;      // players on the trade block (manual or suggested)
    status: TeamStatus;
    capBefore: number;          // NHL cap hit now
    capAfter: number;           // and after the trade
    capCeiling: number;         // this season's cap
}

export type Verdict = 'Good' | 'Mixed' | 'Poor' | 'Neutral';

export interface TradeEffect { text: string; weight: number }

export interface TradeAnalysis {
    verdict: Verdict;
    score: number;
    resolves: TradeEffect[];
    creates: TradeEffect[];
}

const name = (p: Player) => `${p.first_name} ${p.last_name}`.trim();
const roundLabel = (r: number) => ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th'][r - 1] ?? `${r}th`;

// Top-end potential: Franchise, Elite or the first NHL tier
const isTopPotential = (p: Player) =>
    !!p.potential_level && POTENTIAL_TIERS[groupOf(p.position)].indexOf(p.potential_level) <= 2
    && POTENTIAL_TIERS[groupOf(p.position)].indexOf(p.potential_level) !== -1;

// Average overall of the best N NHL players in a group (the dressed lineup). A short
// lineup returns null — the depth check reports that instead of a skewed average.
const LINEUP_SIZE = { FWD: 12, DEF: 6, G: 1 } as const;
function lineupAverage(players: Player[], group: keyof typeof LINEUP_SIZE): number | null {
    const top = players
        .filter(p => p.roster_league === 'NHL' && groupOf(p.position) === group)
        .map(p => p.overall)
        .sort((a, b) => b - a)
        .slice(0, LINEUP_SIZE[group]);
    return top.length === LINEUP_SIZE[group] ? top.reduce((s, o) => s + o, 0) / top.length : null;
}
const GROUP_NAMES = { FWD: 'forwards', DEF: 'defence', G: 'starting goalie' } as const;

const pickValue = (round: number) => round === 1 ? 2 : round === 2 ? 1.25 : round <= 4 ? 0.5 : 0.25;

/**
 * Judges a proposed trade against the organization's needs by comparing the roster before
 * and after: NHL depth, lineup quality, prospect pipeline, player-type mix, cap and
 * contracts, and fit with the team's direction. It doesn't price the partner's side.
 */
export function analyzeTrade(input: TradeAnalysisInput): TradeAnalysis {
    const { players, outPlayerIds, inPlayers, status } = input;
    const w = WEIGHTS[status];
    const before = players;
    const outgoing = players.filter(p => outPlayerIds.has(p.id));
    const after = [...players.filter(p => !outPlayerIds.has(p.id)), ...inPlayers];

    const resolves: TradeEffect[] = [];
    const creates: TradeEffect[] = [];
    const effect = (text: string, weight: number) => {
        if (weight > 0) resolves.push({ text, weight });
        else if (weight < 0) creates.push({ text, weight });
    };

    // NHL depth against lineup spots
    const nhlAt = (list: Player[], position: Position) =>
        list.filter(p => p.roster_league === 'NHL' && p.position === position).length;
    for (const position of POSITIONS) {
        const slots = NHL_SLOTS[position];
        const was = nhlAt(before, position);
        const now = nhlAt(after, position);
        if (was === now) continue;
        const counts = `${was} → ${now} for ${slots} spots`;
        if (was < slots && now > was) effect(`Fills NHL shortage at ${position} (${counts})`, 2 * w.lineup);
        else if (now < slots && now < was) effect(`Leaves the NHL short at ${position} (${counts})`, -2 * w.lineup);
        else if (was > slots + 1 && now < was) effect(`Clears surplus at ${position} (${counts})`, 0.75);
        else if (now > slots + 1 && now > was) effect(`Crowds ${position} (${counts})`, -0.5);
    }

    // Lineup quality
    for (const group of ['FWD', 'DEF', 'G'] as const) {
        const was = lineupAverage(before, group);
        const now = lineupAverage(after, group);
        if (was === null || now === null) continue;
        const delta = now - was;
        if (Math.abs(delta) < QUALITY_STEP) continue;
        const text = group === 'G'
            ? `Starting goalie ${delta > 0 ? 'upgrade' : 'downgrade'} (${was.toFixed(0)} → ${now.toFixed(0)})`
            : `NHL ${GROUP_NAMES[group]} ${delta > 0 ? 'improve' : 'weaken'} (top-${LINEUP_SIZE[group]} avg ${was.toFixed(1)} → ${now.toFixed(1)})`;
        effect(text, Math.sign(delta) * Math.min(3, Math.abs(delta)) * w.lineup);
    }

    // Prospect pipeline and type mix
    const needsBefore = analyzeRoster(before);
    const needsAfter = analyzeRoster(after);
    for (const position of POSITIONS) {
        const target = PIPELINE_TARGET[position];
        const was = needsBefore.positions[position].pipeline;
        const now = needsAfter.positions[position].pipeline;
        const gapWas = Math.max(0, target - was);
        const gapNow = Math.max(0, target - now);
        if (gapNow < gapWas) effect(`Adds a young ${position} with NHL potential (pipeline ${was} → ${now} of ${target})`, (gapWas - gapNow) * w.future);
        else if (gapNow > gapWas) effect(`Thins the ${position} pipeline (${was} → ${now} of ${target})`, -(gapNow - gapWas) * w.future);
    }
    for (const t of needsAfter.types) {
        const prev = needsBefore.types.find(b => b.type === t.type && b.group === t.group);
        if (!prev) continue;
        // Only when the trade changes the count itself, not just the target
        const label = TYPE_NAMES[t.type] ?? t.type;
        if (t.have > prev.have && prev.have < prev.want) effect(`More ${label} (${prev.have} → ${t.have} of ${t.want} wanted)`, 0.75);
        else if (t.have < prev.have && t.have < t.want) effect(`Fewer ${label} (${prev.have} → ${t.have} of ${t.want} wanted)`, -0.75);
    }

    // Core players and top prospects leaving
    const depthRank = (p: Player) =>
        before.filter(o => o.roster_league === 'NHL' && o.position === p.position && o.overall > p.overall).length;
    for (const p of outgoing) {
        if (input.blockIds.has(p.id)) {
            effect(`Moves ${name(p)} off the trade block`, 0.75);
            continue;
        }
        if (status !== 'Rebuild' && p.roster_league === 'NHL' && depthRank(p) < Math.ceil(NHL_SLOTS[p.position] / 2)) {
            effect(`Gives up ${name(p)}, a top-${Math.ceil(NHL_SLOTS[p.position] / 2)} ${p.position}`, -1.5);
        }
        if (p.age <= 23 && isTopPotential(p)) {
            effect(`Gives up ${name(p)} (${p.age}, ${p.potential_level} potential)`, -1.5 * w.future);
        }
    }

    // Fit with the team's direction
    if (status === 'Rebuild') {
        for (const p of outgoing.filter(p => p.roster_league === 'NHL' && p.age >= VETERAN_AGE && !input.blockIds.has(p.id))) {
            effect(`Sells ${name(p)} (${p.age}) for the future`, 1);
        }
        for (const p of inPlayers.filter(p => p.age >= VETERAN_AGE && p.years_remaining >= 3)) {
            effect(`Takes on ${name(p) || 'a veteran'} (${p.age}) with ${p.years_remaining} years of term`, -1.5);
        }
    }
    if (status === 'Bubble') {
        for (const p of inPlayers.filter(p => p.roster_league === 'NHL' && p.age <= 27 && p.years_remaining >= 2)) {
            effect(`${name(p) || 'Incoming player'} is ${p.age} with term`, 0.75);
        }
    }
    if (status === 'Contender') {
        for (const p of inPlayers.filter(p => p.roster_league === 'NHL' && p.years_remaining <= 1)) {
            effect(`${name(p) || 'Incoming player'} is a rental — fine for a push`, 0.25);
        }
    }
    for (const p of inPlayers.filter(p => p.age <= 21 && isTopPotential(p))) {
        effect(`Adds prospect${name(p) ? ` ${name(p)}` : ''} (${p.age}, ${p.potential_level})`, 1 * w.future);
    }

    // Picks
    const pickText = (p: TradePickRef) => `${p.year < 100 ? 2000 + p.year : p.year} ${roundLabel(p.round)}`;
    for (const p of input.inPicks) effect(`Adds a ${pickText(p)}-round pick`, pickValue(p.round) * w.picks);
    for (const p of input.outPicks) effect(`Gives up a ${pickText(p)}-round pick`, -pickValue(p.round) * w.picks * (status === 'Contender' ? 0.6 : 1));

    // Cap and contracts
    const { capBefore: capWas, capAfter: capNow, capCeiling } = input;
    if (capWas <= capCeiling && capNow > capCeiling) effect(`Puts you over the cap (${formatCap(capNow)} / ${formatCap(capCeiling)})`, -3);
    else if (capWas > capCeiling && capNow <= capCeiling) effect(`Gets you back under the cap (${formatCap(capNow)})`, 2);
    else if (capWas - capNow >= 1) effect(`Frees ${formatCap(capWas - capNow)} in cap space`, status === 'Contender' ? 0.5 : 1);
    else if (capNow - capWas >= 1) effect(`Adds ${formatCap(capNow - capWas)} to the cap`, status === 'Rebuild' ? -1 : -0.25);

    const signed = (list: Player[], exempt: boolean) =>
        list.filter(p => p.aav > 0 && (p.roster_league === 'ITS') === exempt).length;
    if (signed(after, false) > MAX_CONTRACTS && signed(after, false) > signed(before, false)) {
        effect(`${signed(after, false)} contracts — over the ${MAX_CONTRACTS} limit`, -2);
    }
    if (signed(after, true) > MAX_EXEMPT_CONTRACTS && signed(after, true) > signed(before, true)) {
        effect(`${signed(after, true)} exempt contracts — over ${MAX_EXEMPT_CONTRACTS}`, -1);
    }

    const byWeight = (a: TradeEffect, b: TradeEffect) => Math.abs(b.weight) - Math.abs(a.weight);
    resolves.sort(byWeight);
    creates.sort(byWeight);

    const score = [...resolves, ...creates].reduce((s, e) => s + e.weight, 0);
    const verdict: Verdict =
        !resolves.length && !creates.length ? 'Neutral'
        : score >= 2 ? 'Good'
        : score <= -2 ? 'Poor'
        : 'Mixed';

    return { verdict, score, resolves, creates };
}
