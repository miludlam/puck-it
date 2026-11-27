import { NHLReadiness } from '@/types';

// NHL draft order. Non-playoff teams pick first, worst record first; playoff teams follow
// in reverse order of points (deep runs and division winners slot later, the champion
// last). Every round uses the same order; the lottery only reshuffles round 1: two
// draws, and a winner moves up at most 10 spots.
export const PLAYOFF_TEAMS = 16;
export const LOTTERY_MAX_JUMP = 10;
export const LOTTERY_DRAWS = 2;
export const DRAFT_ROUNDS = 7;

/** Projected round from a CS rank (≈ overall pick); past the last round, they go undrafted */
export const projectedRoundLabel = (rank: number, teamCount: number) => {
    const round = Math.ceil(rank / teamCount);
    return round > DRAFT_ROUNDS ? 'Undrafted' : `Rd ${round}`;
};

/** Roster note for a drafted player, e.g. "2027 Draft, Round 1, Pick 26. NHL ready in 3 years" */
export function draftNote(
    year: number,
    pick: { round: number; overall: number | null } | null,
    teamCount: number,
    readiness: NHLReadiness | null,
): string {
    const parts = [`${year} Draft`];
    if (pick) {
        parts.push(`Round ${pick.round}`);
        if (pick.overall) {
            const inRound = pick.overall - (pick.round - 1) * teamCount;
            parts.push(pick.round === 1 ? `Pick ${pick.overall}` : `Pick ${inRound} (${pick.overall} overall)`);
        }
    }
    const ready = !readiness ? null
        : readiness === 'NHL Ready' ? 'NHL ready now'
        : `NHL ready in ${readiness.replace('Year', 'year')}`;
    return parts.join(', ') + (ready ? `. ${ready}` : '');
}

export const lotteryTeamCount = (teamCount: number) => Math.max(0, teamCount - PLAYOFF_TEAMS);

// Without a hand-set value, the teams below the playoff line are in the lottery
export const autoInLottery = (position: number) => position > PLAYOFF_TEAMS;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Draft slot within each round (1 = first) from league position (1 = best record) */
export function draftSlot(position: number, inLottery: boolean, teamCount: number): number {
    const base = teamCount + 1 - position;
    const lottery = lotteryTeamCount(teamCount);
    return inLottery ? clamp(base, 1, lottery) : clamp(base, lottery + 1, teamCount);
}

/** Where a lottery team's 1st-rounder can land: win a draw, or drop as others jump ahead */
export function lotteryRange(slot: number, teamCount: number): { best: number; worst: number } {
    return {
        best: slot <= LOTTERY_MAX_JUMP + 1 ? 1 : slot - LOTTERY_MAX_JUMP,
        worst: Math.min(lotteryTeamCount(teamCount), slot + LOTTERY_DRAWS),
    };
}

/** Overall pick number for a round; round 1 uses the post-lottery pick once known */
export function overallPick(round: number, slot: number, teamCount: number, lotteryPick: number | null = null): number {
    return round === 1 && lotteryPick ? lotteryPick : (round - 1) * teamCount + slot;
}
