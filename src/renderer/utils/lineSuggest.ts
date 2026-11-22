import { LineLeague, Player, Position, TeamStatus } from '@/types';
import { groupOf, isNhlPotential } from '@/utils/draftTargets';

/*
 * Lineup suggestions and notes. The game doesn't publish a line-chemistry formula for
 * franchise sims, so these follow hockey sense: best players highest, natural positions,
 * and a mix of player types on each line and pair.
 */

const FWD_POSITIONS: Position[] = ['LW', 'C', 'RW'];
const D_POSITIONS: Position[] = ['LD', 'RD'];

// Slot keys in line order — mirrors LineBuilderLines / LineBuilderScratches
export const lineSlots = (league: LineLeague) => ({
    forwards: [1, 2, 3, 4].map(n => FWD_POSITIONS.map(pos => `${league}-F${n}-${pos}`)),
    defence: [1, 2, 3].map(n => D_POSITIONS.map(pos => `${league}-D${n}-${pos}`)),
    goalies: [`${league}-G1`, `${league}-G2`],
    scratches: league === 'NHL' ? [1, 2, 3].map(n => `${league}-S${n}`) : [],
});

/** Cost of playing somewhere, in overall points: off-wing or off-side is mild, a winger at centre less so */
export function positionCost(p: Player, position: Position): number {
    if (p.position === position) return 0;
    if (p.position2 === position) return 0.5;
    if (groupOf(p.position) !== groupOf(position)) return Infinity;
    if (position === 'C') return 4; // faceoffs and defensive coverage
    return 2;
}

type Rating = (p: Player) => number;
const byOverall: Rating = p => p.overall;

// A rebuilding team gives young players with NHL potential the close calls
const YOUTH_AGE = 23;
const YOUTH_BOOST = 2;
const ratingFor = (status: TeamStatus): Rating => status !== 'Rebuild' ? byOverall
    : p => p.overall + (p.age <= YOUTH_AGE && isNhlPotential(groupOf(p.position), p.potential_level) ? YOUTH_BOOST : 0);

const effective = (p: Player, position: Position, rating: Rating = byOverall) => rating(p) - positionCost(p, position);

/**
 * Fill `perPosition` spots at each position from the candidates, maximising total
 * overall after position costs. Exact: a search over how many spots are filled at each
 * position (5 × 5 × 5 states for forwards), so ties resolve the same way every time.
 */
function fillPositions(candidates: Player[], positions: Position[], perPosition: number, rating: Rating): Map<Position, Player[]> {
    const sorted = [...candidates].sort((a, b) => rating(b) - rating(a) || a.id - b.id);
    type State = { score: number; picks: [Player, Position][] };
    let states = new Map<string, State>([[positions.map(() => 0).join(), { score: 0, picks: [] }]]);

    for (const p of sorted) {
        const next = new Map(states);
        const offer = (key: string, state: State) => {
            const current = next.get(key);
            if (!current || state.score > current.score + 1e-9) next.set(key, state);
        };
        for (const [key, state] of states) {
            const counts = key.split(',').map(Number);
            positions.forEach((pos, i) => {
                if (counts[i] >= perPosition || positionCost(p, pos) === Infinity) return;
                const filled = counts.map((c, j) => j === i ? c + 1 : c).join();
                offer(filled, { score: state.score + effective(p, pos, rating), picks: [...state.picks, [p, pos]] });
            });
        }
        states = next;
    }

    const best = [...states.values()].reduce((a, b) => b.score > a.score + 1e-9 ? b : a);
    const at = new Map<Position, Player[]>(positions.map(pos => [pos, []]));
    for (const [p, pos] of best.picks) at.get(pos)!.push(p);
    for (const pos of positions) at.get(pos)!.sort((a, b) => rating(b) - rating(a) || a.id - b.id);
    return at;
}

