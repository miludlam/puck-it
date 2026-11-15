// Position Types
export type Position = 'C' | 'LW' | 'RW' | 'LD' | 'RD' | 'G';

// League Types
export type League = 'NHL' | 'AHL' | 'ITS';
export type JuniorLeague = 'OHL' | 'QMJHL' | 'WHL' | // Canada
    'US Central' | 'US East' | 'US West' |           // USA
    'Allsvenskan' | 'Liiga' | 'SHL' |                // Scandinavia
    'DEL' | 'Extraliga' | 'ICE' | 'NLA' |            // Central Europe
    'Russia' | 'ROW';                                // Asia

// Player Potential Types
export type ForwardPotentialLevel = 'Top 6' | 'Top 9' | 'Bottom 6'|
    'AHL Top 6' | 'AHL Bottom 6' | 'AHL 4th Line' | 'AHL Extra' | 'AHL Other';
export type DefensePotentialLevel = 'Top 4' | 'Top 6' | '7th' |
    'AHL Top 2' | 'AHL Top 4' | 'AHL Top 6' | 'AHL 7th' | 'AHL Other';
export type GoaliePotentialLevel = 'Starter' | 'Fringe' | 'Backup' |
    'AHL Starter' | 'AHL Fringe' | 'AHL Backup' | 'AHL Extra' | 'AHL Other';
export type PotentialLevel = 'Franchise' | 'Elite' | ForwardPotentialLevel | DefensePotentialLevel | GoaliePotentialLevel;
export type PotentialChance = 'Exact' | 'High' | 'Med' | 'Low';

// Player Types
export type ForwardType = 'ENF' | 'GRN' | 'PLY' | 'PWF' | 'SNP' | 'TWF';
export type DefenseType = 'DFD' | 'ENF' | 'OFD' | 'TWD';
export type GoalieType = 'BF' | 'HYB' | 'SU';
export type PlayerType = ForwardType | DefenseType | GoalieType;

// Contract Types
export type ContractType = '1-way' | '2-way';
export type Clause = 'NMC' | 'M-NTC' | 'NTC';

// Player Status Types
export type PlayerStatus = 'Active' | 'Injured' | 'Healthy Scratch';

// Lines currently only consider Full Strength scenarios. PP & PK will come later
// Line Types
export type LineLeague = Exclude<League, 'ITS'>;

// Scout rating scale
export type ScoutRating =
    'A+' | 'A' | 'A-' |
    'B+' | 'B' | 'B-' |
    'C+' | 'C' | 'C-' |
    'D+' | 'D' | 'D-' | 'E';

// NHL readiness
export type NHLReadiness =
    'NHL Ready' | '1 Year' | '2 Years' |
    '3 Years'   | '4 Years' | '5 Years';

// Draft round
export type DraftRound = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface Player {
    id: number;
    first_name: string;
    last_name: string;
    position: Position;
    position2: Position | null;
    age: number;
    roster_league: League;
    junior_league: JuniorLeague | null;
    overall: number;
    potential_level: PotentialLevel;
    potential_chance: PotentialChance;
    player_type: PlayerType;
    role: string;
    aav: number;
    years_remaining: number;
    contract_type: ContractType | null;
    clause: Clause | null;
    waiver_eligible: number;
    status: PlayerStatus;
    notes: string | null;
    line_slot: string | null;
    line_league: LineLeague | null;
    on_block: number; // 1 = manually placed on the trade block
    created_at: string;
}

// Matches teams.json
export interface TeamColors {
    primary: string;
    secondary: string;
    tertiary: string;
}

export interface Team {
    id: string;
    name: string;
    ahl_affiliate: string;
    colors: TeamColors;
}

// Team direction — drives what the Trade Block shops and asks for
export type TeamStatus = 'Contender' | 'Bubble' | 'Rebuild';

export interface Franchise {
    id: number;
    team_id: string | null;
    season: number;
    team_status: TeamStatus;
    created_at: string;
}

