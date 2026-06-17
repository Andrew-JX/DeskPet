'use strict';

const { app, BrowserWindow, ipcMain, dialog, screen } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

// ---------------------------------------------------------------------------
// 路径与本地存储
// 开发时存项目内（方便查看）；打包后存可写的 userData，因为 asar 资源区只读。
// 这些路径在 app ready 后由 initPaths() 赋值。
// ---------------------------------------------------------------------------
let ASSETS_DIR = path.join(__dirname, 'assets');
let USER_MEDIA_DIR = path.join(ASSETS_DIR, 'user-media');
let CONFIG_PATH = path.join(ASSETS_DIR, 'config.json');

function initPaths() {
  const base = app.isPackaged ? path.join(app.getPath('userData')) : __dirname;
  ASSETS_DIR = path.join(base, 'assets');
  USER_MEDIA_DIR = path.join(ASSETS_DIR, 'user-media');
  CONFIG_PATH = path.join(ASSETS_DIR, 'config.json');
}

function ensureDirs() {
  for (const dir of [ASSETS_DIR, USER_MEDIA_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

// 默认配置：首次启动若无 config.json 自动生成，显示占位宠物。
function defaultConfig() {
  return {
    currentAssetId: null,
    assets: [], // { id, name, type, path, cols, rows, frameCount, stateMap }
    petSize: 180,
    petName: '豆豆',
    // 宠物人设：注入到 AI 对话的 system prompt，决定它说话的语气。
    persona:
      '你是用户养的一只桌面宠物狗，名叫豆豆。你温暖、简短、口语化，像真实宠物一样陪伴主人工作。' +
      '你不会假装自己是人类，也不会编造主人没说过的事。回答尽量一两句话。',
    // 纪念模式：用于已离世的宠物。开启后语气更轻柔克制，且明确「陪伴而非复活」。
    memorialMode: false,
    // 点击互动按钮文案
    buttons: ['摸摸头', '聊会儿', '休息一下'],
    // 随机回应气泡（无 AI / 兜底时使用）
    responses: ['汪~ 在的！', '又在忙呀，记得喝水', '陪你一会儿', '我一直都在哦'],
    // 闲置气泡
    idleMessages: ['……（趴着看你工作）', '工作辛苦啦', '要不要起来动一动？'],
    // 番茄钟 / 久坐提醒
    pomodoro: {
      enabled: true,
      workMinutes: 25,
      sitReminderMinutes: 45,
      workEndMessage: '一个番茄钟到啦，站起来活动 5 分钟吧！',
      sitMessage: '已经坐了好久啦，起来走两步，我陪你～'
    },
    // AI 配置：provider 与 model；apiKey 永远不写进 config，只从环境变量读。
    ai: {
      provider: 'anthropic',
      model: 'claude-haiku-4-5-20251001'
    }
  };
}

function loadConfig() {
  ensureDirs();
  if (!fs.existsSync(CONFIG_PATH)) {
    const cfg = defaultConfig();
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
    return cfg;
  }
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    // 合并默认值，保证新增字段不丢
    return Object.assign(defaultConfig(), JSON.parse(raw));
  } catch (e) {
    console.error('config 解析失败，使用默认配置:', e);
    return defaultConfig();
  }
}

function saveConfig(cfg) {
  ensureDirs();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
}

let config = null;
let petWindow = null;
let panelWindow = null;

// 发给渲染层前，给每个素材附上绝对 file:// URL（渲染层不关心物理路径）。
function publicConfig() {
  if (!config) return config;
  const clone = JSON.parse(JSON.stringify(config));
  clone.assets = (clone.assets || []).map((a) => ({
    ...a,
    url: a.file ? pathToFileURL(path.join(USER_MEDIA_DIR, a.file)).href : null
  }));
  return clone;
}

// ---------------------------------------------------------------------------
// 窗口
// ---------------------------------------------------------------------------
function createPetWindow() {
  const size = (config && config.petSize) || 180;
  // 让窗口比宠物本体略大，给气泡留出空间
  const winW = size + 60;
  const winH = size + 120;

  petWindow = new BrowserWindow({
    width: winW,
    height: winH,
    transparent: true,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  petWindow.setAlwaysOnTop(true, 'screen-saver');
  petWindow.loadFile('pet.html');

  // 默认放到屏幕右下角
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;
  petWindow.setPosition(width - winW - 40, height - winH - 40);

  petWindow.on('closed', () => {
    petWindow = null;
  });
}

function createPanelWindow() {
  if (panelWindow && !panelWindow.isDestroyed()) {
    panelWindow.focus();
    return;
  }
  panelWindow = new BrowserWindow({
    width: 480,
    height: 720,
    title: 'DeskPet 后台 · 素材与人设',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  panelWindow.loadFile('panel.html');
  panelWindow.on('closed', () => {
    panelWindow = null;
  });
}

function broadcastConfig() {
  const pub = publicConfig();
  for (const win of [petWindow, panelWindow]) {
    if (win && !win.isDestroyed()) {
      win.webContents.send('config-updated', pub);
    }
  }
}

// ---------------------------------------------------------------------------
// IPC：配置读写
// ---------------------------------------------------------------------------
ipcMain.handle('get-config', () => publicConfig());

// 把素材读成 data URL 返回，避免 file:// 图片污染 canvas 导致抠图 getImageData 失败。
ipcMain.handle('read-asset-data', (_e, id) => {
  const asset = (config.assets || []).find((a) => a.id === id);
  if (!asset || !asset.file) return null;
  try {
    const abs = path.join(USER_MEDIA_DIR, asset.file);
    const buf = fs.readFileSync(abs);
    const ext = path.extname(asset.file).toLowerCase().replace('.', '');
    const mime =
      ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
      : ext === 'webp' ? 'image/webp'
      : ext === 'gif' ? 'image/gif'
      : 'image/png';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch (e) {
    console.error('读取素材失败:', e);
    return null;
  }
});

ipcMain.handle('save-config', (_e, partial) => {
  config = Object.assign(config, partial);
  saveConfig(config);
  broadcastConfig();
  return config;
});

ipcMain.handle('open-panel', () => {
  createPanelWindow();
});

ipcMain.handle('set-pet-size', (_e, size) => {
  config.petSize = size;
  saveConfig(config);
  if (petWindow && !petWindow.isDestroyed()) {
    const winW = size + 60;
    const winH = size + 120;
    petWindow.setSize(winW, winH);
  }
  broadcastConfig();
  return config;
});

// ---------------------------------------------------------------------------
// IPC：素材上传 / 删除 / 切换
// ---------------------------------------------------------------------------
ipcMain.handle('upload-asset', async () => {
  const result = await dialog.showOpenDialog(panelWindow, {
    title: '选择宠物精灵图 / 图片 / 视频',
    properties: ['openFile'],
    filters: [
      { name: '宠物素材', extensions: ['png', 'webp', 'gif', 'jpg', 'jpeg', 'mp4', 'webm', 'mov'] }
    ]
  });
  if (result.canceled || result.filePaths.length === 0) return null;

  const src = result.filePaths[0];
  const ext = path.extname(src).toLowerCase();
  const id = 'a_' + Date.now();
  const destName = id + ext;
  const dest = path.join(USER_MEDIA_DIR, destName);
  fs.copyFileSync(src, dest);

  const isVideo = ['.mp4', '.webm', '.mov'].includes(ext);
  const asset = {
    id,
    name: path.basename(src),
    type: isVideo ? 'video' : 'image',
    file: destName, // 仅存文件名，绝对路径由 USER_MEDIA_DIR 重建（dev/打包通用）
    // 精灵图默认网格假设：5 列 4 行 = 20 帧，可在面板调整
    cols: 5,
    rows: 4,
    frameCount: 20,
    // 状态 → 帧区间（含首尾）。默认按行划分。
    stateMap: {
      idle: [0, 4],
      walk: [5, 9],
      happy: [10, 14],
      sleep: [15, 19]
    },
    // 是否是单帧静图 / 动图 / 视频（非精灵图）
    animated: false
  };

  config.assets.push(asset);
  if (!config.currentAssetId) config.currentAssetId = id;
  saveConfig(config);
  broadcastConfig();
  return asset;
});

ipcMain.handle('delete-asset', (_e, id) => {
  const idx = config.assets.findIndex((a) => a.id === id);
  if (idx === -1) return config;
  const asset = config.assets[idx];
  try {
    const abs = path.join(USER_MEDIA_DIR, asset.file || '');
    if (asset.file && fs.existsSync(abs)) fs.unlinkSync(abs);
  } catch (e) {
    console.warn('删除素材文件失败:', e);
  }
  config.assets.splice(idx, 1);
  // 若删的是当前素材，切到剩余第一个，否则回到占位
  if (config.currentAssetId === id) {
    config.currentAssetId = config.assets.length ? config.assets[0].id : null;
  }
  saveConfig(config);
  broadcastConfig();
  return config;
});

ipcMain.handle('set-current-asset', (_e, id) => {
  config.currentAssetId = id;
  saveConfig(config);
  broadcastConfig();
  return config;
});

ipcMain.handle('update-asset', (_e, asset) => {
  const idx = config.assets.findIndex((a) => a.id === asset.id);
  if (idx !== -1) {
    config.assets[idx] = Object.assign(config.assets[idx], asset);
    saveConfig(config);
    broadcastConfig();
  }
  return config;
});

// ---------------------------------------------------------------------------
// IPC：移动宠物窗口（渲染层走路时调用）
// ---------------------------------------------------------------------------
ipcMain.handle('move-pet', (_e, dx, dy) => {
  if (!petWindow || petWindow.isDestroyed()) return;
  const [x, y] = petWindow.getPosition();
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;
  const [w, h] = petWindow.getSize();
  const nx = Math.max(0, Math.min(width - w, x + dx));
  const ny = Math.max(0, Math.min(height - h, y + dy));
  petWindow.setPosition(Math.round(nx), Math.round(ny));
});

// ---------------------------------------------------------------------------
// IPC：AI 对话
// 关键安全设计：API Key 只存在主进程环境变量，永不进入渲染层 / config.json。
// 没有 Key 时退回本地兜底文案，演示不翻车。
// ---------------------------------------------------------------------------
ipcMain.handle('ai-chat', async (_e, userText) => {
  const key = process.env.ANTHROPIC_API_KEY;

  // 构造人设
  let system = config.persona || '你是一只陪伴用户的桌面宠物，简短温暖。';
  if (config.memorialMode) {
    system +=
      '\n\n【纪念模式】主人养的这只宠物已经离开了。你是带着它形象的温柔陪伴者，' +
      '不要假装自己就是那只宠物本体、不说「我回来了」之类的话，不消费悲伤；' +
      '当主人流露思念时，给予安静的、有分寸的安慰。';
  }

  // 无 Key：本地兜底，从 responses 里挑，保证有反应
  if (!key) {
    const pool = config.responses && config.responses.length ? config.responses : ['汪~'];
    const pick = pool[Math.floor(Math.random() * pool.length)];
    return { text: pick, source: 'local-fallback' };
  }

  // 有 Key：调用 Anthropic Messages API（主进程内，密钥不外泄）
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: (config.ai && config.ai.model) || 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        system,
        messages: [{ role: 'user', content: userText }]
      })
    });
    if (!resp.ok) {
      const errText = await resp.text();
      console.error('AI API 错误:', resp.status, errText);
      return { text: '（我有点走神了…再说一遍？）', source: 'api-error' };
    }
    const data = await resp.json();
    const text =
      (data.content && data.content[0] && data.content[0].text) || '汪~';
    return { text, source: 'api' };
  } catch (e) {
    console.error('AI 调用异常:', e);
    return { text: '（网络好像不太好…）', source: 'exception' };
  }
});

// ---------------------------------------------------------------------------
// 启动
// ---------------------------------------------------------------------------
app.whenReady().then(() => {
  initPaths();
  config = loadConfig();
  createPetWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createPetWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
