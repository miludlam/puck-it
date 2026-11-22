import { JuniorLeague, Scout, ScoutRating, ScoutStatus } from '@/types';

// Target number of scouts per region (also each region's priority, highest first)
export const ALLOTMENT: Partial<Record<JuniorLeague, number>> = {
    'OHL':        3,
    'QMJHL':      2,
    'WHL':        2,
    'US Central': 2,
    'Russia':     2,
    'SHL':        2,
    'Liiga':      2,
    'US West':    1,
    'US East':    1,
    'Extraliga':  1,
    'NLA':        1,
    'DEL':        1,
};

// Rank a letter rating numerically (higher = better, unrated = 0)
const ratingValue: Record<ScoutRating, number> = {
    'A+': 13, 'A': 12, 'A-': 11,
    'B+': 10, 'B': 9,  'B-': 8,
    'C+': 7,  'C': 6,  'C-': 5,
    'D+': 4,  'D': 3,  'D-': 2,
    'E': 1,
};

const value = (rating: ScoutRating | null | undefined) => rating ? ratingValue[rating] : 0;
export const ratingScore = value;

/**
 * Dense priority rank for each scout (higher = better): overall first, then region
 * ratings compared in target order (highest-target region first) until one differs.
 * Scouts identical on every count share a rank.
 */
function priorityRanks(scouts: Scout[], regionsByTarget: JuniorLeague[]): Map<Scout, number> {
    const compare = (a: Scout, b: Scout) => {
        const diff = value(a.overall_rating) - value(b.overall_rating);
        if (diff) return diff;
        for (const region of regionsByTarget) {
            const d = value(a.region_ratings[region]) - value(b.region_ratings[region]);
            if (d) return d;
        }
        return 0;
    };

    const sorted = [...scouts].sort(compare);
    const ranks = new Map<Scout, number>();
    let rank = 0;
    sorted.forEach((scout, i) => {
        if (i === 0 || compare(sorted[i - 1], scout) !== 0) rank++;
        ranks.set(scout, rank);
    });
    return ranks;
}

export interface ScoutMove {
    scout: Scout;
    from: JuniorLeague | null;
    to: JuniorLeague | null;
}

/**
 * Optimal assignment of unlocked scouts to region slots. Locked scouts keep their
 * region and consume its allotment. Returns only the scouts whose region changes.
 */
export function autoAssignScouts(
    scouts: Scout[],
    allotment: Partial<Record<JuniorLeague, number>>,
): ScoutMove[] {
    const free = scouts.filter(s => !s.region_locked);

    // Expand each region into one slot per remaining opening
    const slots: JuniorLeague[] = [];
    for (const [region, target] of Object.entries(allotment) as [JuniorLeague, number][]) {
        const locked = scouts.filter(s => s.region_locked && s.region === region).length;
        for (let i = locked; i < target; i++) slots.push(region);
    }

    const n = Math.max(free.length, slots.length);
    if (!n) return [];

    const regionsByTarget = (Object.keys(allotment) as JuniorLeague[])
        .sort((a, b) => allotment[b]! - allotment[a]!);
    const ranks = priorityRanks(free, regionsByTarget);
    const maxTarget = allotment[regionsByTarget[0]]!;
    const maxRank = Math.max(1, ...ranks.values());

    // Lexicographic objective packed into one integer per cell, highest tier first:
    //   1. region rating       — every slot counts equally
    //   2. rank × target × rating — on ties, higher-ranked scouts take the
    //      higher-target slots, and slots where they're rated
    //   3. stay put             — avoids pointless swaps between identical scouts
    // Each scale exceeds the largest possible total of every tier below it.
    const stayScale = 1;
    const tiebreakScale = (free.length + 1) * stayScale;
    const ratingScale = (slots.length * maxTarget * 13 * maxRank + 1) * tiebreakScale;

    // Square cost matrix (padding rows/cols cost 0 = unassigned / empty slot)
    const cost = Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) => {
            if (i >= free.length || j >= slots.length) return 0;
            const scout = free[i];
            const region = slots[j];
            const rating = value(scout.region_ratings[region]);
            const tiebreak = ranks.get(scout)! * allotment[region]! * rating;
            const stay = scout.region === region ? 1 : 0;
            return -(rating * ratingScale + tiebreak * tiebreakScale + stay * stayScale);
        })
    );

    const rowToCol = hungarian(cost);

    return free.flatMap((scout, i) => {
        const to = slots[rowToCol[i]] ?? null;
        return to === scout.region ? [] : [{ scout, from: scout.region, to }];
    });
}

