/** @type {import('tailwindcss').Config} */
export default {
    content: ['./src/renderer/**/*.{vue,ts,html}'],
    darkMode: 'class',
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', 'system-ui', 'sans-serif'],
                mono: ['JetBrains Mono', 'monospace'],
            },
        },
    },
    plugins: [],
}
