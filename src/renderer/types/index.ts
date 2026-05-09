// Position Types
export type Position = 'C' | 'LW' | 'RW' | 'LD' | 'RD' | 'G';

// League Types
export type League = 'NHL' | 'AHL' | 'ITS';
export type JuniorLeague = 'OHL' | 'QMJHL' | 'WHL' |                // Canada
                           'US Central' | 'US East' | 'US West' |   // USA
                           'Allsvenskan' | 'Liiga' | 'SHL' |        // Scandinavia
                           'DEL' | 'Extraliga' | 'ICE' | 'NLA' |    // Central Europe
                           'Russia' | 'ROW';                        // Asia

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
    aav: number;
    years_remaining: number;
    contract_type: ContractType | null;
    clause: Clause | null;
    waiver_eligible: number;
    status: PlayerStatus;
    notes: string | null;
    line_slot: string | null;
    line_league: LineLeague | null;
    role: string;
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

export interface Franchise {
    id: number;
    team_id: string | null;
    season: number;
    created_at: string;
}

declare global {
    interface Window {
        db: Record<string, (...args: unknown[]) => Promise<unknown>>;
    }
}