function permutations<T>(items: T[]): T[][] {
    if (items.length <= 1) return [items];
    return items.flatMap((item, i) =>
        permutations([...items.slice(0, i), ...items.slice(i + 1)]).map(rest => [item, ...rest]));
}

// Earlier lines matter more, so the best players rise to the top unless types say otherwise
const LINE_WEIGHT = [1.6, 1.4, 1.2, 1.0];
const PAIR_WEIGHT = [1.4, 1.2, 1.0];

const count = (line: Player[], ...types: string[]) => line.filter(p => types.includes(p.player_type)).length;

// Young players with NHL potential develop best beside a veteran who covers for them
const VETERAN_AGE = 28;
const developing = (p: Player) => p.age <= YOUTH_AGE && isNhlPotential(groupOf(p.position), p.potential_level);
const veteran = (p: Player) => p.age >= VETERAN_AGE;
// A young player already rated above the veterans around them doesn't need covering for
const mentoring = (line: Player[]) => {
    const vets = line.filter(veteran);
    const young = line.filter(p => developing(p) && vets.some(v => v.overall > p.overall));
    return { vets: vets.filter(v => young.some(p => v.overall > p.overall)), young };
};
// Only a tiebreaker: matching potential matters more for development
const mentorFit = (line: Player[]) => mentoring(line).young.length ? 0.1 : 0;

// Players still developing grow best on a line that matches their potential. Their current
// game role caps how far potential can pull them up — one line above it — so an Elite
// prospect in a depth role isn't rushed onto the top line.
const DEVELOPMENT_AGE = 25;
const POTENTIAL_WEIGHT = 0.75; // overall points per line below where they should be
const POTENTIAL_LINE: Record<string, number> = {
    Franchise: 1, Elite: 1, 'Top 6': 2, 'Top 9': 3, 'Bottom 6': 4, // forwards
    'Top 4': 2, '7th': 3,                                          // defence ('Top 6' is 3 for D)
};
const ROLE_LINE: Record<string, number> = {
    '1st': 1, '2nd': 2, '3rd SCR': 3, '3rd CHK': 3, '4th': 4, // forwards
    'Top 2': 1, 'Top 4': 2, 'Top 6': 3,                        // defence
};

/** The line (1-based) a developing player's potential points to, if any */
function potentialLine(p: Player): number | null {
    if (p.age > DEVELOPMENT_AGE || !p.potential_level) return null;
    const isD = groupOf(p.position) === 'DEF';
    return (isD && p.potential_level === 'Top 6' ? 3 : POTENTIAL_LINE[p.potential_level]) ?? null;
}

/** The highest line potential should pull a developing player to, once their role caps it */
export function targetLine(p: Player): number | null {
    const potential = potentialLine(p);
    if (!potential) return null;
    const isD = groupOf(p.position) === 'DEF';
    const role = p.role.replace(/^m/, ''); // minor-league roles read the same for AHL lines
    const roleLine = ROLE_LINE[role] ?? (role === 'Depth' ? (isD ? 4 : 5) : null);
    return roleLine ? Math.max(potential, roleLine - 1) : potential;
}

const potentialFit = (line: Player[], index: number) =>
    -POTENTIAL_WEIGHT * line.reduce((sum, p) => sum + Math.max(0, index + 1 - (targetLine(p) ?? Infinity)), 0);

/** How well a forward line's types fit together, in overall points */
function forwardFit(line: Player[], index: number): number {
    const shared = mentorFit(line) + potentialFit(line, index);
    if (index === 3) return 0.5 * count(line, 'GRN', 'ENF', 'PWF') + shared; // a checking fourth line
    let fit = shared;
    fit += count(line, 'PLY') ? 1 : count(line, 'TWF') ? 0.4 : 0;  // someone to create
    fit += count(line, 'SNP') ? 1 : count(line, 'PWF') ? 0.5 : 0;  // someone to finish
    fit += count(line, 'TWF', 'PWF', 'GRN') ? 0.5 : 0;             // someone to win pucks back
    if (count(line, 'PLY') >= 3 || count(line, 'SNP') >= 3) fit -= 0.5;
    if (index < 2) fit -= count(line, 'ENF');
    return fit;
}

