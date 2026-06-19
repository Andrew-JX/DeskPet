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
  setPetIdle: (id, descriptor) => ipcRenderer.invoke('set-pet-idle', id, descriptor),
  // 互动
  addInteraction: (assetId, label) => ipcRenderer.invoke('add-interaction', assetId, label),
  deleteInteraction: (assetId, interId) => ipcRenderer.invoke('delete-interaction', assetId, interId),
  renameInteraction: (assetId, interId, label) => ipcRenderer.invoke('rename-interaction', assetId, interId, label),
  setInteractionMaterial: (assetId, interId, descriptor) => ipcRenderer.invoke('set-interaction-material', assetId, interId, descriptor),
  setEventMaterial: (assetId, key, descriptor) => ipcRenderer.invoke('set-event-material', assetId, key, descriptor),
  // 素材库
  addLibraryMedia: () => ipcRenderer.invoke('add-library-media'),
  updateLibraryMedia: (libId, partial) => ipcRenderer.invoke('update-library-media', libId, partial),
  sliceLibraryFrame: (libId, index) => ipcRenderer.invoke('slice-library-frame', libId, index),
  saveCroppedFrame: (name, dataUrl) => ipcRenderer.invoke('save-cropped-frame', name, dataUrl),
  deleteLibraryMedia: (libId) => ipcRenderer.invoke('delete-library-media', libId),

  getLayout: () => ipcRenderer.invoke('get-layout'),
  setIgnoreMouse: (ignore) => ipcRenderer.invoke('set-ignore-mouse', ignore),
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
