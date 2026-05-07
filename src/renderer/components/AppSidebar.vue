<script setup lang="ts">
import { useRoute } from 'vue-router';
const route = useRoute();

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
                ? 'bg-slate-700 text-slate-100 font-medium'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'"
        >
            {{ item.label }}
        </RouterLink>
    </nav>
</template>
