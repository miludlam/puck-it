import { computed, ref, watch } from 'vue';
import { useFranchiseStore } from '@/stores';
import { themeVariables, ThemeMode } from '@/utils/theme';
import type { TeamColors } from '@/types';

// Light, dark or follow the system. It's an app preference, kept on this machine rather
// than in a franchise file.
export type ThemePreference = 'system' | ThemeMode;
const STORAGE_KEY = 'puck-it.theme';

function readPreference(): ThemePreference {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
    } catch { /* storage unavailable: fall back to the system */ }
    return 'system';
}

export const themePreference = ref<ThemePreference>(readPreference());

const systemQuery = window.matchMedia('(prefers-color-scheme: dark)');
const systemDark = ref(systemQuery.matches);
systemQuery.addEventListener('change', e => { systemDark.value = e.matches; });

export const themeMode = computed<ThemeMode>(() =>
    themePreference.value === 'system' ? (systemDark.value ? 'dark' : 'light') : themePreference.value
);

export function setThemePreference(preference: ThemePreference) {
    themePreference.value = preference;
    try {
        localStorage.setItem(STORAGE_KEY, preference);
    } catch { /* not remembered, still applied */ }
}

/** Write a team's palette (or the default) for a theme onto the document */
export function applyTheme(team: TeamColors | null, mode: ThemeMode) {
    const root = document.documentElement;
    for (const [name, value] of Object.entries(themeVariables(team, mode))) root.style.setProperty(name, value);
    root.dataset.theme = mode;
}

/** Keep the document themed to the franchise's team and the chosen mode */
export function useTeamTheme() {
    const franchiseStore = useFranchiseStore();
    const team = computed(() => franchiseStore.currentTeam?.colors ?? null);
    watch([team, themeMode], ([colors, mode]) => applyTheme(colors, mode), { immediate: true });
}
