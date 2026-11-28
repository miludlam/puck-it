import { Extension, FAStatus, FreeAgent, League, Pick, Player, Position } from '@/types';
import { ahlCapExemption, CAP_CEILING, formatCap, MAX_CONTRACTS, MAX_ROSTER, minSalary } from '@/utils/league';
import { NHL_SLOTS } from '@/utils/tradeBlock';

export const OUTLOOK_YEARS = 8;
export const UFA_AGE = 27;              // UFA at 27 (as of June 30 of the expiry year), else RFA
export const MAX_SALARY_SHARE = 0.2;   // of the cap
export const MAX_TERM_RESIGN = 8;       // re-signing your own player
export const MAX_TERM_FA = 7;           // signing someone else's

// What a contract costs against the NHL cap where the player plays, in a given season
export function capCharge(league: League, aav: number, season?: number): number {
    if (league === 'NHL') return aav;
    if (league === 'AHL') return Math.max(0, aav - ahlCapExemption(season));
    return 0; // ITS players aren't on the cap
}

export const seasonLabel = (season: number) => `${season}/${String(season + 1).slice(-2)}`;

// Age when the deal expires decides RFA vs UFA (accrued seasons aren't tracked)
export const ageAtExpiry = (p: Player) => p.age + Math.max(0, p.years_remaining - 1);
export function faStatusOf(p: Player, ext: Extension | null): { status: FAStatus; auto: boolean } {
    if (ext?.fa_status) return { status: ext.fa_status, auto: false };
    return { status: ageAtExpiry(p) >= UFA_AGE ? 'UFA' : 'RFA', auto: true };
}

/**
 * The roster once agreed deals take effect: extended players carry their new term (so
 * they're no longer expiring) and accepted free agents not yet signed join where they'd
 * play. For needs analysis — the draft planner weighs targets against this.
 */
export function rosterAfterDeals(players: Player[], extensions: Extension[], freeAgents: FreeAgent[]): Player[] {
    const accepted = new Map(extensions
        .filter(e => e.status === 'Accepted' && e.offer_aav !== null && e.offer_years !== null)
        .map(e => [e.player_id, e]));
    const extended = players.map(p => {
        const ext = accepted.get(p.id);
        return ext ? { ...p, years_remaining: Math.max(0, p.years_remaining) + ext.offer_years! } : p;
    });
    const signings = freeAgents
        .filter(fa => fa.status === 'Accepted' && fa.offer_aav !== null && fa.offer_years !== null)
        .map((fa): Player => ({
            id: -fa.id, // never collides with a rostered player
            first_name: fa.first_name,
            last_name: fa.last_name,
            position: fa.position,
            position2: null,
            age: fa.age ?? 25,
            roster_league: fa.target_league,
            junior_league: null,
            overall: fa.overall ?? 70,
            potential_level: fa.potential_level ?? '' as Player['potential_level'],
            potential_chance: fa.potential_chance ?? '' as Player['potential_chance'],
            player_type: fa.player_type ?? '',
            role: fa.role ?? '',
            aav: fa.offer_aav!,
            years_remaining: fa.offer_years!,
            contract_type: fa.offer_type,
            clause: fa.offer_clause,
            waiver_eligible: 1,
            status: 'Active',
            notes: null,
            line_slot: null,
            line_league: null,
            on_block: 0,
            created_at: fa.created_at,
        }));
    return [...extended, ...signings];
}

export interface OutlookYear {
    season: number;
    cap: number;
    nhl: Record<'FWD' | 'DEF' | 'G', number>;
    nhlTotal: number;
    buried: number;         // AHL salary above the exemption
    extensions: number;     // accepted extensions kicking in, plus accepted FAs not yet signed
    committed: number;      // what counts against the cap from our contracts
    retained: number;       // salary retained in trades, also against the cap
    space: number;
    pending: number;        // outstanding offers (extensions and free agents)
    spaceIfAccepted: number;
    ahlSalary: number;
    itsSalary: number;
    contracts: number;      // NHL/AHL contracts (50 max)
    exempt: number;         // signed ITS players
    expiring: number;       // deals ending after this season with no extension agreed
}

