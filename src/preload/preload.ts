import { contextBridge, ipcRenderer } from 'electron';

// IPC channels will be registered here as features are built.
const channels = [
    'player:getAll', 'player:add', 'player:update', 'player:delete', 'player:assignSlot', 'player:clearAll',
    'franchise:get', 'franchise:update', 'franchise:advanceSeason',
    'teams:get',
    'pick:getAll', 'pick:getMy', 'pick:getTraded', 'pick:getAcquired',
    'pick:add', 'pick:update', 'pick:delete',
    'scout:getAll', 'scout:add', 'scout:update', 'scout:delete',
    'scoutedPlayer:getAll', 'scoutedPlayer:add', 'scoutedPlayer:update', 'scoutedPlayer:delete',
];

const api: Record<string, (...args: unknown[]) => Promise<unknown>> = {};

for (const channel of channels) {
    api[channel] = (...args) => ipcRenderer.invoke(channel, ...args);
}

contextBridge.exposeInMainWorld('db', api);