// Total region-rating value of a layout (allotted regions only)
function coverage(scouts: Scout[], allotment: Partial<Record<JuniorLeague, number>>, moves: ScoutMove[]): number {
    const moved = new Map(moves.map(m => [m.scout.id, m.to]));
    return scouts.reduce((sum, s) => {
        const region = moved.has(s.id) ? moved.get(s.id)! : s.region;
        return region && allotment[region] ? sum + value(s.region_ratings[region]) : sum;
    }, 0);
}

export interface LockSuggestion {
    moves: ScoutMove[];       // full layout change from the current state, locked scouts included
    lockedMoves: ScoutMove[]; // the subset that moves a locked scout
    gain: number;             // rating steps gained over the best lock-respecting layout (0 = tiebreak-only)
}

/**
 * What auto-assign would do if every lock were lifted. Returns null when the locks
 * cost nothing, i.e. the unconstrained optimum leaves every locked scout in place.
 */
export function suggestLockedMoves(
    scouts: Scout[],
    allotment: Partial<Record<JuniorLeague, number>>,
): LockSuggestion | null {
    const unlocked = scouts.map(s => ({ ...s, region_locked: false }));
    const byId = new Map(scouts.map(s => [s.id, s]));
    const moves = autoAssignScouts(unlocked, allotment)
        .map(m => ({ ...m, scout: byId.get(m.scout.id)! }));

    const lockedMoves = moves.filter(m => m.scout.region_locked);
    if (!lockedMoves.length) return null;

    const gain = coverage(scouts, allotment, moves)
        - coverage(scouts, allotment, autoAssignScouts(scouts, allotment));
    return { moves, lockedMoves, gain };
}

// Hungarian algorithm (min-cost perfect matching), O(n^3). Returns row → column.
function hungarian(cost: number[][]): number[] {
    const n = cost.length;
    const u = new Array(n + 1).fill(0);
    const v = new Array(n + 1).fill(0);
    const p = new Array(n + 1).fill(0);   // p[j] = row matched to column j (1-indexed)
    const way = new Array(n + 1).fill(0);

    for (let i = 1; i <= n; i++) {
        p[0] = i;
        let j0 = 0;
        const minv = new Array(n + 1).fill(Infinity);
        const used = new Array(n + 1).fill(false);

        do {
            used[j0] = true;
            const i0 = p[j0];
            let delta = Infinity;
            let j1 = 0;
            for (let j = 1; j <= n; j++) {
                if (used[j]) continue;
                const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
                if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
                if (minv[j] < delta) { delta = minv[j]; j1 = j; }
            }
            for (let j = 0; j <= n; j++) {
                if (used[j]) { u[p[j]] += delta; v[j] -= delta; }
                else minv[j] -= delta;
            }
            j0 = j1;
        } while (p[j0] !== 0);

        do {
            const j1 = way[j0];
            p[j0] = p[j1];
            j0 = j1;
        } while (j0 !== 0);
    }

    const rowToCol = new Array(n).fill(-1);
    for (let j = 1; j <= n; j++) if (p[j]) rowToCol[p[j] - 1] = j - 1;
    return rowToCol;
}

// Head start for scouts already committed to, in rating steps: a shortlisted scout takes a
// hired scout's slot only by a marked margin, and an offer is worth honouring over a near-equal
const INCUMBENCY: Record<ScoutStatus, number> = { hired: 2, offered: 1, shortlisted: 0 };

type Layout = Map<number, JuniorLeague | null>;

/**
 * One layout for everyone — payroll, offers and shortlist together. Locked hired scouts keep
 * their region (unless `ignoreLocks`); everyone else competes for the remaining slots on
 * region rating plus their head start, then overall, then staying where they are (an
 * offer's target counts as where they are). Scouts left without a slot map to null, as do
 * offered or shortlisted scouts whose only slot is a region they're unrated in.
 */
