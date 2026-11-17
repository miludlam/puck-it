import { Extension, Player, Position, TeamStatus } from '@/types';
import { analyzeRoster, groupOf, potentialValue } from '@/utils/draftTargets';
import { faStatusOf } from '@/utils/contracts';
import { formatCap, minSalary } from '@/utils/league';

export type CoreTier = 'Core' | 'Keep' | 'Replaceable' | 'Expendable';
export const CORE_TIERS: CoreTier[] = ['Core', 'Keep', 'Replaceable', 'Expendable'];

const TIER_FLOOR: Record<CoreTier, number> = { Core: 0.6, Keep: 0.42, Replaceable: 0.22, Expendable: -Infinity };

// How much a team leans on today's overall against the years ahead
const WEIGHTS: Record<TeamStatus, { now: number; future: number; summary: string }> = {
    Contender: { now: 0.7, future: 0.3, summary: 'Contender: weighted toward what players give you this season.' },
    Bubble: { now: 0.5, future: 0.5, summary: 'Bubble: today and the next few seasons weighted evenly.' },
    Rebuild: { now: 0.3, future: 0.7, summary: 'Rebuild: weighted toward youth, potential and term.' },
};

const DEVELOPING_AGE = 24; // potential still counts for this age and under
const PRIME_AGE = 26;      // value holds through this age, then declines
// Too old to build around: anyone this age, or this age in a rebuild, tops out at Keep
const CORE_MAX_AGE = 31;
const REBUILD_CORE_MAX_AGE = 27;

// 0 at 74 OVR, 1 at 87+
const nowValue = (p: Player) => Math.min(1, Math.max(0, (p.overall - 74) / 13));

// Share of a player's value that lasts past this season
function ageFactor(age: number) {
    if (age <= PRIME_AGE) return 1;
    return Math.max(0.3, 1 - (age - PRIME_AGE) * 0.1);
}

// Rough market cap hit by overall ($M), rising toward star money. A yardstick for
// bargains and overpays, not a prediction of any one deal.
const TYPICAL_AAV: [number, number][] = [[78, 1.5], [80, 2.5], [82, 3.75], [84, 5.25], [86, 7], [88, 9], [90, 11], [92, 13]];
export function typicalAav(overall: number) {
    const above = TYPICAL_AAV.findIndex(([ovr]) => ovr >= overall);
    if (above === 0) return Math.max(minSalary(), TYPICAL_AAV[0][1] - (TYPICAL_AAV[0][0] - overall) * 0.25);
    if (above === -1) return TYPICAL_AAV[TYPICAL_AAV.length - 1][1];
    const [[x0, y0], [x1, y1]] = [TYPICAL_AAV[above - 1], TYPICAL_AAV[above]];
    return y0 + ((overall - x0) / (x1 - x0)) * (y1 - y0);
}

export interface Assessment {
    player: Player;
    tier: CoreTier;
    score: number;
    reasons: string[];
}

export interface PlayerNote {
    player: Player;
    note: string;
}

export interface LineupMove {
    up: Player;           // AHL player outrating an NHL regular
    down: Player | null;  // the NHL player he'd replace
    position: Position;
    note: string;
}

export interface CoreReport {
    summary: string;
    assessments: Assessment[];  // best first
    extendSoon: PlayerNote[];
    lineupMoves: LineupMove[];
    bargains: PlayerNote[];
    burdens: PlayerNote[];
    succession: PlayerNote[];
}

const plays = (p: Player, position: Position) => p.position === position || p.position2 === position;
const name = (p: Player) => `${p.first_name.charAt(0)}. ${p.last_name}`;
const contract = (p: Player) => `${formatCap(p.aav)} × ${p.years_remaining}`;

