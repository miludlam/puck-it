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

function createSchema() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS players (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            first_name        TEXT    NOT NULL DEFAULT '',
            last_name         TEXT    NOT NULL DEFAULT '',
            position          TEXT    NOT NULL,
            position2         TEXT    DEFAULT NULL,
            age               INTEGER NOT NULL DEFAULT 25,
            roster_league     TEXT    DEFAULT NULL,
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
    `)
}

/*******************
 * Player Handlers *
 *******************/
/* Helper function to map waiver_eligible to boolean which is invoked by most player-based functions */
function mapPlayer(row: Record<string, unknown>) {
    return {
        ...row,
        waiver_eligible: row.waiver_eligible === 1,
    };
}

function getAllPlayers() {
    const rows = db.prepare(`
        SELECT * FROM players
        ORDER BY last_name ASC, first_name ASC
    `).all() as Record<string, unknown>[];

    return rows.map(mapPlayer);
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

    const row = db.prepare('SELECT * FROM players WHERE id = ?')
        .get(result.lastInsertRowid) as Record<string, unknown>;

    return mapPlayer(row);
}

function updatePlayer(id: number, player: Record<string, unknown>) {
    const fields = Object.keys(player)
        .map(key => `${key} = @${key}`)
        .join(', ');

    db.prepare(`UPDATE players SET ${fields} WHERE id = @id`)
        .run({ ...player, id });

    const row = db.prepare('SELECT * FROM players WHERE id = ?')
        .get(id) as Record<string, unknown>;

    return mapPlayer(row);
}

function deletePlayer(id: number) {
    db.prepare('DELETE FROM players WHERE id = ?').run(id);

    return { success: true };
}

/**********************
 * Franchise Handlers *
 **********************/
function getFranchise() {
    return db.prepare('SELECT * FROM franchise WHERE id = 1')
        .get() as Record<string, unknown>;
}

function updateFranchise(teamID: string, season: number) {
    db.prepare(`
        UPDATE franchise SET team_id = ?, season = ? WHERE id = 1
    `).run(teamID, season);

    return getFranchise();
}

/************************
 * Exported Handler Map *
 ************************/
export const dbHandlers: Record<string, (...args: any[]) => unknown> = {
    'player:getAll': () => getAllPlayers(),
    'player:add': (_: null, player: Record<string, unknown>) => addPlayer(player),
    'player:update': (_: null, id: number, player: Record<string, unknown>) => updatePlayer(id, player),
    'player:delete': (_: null, id: number) => deletePlayer(id),
    'franchise:get': () => getFranchise(),
    'franchise:update': (_: null, teamID: string, season: number) => updateFranchise(teamID, season),
}
