import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { initDB, dbHandlers } from './db';

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function getResourcePath(filename: string) {
    if (app.isPackaged) {
        return path.join(process.resourcesPath, filename);
    }
    return path.join(app.getAppPath(), 'resources', filename);
}

function createWindow() {
    const win = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 1024,
        minHeight: 640,
        titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
        backgroundColor: '#0a0a0f',
        webPreferences: {
            preload: path.join(__dirname, '../preload/preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        show: false,
    });

    if (isDev) {
        win.loadURL('http://localhost:5173');
        win.webContents.openDevTools();
    } else {
        win.loadFile(path.join(__dirname, '../renderer/index.html'));
    }

    win.once('ready-to-show', () => win.show());

    win.webContents.setWindowOpenHandler(({url}) => {
        shell.openExternal(url);
        return {action: 'deny'};
    });
}

app.whenReady().then(() => {
    initDB();

    for (const [channel, handler] of Object.entries(dbHandlers)) {
        ipcMain.handle(channel, handler);
    }

    ipcMain.handle('teams:get', () => {
        const teamsPath = getResourcePath('teams.json');
        const raw = fs.readFileSync(teamsPath, 'utf8');
        return JSON.parse(raw);
    });

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