const PAIR_FIT: Record<string, number> = {
    'DFD+OFD': 1, 'OFD+TWD': 0.6, 'DFD+TWD': 0.6, 'TWD+TWD': 0.5, 'DFD+DFD': 0, 'OFD+OFD': -0.5,
};
const pairFit = (pair: Player[], index: number) =>
    (PAIR_FIT[pair.map(p => p.player_type).sort().join('+')] ?? 0) + mentorFit(pair) + potentialFit(pair, index);

/** Best ordering of each position's players into lines (or pairs) */
function arrange(at: Map<Position, Player[]>, positions: Position[], weights: number[], fit: (line: Player[], i: number) => number, rating: Rating) {
    const lines = weights.length;
    const options = positions.map(pos => permutations(at.get(pos)!.slice(0, lines)));
    let best: Player[][] = [], bestScore = -Infinity;
    const choose = (depth: number, picked: Player[][]) => {
        if (depth === positions.length) {
            const rows = weights.map((_, i) => picked.map(order => order[i]).filter(Boolean));
            const score = rows.reduce((sum, row, i) =>
                sum + weights[i] * row.reduce((s, p) => s + rating(p), 0) + (row.length === positions.length ? fit(row, i) : 0), 0);
            if (score > bestScore) { bestScore = score; best = weights.map((_, i) => picked.map(order => order[i])); }
            return;
        }
        for (const order of options[depth]) choose(depth + 1, [...picked, order]);
    };
    choose(0, []);
    return best; // best[line][positionIndex], undefined where short
}

/** A full suggested lineup for a league: slot key → player */
export function suggestLineup(players: Player[], league: LineLeague, status: TeamStatus): Record<string, Player> {
    const slots = lineSlots(league);
    const rating = ratingFor(status);
    const available = players.filter(p => p.roster_league === league && p.status !== 'Injured' && p.line_slot !== `${league}-IR`);
    const lineup: Record<string, Player> = {};

    const fwdAt = fillPositions(available.filter(p => groupOf(p.position) === 'FWD'), FWD_POSITIONS, 4, rating);
    arrange(fwdAt, FWD_POSITIONS, LINE_WEIGHT, forwardFit, rating).forEach((line, i) =>
        line.forEach((p, j) => { if (p) lineup[slots.forwards[i][j]] = p; }));

    const dAt = fillPositions(available.filter(p => groupOf(p.position) === 'DEF'), D_POSITIONS, 3, rating);
    arrange(dAt, D_POSITIONS, PAIR_WEIGHT, pairFit, rating).forEach((pair, i) =>
        pair.forEach((p, j) => { if (p) lineup[slots.defence[i][j]] = p; }));

    available.filter(p => p.position === 'G').sort((a, b) => b.overall - a.overall).slice(0, 2)
        .forEach((p, i) => { lineup[slots.goalies[i]] = p; });

    // Scratches: the best spare forward and defenceman, then whoever's best
    const dressed = new Set(Object.values(lineup).map(p => p.id));
    const spares = available.filter(p => !dressed.has(p.id)).sort((a, b) => rating(b) - rating(a));
    const order = [
        spares.find(p => groupOf(p.position) === 'FWD'),
        spares.find(p => groupOf(p.position) === 'DEF'),
        ...spares,
    ].filter((p, i, all): p is Player => !!p && all.indexOf(p) === i);
    slots.scratches.forEach((slot, i) => { if (order[i]) lineup[slot] = order[i]; });

    return lineup;
}

export interface LineNote {
    text: string;
    tone: 'warn' | 'info';
}

const short = (p: Player) => `${p.first_name.charAt(0)}. ${p.last_name}`;