export interface OutlookInput {
    players: Player[];
    extensions: Extension[];
    freeAgents: FreeAgent[];
    season: number;
    ceilingFor?: (season: number) => number; // the season's cap; default for all if omitted
    retainedFor?: (season: number) => number; // salary retained in trades; none if omitted
    // Leave an offer out, to judge it on its own
    excludePlayerId?: number;
    excludeFreeAgentId?: number;
}

const groupOf = (position: Position) =>
    position === 'G' ? 'G' : position === 'LD' || position === 'RD' ? 'DEF' : 'FWD';

/**
 * Year-by-year cap picture, like the spreadsheet's Contracts sheet: a contract with N
 * years remaining covers this season and the next N - 1. Accepted extensions start the
 * season after the current deal ends; offers still out are shown separately.
 */
export function capOutlook(input: OutlookInput): OutlookYear[] {
    const { players, season } = input;
    const extensionOf = new Map(input.extensions.map(e => [e.player_id, e]));
    const years: OutlookYear[] = [];

    for (let i = 0; i < OUTLOOK_YEARS; i++) {
        const y: OutlookYear = {
            season: season + i,
            cap: input.ceilingFor?.(season + i) ?? CAP_CEILING,
            nhl: { FWD: 0, DEF: 0, G: 0 }, nhlTotal: 0, buried: 0, extensions: 0, committed: 0,
            retained: input.retainedFor?.(season + i) ?? 0,
            space: 0, pending: 0, spaceIfAccepted: 0, ahlSalary: 0, itsSalary: 0,
            contracts: 0, exempt: 0, expiring: 0,
        };
        const countContract = (league: League) => league === 'ITS' ? y.exempt++ : y.contracts++;

        for (const p of players) {
            const ext = extensionOf.get(p.id);
            const covered = p.aav > 0 && p.years_remaining > i;
            if (covered) {
                if (p.roster_league === 'NHL') y.nhl[groupOf(p.position)] += p.aav;
                if (p.roster_league === 'AHL') { y.ahlSalary += p.aav; y.buried += capCharge('AHL', p.aav, y.season); }
                if (p.roster_league === 'ITS') y.itsSalary += p.aav;
                countContract(p.roster_league);
                if (p.years_remaining === i + 1 && ext?.status !== 'Accepted') y.expiring++;
            }

            // Extension terms run from the end of the current deal
            if (!ext || ext.offer_aav === null || ext.offer_years === null || p.id === input.excludePlayerId) continue;
            const start = Math.max(0, p.years_remaining);
            if (i < start || i >= start + ext.offer_years) continue;
            const charge = capCharge(p.roster_league, ext.offer_aav, y.season);
            if (ext.status === 'Accepted') {
                y.extensions += charge;
                countContract(p.roster_league);
                if (i === start + ext.offer_years - 1) y.expiring++;
            }
            else if (ext.status === 'Offered') y.pending += charge;
        }

        for (const fa of input.freeAgents) {
            if (fa.offer_aav === null || fa.offer_years === null || fa.id === input.excludeFreeAgentId) continue;
            if (i >= fa.offer_years) continue;
            const charge = capCharge(fa.target_league, fa.offer_aav, y.season);
            if (fa.status === 'Accepted') { y.extensions += charge; y.contracts++; }
            else if (fa.status === 'Offered') y.pending += charge;
        }

        y.nhlTotal = y.nhl.FWD + y.nhl.DEF + y.nhl.G;
        y.committed = y.nhlTotal + y.buried + y.extensions;
        y.space = y.cap - y.committed - y.retained;
        y.spaceIfAccepted = y.space - y.pending;
        years.push(y);
    }
    return years;
}