// Trade history: each asset is a snapshot at the time of the trade
export interface TradePlayerSnapshot {
    first_name: string;
    last_name: string;
    position: Position;
    position2: Position | null;
    age: number;
    roster_league: League;
    overall: number;
    potential_level: PotentialLevel | '';
    potential_chance: PotentialChance | '';
    player_type: PlayerType | '';
    aav: number;
    years_remaining: number;
    contract_type: ContractType | null;
    clause: Clause | null;
}

export type TradeAsset = { direction: 'out' | 'in' } & (
    | { kind: 'player'; player: TradePlayerSnapshot }
    | {
        kind: 'pick';
        year: number;
        round: number;
        original_owner: string; // team the pick originally belonged to
        from_owner: string;     // who held it going into the trade
        to_owner: string;
    }
);

export interface Trade {
    id: number;
    season: number;
    partner: string; // team ID
    assets: TradeAsset[];
    notes: string | null;
    created_at: string;
}

// Incoming player as entered on the trade form (missing fields default in the DB).
// Spelled out because the draft `Pick` interface shadows TypeScript's Pick utility here.
export interface IncomingPlayer {
    first_name: string;
    last_name: string;
    position: Position;
    age: number;
    roster_league: League;
    overall: number;
    aav: number;
    years_remaining: number;
    potential_level?: PotentialLevel;
    potential_chance?: PotentialChance;
    player_type?: PlayerType;
    contract_type?: ContractType | null;
    clause?: Clause | null;
}

export interface TradeRequest {
    partner: string;
    notes: string | null;
    outPlayerIds: number[];
    outPickIds: number[];
    inPlayers: IncomingPlayer[];
    inPicks: { year: number; round: number; original_owner: string }[];
}

// Pick
export interface Pick {
    id: number;
    year: number;
    round: DraftRound;
    original_owner: string;  // team ID
    current_owner: string;   // team ID
    notes: string | null;
    projected_pick: number | null; // overall pick number, projected from standings
    locked: boolean;               // pick position finalized
}

// Scout
export type ScoutStatus = 'hired' | 'offered'; // offered = contract out, not on payroll yet

export interface Scout {
    id: number;
    first_name: string;
    last_name: string;
    overall_rating: ScoutRating | null;
    region_ratings: Partial<Record<JuniorLeague, ScoutRating>>;
    region: JuniorLeague | null;
    region_locked: boolean;
    status: ScoutStatus;
    assignment_end: string | null; // 'MM-DD' the shortlist assignment ends (years are irrelevant)
}

// Scouted Player (board prospect). A scout's shortlist is the prospects with their
// scout_id. Shortlist quick-adds leave the quality fields null until refined on the board.
export interface ScoutedPlayer {
    id: number;
    first_name: string;
    last_name: string;
    position: Position | null;
    position2: Position | null;
    age: number | null;
    junior_league: JuniorLeague | null;
    cs_rank: number | null; // Central Scouting rank ≈ projected pick
    overall: number | null;
    potential_level: PotentialLevel | null;
    potential_chance: PotentialChance | null;
    player_type: PlayerType | null;
    nhl_readiness: NHLReadiness | null;
    scout_id: number | null;
    notes: string | null;
    gem_bust: GemBust | null; // revealed by scouting; stays on the draft screen
}

export type GemBust = 'Gem' | 'Bust';

// A prospect with every field the draft needs filled in
export type RefinedScoutedPlayer = ScoutedPlayer & {
    position: Position;
    age: number;
    overall: number;
    potential_level: PotentialLevel;
    potential_chance: PotentialChance;
    player_type: PlayerType;
};

export function isRefined(p: ScoutedPlayer): p is RefinedScoutedPlayer {
    return p.position !== null && p.age !== null && p.overall !== null
        && p.potential_level !== null && p.potential_chance !== null && p.player_type !== null;
}

// Max prospects on one scout's shortlist (mirrors the main-process check)
export const SHORTLIST_MAX = 50;

declare global {
    interface Window {
        db: Record<string, (...args: unknown[]) => Promise<unknown>>;
    }
}