export interface LinePlan {
    label: string;
    keys: string[];
    identity: string;
    mentoring: boolean;
    reasons: string[];
}

export interface UnitPlan {
    label: string;
    players: { player: Player; role: string }[];
}

export interface LineupPlan {
    lines: LinePlan[];
    powerPlay: UnitPlan[];
    penaltyKill: UnitPlan[];
    goalies: string[];
    depth: string[];
}

const names = (ps: Player[]) => ps.map(short).join(' and ');
const verb = (ps: Player[], singular: string, plural: string) => ps.length === 1 ? singular : plural;
const ofType = (line: Player[], ...types: string[]) => line.filter(p => types.includes(p.player_type));

function offPosition(line: (Player | undefined)[], positions: Position[]): string[] {
    return line.flatMap((p, i) => p && p.position !== positions[i]
        ? [`${short(p)} shifts from ${p.position} to ${positions[i]}${p.position2 === positions[i] ? '' : ' — not a position they list'}`] : []);
}

function mentorReasons(line: Player[], index: number): string[] {
    const { vets, young } = mentoring(line);
    if (young.length) return [`${names(vets)} ${verb(vets, 'covers', 'cover')} for ${names(young)} while they develop`];
    const growing = line.filter(developing);
    if (growing.length >= 2 && !line.some(veteran)) return [`${names(growing)} are ${growing.length === 2 ? 'both' : 'all'} still developing, with no veteran beside them`];
    return index === 3 && growing.length ? [`Regular NHL minutes for ${names(growing)} to grow`] : [];
}

/** Developing players against the line their potential points to */
function potentialReasons(line: Player[], index: number): string[] {
    return line.flatMap(p => {
        const [potential, target] = [potentialLine(p), targetLine(p)];
        if (!potential || !target) return [];
        if (index + 1 <= potential) return [`${short(p)}'s ${p.potential_level} potential gets matching minutes`];
        if (index + 1 <= target) return [`${short(p)} has ${p.potential_level} potential (role: ${p.role}) — as high as they should go for now`];
        return [`${short(p)} has ${p.potential_level} potential — move up as they improve`];
    });
}

type Description = Pick<LinePlan, 'identity' | 'mentoring' | 'reasons'>;

function describeForwards(line: Player[], index: number): Description {
    const creators = ofType(line, 'PLY');
    const finishers = ofType(line, 'SNP', 'PWF');
    const twoWay = ofType(line, 'TWF');
    const physical = ofType(line, 'GRN', 'ENF', 'PWF');
    const reasons: string[] = [];
    let identity: string;

    if (index === 3) {
        identity = physical.length >= 2 ? 'Energy & forecheck' : line.some(developing) ? 'Development minutes' : 'Checking line';
        if (physical.length) reasons.push(`${names(physical)} ${verb(physical, 'brings', 'bring')} the physical game`);
        if (twoWay.length) reasons.push(`${names(twoWay)} ${verb(twoWay, 'keeps', 'keep')} it safe in their own end`);
    } else {
        if (creators.length && finishers.length) identity = index === 0 ? 'Top scoring line' : 'Secondary scoring';
        else if (twoWay.length >= 2) identity = 'Two-way';
        else if (creators.length >= 2) identity = 'Playmaking';
        else identity = index === 0 ? 'Top line' : 'Depth scoring';

        if (creators.length && finishers.length) reasons.push(`${names(creators)} ${verb(creators, 'feeds', 'feed')} ${names(finishers)}`);
        else if (creators.length) reasons.push(`${names(creators)} ${verb(creators, 'drives', 'drive')} play; no natural finisher on the line`);
        else if (finishers.length) reasons.push(`${names(finishers)} ${verb(finishers, 'shoots', 'shoot')}; no natural playmaker on the line`);
        if (twoWay.length) reasons.push(`${names(twoWay)} ${verb(twoWay, 'handles', 'handle')} the defensive side and ${verb(twoWay, 'wins', 'win')} pucks back`);
    }

    return { identity, mentoring: mentoring(line).young.length > 0, reasons: [...reasons, ...mentorReasons(line, index)] };
}

