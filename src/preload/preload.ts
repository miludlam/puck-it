import { contextBridge, ipcRenderer } from 'electron';

// IPC channels will be registered here as features are built.
const channels = [
    'player:getAll', 'player:add', 'player:update', 'player:delete', 'player:assignSlot', 'player:clearAll', 'player:import',
    'franchise:get', 'franchise:update', 'franchise:advanceSeason', 'franchise:setStatus', 'franchise:rename',
    'library:list', 'library:create', 'library:open', 'library:delete', 'library:export', 'library:import',
    'teams:get',
    'pick:getAll', 'pick:getMy', 'pick:getTraded', 'pick:getAcquired',
    'pick:add', 'pick:update', 'pick:delete',
    'trade:getAll', 'trade:execute', 'trade:delete',
    'draftSettings:getAll', 'draftSettings:save',
    'standings:getAll', 'standings:save',
    'scout:getAll', 'scout:add', 'scout:update', 'scout:delete', 'scout:import',
    'scoutedPlayer:getAll', 'scoutedPlayer:add', 'scoutedPlayer:update', 'scoutedPlayer:delete', 'scoutedPlayer:clearClass',
    'capCeiling:getAll', 'capCeiling:save',
    'extension:getAll', 'extension:save', 'extension:delete', 'extension:start',
    'freeAgent:getAll', 'freeAgent:add', 'freeAgent:update', 'freeAgent:delete', 'freeAgent:sign',
];

const api: Record<string, (...args: unknown[]) => Promise<unknown>> = {};

for (const channel of channels) {
    api[channel] = (...args) => ipcRenderer.invoke(channel, ...args);
}

contextBridge.exposeInMainWorld('db', api);
