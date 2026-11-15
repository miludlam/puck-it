import { JuniorLeague, Scout, ScoutedPlayer, SHORTLIST_MAX } from '@/types';
import { ratingScore } from '@/utils/scoutAssignment';

// End-of-season gap filling: Board prospects nobody is scouting, matched to the scouts
// who've finished their assignments, best regional rating first (overall breaks ties).

export const isUnscouted = (p: ScoutedPlayer) => p.scout_id === null && !p.taken;

export interface ScoutOption {
    scout: Scout;
    rating: Scout['overall_rating'];  // rating for the league in question
    room: number;                     // shortlist spots left
    free: boolean;                    // obligations done
}

/** Hired scouts ranked for a league; free scouts with shortlist room first */
export function rankScoutsFor(
    league: JuniorLeague | null,
    scouts: Scout[],
    shortlistCount: (scoutID: number) => number,
): ScoutOption[] {
    return scouts
        .map(scout => ({
            scout,
            rating: league ? scout.region_ratings[league] ?? null : null,
            room: SHORTLIST_MAX - shortlistCount(scout.id),
            free: scout.obligations_done,
        }))
        .filter(o => o.room > 0)
        .sort((a, b) =>
            Number(b.free) - Number(a.free)
            || ratingScore(b.rating) - ratingScore(a.rating)
            || ratingScore(b.scout.overall_rating) - ratingScore(a.scout.overall_rating)
        );
}

export interface LeagueGap {
    league: JuniorLeague | null;
    prospects: ScoutedPlayer[];   // unscouted, CS order
    options: ScoutOption[];       // best first
}

export function leagueGaps(
    prospects: ScoutedPlayer[],
    scouts: Scout[],
    shortlistCount: (scoutID: number) => number,
): LeagueGap[] {
    const byLeague = new Map<JuniorLeague | null, ScoutedPlayer[]>();
    for (const p of prospects.filter(isUnscouted)) {
        byLeague.set(p.junior_league, [...(byLeague.get(p.junior_league) ?? []), p]);
    }
    return [...byLeague]
        .map(([league, list]) => ({
            league,
            prospects: list.sort((a, b) => (a.cs_rank ?? Infinity) - (b.cs_rank ?? Infinity)),
            options: rankScoutsFor(league, scouts, shortlistCount),
        }))
        .sort((a, b) => b.prospects.length - a.prospects.length);
}
