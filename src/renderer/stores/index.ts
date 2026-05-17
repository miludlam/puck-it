import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { Franchise, LineLeague, Player, Team } from "@/types";

export const usePlayerStore = defineStore('players', () => {
    const players = ref<Player[]>([]);

    // Filtered views
    const nhl = computed(() =>
        players.value.filter(player => player.roster_league === 'NHL')
    );
    const ahl = computed(() =>
        players.value.filter(player => player.roster_league === 'AHL')
    );
    const its = computed(() =>
        players.value.filter(player => player.roster_league === 'ITS')
    );

    // For Persistent app header
    const contractCount = computed(() =>
        players.value.filter(player => player.aav > 0).length
    );
    const nhlCapHit = computed(() =>
        nhl.value.reduce((sum, player) => sum + player.aav, 0)
    );
    const nhlRosterCount = computed(() =>
        nhl.value.filter(player => player.status !== 'Injured').length
    );

    // Actions
    async function load() {
        const result = await window.db['player:getAll']();
        players.value = result as Player[];
    }
    async function add(player: Omit<Player, 'id' | 'created_at'>) {
        const result = await window.db['player:add'](player);
        const created = result as Player;
        players.value = [...players.value, created];
        return created;
    }
    async function update(id: number, player: Partial<Player>) {
        const result = await window.db['player:update'](id, player);
        const updated = result as Player;

        const index = players.value.findIndex(p => p.id === id);
        if (index !== -1) players.value[index] = updated;

        return updated;
    }
    async function remove(id: number) {
        await window.db['player:delete'](id)
        players.value = players.value.filter(player => player.id !== id);
    }
    async function assignSlot(
        playerID: number,
        toSlot: string | null,
        toLeague: string | null,
        occupantID: number | null,
        occupantSlot: string | null,
        occupantLeague: string | null,
    ) {
        const result = await window.db['player:assignSlot'](
            playerID, toSlot, toLeague,
            occupantID, occupantSlot, occupantLeague,
        ) as { player: Player; occupant: Player | null };

        const patchPlayer = (updated: Player) => {
            const index = players.value.findIndex(p => p.id === updated.id);
            if (index !== -1) players.value[index] = updated;
        };

        patchPlayer(result.player);
        if (result.occupant) patchPlayer(result.occupant);
    }
    async function clearLines(league: LineLeague) {
        const leaguePlayers = players.value.filter(p => p.line_league === league);

        await Promise.all(
            leaguePlayers.map(p => window.db['player:update'](p.id, {
                line_slot: null,
                line_league: null,
            }))
        );

        // Patch local state
        players.value = players.value.map(p =>
            p.line_league === league
                ? { ...p, line_slot: null, line_league: null }
                : p
        );
    }

    return {
        players,
        nhl, ahl, its,
        contractCount, nhlCapHit, nhlRosterCount,
        load, add, update, remove, assignSlot, clearLines,
    };
});

export const useFranchiseStore = defineStore('franchise', () => {
    // State mgmt
    const franchise = ref<Franchise | null>(null);
    const teams = ref<Team[]>([]);

    // More header content
    const currentTeam = computed(() =>
        teams.value.find(team => team.id === franchise.value?.team_id) ?? null
    );
    const formattedSeason = computed(() => {
        const year = franchise.value?.season ?? 25;
        return `${year}/${String(year + 1).slice(-2)}`;
    });

    // Actions
    async function load() {
        const result = await window.db['franchise:get']();
        franchise.value = result as Franchise;
    }
    async function loadTeams() {
        const result = await window.db['teams:get']();
        teams.value = result as Team[];
    }
    async function update(teamID: string, season: number) {
        const result = await window.db['franchise:update'](teamID, season);
        franchise.value = result as Franchise;
    }

    return {
        franchise, teams,
        currentTeam, formattedSeason,
        load, loadTeams, update,
    };
});