/** Who to build around and who's replaceable, judged for the team's direction */
export function assessRoster(players: Player[], status: TeamStatus, extensions: Extension[] = []): CoreReport {
    const weights = WEIGHTS[status];
    const nhl = players.filter(p => p.roster_league === 'NHL');
    const needs = analyzeRoster(players);

    // Someone younger in the system at least as good now, or with as much potential
    const replacementFor = (p: Player) => players.find(o => o.id !== p.id && plays(o, p.position) && o.age < p.age
        && (o.overall >= p.overall
            || (o.age <= DEVELOPING_AGE && potentialValue(o.position, o.potential_level, o.potential_chance)
                >= potentialValue(p.position, p.potential_level, p.potential_chance) && o.overall >= p.overall - 6)));

    const assessments: Assessment[] = players.map(p => {
        const reasons: string[] = [];
        const now = nowValue(p);
        const potential = potentialValue(p.position, p.potential_level, p.potential_chance) / 10;
        const developing = p.age <= DEVELOPING_AGE && potential > now;
        const future = Math.max(now, developing ? potential : 0) * ageFactor(p.age);

        let score = weights.now * now + weights.future * future;

        // Rank among the organization's group by overall
        const group = players.filter(o => groupOf(o.position) === groupOf(p.position));
        const rank = group.filter(o => o.overall > p.overall).length + 1;
        const groupName = { FWD: 'forward', DEF: 'defenceman', G: 'goalie' }[groupOf(p.position)];
        if (rank <= 3 && p.overall >= 80) reasons.push(`${rank === 1 ? 'Top' : `#${rank}`} ${groupName} (${p.overall})`);
        else reasons.push(`${p.overall} OVR`);

        if (developing && p.potential_level) reasons.push(`${p.age} with ${p.potential_level} potential${p.potential_chance ? ` (${p.potential_chance})` : ''}`);
        else if (p.age <= PRIME_AGE && now >= 0.4) reasons.push(`${p.age}, in or before his prime`);
        else if (p.age >= 31) reasons.push(`${p.age}, declining`);

        // Contract value against what that overall usually costs, over up to four seasons
        if (p.aav > 0 && p.years_remaining > 0) {
            const surplus = typicalAav(p.overall) - p.aav;
            score += Math.max(-0.1, Math.min(0.1, (surplus * Math.min(p.years_remaining, 4)) / 40));
            if (surplus >= 1.5 && p.years_remaining >= 2) reasons.push(`Bargain at ${contract(p)}`);
            if (surplus <= -2 && p.years_remaining >= 2) reasons.push(`Pricey at ${contract(p)}`);
        }

        if (now >= 0.4 && !replacementFor(p)) {
            score += 0.05;
            reasons.push(`No one in the system to replace at ${p.position}`);
        }

        if (p.role && p.role !== 'Other') reasons.push(`Game role: ${p.role}`);

        let tier = CORE_TIERS.find(t => score >= TIER_FLOOR[t])!;
        const maxAge = status === 'Rebuild' ? REBUILD_CORE_MAX_AGE : CORE_MAX_AGE;
        if (tier === 'Core' && p.age > maxAge) {
            tier = 'Keep';
            reasons.push(status === 'Rebuild' ? 'Past a rebuild\'s window — worth most as a trade chip' : 'Too old to build around');
        }
        return { player: p, tier, score, reasons };
    }).sort((a, b) => b.score - a.score);

    const tierOf = new Map(assessments.map(a => [a.player.id, a.tier]));
    const valued = (p: Player) => ['Core', 'Keep'].includes(tierOf.get(p.id)!);
    const extensionOf = new Map(extensions.map(e => [e.player_id, e]));

    // Valued players whose deals end this season, unless an extension is agreed
    const extendSoon = players
        .filter(p => valued(p) && p.aav > 0 && p.years_remaining <= 1 && extensionOf.get(p.id)?.status !== 'Accepted')
        .map(p => ({ player: p, note: `${tierOf.get(p.id)} · ${faStatusOf(p, extensionOf.get(p.id) ?? null).status} after this season` }));

    // AHL players rated above the weakest NHL regular at a position they play. Core
    // players keep their spot, so a developing one isn't bumped for a veteran.
    const lineupMoves: LineupMove[] = [];
    for (const up of players.filter(p => p.roster_league === 'AHL').sort((a, b) => b.overall - a.overall)) {
        const options = [up.position, up.position2].filter((x): x is Position => !!x).flatMap((position): { position: Position; down: Player | null }[] => {
            const atPosition = nhl.filter(p => p.position === position);
            if (!atPosition.length) return [{ position, down: null }];
            const weakest = atPosition.filter(p => tierOf.get(p.id) !== 'Core' && !lineupMoves.some(m => m.down?.id === p.id))
                .sort((a, b) => a.overall - b.overall)[0];
            return weakest && weakest.overall < up.overall ? [{ position, down: weakest }] : [];
        });
        const best = options.sort((a, b) => (a.down?.overall ?? 0) - (b.down?.overall ?? 0))[0];
        if (!best) continue;
        const notes = [best.down ? `${up.overall} vs ${name(best.down)}'s ${best.down.overall} at ${best.position}` : `No NHL ${best.position}`];
        if (best.down?.waiver_eligible) notes.push(`${name(best.down)} needs waivers`);
        lineupMoves.push({ up, down: best.down, position: best.position, note: notes.join(' · ') });
    }

    const signedNhl = nhl.filter(p => p.aav > 0 && p.years_remaining >= 2);
    const bargains = signedNhl
        .filter(p => typicalAav(p.overall) - p.aav >= 1.5)
        .sort((a, b) => (typicalAav(b.overall) - b.aav) - (typicalAav(a.overall) - a.aav))
        .map(p => ({ player: p, note: `${contract(p)} for a ${p.overall}` }));
    const burdens = signedNhl
        .filter(p => p.aav - typicalAav(p.overall) >= 2)
        .sort((a, b) => (b.aav - typicalAav(b.overall)) - (a.aav - typicalAav(a.overall)))
        .map(p => ({ player: p, note: `${contract(p)} for a ${p.overall}${p.age >= 31 ? `, aged ${p.age}` : ''}${p.clause ? ` · ${p.clause}` : ''}` }));

    // Valued veterans without young NHL-calibre help coming at their position
    const succession = nhl
        .filter(p => valued(p) && p.age >= 30 && needs.positions[p.position].pipeline === 0)
        .map(p => ({ player: p, note: `No young ${p.position} with NHL potential coming up` }));

    return { summary: weights.summary, assessments, extendSoon, lineupMoves, bargains, burdens, succession };
}
