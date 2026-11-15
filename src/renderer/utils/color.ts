// Colour maths for theming: sRGB <-> OKLCH, WCAG luminance and contrast.
// RGB channels are 0..1 sRGB throughout.
export type RGB = [number, number, number];
export interface LCH { l: number; c: number; h: number } // OKLCH, h in degrees

export function hexToRgb(hex: string): RGB {
    const n = parseInt(hex.replace('#', ''), 16);
    return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export const rgbToHex = (rgb: RGB) =>
    '#' + rgb.map(v => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('');

/** "r g b" 0–255, the form Tailwind's <alpha-value> colours read from a CSS variable */
export const rgbChannels = (rgb: RGB) =>
    rgb.map(v => Math.round(Math.min(1, Math.max(0, v)) * 255)).join(' ');

const toLinear = (v: number) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
const fromLinear = (v: number) => v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;

/** WCAG relative luminance */
export function luminance(rgb: RGB) {
    const [r, g, b] = rgb.map(toLinear);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1–21 */
export function contrast(a: RGB, b: RGB) {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

export function rgbToOklch(rgb: RGB): LCH {
    const [r, g, b] = rgb.map(toLinear);
    const l = Math.cbrt(0.4122214708 * r + 0.5363329296 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
    const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
    const B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
    return { l: L, c: Math.hypot(A, B), h: (Math.atan2(B, A) * 180 / Math.PI + 360) % 360 };
}

// Linear sRGB, possibly out of gamut
function oklchToLinear({ l: L, c, h }: LCH): RGB {
    const A = c * Math.cos(h * Math.PI / 180), B = c * Math.sin(h * Math.PI / 180);
    const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
    const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
    const s = (L - 0.0894841775 * A - 1.2914855480 * B) ** 3;
    return [
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
    ];
}

const inGamut = (rgb: RGB) => rgb.every(v => v >= -1e-4 && v <= 1 + 1e-4);

/** OKLCH to sRGB, reducing chroma (keeping lightness and hue) to fit the gamut */
export function oklchToRgb(lch: LCH): RGB {
    let lin = oklchToLinear(lch);
    if (!inGamut(lin)) {
        let lo = 0, hi = lch.c;
        for (let i = 0; i < 20; i++) {
            const mid = (lo + hi) / 2;
            if (inGamut(oklchToLinear({ ...lch, c: mid }))) lo = mid; else hi = mid;
        }
        lin = oklchToLinear({ ...lch, c: lo });
    }
    return lin.map(v => fromLinear(Math.min(1, Math.max(0, v)))) as RGB;
}

/** The colour of this hue and chroma whose WCAG luminance is `target` */
export function atLuminance(target: number, c: number, h: number): RGB {
    let lo = 0, hi = 1;
    for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2;
        if (luminance(oklchToRgb({ l: mid, c, h })) < target) lo = mid; else hi = mid;
    }
    return oklchToRgb({ l: (lo + hi) / 2, c, h });
}

/** Luminance a colour needs to reach `ratio` against a background of luminance `bg` */
export const luminanceFor = (bg: number, ratio: number, lighter: boolean) =>
    lighter ? ratio * (bg + 0.05) - 0.05 : (bg + 0.05) / ratio - 0.05;
