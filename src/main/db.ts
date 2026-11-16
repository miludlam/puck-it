import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

let db: Database.Database;

// Schema versions, stored in each franchise file's user_version. Opening a file runs the
// steps it hasn't had yet, in order. A released step is never edited: changes go in a new one.
const MIGRATIONS: (() => void)[] = [
    baselineSchema, // 1: everything before the franchise library; its checks catch older files up
    () => db.exec("ALTER TABLE franchise ADD COLUMN name TEXT DEFAULT NULL"), // 2: franchise names
    // 3: salary retained in trades, counted against each season's cap
    () => db.exec("CREATE TABLE retained_salary (season INTEGER PRIMARY KEY, amount REAL NOT NULL)"),
];
export const SCHEMA_VERSION = MIGRATIONS.length;

export class NewerFileError extends Error {}

/** Switch to a franchise file, updating it first. On failure the previous file stays open. */
export function openDB(file: string, backupDir: string) {
    const prev = db;
    db = new Database(file);
    try {
        const version = db.pragma('user_version', { simple: true }) as number;
        if (version > SCHEMA_VERSION)
            throw new NewerFileError('This franchise was saved by a newer version of Puck It. Update the app to open it.');
        db.pragma('journal_mode = WAL');
        migrate(file, version, backupDir);
        db.pragma('foreign_keys = ON');
        normalizeData();
    } catch (e) {
        db.close();
        db = prev;
        throw e;
    }
    prev?.close();
}

export function closeDB() {
    db?.close();
}

function migrate(file: string, version: number, backupDir: string) {
    if (version === SCHEMA_VERSION) return;

    // Keep a copy of a file that has data in it, in case an update goes wrong
    if (db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table'").get()) {
        fs.mkdirSync(backupDir, { recursive: true });
        const name = `${path.basename(file, '.db')}.v${version}.${Date.now()}.db`;
        db.prepare('VACUUM INTO ?').run(path.join(backupDir, name));
    }

    // Table rebuilds need foreign keys off, which only takes effect outside a transaction.
    // All steps commit together or not at all.
    db.pragma('foreign_keys = OFF');
    db.transaction(() => {
        for (let v = version; v < SCHEMA_VERSION; v++) MIGRATIONS[v]();
        db.pragma(`user_version = ${SCHEMA_VERSION}`);
    })();
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
        region_locked: Boolean(row.region_locked),
        obligations_done: Boolean(row.obligations_done),
    };
}

