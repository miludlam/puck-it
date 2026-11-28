import { Player, Scout, ScoutedPlayer } from '@/types';
import { groupOf, PLAYER_TYPES, POTENTIAL_TIERS } from '@/utils/draftTargets';

// Data-entry slips on the Draft Board: the same prospect entered twice, two prospects on one
// CS rank, fields that don't fit the position, and so on. Errors are almost certainly wrong;
// warnings are worth a look but may be right.

export type IssueLevel = 'error' | 'warning';
export interface BoardIssue { level: IssueLevel; message: string }

// Draft-eligible prospects are 17–19 in-game; 20 allows for an overage pick
const MIN_AGE = 17;
const MAX_AGE = 20;

// Names compared without case, accents, punctuation or extra spaces ("Jean-Luc" = "jean luc")
const nameKey = (first: string, last: string) =>
    `${first} ${last}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]+/g, ' ').trim();

const fullName = (p: { first_name: string; last_name: string }) => `${p.first_name} ${p.last_name}`;

function groupBy<K>(items: ScoutedPlayer[], key: (p: ScoutedPlayer) => K | null) {
    const groups = new Map<K, ScoutedPlayer[]>();
    for (const p of items) {
        const k = key(p);
        if (k !== null) groups.set(k, [...(groups.get(k) ?? []), p]);
    }
    return [...groups.values()].filter(g => g.length > 1);
}

/** Issues by prospect id; prospects with none are left out */
export function boardIssues(prospects: ScoutedPlayer[], roster: Player[], scouts: Scout[]): Map<number, BoardIssue[]> {
    const issues = new Map<number, BoardIssue[]>();
    const flag = (p: ScoutedPlayer, level: IssueLevel, message: string) =>
        issues.set(p.id, [...(issues.get(p.id) ?? []), { level, message }]);
    const others = (group: ScoutedPlayer[], p: ScoutedPlayer, label: (o: ScoutedPlayer) => string) =>
        group.filter(o => o !== p).map(label).join(', ');

    for (const group of groupBy(prospects, p => nameKey(p.first_name, p.last_name))) {
        for (const p of group) {
            flag(p, 'error', `Duplicate prospect — also on the board at ${others(group, p, o => o.cs_rank ? `CS ${o.cs_rank}` : 'no CS rank')}`);
        }
    }
    for (const group of groupBy(prospects, p => p.cs_rank)) {
        for (const p of group) flag(p, 'error', `Shares CS ${p.cs_rank} with ${others(group, p, fullName)}`);
    }

    const rostered = new Map(roster.map(p => [nameKey(p.first_name, p.last_name), p]));
    const hired = new Set(scouts.filter(s => s.status === 'hired').map(s => s.id));

    for (const p of prospects) {
        const match = rostered.get(nameKey(p.first_name, p.last_name));
        // A taken prospect on the roster is one we drafted
        if (match && !p.taken) flag(p, 'warning', `Same name as ${fullName(match)} on your roster (${match.roster_league}) — already drafted?`);

        if (p.cs_rank !== null && p.original_cs_rank === null) flag(p, 'warning', 'CS rank without an original rank — movement can\'t be tracked');
        if (p.cs_rank !== null && p.cs_rank < 1) flag(p, 'error', `CS rank ${p.cs_rank} is below 1`);
        if (p.age !== null && (p.age < MIN_AGE || p.age > MAX_AGE)) flag(p, 'warning', `Age ${p.age} is unusual for a draft prospect (${MIN_AGE}–${MAX_AGE})`);
        if (p.scout_id !== null && !hired.has(p.scout_id)) flag(p, 'warning', 'Assigned to a scout who isn\'t hired');

        if (!p.position) continue;
        const group = groupOf(p.position);
        if (p.position2 === p.position) flag(p, 'warning', `Secondary position is the same as the primary (${p.position})`);
        else if (p.position2 && groupOf(p.position2) !== group) flag(p, 'error', `${p.position}/${p.position2} mixes position groups`);
        if (p.player_type && !PLAYER_TYPES[group].includes(p.player_type)) flag(p, 'error', `${p.player_type} isn't a ${p.position} player type`);
        if (p.potential_level && !POTENTIAL_TIERS[group].includes(p.potential_level)) flag(p, 'error', `${p.potential_level} isn't a ${p.position} potential`);
    }
    return issues;
}

export const worstLevel = (list: BoardIssue[]): IssueLevel => list.some(i => i.level === 'error') ? 'error' : 'warning';
