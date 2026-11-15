<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';

export interface ContextMenuItem {
    label: string;
    disabled?: boolean;
    hint?: string; // right-aligned secondary text, e.g. "full"
    action: () => void;
}

const props = defineProps<{
    x: number;
    y: number;
    items: ContextMenuItem[];
}>();

const emit = defineEmits<{ close: [] }>();

function select(item: ContextMenuItem) {
    if (item.disabled) return;
    item.action();
    emit('close');
}

// Any click elsewhere, Escape, scroll or resize dismisses the menu
const close = () => emit('close');
const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };

onMounted(() => {
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
});
onBeforeUnmount(() => {
    window.removeEventListener('mousedown', close);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('scroll', close, true);
    window.removeEventListener('resize', close);
});
</script>

<template>
    <div
        class="fixed z-50 min-w-[180px] py-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl shadow-black/40"
        :style="{ left: `${props.x}px`, top: `${props.y}px` }"
        @mousedown.stop
        @contextmenu.prevent
    >
        <button
            v-for="item in props.items"
            :key="item.label"
            class="w-full flex items-center justify-between gap-4 px-3 py-1.5 text-left text-xs transition-colors"
            :class="item.disabled ? 'text-slate-600 cursor-default' : 'text-slate-200 hover:bg-slate-700'"
            :disabled="item.disabled"
            @click="select(item)"
        >
            <span>{{ item.label }}</span>
            <span v-if="item.hint" class="text-slate-600">{{ item.hint }}</span>
        </button>
    </div>
</template>