// Offer-sheet compensation for signing another team's RFA, by the offer's average value
// (total ÷ the lesser of term and 5). 2025-26 NHL thresholds; the game may differ.
const OFFER_SHEET_TIERS: { upTo: number; rounds: number[] }[] = [
    { upTo: 1.573909, rounds: [] },
    { upTo: 2.384773, rounds: [3] },
    { upTo: 4.769548, rounds: [2] },
    { upTo: 7.154320, rounds: [1, 3] },
    { upTo: 9.539095, rounds: [1, 2, 3] },
    { upTo: 11.923867, rounds: [1, 1, 2, 3] },
    { upTo: Infinity, rounds: [1, 1, 1, 1] },
];
export const offerSheetValue = (aav: number, years: number) => (aav * years) / Math.min(years, 5);
export const offerSheetCompensation = (aav: number, years: number) =>
    OFFER_SHEET_TIERS.find(t => offerSheetValue(aav, years) <= t.upTo)!.rounds;

export type ImpactTone = 'good' | 'warn' | 'bad' | 'info';
export interface ImpactNote { tone: ImpactTone; text: string }

export interface OfferImpactInput extends OutlookInput {
    aav: number | null;
    years: number | null;
    askingAav: number | null;
    askingYears: number | null;
    league: League;
    position: Position;
    startOffset: number;        // seasons until the deal starts (extensions start after the current one)
    currentAav?: number;        // extensions: what they make now
    isNewContract: boolean;     // free agents add a contract and a roster spot
    rfaCompensation: boolean;   // signing another team's RFA
    myPicks: Pick[];            // picks we hold
    myTeam: string | null;
    draftYear: number;          // next draft (4-digit)
}

const roundLabel = (r: number) => ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th'][r - 1] ?? `${r}th`;