function describePair(pair: Player[], index: number): Description {
    const [dfd, ofd, twd] = ['DFD', 'OFD', 'TWD'].map(t => ofType(pair, t));
    let identity: string, reason: string;
    if (dfd.length === 1) {
        const partner = pair.find(p => p !== dfd[0])!;
        identity = index === 0 ? 'Shutdown & transition' : 'Balanced';
        reason = `${short(dfd[0])} stays home so ${short(partner)} can join the rush`;
    } else if (dfd.length === 2) {
        identity = index === 2 ? 'Penalty-kill pair' : 'Shutdown';
        reason = 'Two stay-at-home D: hard to play against, little offence';
    } else if (ofd.length === 2) {
        identity = 'Offensive';
        reason = 'Both join the rush, so they can get caught going the other way';
    } else if (ofd.length && twd.length) {
        identity = 'Puck-moving';
        reason = `${short(twd[0])} reads the play behind ${short(ofd[0])}`;
    } else {
        identity = 'Two-way';
        reason = 'Both can move the puck and defend';
    }
    return { identity, mentoring: mentoring(pair).young.length > 0, reasons: [reason, ...mentorReasons(pair, index)] };
}

// Type value on special teams, in overall points
const PP_VALUE: Record<string, number> = { SNP: 3, PLY: 3, PWF: 2, TWF: 0, GRN: -3, ENF: -4, OFD: 3, TWD: 1, DFD: -2 };
const PK_VALUE: Record<string, number> = { TWF: 3, GRN: 2, PWF: 1, ENF: 0, SNP: -1, PLY: -1, DFD: 3, TWD: 2, OFD: -2 };

const ranked = (pool: Player[], score: (p: Player) => number) => [...pool].sort((a, b) => score(b) - score(a) || a.id - b.id);

/** A 1-3-1: shooter on the flank, playmaker on the half-wall, a body in front, a bumper in the slot */
function powerPlayRoles(forwards: Player[], point: Player | undefined): UnitPlan['players'] {
    const left = [...forwards];
    const take = (...types: string[]) => {
        const i = left.findIndex(p => types.includes(p.player_type));
        return left.splice(i === -1 ? 0 : i, 1)[0];
    };
    const shooter = take('SNP', 'PWF');
    const front = take('PWF', 'GRN', 'ENF', 'TWF');
    const wall = take('PLY');
    const bumper = left[0];
    return [
        { player: shooter, role: 'One-timer' }, { player: wall, role: 'Half-wall' },
        { player: bumper, role: 'Bumper' }, { player: front, role: 'Net front' },
        { player: point!, role: 'Point' },
    ].filter(x => x.player);
}

function specialTeams(forwards: Player[], defence: Player[]) {
    const ppF = ranked(forwards, p => p.overall + (PP_VALUE[p.player_type] ?? 0));
    const ppD = ranked(defence, p => p.overall + (PP_VALUE[p.player_type] ?? 0));
    const powerPlay: UnitPlan[] = [0, 1].map(i => ({
        label: `PP${i + 1}`,
        players: powerPlayRoles(ppF.slice(i * 4, i * 4 + 4), ppD[i]),
    })).filter(u => u.players.length);

    // Keep the top power play fresh unless they're clearly the best penalty killers too
    const onPP1 = new Set(powerPlay[0]?.players.map(x => x.player.id));
    const pkScore = (p: Player) => p.overall + (PK_VALUE[p.player_type] ?? 0) - (onPP1.has(p.id) ? 2 : 0);
    const pkF = ranked(forwards, pkScore);
    const pkD = ranked(defence, pkScore);
    const penaltyKill: UnitPlan[] = [0, 1].map(i => ({
        label: `PK${i + 1}`,
        players: [...pkF.slice(i * 2, i * 2 + 2), ...pkD.slice(i * 2, i * 2 + 2)].map(player => ({ player, role: player.position })),
    })).filter(u => u.players.length);

    return { powerPlay, penaltyKill };
}

