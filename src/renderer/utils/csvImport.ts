import type {
    Clause, ContractType, JuniorLeague, League, Player, PlayerStatus, PlayerType, Position,
    PotentialChance, PotentialLevel, Scout, ScoutRating, ScoutStatus,
} from '@/types';
import { groupOf, PLAYER_TYPES, POTENTIAL_TIERS } from './draftTargets';

// Bulk import from CSV, or rows pasted from a spreadsheet (tab-separated). Columns are
// matched by header name, so order doesn't matter and extra columns are ignored.

export type ImportKind = 'players' | 'scouts';
export type PlayerImport = Omit<Player, 'id' | 'created_at' | 'on_block'>;
export type ScoutImport = Omit<Scout, 'id' | 'obligations_done'>;

export interface ImportRow<T> {
    line: number;        // line in the file
    label: string;       // name, for the preview
    data: T | null;      // null when the row has errors
    errors: string[];
    warnings: string[];
}

export interface ImportResult<T> {
    rows: ImportRow<T>[];
    missing: string[];   // required columns not found
}

const POSITIONS: Position[] = ['C', 'LW', 'RW', 'LD', 'RD', 'G'];
const LEAGUES: League[] = ['NHL', 'AHL', 'ITS'];
const CHANCES: PotentialChance[] = ['Exact', 'High', 'Med', 'Low'];
const STATUSES: PlayerStatus[] = ['Active', 'Injured', 'Healthy Scratch'];
export const JUNIOR_LEAGUES: JuniorLeague[] = [
    'OHL', 'QMJHL', 'WHL', 'US Central', 'US East', 'US West',
    'Allsvenskan', 'Liiga', 'SHL', 'DEL', 'Extraliga', 'ICE', 'NLA', 'Russia', 'ROW',
];
const SCOUT_RATINGS: ScoutRating[] = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'E'];

/*************
 * Templates *
 *************/
const PLAYER_COLUMNS = [
    'League', 'First', 'Last', 'Position', 'Position 2', 'Overall', 'Potential', 'Chance', 'Age',
    'Player Type', 'Role', 'Salary', 'Length', 'Contract Type', 'Clause', 'Waiver Eligible',
    'Junior League', 'Status', 'Notes',
];
const SCOUT_COLUMNS = [
    'First', 'Last', 'Overall', 'Status', 'Region', 'Region Locked', 'Assignment End', ...JUNIOR_LEAGUES,
];

// Example rows show the accepted formats; delete them before importing
const PLAYER_EXAMPLES = [
    ['NHL', 'Sample', 'Centre', 'C', 'LW', '84', 'Top 6', 'High', '26', 'PLY', '2nd', '5.5', '4', '1-way', 'M-NTC', 'Y', '', 'Active', 'Delete example rows'],
    ['AHL', 'Sample', 'Defender', 'RD', '', '71', 'Top 4', 'Med', '20', 'TWD', 'Other', '0.875', '2', '2-way', '', 'N', '', 'Active', ''],
    ['ITS', 'Sample', 'Prospect', 'G', '', '58', 'Starter', 'Low', '18', '', '', '0', '0', '', '', 'Y', 'Liiga', 'Active', 'Unsigned draft pick'],
];
const SCOUT_EXAMPLES = [
    ['Sample', 'Scout', 'B+', 'Hired', 'OHL', 'N', '03-15', 'A', 'B+', 'B', 'C+', 'C', 'C', 'B-', 'C+', 'B', 'C', 'C-', 'D+', 'C', 'C-', 'D'],
    ['Sample', 'Target', 'A-', 'Offered', 'SHL', 'N', '', '', '', '', '', '', '', 'B', 'A-', 'A', '', '', '', '', '', ''],
];

const csvCell = (v: string) => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
const csvLine = (cells: string[]) => cells.map(csvCell).join(',');

export function template(kind: ImportKind) {
    const [columns, examples] = kind === 'players' ? [PLAYER_COLUMNS, PLAYER_EXAMPLES] : [SCOUT_COLUMNS, SCOUT_EXAMPLES];
    return [columns, ...examples].map(csvLine).join('\n') + '\n';
}

/***********
 * Parsing *
 ***********/

