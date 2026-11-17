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

/** How well a forward line's types fit together, in overall points */
function forwardFit(line: Player[], index: number): number {
    if (index === 3) return 0.5 * count(line, 'GRN', 'ENF'); // a checking fourth line
    let fit = 0;
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
const pairFit = (pair: Player[]) => PAIR_FIT[pair.map(p => p.player_type).sort().join('+')] ?? 0;

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
