// League-wide limits shared by the header and the Trade Center
export const CAP_CEILING = 95.5;          // $M
export const MAX_CONTRACTS = 50;          // NHL + AHL
export const MAX_EXEMPT_CONTRACTS = 40;   // signed ITS players
export const MAX_ROSTER = 23;             // NHL

// Contracts display three significant figures
export const formatCap = (value: number) => `$${value.toFixed(3)}M`;