/** Rows of cells. Tabs mean a spreadsheet paste; otherwise commas, with quoted fields. */
export function parseTable(text: string): string[][] {
    text = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    const firstLine = text.slice(0, text.indexOf('\n') === -1 ? undefined : text.indexOf('\n'));
    const delimiter = firstLine.includes('\t') ? '\t' : ',';

    const rows: string[][] = [];
    let row: string[] = [], cell = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (quoted) {
            if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
            else if (ch === '"') quoted = false;
            else cell += ch;
        } else if (ch === '"' && cell === '') quoted = true;
        else if (ch === delimiter) { row.push(cell); cell = ''; }
        else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
        else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.map(r => r.map(c => c.trim()));
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// Header spellings accepted for each field (normalised: lowercase, letters and digits)
const PLAYER_HEADERS: Record<string, string[]> = {
    league: ['league', 'rosterleague', 'roster'],
    first: ['first', 'firstname'],
    last: ['last', 'lastname', 'surname'],
    name: ['name', 'fullname', 'player'],
    position: ['position', 'pos', 'position1'],
    position2: ['position2', 'pos2', 'secondaryposition'],
    overall: ['overall', 'ovr'],
    potential: ['potential', 'potentiallevel'],
    chance: ['chance', 'potentialchance'],
    age: ['age'],
    type: ['playertype', 'type'],
    role: ['role'],
    salary: ['salary', 'aav', 'caphit'],
    length: ['length', 'years', 'yearsremaining', 'yrs', 'term'],
    contractType: ['contracttype', 'contract'],
    clause: ['clause', 'tradeclause'],
    waiver: ['waivereligible', 'waivers', 'waiver'],
    junior: ['juniorleague', 'junior'],
    status: ['status'],
    notes: ['notes'],
};

const SCOUT_HEADERS: Record<string, string[]> = {
    first: ['first', 'firstname'],
    last: ['last', 'lastname', 'surname'],
    name: ['name', 'fullname', 'scout'],
    overall: ['overall', 'overallrating', 'rating'],
    status: ['status'],
    region: ['region', 'assignedregion', 'targetregion'],
    locked: ['regionlocked', 'locked'],
    end: ['assignmentend', 'end', 'enddate'],
    ...Object.fromEntries(JUNIOR_LEAGUES.map(l => [`rating:${l}`, [norm(l)]])),
};

function mapHeaders(header: string[], fields: Record<string, string[]>) {
    const index: Record<string, number> = {};
    header.forEach((h, i) => {
        const key = Object.keys(fields).find(f => fields[f].includes(norm(h)));
        if (key && index[key] === undefined) index[key] = i;
    });
    return index;
}

const blank = (v: string | undefined) => !v || v === '-' || v === '—' || v === '–';

// Case-insensitive match against allowed values, ignoring spaces and punctuation
function pick<T extends string>(value: string, options: readonly T[]): T | undefined {
    return options.find(o => norm(o) === norm(value));
}

function parseNumber(value: string) {
    const n = Number(value.replace(/[$,\s]/g, '').replace(/m$/i, ''));
    return Number.isFinite(n) ? n : null;
}

function parseBool(value: string): boolean | null {
    const v = norm(value);
    if (['y', 'yes', 'true', '1', 'x'].includes(v)) return true;
    if (['n', 'no', 'false', '0'].includes(v)) return false;
    return null;
}

function splitName(full: string) {
    const parts = full.trim().split(/\s+/);
    return parts.length > 1 ? { first: parts[0], last: parts.slice(1).join(' ') } : { first: '', last: full.trim() };
}

function parseRows<T>(
    text: string,
    headers: Record<string, string[]>,
    required: string[][], // each entry: any one of these fields satisfies it
    requiredLabels: string[],
    parseRow: (get: (field: string) => string, row: ImportRow<T>) => T | null,
): ImportResult<T> {
    // Skip empty rows, including spreadsheet rows holding only formula leftovers like ". ".
    // Line numbers stay those of the file.
    const table = parseTable(text)
        .map((cells, i) => ({ cells, line: i + 1 }))
        .filter(r => r.cells.some(c => /[a-z0-9]/i.test(c)));
    if (!table.length) return { rows: [], missing: [] };

    // The header is the early row matching the most known columns, so a title line above
    // it (Numbers exports the table name first) is skipped
    const fieldCount = (cells: string[]) => Object.keys(mapHeaders(cells, headers)).length;
    const headerAt = table.slice(0, 5).reduce((best, r, i) =>
        fieldCount(r.cells) > fieldCount(table[best].cells) ? i : best, 0);
    const index = mapHeaders(table[headerAt].cells, headers);
    const missing = requiredLabels.filter((_, i) => !required[i].some(f => index[f] !== undefined));
    if (missing.length) return { rows: [], missing };

    const rows = table.slice(headerAt + 1).map(({ cells, line }) => {
        const get = (field: string) => index[field] === undefined ? '' : (cells[index[field]] ?? '');
        const row: ImportRow<T> = { line, label: '', data: null, errors: [], warnings: [] };
        const data = parseRow(get, row);
        row.data = row.errors.length ? null : data;
        return row;
    });
    return { rows, missing };
}

/***********
 * Players *
 ***********/
export function parsePlayers(text: string): ImportResult<PlayerImport> {
    return parseRows<PlayerImport>(
        text, PLAYER_HEADERS,
        [['league'], ['first', 'last', 'name'], ['position'], ['overall'], ['age']],
        ['League', 'First / Last (or Name)', 'Position', 'Overall', 'Age'],
        (get, row) => {
            const err = (m: string) => row.errors.push(m);
            const warn = (m: string) => row.warnings.push(m);

            const names = get('first') || get('last') ? { first: get('first'), last: get('last') } : splitName(get('name'));
            row.label = `${names.first} ${names.last}`.trim() || '(no name)';
            if (!names.last && !names.first) err('No name');

            const league = pick(get('league'), LEAGUES);
            if (!league) err(get('league') ? `League "${get('league')}" isn't NHL, AHL or ITS` : 'No league');

            const position = pick(get('position'), POSITIONS);
            if (!position) err(get('position') ? `Unknown position "${get('position')}"` : 'No position');
            let position2: Position | null = null;
            if (!blank(get('position2'))) {
                position2 = pick(get('position2'), POSITIONS) ?? null;
                if (!position2) err(`Unknown second position "${get('position2')}"`);
                else if (position2 === position) position2 = null;
            }

            const overall = parseNumber(get('overall'));
            if (overall === null || !Number.isInteger(overall) || overall < 1 || overall > 99)
                err(get('overall') ? `Overall "${get('overall')}" isn't 1–99` : 'No overall');
            const age = parseNumber(get('age'));
            if (age === null || !Number.isInteger(age) || age < 15 || age > 50)
                err(get('age') ? `Age "${get('age')}" isn't a number from 15–50` : 'No age');

            // Potential as "Top 6" + Chance column, or combined "Top 6 (Exact)"
            let level: PotentialLevel | '' = '';
            let chance: PotentialChance = 'Med';
            let rawLevel = get('potential');
            let rawChance = get('chance');
            const combined = rawLevel.match(/^(.*?)\s*\((\w+)\)$/);
            if (combined) { rawLevel = combined[1]; if (blank(rawChance)) rawChance = combined[2]; }
            if (!blank(rawLevel) && position) {
                const found = pick(rawLevel.replace(/fringe starter/i, 'Fringe'), POTENTIAL_TIERS[groupOf(position)]);
                if (found) level = found;
                else err(`Potential "${rawLevel}" isn't a ${position} potential`);
            }
            if (!blank(rawChance)) {
                const found = pick(rawChance, CHANCES);
                if (found) chance = found;
                else err(`Chance "${rawChance}" isn't Exact, High, Med or Low`);
            }

            let playerType: PlayerType | '' = '';
            if (!blank(get('type')) && position) {
                const found = pick(get('type'), PLAYER_TYPES[groupOf(position)]);
                if (found) playerType = found;
                else err(`Player type "${get('type')}" isn't one for a ${position}`);
            }

            // Salary in $M; whole-dollar figures (975000) are converted
            let aav = 0;
            if (!blank(get('salary'))) {
                const n = parseNumber(get('salary'));
                if (n === null || n < 0) err(`Salary "${get('salary')}" isn't a number`);
                else aav = n >= 1000 ? n / 1e6 : n;
            }
            let years = 0;
            if (!blank(get('length'))) {
                const n = parseNumber(get('length'));
                if (n === null || !Number.isInteger(n) || n < 0 || n > 8) err(`Length "${get('length')}" isn't 0–8 years`);
                else years = n;
            }

            let contractType: ContractType | null = null;
            if (!blank(get('contractType'))) {
                const v = norm(get('contractType')).replace('way', '');
                contractType = v === '1' || v === 'one' ? '1-way' : v === '2' || v === 'two' ? '2-way' : null;
                if (!contractType) err(`Contract type "${get('contractType')}" isn't 1-way or 2-way`);
            }
            let clause: Clause | null = null;
            if (!blank(get('clause'))) {
                clause = pick(get('clause'), ['NMC', 'M-NTC', 'NTC'] as Clause[]) ?? null;
                if (!clause) err(`Clause "${get('clause')}" isn't NMC, M-NTC or NTC`);
            }

            let waiver = true;
            if (!blank(get('waiver'))) {
                const b = parseBool(get('waiver'));
                if (b === null) err(`Waiver eligible "${get('waiver')}" isn't Y or N`);
                else waiver = b;
            }

            let junior: JuniorLeague | null = null;
            if (!blank(get('junior'))) {
                junior = pick(get('junior'), JUNIOR_LEAGUES) ?? null;
                if (!junior) err(`Unknown junior league "${get('junior')}"`);
            }

            let status: PlayerStatus = 'Active';
            if (!blank(get('status'))) {
                const v = norm(get('status'));
                const found = pick(get('status'), STATUSES) ?? (v === 'hs' || v === 'scratch' || v === 'scratched' ? 'Healthy Scratch' : v === 'ir' ? 'Injured' : undefined);
                if (found) status = found;
                else err(`Status "${get('status')}" isn't Active, Injured or Healthy Scratch`);
            }

            if (league && league !== 'ITS' && aav === 0) warn('No salary');
            if (blank(rawLevel)) warn('No potential');

            if (row.errors.length) return null;
            return {
                first_name: names.first, last_name: names.last,
                position: position!, position2, age: age!, roster_league: league!, junior_league: junior,
                overall: overall!, potential_level: level as PotentialLevel, potential_chance: chance, player_type: playerType,
                role: blank(get('role')) ? '' : get('role'),
                aav, years_remaining: years, contract_type: contractType, clause,
                waiver_eligible: waiver ? 1 : 0, status, notes: get('notes') || null,
                line_slot: null, line_league: null,
            };
        },
    );
}

/**********
 * Scouts *
 **********/

// 'MM-DD' from 03-15, 3/15, 2026-03-15, 3/15/2026 or "15-Mar" (as spreadsheets show dates)
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
function parseMonthDay(value: string): string | null {
    let m: number, d: number;
    let match;
    if ((match = value.match(/^\d{4}-(\d{1,2})-(\d{1,2})$/))) [m, d] = [+match[1], +match[2]];
    else if ((match = value.match(/^(\d{1,2})[-/](\d{1,2})(?:[-/]\d{2,4})?$/))) [m, d] = [+match[1], +match[2]];
    else if ((match = value.match(/^(\d{1,2})[-\s]([a-z]{3})/i))) [m, d] = [MONTHS.indexOf(match[2].toLowerCase()) + 1, +match[1]];
    else if ((match = value.match(/^([a-z]{3})[a-z]*[-\s](\d{1,2})/i))) [m, d] = [MONTHS.indexOf(match[1].toLowerCase()) + 1, +match[2]];
    else return null;
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    return `${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function parseScouts(text: string): ImportResult<ScoutImport> {
    return parseRows<ScoutImport>(
        text, SCOUT_HEADERS,
        [['first', 'last', 'name']],
        ['First / Last (or Name)'],
        (get, row) => {
            const err = (m: string) => row.errors.push(m);

            const names = get('first') || get('last') ? { first: get('first'), last: get('last') } : splitName(get('name'));
            row.label = `${names.first} ${names.last}`.trim() || '(no name)';
            if (!names.first || !names.last) err('Scouts need a first and last name');

            const rating = (field: string, label: string) => {
                const v = get(field);
                if (blank(v)) return null;
                // Exact, since + and - are the difference between grades
                const found = SCOUT_RATINGS.find(r => r === v.toUpperCase().replace(/\s/g, ''));
                if (!found) err(`${label} rating "${v}" isn't A+ to E`);
                return found ?? null;
            };

            const overall = rating('overall', 'Overall');
            const regionRatings: Partial<Record<JuniorLeague, ScoutRating>> = {};
            for (const league of JUNIOR_LEAGUES) {
                const r = rating(`rating:${league}`, league);
                if (r) regionRatings[league] = r;
            }

            let status: ScoutStatus = 'hired';
            if (!blank(get('status'))) {
                const v = norm(get('status'));
                if (v === 'offered' || v === 'offer') status = 'offered';
                else if (v === 'shortlisted' || v === 'shortlist') status = 'shortlisted';
                else if (v !== 'hired') err(`Status "${get('status')}" isn't Hired, Offered or Shortlisted`);
            }

            let region: JuniorLeague | null = null;
            if (!blank(get('region'))) {
                region = pick(get('region'), JUNIOR_LEAGUES) ?? null;
                if (!region) err(`Unknown region "${get('region')}"`);
            }

            let locked = false;
            if (!blank(get('locked'))) {
                const b = parseBool(get('locked'));
                if (b === null) err(`Region locked "${get('locked')}" isn't Y or N`);
                else locked = b;
            }

            let end: string | null = null;
            if (!blank(get('end'))) {
                end = parseMonthDay(get('end'));
                if (!end) err(`Assignment end "${get('end')}" isn't a month and day (MM-DD)`);
            }

            if (!overall) row.warnings.push('No overall rating');

            if (row.errors.length) return null;
            return {
                first_name: names.first, last_name: names.last, overall_rating: overall,
                region_ratings: regionRatings, region, region_locked: locked, status, assignment_end: end,
            };
        },
    );
}
