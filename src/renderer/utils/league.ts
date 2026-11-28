import { ref } from 'vue';
import { Game, SalaryRule } from '@/types';

// League-wide limits shared by the header and the Trade Center
export const CAP_CEILING = 95.5;          // $M — default; seasons can set their own (useCapStore)
export const MAX_CONTRACTS = 50;          // NHL + AHL
export const MAX_EXEMPT_CONTRACTS = 40;   // signed ITS players
export const MAX_ROSTER = 23;             // NHL
export const MIN_ROSTER = 20;             // NHL — enough to dress 12F / 6D / 2G

// Salary rules by game edition ($M)
export const GAMES: Game[] = [26, 27];
const MIN_SALARIES: Record<Game, number> = { 26: 0.775, 27: 0.85 };
// The open franchise's game, kept in step by the franchise store; a ref so cap figures follow it
export const game = ref<Game>(27);
// The open franchise's season and per-season rules, kept in step by the franchise and cap stores
export const currentSeason = ref(25);
export const salaryRules = ref<SalaryRule[]>([]);
export const BURIED_ALLOWANCE = 0.375; // default exemption = minimum salary + this

// A season's rule, or the latest earlier season's when it has none of its own
const ruleFor = (season: number, field: 'min_salary' | 'buried_exemption') =>
    salaryRules.value
        .filter(r => r.season <= season && r[field] !== null)
        .sort((a, b) => b.season - a.season)[0]?.[field] ?? null;

export const defaultMinSalary = () => MIN_SALARIES[game.value];
export const minSalary = (season = currentSeason.value) => ruleFor(season, 'min_salary') ?? defaultMinSalary();
// Buried AHL contracts count against the cap above this; by default the minimum salary plus $0.375M
export const ahlCapExemption = (season = currentSeason.value) =>
    ruleFor(season, 'buried_exemption') ?? minSalary(season) + BURIED_ALLOWANCE;

// Contracts display three significant figures
export const formatCap = (value: number) => `$${value.toFixed(3)}M`;
