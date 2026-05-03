import { contextBridge, ipcRenderer } from 'electron';

// IPC channels will be registered here as features are built.
const channels = [
    'player:getAll',
    'player:add',
    'player:update',
    'player:delete',
    'franchise:get',
    'franchise:update',
    'teams:get',
];

const api: Record<string, (...args: unknown[]) => Promise<unknown>> = {};

for (const channel of channels) {
    api[channel] = (...args) => ipcRenderer.invoke(channel, ...args);
}

contextBridge.exposeInMainWorld('db', api);