function baselineSchema() {
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
            projected_pick  INTEGER DEFAULT NULL,  -- overall pick number, projected from standings
            locked          INTEGER NOT NULL DEFAULT 0,  -- 1 = pick position finalized
            UNIQUE(year, round, original_owner)
        );

        CREATE TABLE IF NOT EXISTS scouts (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            first_name      TEXT    NOT NULL,
            last_name       TEXT    NOT NULL,
            overall_rating  TEXT    DEFAULT NULL,
            region_ratings  TEXT    DEFAULT NULL,  -- JSON blob
            region          TEXT    DEFAULT NULL,  -- currently assigned region
            region_locked   INTEGER NOT NULL DEFAULT 0,  -- 1 = skip during auto-assign
            status          TEXT    NOT NULL DEFAULT 'hired',  -- 'hired' | 'offered' (region = target region; contracts aren't region-specific)
            assignment_end  TEXT    DEFAULT NULL  -- 'MM-DD' the scout's shortlist assignment ends (no year)
        );

    `);

    // Projected pick position, locked in manually once standings are final
    const pickColNames = (db.prepare("PRAGMA table_info(picks)").all() as { name: string }[]).map(c => c.name);
    if (!pickColNames.includes('projected_pick'))
        db.exec("ALTER TABLE picks ADD COLUMN projected_pick INTEGER DEFAULT NULL");
    if (!pickColNames.includes('locked'))
        db.exec("ALTER TABLE picks ADD COLUMN locked INTEGER NOT NULL DEFAULT 0");

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
    if (!scoutColNames.includes('region_locked'))
        db.exec("ALTER TABLE scouts ADD COLUMN region_locked INTEGER NOT NULL DEFAULT 0");
    if (!scoutColNames.includes('status'))
        db.exec("ALTER TABLE scouts ADD COLUMN status TEXT NOT NULL DEFAULT 'hired'");
    if (!scoutColNames.includes('assignment_end'))
        db.exec("ALTER TABLE scouts ADD COLUMN assignment_end TEXT DEFAULT NULL");
    // Set by hand once a scout's assignment is finished — free to fill Board gaps
    if (!scoutColNames.includes('obligations_done'))
        db.exec("ALTER TABLE scouts ADD COLUMN obligations_done INTEGER NOT NULL DEFAULT 0");
    // Assignment end dates are month/day only — strip the year from any 'YYYY-MM-DD'
    db.exec("UPDATE scouts SET assignment_end = substr(assignment_end, 6) WHERE length(assignment_end) = 10");

    db.exec(`
        CREATE TABLE IF NOT EXISTS trades (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            season      INTEGER NOT NULL,
            partner     TEXT    NOT NULL,  -- team ID traded with
            assets      TEXT    NOT NULL,  -- JSON TradeAsset[] snapshot (players as they were, pick ownership)
            notes       TEXT    DEFAULT NULL,
            created_at  TEXT    DEFAULT (datetime('now'))
        );

        -- Randomized each season: Low / Medium / High, with the d100 roll that produced it
        CREATE TABLE IF NOT EXISTS draft_settings (
            season            INTEGER PRIMARY KEY,
            class_quality     TEXT    DEFAULT NULL,
            class_roll        INTEGER DEFAULT NULL,
            prospect_quality  TEXT    DEFAULT NULL,
            prospect_roll     INTEGER DEFAULT NULL,
            updated_at        TEXT    DEFAULT (datetime('now'))
        );

        -- League standings for teams whose picks we hold, used to estimate pick positions
        CREATE TABLE IF NOT EXISTS team_standings (
            season        INTEGER NOT NULL,
            team_id       TEXT    NOT NULL,
            position      INTEGER DEFAULT NULL,  -- league-wide, 1 = best record
            in_lottery    INTEGER DEFAULT NULL,  -- 1/0 set by hand; NULL = from position
            lottery_pick  INTEGER DEFAULT NULL,  -- 1st-round pick after the lottery draw
            PRIMARY KEY (season, team_id)
        );

        -- Salary cap set by hand for a season; seasons without one carry the last cap forward
        CREATE TABLE IF NOT EXISTS cap_ceilings (
            season   INTEGER PRIMARY KEY,
            ceiling  REAL    NOT NULL
        );

        -- Re-signing talks with our own players whose deals are running out. One row per
        -- player; an accepted extension starts once the current contract ends.
        CREATE TABLE IF NOT EXISTS extensions (
            player_id     INTEGER PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
            fa_status     TEXT    DEFAULT NULL,  -- 'RFA' | 'UFA'; NULL = from age
            asking_aav    REAL    DEFAULT NULL,
            asking_years  INTEGER DEFAULT NULL,
            offer_aav     REAL    DEFAULT NULL,
            offer_years   INTEGER DEFAULT NULL,
            offer_type    TEXT    DEFAULT NULL,
            offer_clause  TEXT    DEFAULT NULL,
            status        TEXT    NOT NULL DEFAULT 'Negotiating',
            notes         TEXT    DEFAULT NULL
        );

        -- Free agents we're interested in, with what they want and what we've offered
        CREATE TABLE IF NOT EXISTS free_agents (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            first_name        TEXT    NOT NULL DEFAULT '',
            last_name         TEXT    NOT NULL DEFAULT '',
            position          TEXT    NOT NULL DEFAULT 'C',
            age               INTEGER DEFAULT NULL,
            overall           INTEGER DEFAULT NULL,
            potential_level   TEXT    DEFAULT NULL,
            potential_chance  TEXT    DEFAULT NULL,
            player_type       TEXT    DEFAULT NULL,
            role              TEXT    DEFAULT NULL,
            fa_type           TEXT    NOT NULL DEFAULT 'UFA',
            rights_team       TEXT    DEFAULT NULL,  -- RFA's current team (receives offer-sheet compensation)
            asking_aav        REAL    DEFAULT NULL,
            asking_years      INTEGER DEFAULT NULL,
            offer_aav         REAL    DEFAULT NULL,
            offer_years       INTEGER DEFAULT NULL,
            offer_type        TEXT    DEFAULT NULL,
            offer_clause      TEXT    DEFAULT NULL,
            target_league     TEXT    NOT NULL DEFAULT 'NHL',
            status            TEXT    NOT NULL DEFAULT 'Shortlisted',
            notes             TEXT    DEFAULT NULL,
            created_at        TEXT    DEFAULT (datetime('now'))
        );
    `);

    // Team direction (drives Trade Block suggestions) and manual trade-block flags
    const franchiseColNames = (db.prepare("PRAGMA table_info(franchise)").all() as { name: string }[]).map(c => c.name);
    if (!franchiseColNames.includes('team_status'))
        db.exec("ALTER TABLE franchise ADD COLUMN team_status TEXT NOT NULL DEFAULT 'Bubble'");
    const playerColNames = (db.prepare("PRAGMA table_info(players)").all() as { name: string }[]).map(c => c.name);
    if (!playerColNames.includes('on_block'))
        db.exec("ALTER TABLE players ADD COLUMN on_block INTEGER NOT NULL DEFAULT 0");

    db.exec(SCOUTED_PLAYERS_SCHEMA('scouted_players'));
    migrateScoutedPlayers();
    const prospectColNames = (db.prepare("PRAGMA table_info(scouted_players)").all() as { name: string }[]).map(c => c.name);
    if (!prospectColNames.includes('gem_bust'))
        db.exec("ALTER TABLE scouted_players ADD COLUMN gem_bust TEXT DEFAULT NULL");
    // Drafted by another team (who doesn't matter) — kept on the board, out of the targets
    if (!prospectColNames.includes('taken'))
        db.exec("ALTER TABLE scouted_players ADD COLUMN taken INTEGER NOT NULL DEFAULT 0");
    // CS rank at first assessment, to show movement since. Existing prospects start from today's rank.
    if (!prospectColNames.includes('original_cs_rank')) {
        db.exec("ALTER TABLE scouted_players ADD COLUMN original_cs_rank INTEGER DEFAULT NULL");
        db.exec("UPDATE scouted_players SET original_cs_rank = cs_rank");
    }
}

// Data fix-ups that run every time a file is opened
function normalizeData() {
    // Prospects with no league default to the region their scout is working
    db.exec(`
        UPDATE scouted_players
        SET junior_league = (SELECT region FROM scouts WHERE scouts.id = scouted_players.scout_id)
        WHERE junior_league IS NULL AND scout_id IS NOT NULL
    `);
}

// Prospects. A scout's shortlist is the prospects with their scout_id; quick-adds
// fill identity + cs_rank, and the quality fields stay NULL until refined on the board.
const SCOUTED_PLAYERS_SCHEMA = (table: string) => `
    CREATE TABLE IF NOT EXISTS ${table} (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name          TEXT    NOT NULL DEFAULT '',
        last_name           TEXT    NOT NULL DEFAULT '',
        position            TEXT    DEFAULT NULL,
        position2           TEXT    DEFAULT NULL,
        age                 INTEGER DEFAULT NULL,
        junior_league       TEXT    DEFAULT NULL,
        cs_rank             INTEGER DEFAULT NULL,  -- Central Scouting rank ≈ projected pick
        overall             INTEGER DEFAULT NULL,
        potential_level     TEXT    DEFAULT NULL,
        potential_chance    TEXT    DEFAULT NULL,
        player_type         TEXT    DEFAULT NULL,
        nhl_readiness       TEXT    DEFAULT NULL,
        scout_id            INTEGER DEFAULT NULL REFERENCES scouts(id) ON DELETE SET NULL,
        notes               TEXT    DEFAULT NULL,
        gem_bust            TEXT    DEFAULT NULL  -- 'Gem' | 'Bust' once scouting reveals it (draft screen only)
    );
`;

// Max prospects on one scout's shortlist
const SHORTLIST_MAX = 50;

function migrateScoutedPlayers() {
    const cols = (db.prepare("PRAGMA table_info(scouted_players)").all() as { name: string }[])
        .map(c => c.name);
    const hasShortlistTable = !!db.prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'scout_shortlist'"
    ).get();
    if (cols.includes('cs_rank') && !hasShortlistTable) return;

    // SQLite can't relax NOT NULL in place, so rebuild the table (migrate() has FK checks off)
    if (!cols.includes('cs_rank')) {
        db.exec(SCOUTED_PLAYERS_SCHEMA('scouted_players_new'));
        db.exec(`
            INSERT INTO scouted_players_new (
                id, first_name, last_name, position, position2, age, junior_league,
                overall, potential_level, potential_chance, player_type,
                nhl_readiness, scout_id, notes
            )
            SELECT
                id, first_name, last_name, position, position2, age, junior_league,
                overall, NULLIF(potential_level, ''), potential_chance, NULLIF(player_type, ''),
                nhl_readiness, scout_id, notes
            FROM scouted_players;
            DROP TABLE scouted_players;
            ALTER TABLE scouted_players_new RENAME TO scouted_players;
        `);
    }
    // Fold the interim shortlist table into prospects
    if (hasShortlistTable) {
        db.exec(`
            INSERT INTO scouted_players (first_name, last_name, age, position, cs_rank, scout_id)
            SELECT first_name, last_name, age, position, cs_rank, scout_id
            FROM scout_shortlist
            WHERE scouted_player_id IS NULL;
            DROP TABLE scout_shortlist;
        `);
    }
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

// Bulk import from CSV: all rows or none. Replacing clears the roster first (extensions go with it).
function importPlayers(players: Record<string, unknown>[], replace: boolean) {
    db.transaction(() => {
        if (replace) clearAllPlayers();
        for (const player of players) addPlayer(player);
    })();
    return getAllPlayers();
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

function setTeamStatus(status: string) {
    db.prepare('UPDATE franchise SET team_status = ? WHERE id = 1').run(status);
    return getFranchise();
}

// Blank clears the name; the franchise list then shows the team instead
function renameFranchise(name: string | null) {
    db.prepare('UPDATE franchise SET name = ? WHERE id = 1').run(name?.trim() || null);
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
function mapPick(row: unknown) {
    const pick = row as Record<string, unknown>;
    return { ...pick, locked: Boolean(pick.locked) };
}

function getAllPicks() {
    return db.prepare(`
        SELECT * FROM picks
        ORDER BY year ASC, round ASC
    `).all().map(mapPick);
}

function getMyPicks(teamID: string) {
    return db.prepare(`
        SELECT * FROM picks WHERE current_owner = ?
        ORDER BY year ASC, round ASC
    `).all(teamID).map(mapPick);
}

function getTradedAway(teamID: string) {
    return db.prepare(`
        SELECT * FROM picks WHERE original_owner = ? AND current_owner != ?
        ORDER BY year ASC, round ASC
    `).all(teamID, teamID).map(mapPick);
}

function getAcquired(teamID: string) {
    return db.prepare(`
        SELECT * FROM picks WHERE original_owner != ? AND current_owner = ?
        ORDER BY year ASC, round ASC
    `).all(teamID, teamID).map(mapPick);
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

    return mapPick(db.prepare('SELECT * FROM picks WHERE id = ?')
        .get(result.lastInsertRowid));
}

function updatePick(id: number, pick: Record<string, unknown>) {
    const data = {
        ...pick,
        ...(pick.locked !== undefined && { locked: pick.locked ? 1 : 0 }),
    };
    const fields = Object.keys(data)
        .map(key => `${key} = @${key}`)
        .join(', ');

    db.prepare(`UPDATE picks SET ${fields} WHERE id = @id`)
        .run({ ...data, id });

    return mapPick(db.prepare('SELECT * FROM picks WHERE id = ?').get(id));
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
            first_name, last_name, overall_rating, region_ratings, region, region_locked, status, assignment_end
        ) VALUES (
            @first_name, @last_name, @overall_rating, @region_ratings, @region, @region_locked, @status, @assignment_end
        )
    `).run({
        ...scout,
        region_ratings: JSON.stringify(scout.region_ratings ?? {}),
        region: scout.region ?? null,
        region_locked: scout.region_locked ? 1 : 0,
        status: scout.status ?? 'hired',
        assignment_end: scout.assignment_end ?? null,
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
        ...(scout.region_locked !== undefined && {
            region_locked: scout.region_locked ? 1 : 0,
        }),
        ...(scout.obligations_done !== undefined && {
            obligations_done: scout.obligations_done ? 1 : 0,
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

// Bulk import: all rows or none. Replacing removes existing scouts; their shortlisted
// prospects stay on the Board without a scout.
function importScouts(scouts: Record<string, unknown>[], replace: boolean) {
    db.transaction(() => {
        if (replace) db.prepare('DELETE FROM scouts').run();
        for (const scout of scouts) addScout(scout);
    })();
    return getAllScouts();
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

// Throws if assigning a prospect to this scout would exceed their shortlist limit
function assertShortlistRoom(scoutID: unknown, excludeID: number | null = null) {
    if (scoutID === null || scoutID === undefined) return;
    const { count } = db.prepare(
        'SELECT COUNT(*) AS count FROM scouted_players WHERE scout_id = ? AND id IS NOT ?'
    ).get(scoutID, excludeID) as { count: number };
    if (count >= SHORTLIST_MAX) throw new Error(`Shortlist full (${SHORTLIST_MAX} max)`);
}

function addScoutedPlayer(player: Record<string, unknown>) {
    assertShortlistRoom(player.scout_id);

    // Quick-adds omit the refinement fields — default everything to NULL
    const result = db.prepare(`
        INSERT INTO scouted_players (
            first_name, last_name, position, position2, age, junior_league, cs_rank,
            overall, potential_level, potential_chance, player_type,
            nhl_readiness, scout_id, notes, gem_bust, original_cs_rank
        ) VALUES (
            @first_name, @last_name, @position, @position2, @age, @junior_league, @cs_rank,
            @overall, @potential_level, @potential_chance, @player_type,
            @nhl_readiness, @scout_id, @notes, @gem_bust, @original_cs_rank
        )
    `).run({
        position: null, position2: null, age: null, junior_league: null, cs_rank: null,
        overall: null, potential_level: null, potential_chance: null, player_type: null,
        nhl_readiness: null, scout_id: null, notes: null, gem_bust: null,
        ...player,
        // The first rank entered is the original assessment
        original_cs_rank: player.original_cs_rank ?? player.cs_rank ?? null,
    });

    return db.prepare('SELECT * FROM scouted_players WHERE id = ?')
        .get(result.lastInsertRowid) as Record<string, unknown>;
}

function updateScoutedPlayer(id: number, player: Record<string, unknown>) {
    if ('scout_id' in player) assertShortlistRoom(player.scout_id, id);

    // A prospect ranked for the first time gets that rank as their original
    if (player.cs_rank != null && !('original_cs_rank' in player)) {
        const { original_cs_rank } = db.prepare('SELECT original_cs_rank FROM scouted_players WHERE id = ?')
            .get(id) as { original_cs_rank: number | null };
        if (original_cs_rank === null) player = { ...player, original_cs_rank: player.cs_rank };
    }

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

// After the draft: clear the class. Optionally keep undrafted prospects (not taken) to
// carry into next year's board, re-baselined to their current CS rank.
function clearDraftClass(keepUndrafted: boolean) {
    const tx = db.transaction(() => {
        if (keepUndrafted) {
            db.prepare('DELETE FROM scouted_players WHERE taken = 1').run();
            db.prepare('UPDATE scouted_players SET original_cs_rank = cs_rank').run();
        } else {
            db.prepare('DELETE FROM scouted_players').run();
        }
    });
    tx();
    return getAllScoutedPlayers();
}

/**********************
 * Contract Handlers *
 **********************/
function getAllCapCeilings() {
    return db.prepare('SELECT * FROM cap_ceilings ORDER BY season').all();
}

// A null ceiling clears the season back to carrying the previous cap forward
function saveCapCeiling(season: number, ceiling: number | null) {
    if (ceiling === null) db.prepare('DELETE FROM cap_ceilings WHERE season = ?').run(season);
    else db.prepare(`
        INSERT INTO cap_ceilings (season, ceiling) VALUES (?, ?)
        ON CONFLICT(season) DO UPDATE SET ceiling = excluded.ceiling
    `).run(season, ceiling);
    return getAllCapCeilings();
}

function getAllRetainedSalary() {
    return db.prepare('SELECT * FROM retained_salary ORDER BY season').all();
}

// A null or zero amount clears the season
function saveRetainedSalary(season: number, amount: number | null) {
    if (!amount) db.prepare('DELETE FROM retained_salary WHERE season = ?').run(season);
    else db.prepare(`
        INSERT INTO retained_salary (season, amount) VALUES (?, ?)
        ON CONFLICT(season) DO UPDATE SET amount = excluded.amount
    `).run(season, amount);
    return getAllRetainedSalary();
}

function getAllExtensions() {
    return db.prepare('SELECT * FROM extensions').all();
}

// Upsert: one row of talks per player
function saveExtension(extension: { player_id: number } & Record<string, unknown>) {
    const row = {
        fa_status: null, asking_aav: null, asking_years: null, offer_aav: null, offer_years: null,
        offer_type: null, offer_clause: null, status: 'Negotiating', notes: null,
        ...extension,
    };
    db.prepare(`
        INSERT INTO extensions (
            player_id, fa_status, asking_aav, asking_years, offer_aav, offer_years,
            offer_type, offer_clause, status, notes
        ) VALUES (
            @player_id, @fa_status, @asking_aav, @asking_years, @offer_aav, @offer_years,
            @offer_type, @offer_clause, @status, @notes
        )
        ON CONFLICT(player_id) DO UPDATE SET
            fa_status = excluded.fa_status, asking_aav = excluded.asking_aav,
            asking_years = excluded.asking_years, offer_aav = excluded.offer_aav,
            offer_years = excluded.offer_years, offer_type = excluded.offer_type,
            offer_clause = excluded.offer_clause, status = excluded.status, notes = excluded.notes
    `).run(row);
    return db.prepare('SELECT * FROM extensions WHERE player_id = ?').get(row.player_id);
}

function deleteExtension(playerID: number) {
    db.prepare('DELETE FROM extensions WHERE player_id = ?').run(playerID);
    return { success: true };
}

// The old deal has run out: the accepted extension becomes the player's contract
function startExtension(playerID: number) {
    const ext = db.prepare('SELECT * FROM extensions WHERE player_id = ?').get(playerID) as
        { offer_aav: number | null; offer_years: number | null; offer_type: string | null; offer_clause: string | null; status: string } | undefined;
    if (!ext || ext.status !== 'Accepted' || ext.offer_aav === null || ext.offer_years === null) {
        throw new Error('No accepted extension to start');
    }
    const tx = db.transaction(() => {
        db.prepare(`
            UPDATE players SET aav = ?, years_remaining = ?, contract_type = ?, clause = ? WHERE id = ?
        `).run(ext.offer_aav, ext.offer_years, ext.offer_type, ext.offer_clause, playerID);
        db.prepare('DELETE FROM extensions WHERE player_id = ?').run(playerID);
    });
    tx();
    return db.prepare('SELECT * FROM players WHERE id = ?').get(playerID);
}

function getAllFreeAgents() {
    return db.prepare('SELECT * FROM free_agents ORDER BY last_name ASC, first_name ASC').all();
}

const FREE_AGENT_DEFAULTS = {
    age: null, overall: null, potential_level: null, potential_chance: null, player_type: null,
    role: null, fa_type: 'UFA', rights_team: null, asking_aav: null, asking_years: null,
    offer_aav: null, offer_years: null, offer_type: null, offer_clause: null,
    target_league: 'NHL', status: 'Shortlisted', notes: null,
};

function addFreeAgent(agent: Record<string, unknown>) {
    const result = db.prepare(`
        INSERT INTO free_agents (
            first_name, last_name, position, age, overall, potential_level, potential_chance,
            player_type, role, fa_type, rights_team, asking_aav, asking_years, offer_aav,
            offer_years, offer_type, offer_clause, target_league, status, notes
        ) VALUES (
            @first_name, @last_name, @position, @age, @overall, @potential_level, @potential_chance,
            @player_type, @role, @fa_type, @rights_team, @asking_aav, @asking_years, @offer_aav,
            @offer_years, @offer_type, @offer_clause, @target_league, @status, @notes
        )
    `).run({ ...FREE_AGENT_DEFAULTS, ...agent });
    return db.prepare('SELECT * FROM free_agents WHERE id = ?').get(result.lastInsertRowid);
}

function updateFreeAgent(id: number, agent: Record<string, unknown>) {
    const fields = Object.keys(agent)
        .map(key => `${key} = @${key}`)
        .join(', ');
    db.prepare(`UPDATE free_agents SET ${fields} WHERE id = @id`).run({ ...agent, id });
    return db.prepare('SELECT * FROM free_agents WHERE id = ?').get(id);
}

function deleteFreeAgent(id: number) {
    db.prepare('DELETE FROM free_agents WHERE id = ?').run(id);
    return { success: true };
}

// An accepted offer: the free agent joins the roster on the offered terms
function signFreeAgent(id: number) {
    const fa = db.prepare('SELECT * FROM free_agents WHERE id = ?').get(id) as Record<string, any> | undefined;
    if (!fa || fa.offer_aav === null || fa.offer_years === null) throw new Error('No offer to sign');
    let player: unknown;
    const tx = db.transaction(() => {
        player = addPlayer({
            ...INCOMING_PLAYER_DEFAULTS,
            first_name: fa.first_name,
            last_name: fa.last_name,
            position: fa.position,
            age: fa.age ?? 25,
            roster_league: fa.target_league,
            overall: fa.overall ?? 70,
            potential_level: fa.potential_level ?? '',
            potential_chance: fa.potential_chance ?? '',
            player_type: fa.player_type ?? '',
            role: fa.role ?? '',
            aav: fa.offer_aav,
            years_remaining: fa.offer_years,
            contract_type: fa.offer_type,
            clause: fa.offer_clause,
            notes: fa.notes,
        });
        db.prepare('DELETE FROM free_agents WHERE id = ?').run(id);
    });
    tx();
    return player;
}

/******************
 * Trade Handlers *
 ******************/
const parseTrade = (row: unknown) => {
    const trade = row as Record<string, unknown>;
    return { ...trade, assets: JSON.parse(trade.assets as string) };
};

function getAllTrades() {
    return db.prepare('SELECT * FROM trades ORDER BY id DESC').all().map(parseTrade);
}

// Defaults for an incoming player so every column addPlayer binds is present
const INCOMING_PLAYER_DEFAULTS = {
    position2: null, junior_league: null, potential_level: '', potential_chance: '', player_type: '',
    role: '', aav: 0, years_remaining: 0, contract_type: null, clause: null, waiver_eligible: 1,
    status: 'Active', notes: null, line_slot: null, line_league: null,
};

/**
 * Executes a trade atomically: outgoing players leave the roster, outgoing picks move to
 * the partner, incoming players join, incoming picks are claimed (created if the pick
 * isn't tracked yet). Every asset is snapshotted into the trade log.
 *
 * Incoming picks name their original owner explicitly — the partner may be flipping a
 * pick it acquired elsewhere.
 */
function executeTrade(trade: {
    partner: string;
    notes: string | null;
    outPlayerIds: number[];
    outPickIds: number[];
    inPlayers: Record<string, unknown>[];
    inPicks: { year: number; round: number; original_owner: string }[];
}) {
    const franchise = getFranchise() as { team_id: string | null; season: number };
    const me = franchise.team_id;
    if (!me) throw new Error('Set your team before trading');
    if (trade.partner === me) throw new Error("Can't trade with yourself");
    const total = trade.outPlayerIds.length + trade.outPickIds.length + trade.inPlayers.length + trade.inPicks.length;
    if (!total) throw new Error('A trade needs at least one asset');

    const snapshot = (p: Record<string, unknown>) => ({
        first_name: p.first_name, last_name: p.last_name, position: p.position, position2: p.position2,
        age: p.age, roster_league: p.roster_league, overall: p.overall,
        potential_level: p.potential_level, potential_chance: p.potential_chance, player_type: p.player_type,
        aav: p.aav, years_remaining: p.years_remaining, contract_type: p.contract_type, clause: p.clause,
    });

    return db.transaction(() => {
        const assets: Record<string, unknown>[] = [];

        for (const id of trade.outPlayerIds) {
            const player = db.prepare('SELECT * FROM players WHERE id = ?').get(id) as Record<string, unknown> | undefined;
            if (!player) throw new Error(`Player ${id} not found`);
            assets.push({ direction: 'out', kind: 'player', player: snapshot(player) });
            db.prepare('DELETE FROM players WHERE id = ?').run(id);
        }

        for (const id of trade.outPickIds) {
            const pick = db.prepare('SELECT * FROM picks WHERE id = ?').get(id) as Record<string, unknown> | undefined;
            if (!pick) throw new Error(`Pick ${id} not found`);
            if (pick.current_owner !== me) throw new Error(`You don't own the ${pick.year} round ${pick.round} pick`);
            assets.push({
                direction: 'out', kind: 'pick', year: pick.year, round: pick.round,
                original_owner: pick.original_owner, from_owner: me, to_owner: trade.partner,
            });
            db.prepare('UPDATE picks SET current_owner = ?, projected_pick = NULL, locked = 0 WHERE id = ?')
                .run(trade.partner, id);
        }

        for (const incoming of trade.inPlayers) {
            const player = addPlayer({ ...INCOMING_PLAYER_DEFAULTS, ...incoming });
            assets.push({ direction: 'in', kind: 'player', player: snapshot(player) });
        }

        for (const { year, round, original_owner } of trade.inPicks) {
            // Generated picks store 2-digit years, picks added by hand 4-digit — match either
            const yy = year % 100;
            const existing = db.prepare(
                'SELECT * FROM picks WHERE year IN (?, ?) AND round = ? AND original_owner = ?'
            ).get(yy, 2000 + yy, round, original_owner) as Record<string, unknown> | undefined;
            if (existing?.current_owner === me) throw new Error(`You already own the ${year} round ${round} pick (${original_owner})`);
            if (existing) {
                db.prepare('UPDATE picks SET current_owner = ?, projected_pick = NULL, locked = 0 WHERE id = ?')
                    .run(me, existing.id);
            } else {
                db.prepare('INSERT INTO picks (year, round, original_owner, current_owner) VALUES (?, ?, ?, ?)')
                    .run(yy, round, original_owner, me);
            }
            assets.push({
                direction: 'in', kind: 'pick', year: yy, round,
                original_owner, from_owner: trade.partner, to_owner: me,
            });
        }

        const result = db.prepare(
            'INSERT INTO trades (season, partner, assets, notes) VALUES (?, ?, ?, ?)'
        ).run(franchise.season, trade.partner, JSON.stringify(assets), trade.notes);

        return parseTrade(db.prepare('SELECT * FROM trades WHERE id = ?').get(result.lastInsertRowid));
    })();
}

// Removes a log entry only — the roster and picks are not rolled back
function deleteTrade(id: number) {
    db.prepare('DELETE FROM trades WHERE id = ?').run(id);
    return { success: true };
}

/******************
 * Draft Settings *
 ******************/
function getAllDraftSettings() {
    return db.prepare('SELECT * FROM draft_settings ORDER BY season DESC').all();
}

function saveDraftSettings(settings: {
    season: number;
    class_quality: string | null;
    class_roll: number | null;
    prospect_quality: string | null;
    prospect_roll: number | null;
}) {
    db.prepare(`
        INSERT INTO draft_settings (season, class_quality, class_roll, prospect_quality, prospect_roll)
        VALUES (@season, @class_quality, @class_roll, @prospect_quality, @prospect_roll)
        ON CONFLICT(season) DO UPDATE SET
            class_quality = excluded.class_quality,
            class_roll = excluded.class_roll,
            prospect_quality = excluded.prospect_quality,
            prospect_roll = excluded.prospect_roll,
            updated_at = datetime('now')
    `).run(settings);
    return db.prepare('SELECT * FROM draft_settings WHERE season = ?').get(settings.season);
}

/******************
 * Team Standings *
 ******************/
function mapStanding(row: any) {
    return row && { ...row, in_lottery: row.in_lottery === null ? null : !!row.in_lottery };
}

function getAllStandings() {
    return db.prepare('SELECT * FROM team_standings ORDER BY season DESC, position').all().map(mapStanding);
}

function saveStanding(standing: {
    season: number;
    team_id: string;
    position: number | null;
    in_lottery: boolean | null;
    lottery_pick: number | null;
}) {
    db.prepare(`
        INSERT INTO team_standings (season, team_id, position, in_lottery, lottery_pick)
        VALUES (@season, @team_id, @position, @in_lottery, @lottery_pick)
        ON CONFLICT(season, team_id) DO UPDATE SET
            position = excluded.position,
            in_lottery = excluded.in_lottery,
            lottery_pick = excluded.lottery_pick
    `).run({ ...standing, in_lottery: standing.in_lottery === null ? null : standing.in_lottery ? 1 : 0 });
    return mapStanding(db.prepare('SELECT * FROM team_standings WHERE season = ? AND team_id = ?')
        .get(standing.season, standing.team_id));
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
    'player:import': (_: null, players: Record<string, unknown>[], replace: boolean) => importPlayers(players, replace),
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
    'franchise:setStatus': (_: null, status: string) => setTeamStatus(status),
    'franchise:rename': (_: null, name: string | null) => renameFranchise(name),
    'franchise:advanceSeason': () => advanceSeason(),
    'pick:getAll': () => getAllPicks(),
    'pick:getMy': (_: null, teamID: string) => getMyPicks(teamID),
    'pick:getTraded': (_: null, teamID: string) => getTradedAway(teamID),
    'pick:getAcquired': (_: null, teamID: string) => getAcquired(teamID),
    'pick:add': (_: null, pick: Record<string, unknown>) => addPick(pick),
    'pick:update': (_: null, id: number, pick: Record<string, unknown>) => updatePick(id, pick),
    'pick:delete': (_: null, id: number) => deletePick(id),
    'trade:getAll': () => getAllTrades(),
    'trade:execute': (_: null, trade: Parameters<typeof executeTrade>[0]) => executeTrade(trade),
    'trade:delete': (_: null, id: number) => deleteTrade(id),
    'draftSettings:getAll': () => getAllDraftSettings(),
    'standings:getAll': () => getAllStandings(),
    'standings:save': (_: null, standing: Parameters<typeof saveStanding>[0]) => saveStanding(standing),
    'draftSettings:save': (_: null, settings: Parameters<typeof saveDraftSettings>[0]) => saveDraftSettings(settings),
    'scout:getAll': () => getAllScouts(),
    'scout:add': (_: null, scout: Record<string, unknown>) => addScout(scout),
    'scout:update': (_: null, id: number, scout: Record<string, unknown>) => updateScout(id, scout),
    'scout:delete': (_: null, id: number) => deleteScout(id),
    'scout:import': (_: null, scouts: Record<string, unknown>[], replace: boolean) => importScouts(scouts, replace),
    'scoutedPlayer:getAll': () => getAllScoutedPlayers(),
    'scoutedPlayer:add': (_: null, player: Record<string, unknown>) => addScoutedPlayer(player),
    'scoutedPlayer:update': (_: null, id: number, player: Record<string, unknown>) => updateScoutedPlayer(id, player),
    'scoutedPlayer:delete': (_: null, id: number) => deleteScoutedPlayer(id),
    'scoutedPlayer:clearClass': (_: null, keepUndrafted: boolean) => clearDraftClass(keepUndrafted),
    'capCeiling:getAll': () => getAllCapCeilings(),
    'capCeiling:save': (_: null, season: number, ceiling: number | null) => saveCapCeiling(season, ceiling),
    'retained:getAll': () => getAllRetainedSalary(),
    'retained:save': (_: null, season: number, amount: number | null) => saveRetainedSalary(season, amount),
    'extension:getAll': () => getAllExtensions(),
    'extension:save': (_: null, extension: Parameters<typeof saveExtension>[0]) => saveExtension(extension),
    'extension:delete': (_: null, playerID: number) => deleteExtension(playerID),
    'extension:start': (_: null, playerID: number) => startExtension(playerID),
    'freeAgent:getAll': () => getAllFreeAgents(),
    'freeAgent:add': (_: null, agent: Record<string, unknown>) => addFreeAgent(agent),
    'freeAgent:update': (_: null, id: number, agent: Record<string, unknown>) => updateFreeAgent(id, agent),
    'freeAgent:delete': (_: null, id: number) => deleteFreeAgent(id),
    'freeAgent:sign': (_: null, id: number) => signFreeAgent(id),
}
