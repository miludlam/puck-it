<script setup lang="ts">
defineProps<{ locked: boolean }>();
</script>

<template>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <title>{{ locked ? 'Locked' : 'Unlocked' }}</title>
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path v-if="locked" d="M8 11V7a4 4 0 0 1 8 0v4" />
        <path v-else d="M8 11V7a4 4 0 0 1 7.5-2" />
    </svg>
</template>
