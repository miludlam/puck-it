import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';

let db: Database.Database;

export function initDB() {
    const dbPath = path.join(app.getPath('userData'), 'puck-it.db');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    createSchema();
}

// Helper method that adds the next year's default draft picks on season advance
function generatePicksForYear(year: number, teamID: string) {
    const existing = db.prepare(
        'SELECT id FROM picks WHERE year = ? AND original_owner = ?'
    ).all(year, teamID);

    if (existing.length > 0) return; // idempotent — already generated

    const insert = db.prepare(`
        INSERT OR IGNORE INTO picks (year, round, original_owner, current_owner)
        VALUES (?, ?, ?, ?)
    `);

    const tx = db.transaction(() => {
        for (let round = 1; round <= 7; round++) {
            insert.run(year, round, teamID, teamID);
        }
    });

    tx();
}

// Helper method for scout region handling
function mapScout(row: Record<string, unknown>) {
    return {
        ...row,
        region_ratings: row.region_ratings
            ? JSON.parse(row.region_ratings as string)
            : {},
    };
}

function createSchema() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS players (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            first_name        TEXT    NOT NULL DEFAULT '',
            last_name         TEXT    NOT NULL DEFAULT '',
            position          TEXT    NOT NULL,
            position2         TEXT    DEFAULT NULL,
            age               INTEGER NOT NULL DEFAULT 18,
            roster_league     TEXT    NOT NULL DEFAULT NULL,
            junior_league     TEXT    DEFAULT NULL,
            overall           INTEGER NOT NULL DEFAULT 70,
            potential_level   TEXT    NOT NULL DEFAULT '',
            potential_chance  TEXT    NOT NULL DEFAULT 'Med',
            player_type       TEXT    NOT NULL DEFAULT '',
            role              TEXT    NOT NULL DEFAULT '',
            aav               REAL    NOT NULL DEFAULT 0,
            years_remaining   INTEGER NOT NULL DEFAULT 0,
            contract_type     TEXT    DEFAULT NULL,
            clause            TEXT    DEFAULT NULL,
            waiver_eligible   INTEGER NOT NULL DEFAULT 1,
            status            TEXT    NOT NULL DEFAULT 'Active',
            notes             TEXT    DEFAULT NULL,
            line_slot         TEXT    DEFAULT NULL,
            line_league       TEXT    DEFAULT NULL,
            created_at        TEXT    DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS franchise (
            id          INTEGER PRIMARY KEY,
            team_id     TEXT    DEFAULT NULL,   -- references teams.json
            season      INTEGER NOT NULL DEFAULT 25,
            created_at  TEXT    DEFAULT (datetime('now'))
        );

        INSERT OR IGNORE INTO franchise (id, team_id, season)
        VALUES (1, NULL, 25);
               
        CREATE TABLE IF NOT EXISTS picks (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            year            INTEGER NOT NULL,
            round           INTEGER NOT NULL,
            original_owner  TEXT    NOT NULL, -- references teams.json
            current_owner   TEXT    NOT NULL, -- references teams.json, changes on trade
            notes           TEXT    DEFAULT NULL,
            UNIQUE(year, round, original_owner)
        );

        CREATE TABLE IF NOT EXISTS scouts (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            first_name      TEXT    NOT NULL,
            last_name       TEXT    NOT NULL,
            overall_rating  TEXT    DEFAULT NULL,
            region_ratings  TEXT    DEFAULT NULL,  -- JSON blob
            region          TEXT    DEFAULT NULL   -- currently assigned region
        );

    `);

    // Migrate scouts table to split name → first_name + last_name
    const scoutCols = db.prepare("PRAGMA table_info(scouts)").all() as { name: string }[];
    const scoutColNames = scoutCols.map(c => c.name);
    if (!scoutColNames.includes('first_name'))
        db.exec("ALTER TABLE scouts ADD COLUMN first_name TEXT NOT NULL DEFAULT ''");
    if (!scoutColNames.includes('last_name'))
        db.exec("ALTER TABLE scouts ADD COLUMN last_name TEXT NOT NULL DEFAULT ''");
    if (scoutColNames.includes('name'))
        db.exec("ALTER TABLE scouts DROP COLUMN name");
    if (!scoutColNames.includes('region'))
        db.exec("ALTER TABLE scouts ADD COLUMN region TEXT DEFAULT NULL");

    db.exec(`
        CREATE TABLE IF NOT EXISTS scouted_players (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            first_name          TEXT    NOT NULL DEFAULT '',
            last_name           TEXT    NOT NULL DEFAULT '',
            position            TEXT    NOT NULL,
            position2           TEXT    DEFAULT NULL,
            age                 INTEGER NOT NULL DEFAULT 18,
            junior_league       TEXT    DEFAULT NULL,
            overall             INTEGER NOT NULL DEFAULT 70,
            potential_level     TEXT    NOT NULL DEFAULT '',
            potential_chance    TEXT    NOT NULL DEFAULT 'Med',
            player_type         TEXT    NOT NULL DEFAULT '',
            nhl_readiness       TEXT    DEFAULT NULL,
            scout_id            INTEGER DEFAULT NULL REFERENCES scouts(id) ON DELETE SET NULL,
            notes               TEXT    DEFAULT NULL
        );
    `);
}

/*******************
 * Player Handlers *
 *******************/
function getAllPlayers() {
    return db.prepare(`
        SELECT * FROM players
        ORDER BY last_name ASC, first_name ASC
    `).all() as Record<string, unknown>[];
}

function addPlayer(player: Record<string, unknown>) {
    const result = db.prepare(`
        INSERT INTO players (
            first_name, last_name, position, position2, age, roster_league, 
            junior_league, overall, potential_level, potential_chance, player_type,
            role, aav, years_remaining, contract_type, clause, waiver_eligible,
            status, notes, line_slot, line_league
        ) VALUES (
            @first_name, @last_name, @position, @position2, @age, @roster_league,
            @junior_league, @overall, @potential_level, @potential_chance, @player_type,
            @role, @aav, @years_remaining, @contract_type, @clause, @waiver_eligible,
            @status, @notes, @line_slot, @line_league
        )
    `).run(player);

    return db.prepare('SELECT * FROM players WHERE id = ?')
        .get(result.lastInsertRowid) as Record<string, unknown>;
}

function updatePlayer(id: number, player: Record<string, unknown>) {
    const fields = Object.keys(player)
        .map(key => `${key} = @${key}`)
        .join(', ');

    db.prepare(`UPDATE players SET ${fields} WHERE id = @id`)
        .run({ ...player, id });

    return db.prepare('SELECT * FROM players WHERE id = ?')
        .get(id) as Record<string, unknown>;
}

function deletePlayer(id: number) {
    db.prepare('DELETE FROM players WHERE id = ?').run(id);

    return { success: true };
}

function clearAllPlayers() {
    db.prepare('DELETE FROM players').run();

    return { success: true };
}

function assignSlot(
    playerID: number,
    toSlot: string | null,
    toLeague: string | null,
    occupantID: number | null,
    occupantSlot: string | null,
    occupantLeague: string | null,
) {
    const tx = db.transaction(() => {
        db.prepare(`
            UPDATE players SET line_slot = ?, line_league = ? WHERE id = ?
        `).run(toSlot, toLeague, playerID);

        if (occupantID !== null) {
            db.prepare(`
                UPDATE players SET line_slot = ?, line_league = ? WHERE id = ?
            `).run(occupantSlot, occupantLeague, occupantID);
        }
    });

    tx();

    return {
        player: db.prepare('SELECT * FROM players WHERE id = ?').get(playerID),
        occupant: occupantID
            ? db.prepare('SELECT * FROM players WHERE id = ?').get(occupantID)
            : null,
    };
}

/**********************
 * Franchise Handlers *
 **********************/
function getFranchise() {
    return db.prepare('SELECT * FROM franchise WHERE id = 1')
        .get() as Record<string, unknown>;
}

function updateFranchise(teamID: string, season: number) {
    db.prepare(`UPDATE franchise SET team_id = ?, season = ? WHERE id = 1`)
        .run(teamID, season);

    // Generate 6 years of picks if team is being set
    for (let i = 1; i <= 6; i++) {
        generatePicksForYear(season + i, teamID);
    }

    return getFranchise();
}

function advanceSeason() {
    const franchise = getFranchise() as any;
    const newSeason = franchise.season + 1;
    const newPickYear = newSeason + 6;

    db.prepare('UPDATE franchise SET season = ? WHERE id = 1')
        .run(newSeason);

    // Generate picks for the newly available year
    generatePicksForYear(newPickYear, franchise.team_id);

    return getFranchise();
}

/***********************
 * Draft Pick Handlers *
 ***********************/
function getAllPicks() {
    return db.prepare(`
        SELECT * FROM picks
        ORDER BY year ASC, round ASC
    `).all();
}

function getMyPicks(teamID: string) {
    return db.prepare(`
        SELECT * FROM picks WHERE current_owner = ?
        ORDER BY year ASC, round ASC
    `).all(teamID);
}

function getTradedAway(teamID: string) {
    return db.prepare(`
        SELECT * FROM picks WHERE original_owner = ? AND current_owner != ?
        ORDER BY year ASC, round ASC
    `).all(teamID, teamID);
}

function getAcquired(teamID: string) {
    return db.prepare(`
        SELECT * FROM picks WHERE original_owner != ? AND current_owner = ?
        ORDER BY year ASC, round ASC
    `).all(teamID, teamID);
}

function addPick(pick: Record<string, unknown>) {
    const result = db.prepare(`
        INSERT OR IGNORE INTO picks (
            year, round, original_owner, current_owner, notes
        ) VALUES (
            @year, @round, @original_owner, @current_owner, @notes 
        )
    `).run(pick);

    // If lastInsertRowid is 0, the insert was ignored (duplicate)
    if (!result.lastInsertRowid) return null;

    return db.prepare('SELECT * FROM picks WHERE id = ?')
        .get(result.lastInsertRowid) as Record<string, unknown>;
}

function updatePick(id: number, pick: Record<string, unknown>) {
    const fields = Object.keys(pick)
        .map(key => `${key} = @${key}`)
        .join(', ');

    db.prepare(`UPDATE picks SET ${fields} WHERE id = @id`)
        .run({ ...pick, id });

    return db.prepare('SELECT * FROM picks WHERE id = ?')
        .get(id) as Record<string, unknown>;
}

function deletePick(id: number) {
    db.prepare('DELETE FROM picks WHERE id = ?').run(id);

    return { success: true };
}

/******************
 * Scout Handlers *
 ******************/
function getAllScouts() {
    const rows = db.prepare(`
        SELECT * FROM scouts
        ORDER BY last_name ASC, first_name ASC
    `).all() as Record<string, unknown>[];

    return rows.map(mapScout);
}

function addScout(scout: Record<string, unknown>) {
    const result = db.prepare(`
        INSERT INTO scouts (
            first_name, last_name, overall_rating, region_ratings, region
        ) VALUES (
            @first_name, @last_name, @overall_rating, @region_ratings, @region
        )
    `).run({
        ...scout,
        region_ratings: JSON.stringify(scout.region_ratings ?? {}),
        region: scout.region ?? null,
    });

    if (!result.lastInsertRowid) return null;

    const row = db.prepare('SELECT * FROM scouts WHERE id = ?')
        .get(result.lastInsertRowid) as Record<string, unknown>;

    return mapScout(row);
}

function updateScout(id: number, scout: Record<string, unknown>) {
    const data = {
        ...scout,
        ...(scout.region_ratings !== undefined && {
            region_ratings: JSON.stringify(scout.region_ratings),
        }),
    };

    const fields = Object.keys(data)
        .map(key => `${key} = @${key}`)
        .join(', ');

    db.prepare(`UPDATE scouts SET ${fields} WHERE id = @id`)
        .run({ ...data, id });

    const row = db.prepare('SELECT * FROM scouts WHERE id = ?')
        .get(id) as Record<string, unknown>;

    return mapScout(row);
}

function deleteScout(id: number) {
    db.prepare('DELETE FROM scouts WHERE id = ?').run(id);

    return { success: true };
}

/****************************
 * Scouted Players Handlers *
 ****************************/
function getAllScoutedPlayers() {
    return db.prepare(`
        SELECT * FROM scouted_players
        ORDER BY last_name ASC, first_name ASC
    `).all() as Record<string, unknown>[];
}

function addScoutedPlayer(player: Record<string, unknown>) {
    const result = db.prepare(`
        INSERT INTO scouted_players (
            first_name, last_name, position, position2, age, junior_league,
            overall, potential_level, potential_chance, player_type, 
            nhl_readiness, scout_id, notes
        ) VALUES (
            @first_name, @last_name, @position, @position2, @age, @junior_league,
            @overall, @potential_level, @potential_chance, @player_type,
            @nhl_readiness, @scout_id, @notes
        )
    `).run(player);

    return db.prepare('SELECT * FROM scouted_players WHERE id = ?')
        .get(result.lastInsertRowid) as Record<string, unknown>;
}

function updateScoutedPlayer(id: number, player: Record<string, unknown>) {
    const fields = Object.keys(player)
        .map(key => `${key} = @${key}`)
        .join(', ');

    db.prepare(`UPDATE scouted_players SET ${fields} WHERE id = @id`)
        .run({ ...player, id });

    return db.prepare('SELECT * FROM scouted_players WHERE id = ?')
        .get(id) as Record<string, unknown>;
}

function deleteScoutedPlayer(id: number) {
    db.prepare('DELETE FROM scouted_players WHERE id = ?').run(id);

    return { success: true };
}

/************************
 * Exported Handler Map *
 ************************/
export const dbHandlers: Record<string, (...args: any[]) => unknown> = {
    'player:getAll': () => getAllPlayers(),
    'player:add': (_: null, player: Record<string, unknown>) => addPlayer(player),
    'player:update': (_: null, id: number, player: Record<string, unknown>) => updatePlayer(id, player),
    'player:delete': (_: null, id: number) => deletePlayer(id),
    'player:clearAll': () => clearAllPlayers(),
    'player:assignSlot': (
        _: null,
        playerID: number,
        toSlot: string | null,
        toLeague: string | null,
        occupantID: number | null,
        occupantSlot: string | null,
        occupantLeague: string | null,
    ) => assignSlot(playerID, toSlot, toLeague, occupantID, occupantSlot, occupantLeague),
    'franchise:get': () => getFranchise(),
    'franchise:update': (_: null, teamID: string, season: number) => updateFranchise(teamID, season),
    'franchise:advanceSeason': () => advanceSeason(),
    'pick:getAll': () => getAllPicks(),
    'pick:getMy': (_: null, teamID: string) => getMyPicks(teamID),
    'pick:getTraded': (_: null, teamID: string) => getTradedAway(teamID),
    'pick:getAcquired': (_: null, teamID: string) => getAcquired(teamID),
    'pick:add': (_: null, pick: Record<string, unknown>) => addPick(pick),
    'pick:update': (_: null, id: number, pick: Record<string, unknown>) => updatePick(id, pick),
    'pick:delete': (_: null, id: number) => deletePick(id),
    'scout:getAll': () => getAllScouts(),
    'scout:add': (_: null, scout: Record<string, unknown>) => addScout(scout),
    'scout:update': (_: null, id: number, scout: Record<string, unknown>) => updateScout(id, scout),
    'scout:delete': (_: null, id: number) => deleteScout(id),
    'scoutedPlayer:getAll': () => getAllScoutedPlayers(),
    'scoutedPlayer:add': (_: null, player: Record<string, unknown>) => addScoutedPlayer(player),
    'scoutedPlayer:update': (_: null, id: number, player: Record<string, unknown>) => updateScoutedPlayer(id, player),
    'scoutedPlayer:delete': (_: null, id: number) => deleteScoutedPlayer(id),
}
