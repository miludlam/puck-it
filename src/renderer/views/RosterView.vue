<script setup lang="ts">
import { ref } from 'vue';
import PlayerModal from '@/components/roster/PlayerModal.vue';
import { Player } from '@/types';

const showModal = ref(false);
const selectedPlayer = ref<Player | undefined>(undefined);

function openAdd() {
    selectedPlayer.value = undefined;
    showModal.value = true;
}

function openEdit(player: Player) {
    selectedPlayer.value = player;
    showModal.value = true;
}

function onClose() {
    showModal.value = false;
    selectedPlayer.value = undefined;
}
</script>

<template>
    <div class="p-6">
        <div class="flex items-center justify-between mb-6">
            <h1 class="text-xl font-semibold">Roster</h1>
            <button
                class="px-4 py-2 rounded-lg text-sm bg-sky-600 hover:bg-sky-500 text-white font-medium transition-colors"
                @click="openAdd"
            >+ Add Player</button>
        </div>

        <!-- AllPlayersTable will go here -->

        <PlayerModal
            v-if="showModal"
            :player="selectedPlayer"
            @close="onClose"
            @saved="onClose"
        />
    </div>
</template>