/** What signing this offer would mean: against the ask, the cap each year, limits, and fit. */
export function offerImpact(input: OfferImpactInput): ImpactNote[] {
    const notes: ImpactNote[] = [];
    const { aav, years } = input;
    if (aav === null || years === null || aav <= 0 || years <= 0) {
        return [{ tone: 'info', text: 'Enter an offer (AAV and years) to see its impact.' }];
    }

    // Against what they want
    if (input.askingAav) {
        const pct = Math.round((aav / input.askingAav) * 100);
        if (pct >= 100) notes.push({ tone: 'good', text: `Meets the ask (${formatCap(input.askingAav)})` });
        else if (pct >= 90) notes.push({ tone: 'warn', text: `${pct}% of the ask (${formatCap(input.askingAav)}) — may need a bump` });
        else notes.push({ tone: 'bad', text: `Only ${pct}% of the ask (${formatCap(input.askingAav)}) — likely refused` });
    }
    if (input.askingYears && input.askingYears !== years) {
        notes.push({ tone: 'warn', text: `Wants ${input.askingYears} year${input.askingYears === 1 ? '' : 's'}, offer is ${years}` });
    }
    if (input.currentAav !== undefined && input.currentAav > 0) {
        const diff = aav - input.currentAav;
        notes.push({ tone: 'info', text: `${diff >= 0 ? 'Raise' : 'Cut'} of ${formatCap(Math.abs(diff))} on today's ${formatCap(input.currentAav)}` });
    }

    // League limits (the max is a share of the cap in the deal's first season)
    const outlook = capOutlook(input);
    const maxSalary = (outlook[input.startOffset]?.cap ?? CAP_CEILING) * MAX_SALARY_SHARE;
    const startSeason = input.season + input.startOffset;
    if (aav < minSalary(startSeason)) notes.push({ tone: 'bad', text: `Below the ${formatCap(minSalary(startSeason))} league minimum` });
    if (aav > maxSalary) notes.push({ tone: 'bad', text: `Above the ${formatCap(maxSalary)} max (20% of the cap)` });
    const maxTerm = input.isNewContract ? MAX_TERM_FA : MAX_TERM_RESIGN;
    if (years > maxTerm) notes.push({ tone: 'bad', text: `Longer than the ${maxTerm}-year max term` });

    // Cap, each season the deal covers (within the outlook)
    const charge = capCharge(input.league, aav, startSeason);
    if (input.league !== 'NHL') {
        notes.push({ tone: 'info', text: charge > 0
            ? `${formatCap(charge)} of it counts against the cap while in the AHL`
            : input.league === 'AHL' ? 'Buried in the AHL — no cap hit' : 'ITS — no cap hit' });
    }
    const covered = outlook.slice(input.startOffset, input.startOffset + years);
    if (charge > 0 && covered.length) {
        const first = covered[0];
        const firstSpace = first.space - charge;
        const tightest = covered.reduce((min, y) => (y.space < min.space ? y : min));
        const tightSpace = tightest.space - charge;
        const firstText = `${seasonLabel(first.season)} space after: ${formatCap(firstSpace)}`;
        notes.push({ tone: firstSpace < 0 ? 'bad' : firstSpace < 2 ? 'warn' : 'good', text: firstText });
        if (tightest !== first) {
            notes.push({
                tone: tightSpace < 0 ? 'bad' : tightSpace < 2 ? 'warn' : 'info',
                text: `Tightest year: ${seasonLabel(tightest.season)} at ${formatCap(tightSpace)}`,
            });
        }
        if (first.pending > 0) {
            const ifAll = first.spaceIfAccepted - charge;
            notes.push({ tone: ifAll < 0 ? 'warn' : 'info', text: `${formatCap(ifAll)} if every other open offer is accepted too` });
        }
    }

    // Contracts and roster spots
    if (input.isNewContract) {
        const contracts = outlook[0].contracts + (input.league === 'ITS' ? 0 : 1);
        if (contracts > MAX_CONTRACTS) notes.push({ tone: 'bad', text: `${contracts} contracts — over the ${MAX_CONTRACTS} limit` });
        else notes.push({ tone: 'info', text: `${contracts} of ${MAX_CONTRACTS} contracts after signing` });

        if (input.league === 'NHL') {
            const roster = input.players.filter(p => p.roster_league === 'NHL' && p.status !== 'Injured').length + 1;
            if (roster > MAX_ROSTER) notes.push({ tone: 'warn', text: `NHL roster goes to ${roster} — someone has to go down` });
            const atPosition = input.players.filter(p => p.roster_league === 'NHL' && p.position === input.position).length;
            const slots = NHL_SLOTS[input.position];
            if (atPosition < slots) notes.push({ tone: 'good', text: `Fills an NHL need at ${input.position} (${atPosition}/${slots} spots)` });
            else if (atPosition >= slots + 1) notes.push({ tone: 'warn', text: `Crowds ${input.position} (${atPosition} for ${slots} spots)` });
        }
    }

    // Offer sheets cost picks — they must be your own, from the next drafts
    if (input.rfaCompensation) {
        const rounds = offerSheetCompensation(aav, years);
        if (!rounds.length) {
            notes.push({ tone: 'good', text: 'Offer sheet: no compensation at this value' });
        } else {
            const own = (year: number, round: number) => input.myPicks.some(p =>
                (p.year < 100 ? 2000 + p.year : p.year) === year && p.round === round && p.original_owner === input.myTeam && p.current_owner === input.myTeam);
            const missing: string[] = [];
            const seen: Record<number, number> = {};
            for (const r of rounds) {
                const year = input.draftYear + (seen[r] ?? 0); // multiple 1sts come from consecutive drafts
                seen[r] = (seen[r] ?? 0) + 1;
                if (!own(year, r)) missing.push(`${year} ${roundLabel(r)}`);
            }
            const list = rounds.map(roundLabel).join(' + ');
            const value = formatCap(offerSheetValue(aav, years));
            notes.push(missing.length
                ? { tone: 'bad', text: `Offer sheet costs ${list} (at ${value}) — you don't own your ${missing.join(', ')}` }
                : { tone: 'warn', text: `Offer sheet costs your ${list} (at ${value})` });
        }
    }

    return notes;
}
