import colors from 'tailwindcss/colors';
import { atLuminance, contrast, hexToRgb, luminance, RGB, rgbChannels, rgbToOklch } from './color';
import type { TeamColors } from '@/types';

// The app is styled with Tailwind's palette names (bg-slate-900, text-rose-300, …). Each
// name reads a CSS variable (see tailwind.config.js), and this module fills those variables
// per theme: slate becomes neutrals tinted with the team's hue, sky becomes the team accent,
// and the status hues keep their meaning. Every palette is set by luminance so text keeps
// WCAG AA contrast (4.5:1) against the surfaces it's used on, in both themes.

export type ThemeMode = 'light' | 'dark';

export const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
type Step = typeof STEPS[number];
type Scale = Record<Step, RGB>;

export const STATUS_HUES = ['rose', 'emerald', 'amber', 'violet', 'blue', 'red', 'orange', 'yellow'] as const;
export const THEMED_PALETTES = ['slate', 'sky', ...STATUS_HUES] as const;

// Neutral luminance per step. Surfaces: 950 page, 900 panels, 800 inputs and menus,
// 700 borders. Text: 100–400 primary to secondary, 500 tertiary (≥ 4.5:1 on 800),
// 600 faint and disabled (≥ 3:1 on 900).
const NEUTRAL: Record<ThemeMode, Record<Step, number>> = {
    dark: {
        50: 0.95, 100: 0.9, 200: 0.8, 300: 0.65, 400: 0.4, 500: 0.275,
        600: 0.13, 700: 0.065, 800: 0.0218, 900: 0.0088, 950: 0.0035,
    },
    light: {
        50: 0.0021, 100: 0.0088, 200: 0.0218, 300: 0.05, 400: 0.0886, 500: 0.135,
        600: 0.26, 700: 0.56, 800: 0.8, 900: 0.91, 950: 0.96,
    },
};

// White text on a solid 500/600 fill needs luminance ≤ 0.183 for 4.5:1
const SOLID_MAX = 0.175;

const scaleOf = (palette: Record<string, string>) =>
    Object.fromEntries(STEPS.map(s => [s, hexToRgb(palette[s])])) as Scale;

/** Darken a colour (same hue and chroma) to at most this luminance */
function capLuminance(rgb: RGB, max: number): RGB {
    if (luminance(rgb) <= max) return rgb;
    const { c, h } = rgbToOklch(rgb);
    return atLuminance(max, c, h);
}

/**
 * A chromatic scale for one theme. Dark keeps the base scale, darkening only the solid
 * fills that carry white text. Light flips the text shades (300 → the base's 800, 400 →
 * 700) and holds them dark enough to read on light surfaces.
 */
function chromatic(base: Scale, mode: ThemeMode): Scale {
    if (mode === 'dark') return {
        ...base,
        600: capLuminance(base[600], SOLID_MAX),
        700: capLuminance(base[700], 0.115),
    };
    return {
        50: base[950], 100: base[950], 200: base[900],
        300: capLuminance(base[800], 0.075),
        400: capLuminance(base[700], 0.13),
        500: capLuminance(base[500], SOLID_MAX),
        600: capLuminance(base[600], 0.15),
        700: capLuminance(base[700], 0.115),
        800: base[800], 900: base[900], 950: base[950],
    };
}

const DEFAULT_TINT = rgbToOklch(hexToRgb(colors.slate[700])).h;
const SKY = scaleOf(colors.sky);

interface TeamTones {
    accent: { c: number; h: number } | null; // null = use the default sky accent
    tintHue: number;
}

// The team's most colourful colour sets the accent and the neutrals' tint. Primary wins
// unless it's close to black, white or grey (Kings, Penguins, Bruins…).
function teamTones(team: TeamColors | null): TeamTones {
    if (!team) return { accent: null, tintHue: DEFAULT_TINT };
    const candidates = [team.primary, team.secondary, team.tertiary].map(hex => rgbToOklch(hexToRgb(hex)));
    const pick = candidates.find(c => c.c >= 0.08);
    if (!pick) return { accent: null, tintHue: DEFAULT_TINT };
    return { accent: { c: Math.min(0.19, Math.max(0.1, pick.c)), h: pick.h }, tintHue: pick.h };
}

const WHITE: RGB = [1, 1, 1];
const INK: RGB = hexToRgb('#0b0d12');

/**
 * The team colour for fills (active nav, primary buttons, header rule): the first of
 * primary/secondary/tertiary standing out 3:1 from the panels, else primary darkened or
 * lightened until it does. Text on it is white or ink, whichever reads better.
 */
function teamFill(team: TeamColors | null, surface: RGB, mode: ThemeMode, accent500: RGB) {
    const colorful = (rgb: RGB) => rgbToOklch(rgb).c >= 0.05;
    const options = team ? [team.primary, team.secondary, team.tertiary].map(hexToRgb) : [];
    let fill = options.find((rgb, i) => contrast(rgb, surface) >= 3 && (i === 0 || colorful(rgb)));
    if (!fill) {
        const { c, h } = rgbToOklch(options[0] ?? accent500);
        const s = luminance(surface);
        fill = atLuminance(mode === 'dark' ? 3.2 * (s + 0.05) - 0.05 : (s + 0.05) / 3.2 - 0.05, c, h);
    }
    const on = contrast(WHITE, fill) >= contrast(INK, fill) ? WHITE : INK;
    return { fill, on };
}

/** CSS variables for a team (or none) in one theme */
export function themeVariables(team: TeamColors | null, mode: ThemeMode): Record<string, string> {
    const { accent, tintHue } = teamTones(team);
    const vars: Record<string, string> = {};
    const put = (name: string, scale: Scale) => {
        for (const s of STEPS) vars[`--c-${name}-${s}`] = rgbChannels(scale[s]);
    };

    // A team tints the neutrals a little more than the default slate does
    const tint = team && accent ? 0.028 : 0.022;
    const neutral = Object.fromEntries(STEPS.map(s => [s, atLuminance(NEUTRAL[mode][s], tint, tintHue)])) as Scale;
    put('slate', neutral);

    // The team accent follows sky's luminance at the team's hue
    const accentBase = accent
        ? Object.fromEntries(STEPS.map(s => [s, atLuminance(luminance(SKY[s]), accent.c, accent.h)])) as Scale
        : SKY;
    const accentScale = chromatic(accentBase, mode);
    put('sky', accentScale);

    for (const hue of STATUS_HUES) put(hue, chromatic(scaleOf(colors[hue]), mode));

    const { fill, on } = teamFill(team, neutral[900], mode, accentScale[500]);
    vars['--team-primary'] = rgbChannelsToCss(fill);
    vars['--team-on-primary'] = rgbChannelsToCss(on);
    return vars;
}

const rgbChannelsToCss = (rgb: RGB) => `rgb(${rgbChannels(rgb)})`;

/** White or ink, whichever reads better on a colour (e.g. another team's badge) */
export const readableOn = (hex: string) =>
    contrast(WHITE, hexToRgb(hex)) >= contrast(INK, hexToRgb(hex)) ? '#ffffff' : '#0b0d12';
