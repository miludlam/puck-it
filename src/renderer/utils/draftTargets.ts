import { Player, PlayerType, Position, PotentialChance, PotentialLevel, ScoutedPlayer } from '@/types';

type Group = 'FWD' | 'DEF' | 'G';

export const groupOf = (position: Position): Group =>
    position === 'G' ? 'G' : position === 'LD' || position === 'RD' ? 'DEF' : 'FWD';

const POSITIONS: Position[] = ['C', 'LW', 'RW', 'LD', 'RD', 'G'];

// Potential tiers per position group, best first. The player forms, filters and sorting all use these.
export const POTENTIAL_TIERS: Record<Group, PotentialLevel[]> = {
    FWD: ['Franchise', 'Elite', 'Top 6', 'Top 9', 'Bottom 6', 'AHL Top 6', 'AHL Bottom 6', 'AHL 4th Line', 'AHL Extra', 'AHL Other'],
    DEF: ['Franchise', 'Elite', 'Top 4', 'Top 6', '7th', 'AHL Top 2', 'AHL Top 4', 'AHL Top 6', 'AHL 7th', 'AHL Extra', 'AHL Other'],
    G:   ['Franchise', 'Elite', 'Starter', 'Fringe', 'Backup', 'AHL Starter', 'AHL Fringe', 'AHL Backup', 'AHL Extra', 'AHL Other'],
};

// Value of each tier index: Franchise/Elite dominate, NHL tiers next, AHL tiers barely register
const TIER_VALUE = [10, 9, 7, 5, 3, 1, 1, 1, 1, 1, 1];

// How much to trust a potential reading
const CHANCE_FACTOR: Record<PotentialChance, number> = { Exact: 1, High: 0.9, Med: 0.75, Low: 0.55 };

/** A potential reading's worth on a 0–10 scale, discounted by how sure the reading is */
export function potentialValue(position: Position, level: PotentialLevel | '' | null, chance: PotentialChance | '' | null) {
    const index = level ? POTENTIAL_TIERS[groupOf(position)].indexOf(level) : -1;
    return (index === -1 ? 1 : TIER_VALUE[index]) * (chance ? CHANCE_FACTOR[chance] : 0.75);
}

// Is this an NHL-calibre potential (top three tiers below Franchise/Elite included)?
export const isNhlPotential = (group: Group, level: PotentialLevel | '' | null) =>
    !!level && POTENTIAL_TIERS[group].indexOf(level) !== -1 && POTENTIAL_TIERS[group].indexOf(level) <= 3;

// Desired share of each player type within a group. Creativity and finishing (PLY/SNP)
// are weighted up; depth types (GRN/ENF) take what's left. Shares are a starting point.
const TYPE_MIX: Record<Group, Partial<Record<PlayerType, number>>> = {
    FWD: { PLY: 0.25, SNP: 0.25, PWF: 0.15, TWF: 0.2, GRN: 0.1, ENF: 0.05 },
    DEF: { OFD: 0.35, TWD: 0.4, DFD: 0.25 },
    G:   {},
};

export const PLAYER_TYPES: Record<Group, PlayerType[]> = {
    FWD: ['ENF', 'GRN', 'PLY', 'PWF', 'SNP', 'TWF'],
    DEF: ['DFD', 'ENF', 'OFD', 'TWD'],
    G: ['BF', 'HYB', 'SU'],
};

export const TYPE_NAMES: Partial<Record<PlayerType, string>> = {
    PLY: 'playmakers', SNP: 'snipers', PWF: 'power forwards', TWF: 'two-way forwards',
    GRN: 'grinders', ENF: 'enforcers', OFD: 'offensive D', TWD: 'two-way D', DFD: 'defensive D',
};

// Young players with real potential at a position, the "pipeline" we want behind the NHL group
const PIPELINE_AGE = 23;
export const PIPELINE_TARGET: Record<Position, number> = { C: 2, LW: 2, RW: 2, LD: 2, RD: 2, G: 1 };
const AGING_AGE = 30;

export interface PositionNeed {
    position: Position;
    score: number;      // 0 = covered; higher = bigger gap
    aging: number;      // NHL players 30+
    expiring: number;   // NHL players with ≤ 1 year left
    pipeline: number;   // young players with NHL-calibre potential
    reasons: string[];
}

export interface TypeNeed {
    type: PlayerType;
    group: Group;
    have: number;
    want: number;
    score: number;      // shortfall as a fraction of the group (0 = covered)
}

export interface RosterNeeds {
    positions: Record<Position, PositionNeed>;
    types: TypeNeed[];
}

const playsPosition = (p: Player, position: Position) => p.position === position || p.position2 === position;

