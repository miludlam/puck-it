import { Pick, Player, Position, TeamStatus } from '@/types';
import { analyzeRoster } from '@/utils/draftTargets';
import { assessRoster } from '@/utils/rosterCore';

// NHL lineup slots per position (12F / 6D / 2G); one extra per position is normal depth
export const NHL_SLOTS: Record<Position, number> = { C: 4, LW: 4, RW: 4, LD: 3, RD: 3, G: 2 };
const POSITIONS = Object.keys(NHL_SLOTS) as Position[];

const VETERAN_AGE = 30;
const SELL_AGE = 28; // rebuilding teams shop players this age and up on short deals

// Organizational depth at one position, each league best first
export interface DepthRow {
    position: Position;
    slots: number;
    nhl: Player[];
    ahl: Player[];
    its: Player[];
    state: 'surplus' | 'short' | 'ok'; // judged on the NHL lineup
}

export interface BlockCandidate {
    player: Player;
    reasons: string[];
    manual: boolean;           // placed on the block by hand
    clause: string | null;     // warning when a clause limits the trade
}

export interface TradeBlockReport {
    depth: DepthRow[];
    wants: string[];
    candidates: BlockCandidate[];
    pickChips: Pick[];         // picks this team could reasonably move
}

const STATUS_SUMMARY: Record<TeamStatus, string> = {
    Contender: 'Buyer — add NHL help now; move surplus depth, lower-ceiling prospects and mid/late picks.',
    Bubble: 'Balanced — fix shortages with players who have term; move surplus and aging contracts, keep the young core.',
    Rebuild: 'Seller — move veterans and short-term deals for picks, high-potential prospects and cap relief.',
};
export const statusSummary = (status: TeamStatus) => STATUS_SUMMARY[status];

const clauseWarning = (p: Player) =>
    p.clause === 'NMC' ? 'NMC — needs consent'
    : p.clause ? `${p.clause} — limited destinations`
    : null;


export function evaluateTradeBlock(
    players: Player[],
    status: TeamStatus,
    capSpace: number,
    myPicks: Pick[],
    draftYear: number,
): TradeBlockReport {
    const nhl = players.filter(p => p.roster_league === 'NHL');
    const ahl = players.filter(p => p.roster_league === 'AHL');
    const its = players.filter(p => p.roster_league === 'ITS');

    // Positional depth across the organization; surplus/short against the NHL lineup
    const atPosition = (group: Player[], position: Position) =>
        group.filter(p => p.position === position).sort((a, b) => b.overall - a.overall);
    const depth: DepthRow[] = POSITIONS.map(position => {
        const row = {
            position,
            slots: NHL_SLOTS[position],
            nhl: atPosition(nhl, position),
            ahl: atPosition(ahl, position),
            its: atPosition(its, position),
        };
        const state = row.nhl.length > row.slots + 1 ? 'surplus' : row.nhl.length < row.slots ? 'short' : 'ok';
        return { ...row, state };
    });

    const short = depth.filter(d => d.state === 'short').map(d => d.position);
    const surplus = new Set(depth.filter(d => d.state === 'surplus').map(d => d.position));
    const typeGaps = analyzeRoster(players).types.filter(t => t.score > 0).sort((a, b) => b.score - a.score);

    // What we're looking for
    const wants: string[] = [];
    for (const position of short) {
        wants.push(
            status === 'Contender' ? `NHL-ready ${position} — a rental is fine`
            : status === 'Bubble' ? `${position} aged 27 or under with term`
            : `Young ${position} prospect with high potential`
        );
    }
    if (status === 'Rebuild') {
        wants.push('1st/2nd-round picks', 'Prospects 21 or under with Franchise/Elite/Top potential', 'Cap relief — avoid taking back term');
    }
    for (const gap of typeGaps.slice(0, 2)) {
        wants.push(`${gap.type} (${gap.have} of ${gap.want} wanted)`);
    }
    if (status !== 'Rebuild') {
        wants.push(capSpace > 0
            ? `Up to $${capSpace.toFixed(3)}M in cap space to absorb`
            : `Over the cap by $${(-capSpace).toFixed(3)}M — salary has to go out`);
    }

    // Who to shop: manual picks first, then status-driven suggestions
    const candidates = new Map<number, BlockCandidate>();
    const add = (p: Player, reason: string, manual = false) => {
        const existing = candidates.get(p.id);
        if (existing) {
            existing.reasons.push(reason);
            existing.manual ||= manual;
        } else {
            candidates.set(p.id, { player: p, reasons: [reason], manual, clause: clauseWarning(p) });
        }
    };

    // Core players are only shopped when put on the block by hand
    const core = new Set(assessRoster(players, status).assessments.filter(a => a.tier === 'Core').map(a => a.player.id));
    for (const p of players.filter(p => p.on_block)) {
        add(p, 'On the block', true);
        if (core.has(p.id)) add(p, 'Core piece — sure about moving him?', true);
    }

    // Surplus extras: the lowest-rated players beyond slots + 1 at a crowded position
    for (const position of surplus) {
        const atPos = nhl.filter(p => p.position === position).sort((a, b) => a.overall - b.overall);
        const extras = atPos.length - (NHL_SLOTS[position] + 1);
        for (const p of atPos.slice(0, extras).filter(p => !core.has(p.id))) add(p, `Surplus at ${position} (${atPos.length} for ${NHL_SLOTS[position]} spots)`);
    }

    // A player's rank on the NHL depth chart at their position (0 = best)
    const depthRank = (p: Player) =>
        nhl.filter(o => o.position === p.position && o.overall > p.overall).length;
    // Top half of the lineup at a position — the core a non-rebuilding team keeps
    const isCore = (p: Player) => depthRank(p) < Math.ceil(NHL_SLOTS[p.position] / 2);

    for (const p of nhl) {
        if (p.clause === 'NMC' && !p.on_block) continue; // not suggested without consent
        if (core.has(p.id) && !p.on_block) continue;
        if (status === 'Rebuild' && p.age >= SELL_AGE && p.years_remaining <= 2) {
            add(p, `${p.age}-year-old on ${p.years_remaining <= 1 ? 'an expiring deal' : 'a short deal'} — sell for futures`);
        }
        if (status !== 'Rebuild' && p.age >= VETERAN_AGE && p.years_remaining >= 3 && !isCore(p)) {
            add(p, `${p.age} with ${p.years_remaining} years left — aging term`);
        }
        if (status === 'Bubble' && p.age >= VETERAN_AGE && p.years_remaining <= 1 && surplus.has(p.position)) {
            add(p, 'Expiring veteran at a deep position');
        }
    }

    // Contenders can spend lower-ceiling prospects as trade chips
    if (status === 'Contender') {
        for (const p of players.filter(p => p.roster_league !== 'NHL' && p.age >= 21 && p.potential_level?.startsWith('AHL'))) {
            add(p, `${p.potential_level} ceiling — trade chip`);
        }
    }

    const sortedCandidates = [...candidates.values()].sort((a, b) =>
        Number(b.manual) - Number(a.manual) || b.player.overall - a.player.overall
    );

    // Picks worth offering, by direction (rebuilding teams hold theirs)
    const normalizeYear = (y: number) => y < 100 ? 2000 + y : y;
    const minRound = status === 'Contender' ? 2 : status === 'Bubble' ? 4 : Infinity;
    const pickChips = myPicks
        .filter(p => p.round >= minRound && normalizeYear(p.year) <= draftYear + 1)
        .sort((a, b) => normalizeYear(a.year) - normalizeYear(b.year) || a.round - b.round);

    return { depth, wants, candidates: sortedCandidates, pickChips };
}
