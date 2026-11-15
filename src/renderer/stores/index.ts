import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { AHL_CAP_EXEMPTION, CAP_CEILING } from "@/utils/league";
import { CapCeiling, DraftSettings, Extension, Franchise, FreeAgent, LineLeague, Pick, Player, Scout, ScoutedPlayer, Team, TeamStanding, TeamStatus, Trade, TradeRequest } from "@/types";

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

    // For Persistent app header. A contract is any salary > 0; NHL/AHL deals count
    // toward the 50-contract limit, signed ITS players are exempt (separate 40 limit).
    const contractCount = computed(() =>
        players.value.filter(player => player.aav > 0 && player.roster_league !== 'ITS').length
    );
    const exemptContractCount = computed(() =>
        its.value.filter(player => player.aav > 0).length
    );
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
    async function add(player: Omit<Player, 'id' | 'created_at' | 'on_block'>) {
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
    // Injured reserve (`${league}-IR`) isn't a line, so it survives a clear
    async function clearLines(league: LineLeague) {
        const onLine = (p: Player) => p.line_league === league && p.line_slot !== `${league}-IR`;
        const leaguePlayers = players.value.filter(onLine);

        await Promise.all(
            leaguePlayers.map(p => window.db['player:update'](p.id, {
                line_slot: null,
                line_league: null,
            }))
        );

        // Patch local state
        players.value = players.value.map(p =>
            onLine(p)
                ? { ...p, line_slot: null, line_league: null }
                : p
        );
    }

    return {
        players,
        nhl, ahl, its,
        contractCount, exemptContractCount, nhlCapHit, nhlRosterCount,
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
    async function setStatus(status: TeamStatus) {
        const result = await window.db['franchise:setStatus'](status);
        franchise.value = result as Franchise;
    }

    return {
        franchise, teams,
        currentTeam, formattedSeason,
        load, loadTeams, update, setStatus,
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
    // Projection fields default in the DB (unset, unlocked)
    async function add(pick: Omit<Pick, 'id' | 'projected_pick' | 'locked'>) {
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

    // Scouts on the payroll vs. those with an outstanding contract offer
    const hired = computed(() => scouts.value.filter(s => s.status === 'hired'));
    const offered = computed(() => scouts.value.filter(s => s.status === 'offered'));

    // Region a scout is working (null if unassigned or no scout)
    const regionOf = (id: number | null | undefined) =>
        scouts.value.find(s => s.id === id)?.region ?? null;

    async function load() {
        const result = await window.db['scout:getAll']();
        scouts.value = result as Scout[];
    }
    async function add(scout: Omit<Scout, 'id' | 'obligations_done'>) {
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

    return { scouts, hired, offered, regionOf, load, add, update, remove };
});

export const useScoutedPlayerStore = defineStore('scoutedPlayers', () => {
    const scoutedPlayers = ref<ScoutedPlayer[]>([]);

    // A scout's shortlist: their prospects, best CS rank first (unranked last)
    function forScout(scoutID: number) {
        return scoutedPlayers.value
            .filter(p => p.scout_id === scoutID)
            .sort((a, b) =>
                (a.cs_rank ?? Infinity) - (b.cs_rank ?? Infinity)
                || a.last_name.localeCompare(b.last_name)
            );
    }

    async function load() {
        const result = await window.db['scoutedPlayer:getAll']();
        scoutedPlayers.value = result as ScoutedPlayer[];
    }
    // Partial so shortlist quick-adds can omit the refinement fields (stored as null)
    async function add(player: Partial<Omit<ScoutedPlayer, 'id'>>) {
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

    // Season rollover: drop the drafted class (optionally keeping undrafted prospects)
    async function clearClass(keepUndrafted: boolean) {
        const result = await window.db['scoutedPlayer:clearClass'](keepUndrafted);
        scoutedPlayers.value = result as ScoutedPlayer[];
    }

    return { scoutedPlayers, forScout, load, add, update, remove, clearClass };
});

export const useDraftSettingsStore = defineStore('draftSettings', () => {
    const settings = ref<DraftSettings[]>([]);

    async function load() {
        const result = await window.db['draftSettings:getAll']();
        settings.value = result as DraftSettings[];
    }
    const forSeason = (season: number) => settings.value.find(s => s.season === season) ?? null;

    async function save(next: Omit<DraftSettings, 'updated_at'>) {
        const saved = await window.db['draftSettings:save']({ ...next }) as DraftSettings;
        settings.value = [saved, ...settings.value.filter(s => s.season !== saved.season)]
            .sort((a, b) => b.season - a.season);
        return saved;
    }

    return { settings, load, forSeason, save };
});

export const useStandingsStore = defineStore('standings', () => {
    const standings = ref<TeamStanding[]>([]);

    async function load() {
        const result = await window.db['standings:getAll']();
        standings.value = result as TeamStanding[];
    }
    const forTeam = (season: number, teamID: string) =>
        standings.value.find(s => s.season === season && s.team_id === teamID) ?? null;

    async function save(next: TeamStanding) {
        const saved = await window.db['standings:save']({ ...next }) as TeamStanding;
        standings.value = [
            saved,
            ...standings.value.filter(s => !(s.season === saved.season && s.team_id === saved.team_id)),
        ];
        return saved;
    }

    return { standings, load, forTeam, save };
});

// Salary cap per season. A season with no cap of its own uses the latest earlier one,
// falling back to the default.
export const useCapStore = defineStore('cap', () => {
    const ceilings = ref<CapCeiling[]>([]);

    const ceilingFor = (season: number) =>
        ceilings.value.filter(c => c.season <= season).sort((a, b) => b.season - a.season)[0]?.ceiling ?? CAP_CEILING;
    const isSet = (season: number) => ceilings.value.some(c => c.season === season);
    const current = computed(() => ceilingFor(useFranchiseStore().franchise?.season ?? 25));

    async function load() {
        ceilings.value = await window.db['capCeiling:getAll']() as CapCeiling[];
    }
    async function save(season: number, ceiling: number | null) {
        ceilings.value = await window.db['capCeiling:save'](season, ceiling) as CapCeiling[];
    }

    return { ceilings, ceilingFor, isSet, current, load, save };
});

export const useContractStore = defineStore('contracts', () => {
    const extensions = ref<Extension[]>([]);
    const freeAgents = ref<FreeAgent[]>([]);

    const extensionFor = (playerID: number) => extensions.value.find(e => e.player_id === playerID) ?? null;

    async function load() {
        const [ext, fas] = await Promise.all([
            window.db['extension:getAll'](),
            window.db['freeAgent:getAll'](),
        ]);
        extensions.value = ext as Extension[];
        freeAgents.value = fas as FreeAgent[];
    }

    async function saveExtension(extension: Extension) {
        const saved = await window.db['extension:save']({ ...extension }) as Extension;
        extensions.value = [...extensions.value.filter(e => e.player_id !== saved.player_id), saved];
        return saved;
    }
    async function removeExtension(playerID: number) {
        await window.db['extension:delete'](playerID);
        extensions.value = extensions.value.filter(e => e.player_id !== playerID);
    }
    // The accepted extension replaces the player's current contract
    async function startExtension(playerID: number) {
        const player = await window.db['extension:start'](playerID) as Player;
        extensions.value = extensions.value.filter(e => e.player_id !== playerID);
        const playerStore = usePlayerStore();
        const index = playerStore.players.findIndex(p => p.id === playerID);
        if (index !== -1) playerStore.players[index] = player;
        return player;
    }

    async function addFreeAgent(agent: Omit<FreeAgent, 'id' | 'created_at'>) {
        const created = await window.db['freeAgent:add']({ ...agent }) as FreeAgent;
        freeAgents.value = [...freeAgents.value, created];
        return created;
    }
    async function updateFreeAgent(id: number, agent: Partial<FreeAgent>) {
        const updated = await window.db['freeAgent:update'](id, { ...agent }) as FreeAgent;
        const index = freeAgents.value.findIndex(f => f.id === id);
        if (index !== -1) freeAgents.value[index] = updated;
        return updated;
    }
    async function removeFreeAgent(id: number) {
        await window.db['freeAgent:delete'](id);
        freeAgents.value = freeAgents.value.filter(f => f.id !== id);
    }
    // Accepted offer: the free agent becomes a rostered player
    async function signFreeAgent(id: number) {
        const player = await window.db['freeAgent:sign'](id) as Player;
        freeAgents.value = freeAgents.value.filter(f => f.id !== id);
        const playerStore = usePlayerStore();
        playerStore.players = [...playerStore.players, player];
        return player;
    }

    return {
        extensions, freeAgents, extensionFor,
        load, saveExtension, removeExtension, startExtension,
        addFreeAgent, updateFreeAgent, removeFreeAgent, signFreeAgent,
    };
});

export const useTradeStore = defineStore('trades', () => {
    const trades = ref<Trade[]>([]);

    async function load() {
        const result = await window.db['trade:getAll']();
        trades.value = result as Trade[];
    }
    // Runs atomically in the main process; roster and picks change, so reload both
    async function execute(request: TradeRequest) {
        const result = await window.db['trade:execute'](request) as Trade;
        trades.value = [result, ...trades.value];
        await Promise.all([usePlayerStore().load(), usePickStore().load()]);
        return result;
    }
    // Log entry only — doesn't undo the roster or pick changes
    async function remove(id: number) {
        await window.db['trade:delete'](id);
        trades.value = trades.value.filter(t => t.id !== id);
    }

    return { trades, load, execute, remove };
});
