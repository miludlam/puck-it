<script setup lang="ts">
import { useRoute } from 'vue-router';
import { setThemePreference, themePreference, ThemePreference } from '@/composables/useTeamTheme';
const route = useRoute();

const themeOptions: { value: ThemePreference; label: string }[] = [
    { value: 'light',  label: 'Light'  },
    { value: 'dark',   label: 'Dark'   },
    { value: 'system', label: 'System' },
];

const navItems = [
    { label: 'Roster',       path: '/roster'    },
    { label: 'Contracts',    path: '/contracts'  },
    { label: 'Draft Board',  path: '/draft'      },
    { label: 'Trade Center', path: '/trades'     },
];
</script>

<template>
    <nav class="h-full w-48 bg-slate-900 flex flex-col px-3 py-4">
        <RouterLink
            v-for="item in navItems"
            :key="item.path"
            :to="item.path"
            class="block px-3 py-2 rounded-lg text-sm transition-colors"
            :class="route.path === item.path
                ? 'font-medium'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'"
            :style="route.path === item.path ? { backgroundColor: 'var(--team-primary)', color: 'var(--team-on-primary)' } : {}"
        >
            {{ item.label }}
        </RouterLink>

        <div class="mt-auto px-1">
            <div id="theme-label" class="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">Theme</div>
            <div role="radiogroup" aria-labelledby="theme-label" class="grid grid-cols-3 p-0.5 rounded-lg bg-slate-800 border border-slate-700">
                <button
                    v-for="option in themeOptions"
                    :key="option.value"
                    role="radio"
                    :aria-checked="themePreference === option.value"
                    class="py-1 rounded-md text-[11px] transition-colors"
                    :class="themePreference === option.value
                        ? 'bg-slate-600 text-slate-50 font-medium'
                        : 'text-slate-400 hover:text-slate-200'"
                    @click="setThemePreference(option.value)"
                >{{ option.label }}</button>
            </div>
        </div>
    </nav>
</template>