const SEASON_GAMES = 82;

function goalieWorkload(starter: Player | undefined, backup: Player | undefined): string[] {
    if (!starter || !backup) return [];
    const gap = starter.overall - backup.overall;
    const starts = gap >= 5 ? 60 : gap >= 2 ? 55 : 46;
    const why = gap >= 5 ? 'the gap is big enough to lean on the starter'
        : gap >= 2 ? 'enough rest to keep the starter fresh' : 'close to a platoon — ride the hot hand';
    const notes = [`${short(starter)} about ${starts} starts, ${short(backup)} about ${SEASON_GAMES - starts}: ${why}`];
    if (developing(backup)) notes.push(`${short(backup)} is ${backup.age} with ${backup.potential_level} potential — extra starts help development`);
    return notes;
}

/** Why the lineup is put together the way it is: line identities, special teams, goalies and depth */
export function explainLineup(slotMap: Record<string, Player | null>, league: LineLeague): LineupPlan {
    const slots = lineSlots(league);
    const at = (keys: string[]) => keys.map(k => slotMap[k] ?? undefined);
    const lines: LinePlan[] = [];

    slots.forwards.forEach((keys, i) => {
        const line = at(keys);
        const full = line.filter((p): p is Player => !!p);
        if (full.length < 3) return;
        lines.push({ label: `L${i + 1}`, keys, ...describeForwards(full, i) });
        lines[lines.length - 1].reasons.push(...potentialReasons(full, i), ...offPosition(line, FWD_POSITIONS));
    });
    slots.defence.forEach((keys, i) => {
        const pair = at(keys);
        const full = pair.filter((p): p is Player => !!p);
        if (full.length < 2) return;
        lines.push({ label: `P${i + 1}`, keys, ...describePair(full, i) });
        lines[lines.length - 1].reasons.push(...potentialReasons(full, i), ...offPosition(pair, D_POSITIONS));
    });

    const dressed = (keys: string[]) => at(keys).filter((p): p is Player => !!p);
    const { powerPlay, penaltyKill } = specialTeams(dressed(slots.forwards.flat()), dressed(slots.defence.flat()));
    const [starter, backup] = at(slots.goalies);

    // Young players in the press box would be better off playing in the AHL
    const depth = dressed(slots.scratches).filter(developing).map(p => p.waiver_eligible
        ? `${short(p)} (${p.age}) is developing in the press box, but would need waivers to send down`
        : `${short(p)} (${p.age}) would develop more playing big AHL minutes than sitting`);

    const finishers = ofType(dressed(slots.forwards.slice(0, 3).flat()), 'SNP', 'PWF');
    if (slots.forwards.slice(0, 3).flat().every(k => slotMap[k]) && finishers.length < 3) {
        const who = !finishers.length ? 'No natural shooters (SNP/PWF) in the top nine'
            : `Only ${names(finishers)} in the top nine ${verb(finishers, 'is a natural shooter', 'are natural shooters')} (SNP/PWF)`;
        depth.push(`${who} — a scoring winger is the clearest need`);
    }

    return { lines, powerPlay, penaltyKill, goalies: goalieWorkload(starter, backup), depth };
}
const average = (line: Player[]) => line.reduce((s, p) => s + p.overall, 0) / line.length;

