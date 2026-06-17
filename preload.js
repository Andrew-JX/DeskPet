'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// 渲染层只能通过这个白名单 API 与主进程通信。
// 注意：没有任何方法能拿到 API Key —— 这是「可信桌宠」的安全基线。
contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (partial) => ipcRenderer.invoke('save-config', partial),
  openPanel: () => ipcRenderer.invoke('open-panel'),
  setPetSize: (size) => ipcRenderer.invoke('set-pet-size', size),

  // 宠物
  addPet: () => ipcRenderer.invoke('add-pet'),
  deletePet: (id) => ipcRenderer.invoke('delete-pet', id),
  setCurrentAsset: (id) => ipcRenderer.invoke('set-current-asset', id),
  renamePet: (id, name) => ipcRenderer.invoke('rename-pet', id, name),
  replacePetMedia: (id) => ipcRenderer.invoke('replace-pet-media', id),
  updateAsset: (partial) => ipcRenderer.invoke('update-asset', partial),
  // 互动
  addInteraction: (assetId, label) => ipcRenderer.invoke('add-interaction', assetId, label),
  deleteInteraction: (assetId, interId) => ipcRenderer.invoke('delete-interaction', assetId, interId),
  renameInteraction: (assetId, interId, label) => ipcRenderer.invoke('rename-interaction', assetId, interId, label),
  updateInteraction: (assetId, interId, partial) => ipcRenderer.invoke('update-interaction', assetId, interId, partial),
  uploadInteractionMedia: (assetId, interId) => ipcRenderer.invoke('upload-interaction-media', assetId, interId),

  movePet: (dx, dy) => ipcRenderer.invoke('move-pet', dx, dy),
  aiChat: (text) => ipcRenderer.invoke('ai-chat', text),
  confirmTool: (id, ok) => ipcRenderer.invoke('confirm-tool', id, ok),
  statEvent: (kind) => ipcRenderer.invoke('stat-event', kind),
  toggleTodo: (id) => ipcRenderer.invoke('toggle-todo', id),
  clearTrace: () => ipcRenderer.invoke('clear-trace'),
  readMedia: (file) => ipcRenderer.invoke('read-media', file),
  readAssetData: (id) => ipcRenderer.invoke('read-asset-data', id),

  // 配置变更广播
  onConfigUpdated: (cb) =>
    ipcRenderer.on('config-updated', (_e, cfg) => cb(cfg))
});