function planLayout(scouts: Scout[], allotment: Partial<Record<JuniorLeague, number>>, ignoreLocks = false): Layout {
    const pinned = (s: Scout) => !ignoreLocks && s.status === 'hired' && s.region_locked && !!s.region && !!allotment[s.region];
    const locked = scouts.filter(pinned);
    const free = scouts.filter(s => !pinned(s));

    const slots: JuniorLeague[] = [];
    for (const [region, target] of Object.entries(allotment) as [JuniorLeague, number][]) {
        for (let i = locked.filter(s => s.region === region).length; i < target; i++) slots.push(region);
    }

    const layout: Layout = new Map(locked.map(s => [s.id, s.region]));
    const n = Math.max(free.length, slots.length);
    if (!n) return layout;

    // Lexicographic, as in autoAssignScouts: rating + head start, then overall, then stay put
    const overallScale = free.length + 1;
    const ratingScale = (13 * free.length + 1) * overallScale;
    const cost = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => {
        if (i >= free.length || j >= slots.length) return 0;
        const scout = free[i];
        const region = slots[j];
        const rating = value(scout.region_ratings[region]);
        if (!rating && scout.status !== 'hired') return 0; // no better than leaving them out
        return -((value(scout.region_ratings[region]) + INCUMBENCY[scout.status]) * ratingScale
            + value(scout.overall_rating) * overallScale
            + (scout.region === region ? 1 : 0));
    }));

    const rowToCol = hungarian(cost);
    free.forEach((s, i) => {
        const region = slots[rowToCol[i]] ?? null;
        layout.set(s.id, region && (s.status === 'hired' || value(s.region_ratings[region])) ? region : null);
    });
    return layout;
}

const layoutCoverage = (scouts: Scout[], layout: Layout) =>
    scouts.reduce((sum, s) => {
        const region = layout.get(s.id);
        return region ? sum + value(s.region_ratings[region]) : sum;
    }, 0);

export interface ScoutAdvice {
    scout: Scout;                                         // an offered or shortlisted scout
    region: JuniorLeague | null;                          // target region in the plan, null = no place
    replaces: Scout | null;                               // who held that region and gives it up
    gain: number;                                         // rating steps over who they replace (or an empty slot)
    unlock: { region: JuniorLeague; locked: Scout[] } | null; // a better region, if these locks were lifted
}

export interface HiringPlan {
    candidates: ScoutAdvice[];   // offers first, then shortlist, best gain first
    moves: ScoutMove[];          // unlocked hired scouts shifting to make room
    releases: Scout[];           // hired scouts to let go once the plan's hires sign
    gain: number;                // coverage over the payroll's own best layout
}

/**
 * Where offered and shortlisted scouts should target, judged against each other and the
 * payroll at once: who's a marked improvement on a hired or offered scout, and which
 * unlocked scouts can shift so both fit. Payroll beyond `maxScouts` means releases.
 */
export function planHiring(scouts: Scout[], allotment: Partial<Record<JuniorLeague, number>>, maxScouts: number): HiringPlan {
    const hired = scouts.filter(s => s.status === 'hired');
    const pending = scouts.filter(s => s.status !== 'hired');
    const plan = planLayout(scouts, allotment);
    const unlockedPlan = planLayout(scouts, allotment, true);
    const at = (s: Scout) => plan.get(s.id) ?? null;

    const candidates = pending.map((scout): ScoutAdvice => {
        const region = at(scout);
        const rating = region ? value(scout.region_ratings[region]) : 0;
        // The weakest scout (hired, or an offer targeting it) who loses this region in the plan
        const replaces = region ? scouts
            .filter(o => o !== scout && o.region === region && at(o) !== region)
            .sort((a, b) => value(a.region_ratings[region]) - value(b.region_ratings[region]))[0] ?? null : null;

        let unlock: ScoutAdvice['unlock'] = null;
        const better = unlockedPlan.get(scout.id) ?? null;
        if (better && value(scout.region_ratings[better]) > rating) {
            const locked = hired.filter(o => o.region_locked && o.region === better && unlockedPlan.get(o.id) !== better);
            if (locked.length) unlock = { region: better, locked };
        }

        return {
            scout, region, replaces, unlock,
            gain: region ? rating - (replaces ? value(replaces.region_ratings[region]) : 0) : 0,
        };
    }).sort((a, b) => Number(b.scout.status === 'offered') - Number(a.scout.status === 'offered')
        || Number(!!b.region) - Number(!!a.region) || b.gain - a.gain);

    const moves = hired
        .filter(s => !s.region_locked && at(s) && at(s) !== s.region)
        .map(s => ({ scout: s, from: s.region, to: at(s) }));

    // Signing everyone the plan places can push the payroll over the limit
    const signing = pending.filter(s => at(s)).length;
    const releases = hired
        .filter(s => !at(s))
        .sort((a, b) => value(a.overall_rating) - value(b.overall_rating))
        .slice(0, Math.max(0, hired.length + signing - maxScouts));

    const base = coverage(hired, allotment, autoAssignScouts(hired, allotment));
    return { candidates, moves, releases, gain: layoutCoverage(scouts, plan) - base };
}
