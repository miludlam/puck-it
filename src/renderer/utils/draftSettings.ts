import { DraftQuality } from '@/types';

export const DRAFT_QUALITIES: DraftQuality[] = ['Low', 'Medium', 'High'];

// d100: 1–25 Low, 26–75 Medium, 76–100 High (Medium twice as likely as either end)
export const qualityFor = (roll: number): DraftQuality =>
    roll <= 25 ? 'Low' : roll <= 75 ? 'Medium' : 'High';

export function rollD100(): number {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return (buf[0] % 100) + 1;
}
