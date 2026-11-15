// League-wide limits shared by the header and the Trade Center
export const CAP_CEILING = 95.5;          // $M — default; seasons can set their own (useCapStore)
export const MAX_CONTRACTS = 50;          // NHL + AHL
export const MAX_EXEMPT_CONTRACTS = 40;   // signed ITS players
export const MAX_ROSTER = 23;             // NHL
export const MIN_ROSTER = 20;             // NHL — enough to dress 12F / 6D / 2G
// Buried AHL contracts count against the cap above this amount
export const AHL_CAP_EXEMPTION = 1.15;    // $M

// Contracts display three significant figures
export const formatCap = (value: number) => `$${value.toFixed(3)}M`;
