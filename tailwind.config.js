// Palettes the theme recolours at runtime (src/renderer/utils/theme.ts). Each shade reads a
// CSS variable holding "r g b", so opacity modifiers like bg-slate-800/40 keep working.
const THEMED = ['slate', 'sky', 'rose', 'emerald', 'amber', 'violet', 'blue', 'red', 'orange', 'yellow'];
const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const themed = Object.fromEntries(THEMED.map(name => [
    name,
    Object.fromEntries(STEPS.map(step => [step, `rgb(var(--c-${name}-${step}) / <alpha-value>)`])),
]));

/** @type {import('tailwindcss').Config} */
export default {
    content: ['./src/renderer/**/*.{vue,ts,html}'],
    darkMode: ['selector', '[data-theme="dark"]'],
    theme: {
        extend: {
            colors: themed,
            fontFamily: {
                sans: ['Inter', 'system-ui', 'sans-serif'],
                mono: ['JetBrains Mono', 'monospace'],
            },
        },
    },
    plugins: [],
}
