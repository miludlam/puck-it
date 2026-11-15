import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { app, BrowserWindow, dialog, IpcMainInvokeEvent, shell } from 'electron';
import { dbHandlers, openDB, SCHEMA_VERSION } from './db';

// Each franchise is its own database file in userData/franchises. settings.json remembers
// which one was open last. Backups made before a schema update go in franchises/backups.
const userData = () => app.getPath('userData');
const libraryDir = () => path.join(userData(), 'franchises');
const backupDir = () => path.join(libraryDir(), 'backups');
const settingsPath = () => path.join(userData(), 'settings.json');
const LEGACY_DB = 'puck-it.db';

let current: string | null = null; // file name within the library

export interface FranchiseFile {
    file: string;
    name: string | null;
    team_id: string | null;
    season: number | null;
    modified: string;      // ISO time the file last changed
    current: boolean;
    newer: boolean;        // saved by a newer app version, can't be opened here
    unreadable: boolean;
}

function readSettings(): { current?: string } {
    try {
        return JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
    } catch {
        return {};
    }
}

function writeSettings(settings: { current?: string }) {
    fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2));
}

const filePath = (file: string) => path.join(libraryDir(), file);
const newFileName = () => `franchise-${Date.now().toString(36)}.db`;

// Only plain names from our own listing, never paths
function assertLibraryFile(file: string) {
    if (path.basename(file) !== file || !file.endsWith('.db') || !fs.existsSync(filePath(file)))
        throw new Error('Franchise not found');
}

function open(file: string) {
    openDB(filePath(file), backupDir());
    current = file;
    writeSettings({ ...readSettings(), current: file });
}

/** Read a franchise file without changing it */
function inspect(fullPath: string) {
    const conn = new Database(fullPath, { readonly: true, fileMustExist: true });
    try {
        const version = conn.pragma('user_version', { simple: true }) as number;
        const hasFranchise = !!conn.prepare(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'franchise'"
        ).get();
        const row = hasFranchise
            ? conn.prepare('SELECT * FROM franchise WHERE id = 1').get() as Record<string, unknown> | undefined
            : undefined;
        return { version, hasFranchise, row };
    } finally {
        conn.close();
    }
}

// Moves the single database from before the library into it, as the first franchise
function adoptLegacyDB() {
    const legacy = path.join(userData(), LEGACY_DB);
    if (!fs.existsSync(legacy)) return null;
    // Closing folds any write-ahead log back into the main file, so it moves as one file
    new Database(legacy).close();
    const file = newFileName();
    fs.renameSync(legacy, filePath(file));
    for (const suffix of ['-wal', '-shm']) fs.rmSync(legacy + suffix, { force: true });
    return file;
}

/** Open the last-used franchise at startup, creating the library on first run */
export function openLibrary(): string | null {
    fs.mkdirSync(libraryDir(), { recursive: true });
    const adopted = adoptLegacyDB();
    const remembered = readSettings().current;
    const file = adopted
        ?? (remembered && fs.existsSync(filePath(remembered)) ? remembered : null)
        ?? listFiles()[0]
        ?? newFileName();
    try {
        open(file);
        return null;
    } catch (e) {
        // Keep the app usable: start a blank franchise and leave the problem file in the list
        open(newFileName());
        return `Couldn't open your last franchise: ${(e as Error).message}`;
    }
}

function listFiles() {
    return fs.readdirSync(libraryDir())
        .filter(f => f.endsWith('.db'))
        .sort((a, b) => fs.statSync(filePath(b)).mtimeMs - fs.statSync(filePath(a)).mtimeMs);
}

function list(): FranchiseFile[] {
    return listFiles().map(file => {
        const full = filePath(file);
        // The open file's changes sit in its write-ahead log until checkpointed
        const wal = full + '-wal';
        const mtime = Math.max(fs.statSync(full).mtimeMs, fs.existsSync(wal) ? fs.statSync(wal).mtimeMs : 0);
        const base = { file, modified: new Date(mtime).toISOString(), current: file === current };
        try {
            const { version, row } = inspect(full);
            return {
                ...base,
                name: (row?.name as string | null) ?? null,
                team_id: (row?.team_id as string | null) ?? null,
                season: (row?.season as number | null) ?? null,
                newer: version > SCHEMA_VERSION,
                unreadable: false,
            };
        } catch {
            return { ...base, name: null, team_id: null, season: null, newer: false, unreadable: true };
        }
    });
}

function create(name: string | null) {
    open(newFileName());
    dbHandlers['franchise:rename'](null, name);
}

function switchTo(file: string) {
    assertLibraryFile(file);
    if (file !== current) open(file);
}

async function remove(file: string) {
    assertLibraryFile(file);
    if (file === current) throw new Error("Can't delete the open franchise");
    // To the Trash rather than gone, in case it was a mistake
    await shell.trashItem(filePath(file));
}

const windowOf = (event: IpcMainInvokeEvent) => BrowserWindow.fromWebContents(event.sender)!;

async function exportFile(event: IpcMainInvokeEvent, file: string, suggestedName: string) {
    assertLibraryFile(file);
    const { canceled, filePath: target } = await dialog.showSaveDialog(windowOf(event), {
        title: 'Export franchise',
        defaultPath: path.join(app.getPath('documents'), `${suggestedName.replace(/[\\/:*?"<>|]/g, '')}.db`),
        filters: [{ name: 'Puck It franchise', extensions: ['db'] }],
    });
    if (canceled || !target) return false;
    // VACUUM INTO writes one self-contained file, including changes still in the log.
    // It won't overwrite, and the save dialog has already confirmed replacing the target.
    fs.rmSync(target, { force: true });
    const conn = new Database(filePath(file), { readonly: true });
    try {
        conn.prepare('VACUUM INTO ?').run(target);
    } finally {
        conn.close();
    }
    return true;
}

async function importFile(event: IpcMainInvokeEvent) {
    const { canceled, filePaths } = await dialog.showOpenDialog(windowOf(event), {
        title: 'Import franchise',
        filters: [{ name: 'Puck It franchise', extensions: ['db'] }],
        properties: ['openFile'],
    });
    if (canceled || !filePaths[0]) return false;

    let info;
    try {
        info = inspect(filePaths[0]);
    } catch {
        throw new Error("That file isn't a Puck It franchise");
    }
    if (!info.hasFranchise) throw new Error("That file isn't a Puck It franchise");
    if (info.version > SCHEMA_VERSION)
        throw new Error('That franchise was saved by a newer version of Puck It. Update the app to import it.');

    const file = newFileName();
    const conn = new Database(filePaths[0], { readonly: true });
    try {
        conn.prepare('VACUUM INTO ?').run(filePath(file));
    } finally {
        conn.close();
    }
    try {
        open(file);
    } catch (e) {
        fs.rmSync(filePath(file), { force: true });
        throw e;
    }
    return true;
}

export const libraryHandlers: Record<string, (event: IpcMainInvokeEvent, ...args: any[]) => unknown> = {
    'library:list': () => list(),
    'library:create': (_, name: string | null) => create(name),
    'library:open': (_, file: string) => switchTo(file),
    'library:delete': (_, file: string) => remove(file),
    'library:export': (event, file: string, suggestedName: string) => exportFile(event, file, suggestedName),
    'library:import': (event) => importFile(event),
};
