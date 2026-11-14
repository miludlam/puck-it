import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { Franchise, LineLeague, Pick, Player, Scout, ScoutedPlayer, Team } from "@/types";

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
    const AHL_CAP_EXEMPTION = 1.15;
    const nhlCapHit = computed(() => {
        const nhlHit = nhl.value.reduce((sum, p) => sum + p.aav, 0);
        const ahlOverage = ahl.value
            .filter(p => p.aav > AHL_CAP_EXEMPTION)
            .reduce((sum, p) => sum + (p.aav - AHL_CAP_EXEMPTION), 0);
        return nhlHit + ahlOverage;
    });
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
    async function clearAll() {
        await window.db['player:clearAll']();
        players.value = [];
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
        load, add, update, remove, assignSlot, clearLines, clearAll,
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

export const usePickStore = defineStore('picks', () => {
    const picks = ref<Pick[]>([]);

    const owned = computed(() => picks.value.filter(p => p.current_owner === _teamID()));
    const tradedAway = computed(() => picks.value.filter(p =>
        p.original_owner === _teamID() && p.current_owner !== _teamID()
    ));

    function _teamID() {
        const fs = useFranchiseStore();
        return fs.franchise?.team_id ?? '';
    }

    async function load() {
        const result = await window.db['pick:getAll']();
        picks.value = result as Pick[];
    }
    async function add(pick: Omit<Pick, 'id'>) {
        const result = await window.db['pick:add'](pick);
        if (result) picks.value = [...picks.value, result as Pick];
        return result as Pick | null;
    }
    async function update(id: number, pick: Partial<Pick>) {
        const result = await window.db['pick:update'](id, pick) as Pick;
        const index = picks.value.findIndex(p => p.id === id);
        if (index !== -1) picks.value[index] = result;
        return result;
    }
    async function remove(id: number) {
        await window.db['pick:delete'](id);
        picks.value = picks.value.filter(p => p.id !== id);
    }

    return { picks, owned, tradedAway, load, add, update, remove };
});

export const useScoutStore = defineStore('scouts', () => {
    const scouts = ref<Scout[]>([]);

    async function load() {
        const result = await window.db['scout:getAll']();
        scouts.value = result as Scout[];
    }
    async function add(scout: Omit<Scout, 'id'>) {
        const result = await window.db['scout:add'](scout) as Scout;
        scouts.value = [...scouts.value, result];
        return result;
    }
    async function update(id: number, scout: Partial<Scout>) {
        const result = await window.db['scout:update'](id, scout) as Scout;
        const index = scouts.value.findIndex(s => s.id === id);
        if (index !== -1) scouts.value[index] = result;
        return result;
    }
    async function remove(id: number) {
        await window.db['scout:delete'](id);
        scouts.value = scouts.value.filter(s => s.id !== id);
    }

    return { scouts, load, add, update, remove };
});

export const useScoutedPlayerStore = defineStore('scoutedPlayers', () => {
    const scoutedPlayers = ref<ScoutedPlayer[]>([]);

    async function load() {
        const result = await window.db['scoutedPlayer:getAll']();
        scoutedPlayers.value = result as ScoutedPlayer[];
    }
    async function add(player: Omit<ScoutedPlayer, 'id'>) {
        const result = await window.db['scoutedPlayer:add'](player) as ScoutedPlayer;
        scoutedPlayers.value = [...scoutedPlayers.value, result];
        return result;
    }
    async function update(id: number, player: Partial<ScoutedPlayer>) {
        const result = await window.db['scoutedPlayer:update'](id, player) as ScoutedPlayer;
        const index = scoutedPlayers.value.findIndex(p => p.id === id);
        if (index !== -1) scoutedPlayers.value[index] = result;
        return result;
    }
    async function remove(id: number) {
        await window.db['scoutedPlayer:delete'](id);
        scoutedPlayers.value = scoutedPlayers.value.filter(p => p.id !== id);
    }

    return { scoutedPlayers, load, add, update, remove };
});