/** Things worth a look in the lines as set */
export function reviewLineup(slotMap: Record<string, Player | null>, players: Player[], league: LineLeague): LineNote[] {
    const slots = lineSlots(league);
    const notes: LineNote[] = [];
    const filled = (keys: string[]) => keys.map(k => slotMap[k]).filter((p): p is Player => !!p);

    const fwdLines = slots.forwards.map(filled);
    fwdLines.forEach((line, i) => {
        if (line.length < 3 || i > 2) return;
        if (!count(line, 'PLY')) notes.push({ tone: 'info', text: `Line ${i + 1} has no playmaker (PLY)` });
        if (!count(line, 'SNP', 'PWF')) notes.push({ tone: 'info', text: `Line ${i + 1} has no shooter (SNP or PWF)` });
        if (count(line, 'PLY') === 3) notes.push({ tone: 'info', text: `Line ${i + 1} is three playmakers — who shoots?` });
        if (i < 2 && count(line, 'ENF')) notes.push({ tone: 'warn', text: `Enforcer on Line ${i + 1}` });
    });

    slots.defence.map(filled).forEach((pair, i) => {
        if (pair.length < 2) return;
        if (count(pair, 'OFD') === 2) notes.push({ tone: 'info', text: `Pair ${i + 1} is two offensive D — exposed defensively` });
        if (count(pair, 'DFD') === 2) notes.push({ tone: 'info', text: `Pair ${i + 1} is two defensive D — little offence` });
    });

    // Out of position (position2 counts as natural)
    for (const key of [...slots.forwards.flat(), ...slots.defence.flat()]) {
        const p = slotMap[key];
        const position = key.split('-').pop() as Position;
        if (p && positionCost(p, position) > 0.5) {
            notes.push({ tone: 'warn', text: `${short(p)} at ${position} — plays ${p.position}${p.position2 ? `/${p.position2}` : ''}` });
        }
    }

    // Line strength out of order
    const groups: [string, Player[][], number][] = [['Line', fwdLines, 3], ['Pair', slots.defence.map(filled), 2]];
    for (const [label, lines, size] of groups) {
        for (let i = 1; i < lines.length; i++) {
            if (lines[i].length < size || lines[i - 1].length < size) continue;
            const [above, below] = [average(lines[i - 1]), average(lines[i])];
            if (below - above >= 2) notes.push({ tone: 'info', text: `${label} ${i + 1} (avg ${below.toFixed(1)}) is stronger than ${label} ${i} (${above.toFixed(1)})` });
        }
    }

    const [starter, backup] = slots.goalies.map(k => slotMap[k]);
    if (starter && backup && backup.overall > starter.overall) {
        notes.push({ tone: 'info', text: `Backup ${short(backup)} (${backup.overall}) rates above starter ${short(starter)} (${starter.overall})` });
    }

    const lineKeys = [...slots.forwards.flat(), ...slots.defence.flat(), ...slots.goalies];
    const dressed = lineKeys.map(k => slotMap[k]).filter((p): p is Player => !!p);
    for (const p of dressed.filter(p => p.status === 'Injured')) notes.push({ tone: 'warn', text: `${short(p)} is injured but dressed` });

    // Healthy players sitting while someone weaker plays their position
    const sitting = players.filter(p => p.roster_league === league && p.status !== 'Injured'
        && p.line_slot !== `${league}-IR` && !dressed.some(d => d.id === p.id));
    for (const p of sitting.sort((a, b) => b.overall - a.overall)) {
        const weaker = lineKeys
            .map(k => ({ key: k, d: slotMap[k], position: (k.endsWith('G1') || k.endsWith('G2') ? 'G' : k.split('-').pop()) as Position }))
            .filter(x => x.d && positionCost(p, x.position) <= 0.5 && effective(p, x.position) >= effective(x.d, x.position) + 3)
            .sort((a, b) => a.d!.overall - b.d!.overall)[0];
        if (weaker) notes.push({ tone: 'warn', text: `${short(p)} (${p.overall}) sits while ${short(weaker.d!)} (${weaker.d!.overall}) plays ${weaker.position}` });
    }

    const empty = lineKeys.filter(k => !slotMap[k]).length;
    if (empty) notes.unshift({ tone: 'warn', text: `${empty} empty spot${empty === 1 ? '' : 's'} in the lineup` });

    return notes;
}
