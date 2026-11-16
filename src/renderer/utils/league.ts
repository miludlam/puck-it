import { ref } from 'vue';
import { Game } from '@/types';

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
export const minSalary = () => MIN_SALARIES[game.value];
// Buried AHL contracts count against the cap above the minimum salary plus $0.375M
export const ahlCapExemption = () => minSalary() + 0.375;

// Contracts display three significant figures
export const formatCap = (value: number) => `$${value.toFixed(3)}M`;