/** Where the organization is thin: position depth, aging NHL players, expiring deals, type mix */
export function analyzeRoster(players: Player[]): RosterNeeds {
    const positions = {} as Record<Position, PositionNeed>;
    for (const position of POSITIONS) {
        const group = groupOf(position);
        const nhl = players.filter(p => p.roster_league === 'NHL' && p.position === position);
        const aging = nhl.filter(p => p.age >= AGING_AGE).length;
        const expiring = nhl.filter(p => p.years_remaining <= 1).length;
        const pipeline = players.filter(p =>
            playsPosition(p, position) && p.age <= PIPELINE_AGE && isNhlPotential(group, p.potential_level)
        ).length;
        const pipelineGap = Math.max(0, PIPELINE_TARGET[position] - pipeline);
        // Aging and expiring overlap often, so count the turnover risk once per player
        const atRisk = nhl.filter(p => p.age >= AGING_AGE || p.years_remaining <= 1).length;

        const reasons: string[] = [];
        if (pipelineGap) reasons.push(`${pipeline} young ${position} with NHL potential (want ${PIPELINE_TARGET[position]})`);
        if (aging) reasons.push(`${aging} NHL ${position} aged ${AGING_AGE}+`);
        if (expiring) reasons.push(`${expiring} NHL ${position} expiring`);

        positions[position] = { position, score: pipelineGap + atRisk * 0.5, aging, expiring, pipeline, reasons };
    }

    // Type mix across the organization's non-veteran players in each group
    const types: TypeNeed[] = [];
    for (const group of ['FWD', 'DEF'] as Group[]) {
        const pool = players.filter(p => groupOf(p.position) === group && p.age < AGING_AGE + 3);
        for (const [type, share] of Object.entries(TYPE_MIX[group]) as [PlayerType, number][]) {
            const have = pool.filter(p => p.player_type === type).length;
            const want = Math.round(pool.length * share);
            const score = pool.length ? Math.max(0, want - have) / pool.length : 0;
            types.push({ type, group, have, want, score });
        }
    }

    return { positions, types };
}

export interface Target {
    prospect: ScoutedPlayer;
    score: number;
    reasons: string[];
    mayBeGone: boolean; // ranked ahead of the pick, only available if they fall
}

export interface PickPlan {
    pickNumber: number;
    window: { from: number; to: number | null }; // CS rank range considered (to = before next pick)
    targets: Target[];
}

// Ranked within this many spots before a pick, a prospect may still fall to it
export const FALLER_MARGIN = 5;
const TARGETS_PER_PICK = 3;

function prospectValue(p: ScoutedPlayer, draftSize: number): { value: number; reason: string | null } {
    if (p.position && p.potential_level) {
        return { value: potentialValue(p.position, p.potential_level, p.potential_chance), reason: `${p.potential_level}${p.potential_chance ? ` (${p.potential_chance})` : ''}` };
    }
    // Potential unknown — fall back on Central Scouting, scaled below a known Top-tier read
    const rank = p.cs_rank ?? draftSize;
    return { value: 5 * Math.max(0.1, 1 - rank / draftSize), reason: null };
}

/**
 * Up to three targets per pick. A pick at #P considers prospects ranked from a few spots
 * before P (fallers) up to just before your next pick — anyone ranked later can be taken
 * with that pick instead. Picks are planned in order so no prospect is suggested twice.
 */
export function planPicks(
    pickNumbers: number[],
    prospects: ScoutedPlayer[],
    needs: RosterNeeds,
    draftSize: number,
): PickPlan[] {
    const sorted = [...pickNumbers].sort((a, b) => a - b);
    const used = new Set<number>();
    const maxPositionNeed = Math.max(1, ...Object.values(needs.positions).map(n => n.score));

    return sorted.map((pickNumber, i) => {
        const next = sorted[i + 1] ?? null;
        const from = Math.max(1, pickNumber - FALLER_MARGIN);
        const window = { from, to: next !== null ? next - 1 : null };

        const candidates = prospects.filter(p =>
            p.cs_rank !== null && !used.has(p.id)
            && p.cs_rank >= from && (next === null || p.cs_rank < next)
        );

        const scored = candidates.map(p => {
            const { value, reason: potentialReason } = prospectValue(p, draftSize);
            const reasons: string[] = [];
            if (potentialReason) reasons.push(potentialReason);

            let fit = 0;
            if (p.position) {
                const need = needs.positions[p.position];
                if (need.score > 0) {
                    fit += 0.6 * (need.score / maxPositionNeed);
                    reasons.push(`${p.position} need: ${need.reasons.join(', ')}`);
                }
            }
            const typeNeed = p.player_type && needs.types.find(t => t.type === p.player_type && p.position && t.group === groupOf(p.position));
            if (typeNeed && typeNeed.score > 0) {
                fit += Math.min(0.4, typeNeed.score * 4);
                reasons.push(`short on ${TYPE_NAMES[typeNeed.type] ?? typeNeed.type} (${typeNeed.have} of ${typeNeed.want} wanted)`);
            }

            // Scouting verdicts: gems outperform their read, busts fall short of it
            const verdict = p.gem_bust === 'Gem' ? 1.25 : p.gem_bust === 'Bust' ? 0.5 : 1;
            if (p.gem_bust) reasons.unshift(p.gem_bust);

            // Potential leads; fit multiplies it. A tiny CS-rank term breaks ties toward the
            // better-ranked prospect.
            const score = value * (1 + fit) * verdict + (draftSize - p.cs_rank!) / (draftSize * 100);
            return { prospect: p, score, reasons, mayBeGone: p.cs_rank! < pickNumber };
        });

        const targets = scored.sort((a, b) => b.score - a.score).slice(0, TARGETS_PER_PICK);
        targets.forEach(t => used.add(t.prospect.id));
        return { pickNumber, window, targets };
    });
}
