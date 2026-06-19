'use strict';

const { app, BrowserWindow, ipcMain, dialog, screen } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { routeIntent } = require('./intent');

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
    // 素材库：可复用的素材描述符（整图 / 视频 / 从精灵图切出的单帧）
    // { id, name, type:'image'|'video', file, cols, rows, frames, fps }
    library: [],
    // 每个宠物：{ id,name, type,file,cols,rows,frames,fps（待机素材描述符）,
    //   interactions:[ {id,label, type,file,cols,rows,frames,fps} ] }
    // 待机与互动的素材描述符都从素材库挑选后拷贝过来。
    assets: [],
    petSize: 180,
    petName: '豆豆',
    // 宠物人设：注入到 AI 对话的 system prompt，决定它说话的语气。
    persona:
      '你是用户养的一只桌面宠物狗，名叫豆豆。你温暖、简短、口语化，像真实宠物一样陪伴主人工作。' +
      '你不会假装自己是人类，也不会编造主人没说过的事。回答尽量一两句话。',
    // 纪念模式：用于已离世的宠物。开启后语气更轻柔克制，且明确「陪伴而非复活」。
    memorialMode: false,
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
    },
    // —— 确定性数据（由主进程计算，不交给 AI）——
    stats: { date: '', focusMinutes: 0, pomodorosDone: 0, interactions: 0 },
    todos: [], // { id, text, done, createdAt }
    // 工具调用审计日志（可信内核的「可追溯」）
    trace: [] // { ts, tool, args, status, source }
  };
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 一段「素材」的播放字段默认值（图片/视频通用）。
// 图片：cols×rows 网格，frames 指定播哪些格，fps>0 且多帧才循环；单帧/视频忽略这些。
function withMediaDefaults(m) {
  if (m.cols == null) m.cols = 1;
  if (m.rows == null) m.rows = 1;
  if (!Array.isArray(m.frames)) m.frames = [0];
  if (m.fps == null) m.fps = 0;
  return m;
}

let interactionSeq = 0;
function newInteraction(label) {
  return withMediaDefaults({ id: 'it_' + Date.now() + '_' + (interactionSeq++), label: label || '互动', type: null, file: null });
}

// 兼容旧数据：补上 library / interactions / 播放字段；清理旧的 actions/stateMap/buttons
function normalizeConfig(cfg) {
  if (!Array.isArray(cfg.library)) cfg.library = [];
  cfg.library.forEach((m) => withMediaDefaults(m));
  (cfg.assets || []).forEach((a) => {
    withMediaDefaults(a);
    if (!Array.isArray(a.interactions)) a.interactions = [];
    a.interactions.forEach((it) => withMediaDefaults(it));
    if (!a.events || typeof a.events !== 'object') a.events = {}; // 系统动作素材：click/chat/pomodoro/sit
    delete a.actions; delete a.stateMap; delete a.frameCount; delete a.animated; delete a.path;
  });
  delete cfg.buttons;
  return cfg;
}

// 一个素材文件是否仍被库或任何宠物/互动引用（决定删库项时要不要删文件）
function fileStillReferenced(file, exceptLibId) {
  if (!file) return false;
  for (const m of (config.library || [])) { if (m.id !== exceptLibId && m.file === file) return true; }
  for (const a of (config.assets || [])) {
    if (a.file === file) return true;
    for (const it of (a.interactions || [])) { if (it.file === file) return true; }
  }
  return false;
}

// 从描述符里只取播放相关字段（赋给待机/互动时用）
function mediaDescriptor(m) {
  return { type: m.type, file: m.file, cols: m.cols, rows: m.rows, frames: m.frames, fps: m.fps };
}

// 跨天则重置当日统计（专注时长/番茄钟/互动按天计）
function rolloverDaily(cfg) {
  const today = todayStr();
  if (!cfg.stats || cfg.stats.date !== today) {
    cfg.stats = { date: today, focusMinutes: 0, pomodorosDone: 0, interactions: 0 };
  }
  return cfg;
}

function loadConfig() {
  ensureDirs();
  if (!fs.existsSync(CONFIG_PATH)) {
    const cfg = rolloverDaily(defaultConfig());
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
    return cfg;
  }
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    // 合并默认值，保证新增字段不丢
    return normalizeConfig(rolloverDaily(Object.assign(defaultConfig(), JSON.parse(raw))));
  } catch (e) {
    console.error('config 解析失败，使用默认配置:', e);
    return rolloverDaily(defaultConfig());
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

// ===========================================================================
// 可信工具调用内核
// 设计原则（沿用 FitMind 方法论）：
//   1. 意图由「规则路由」决定，不依赖模型不乱来 —— 工具不会被幻觉触发；
//   2. 模型只负责把结果包装成自然语言（有 Key 时），无 Key 用模板兜底；
//   3. 读操作直接执行；写操作必须用户确认后才执行；
//   4. 每一步写进 trace 审计日志，可追溯。
// ===========================================================================

const MAX_TRACE = 50;
let convoHistory = []; // 最近若干轮对话，给模型上下文用

function logTrace(entry) {
  config.trace = config.trace || [];
  config.trace.unshift(Object.assign({ ts: Date.now() }, entry));
  if (config.trace.length > MAX_TRACE) config.trace.length = MAX_TRACE;
  saveConfig(config);
  broadcastConfig();
}

// 工具白名单。risk: 'read' 可直接执行；'write' 需确认。
const TOOLS = {
  get_stats: {
    risk: 'read',
    desc: '查看今天的专注时长、番茄钟数、互动次数',
    run: () => ({
      focusMinutes: config.stats.focusMinutes,
      pomodorosDone: config.stats.pomodorosDone,
      interactions: config.stats.interactions
    })
  },
  list_todos: {
    risk: 'read',
    desc: '列出还没完成的待办',
    run: () => (config.todos || []).filter((t) => !t.done).map((t) => t.text)
  },
  add_todo: {
    risk: 'write',
    desc: '新增一条待办',
    run: (args) => {
      const text = (args && args.text || '').trim();
      if (!text) return { ok: false, reason: '没有内容' };
      const todo = { id: 't_' + Date.now(), text, done: false, createdAt: Date.now() };
      config.todos = config.todos || [];
      config.todos.push(todo);
      return { ok: true, text };
    }
  },
  complete_todo: {
    risk: 'write',
    desc: '把某条待办标记为完成',
    run: (args) => {
      const kw = (args && args.text || '').trim();
      const todo = (config.todos || []).find((t) => !t.done && t.text.includes(kw));
      if (!todo) return { ok: false, reason: '没找到匹配的待办' };
      todo.done = true;
      return { ok: true, text: todo.text };
    }
  }
};

// 把工具结果转成自然语言（无 Key 时的模板兜底）
function templateForResult(tool, result, args) {
  switch (tool) {
    case 'get_stats':
      return `今天你已经专注了约 ${result.focusMinutes} 分钟，完成了 ${result.pomodorosDone} 个番茄钟，我们互动了 ${result.interactions} 次~`;
    case 'list_todos':
      return result.length ? `还有这些待办没完成：\n· ${result.join('\n· ')}` : '太棒了，待办都清空啦！';
    case 'add_todo':
      return result.ok ? `好的，记下啦：「${result.text}」` : `没记成：${result.reason}`;
    case 'complete_todo':
      return result.ok ? `「${result.text}」完成，给你点个赞！` : `没找到：${result.reason}`;
    default:
      return '汪~';
  }
}

let pendingProposals = {}; // id -> { tool, args }

// 用模型把"工具结果/闲聊"包装成符合人设的一句话；失败/无 Key 返回 null
async function modelWrap(userText, contextNote) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  let system = config.persona || '你是一只陪伴用户的桌面宠物，简短温暖。';
  if (config.memorialMode) {
    system += '\n\n【纪念模式】你是带着已离开宠物形象的温柔陪伴者，不冒充本体、不消费悲伤。';
  }
  if (contextNote) system += `\n\n【可用事实，只能基于它回答，不要编造】${contextNote}`;
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: (config.ai && config.ai.model) || 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        system,
        messages: [...convoHistory.slice(-6), { role: 'user', content: userText }]
      })
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return (data.content && data.content[0] && data.content[0].text) || null;
  } catch (e) {
    console.error('modelWrap 异常:', e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// 窗口
// ---------------------------------------------------------------------------
function createPetWindow() {
  // 窗口覆盖「所有显示器的并集」并固定不动——宠物在窗口内用 CSS 移动，
  // 从根上避免移动 OS 窗口带来的边界/DPI/漂移问题，且可跨屏到任意位置。
  const u = unionBounds();
  const bounds = { x: u.minX, y: u.minY, width: u.maxX - u.minX, height: u.maxY - u.minY };

  petWindow = new BrowserWindow({
    ...bounds,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
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
  petWindow.setBounds(bounds);
  petWindow.loadFile('pet.html');
  // 默认鼠标穿透（forward 让窗口仍能收到移动事件，用于检测指针进入宠物）
  petWindow.webContents.once('did-finish-load', () => {
    if (petWindow && !petWindow.isDestroyed()) petWindow.setIgnoreMouseEvents(true, { forward: true });
  });

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
function mimeOf(file) {
  const ext = path.extname(file).toLowerCase().replace('.', '');
  return ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
    : ext === 'webp' ? 'image/webp'
    : ext === 'gif' ? 'image/gif'
    : ext === 'mp4' ? 'video/mp4'
    : ext === 'webm' ? 'video/webm'
    : ext === 'mov' ? 'video/quicktime'
    : 'image/png';
}

// 按文件名读成 data URL（同源，避免污染 canvas）。idle 素材与各互动素材都走这里。
function readMediaFile(file) {
  if (!file) return null;
  try {
    const buf = fs.readFileSync(path.join(USER_MEDIA_DIR, file));
    return `data:${mimeOf(file)};base64,${buf.toString('base64')}`;
  } catch (e) {
    console.error('读取素材失败:', file, e);
    return null;
  }
}

ipcMain.handle('read-media', (_e, file) => readMediaFile(file));

ipcMain.handle('read-asset-data', (_e, id) => {
  const asset = (config.assets || []).find((a) => a.id === id);
  return asset ? readMediaFile(asset.file) : null;
});

// 弹文件框选一个素材文件，复制进 user-media，返回 { type, file } 或 null
async function pickAndCopyMedia(title) {
  const result = await dialog.showOpenDialog(panelWindow, {
    title: title || '选择图片 / 视频素材',
    properties: ['openFile'],
    filters: [{ name: '宠物素材', extensions: ['png', 'webp', 'gif', 'jpg', 'jpeg', 'mp4', 'webm', 'mov'] }]
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const src = result.filePaths[0];
  const ext = path.extname(src).toLowerCase();
  const destName = 'm_' + Date.now() + ext;
  fs.copyFileSync(src, path.join(USER_MEDIA_DIR, destName));
  const isVideo = ['.mp4', '.webm', '.mov'].includes(ext);
  return { type: isVideo ? 'video' : 'image', file: destName, name: path.basename(src) };
}

function removeMediaFile(file) {
  try { if (file && fs.existsSync(path.join(USER_MEDIA_DIR, file))) fs.unlinkSync(path.join(USER_MEDIA_DIR, file)); }
  catch (e) { console.warn('删除素材文件失败:', e); }
}

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
  config.petSize = size;          // 窗口覆盖全屏不变，大小只影响 CSS 里宠物本体
  saveConfig(config);
  broadcastConfig();
  return config;
});

// ---------------------------------------------------------------------------
// IPC：宠物（asset）与互动（interaction）管理
// 一个宠物 = 待机素材 + 若干自定义互动，每个互动各带素材。
// ---------------------------------------------------------------------------
const findAsset = (id) => (config.assets || []).find((a) => a.id === id);

// 新增宠物：创建一个空宠物（待机素材稍后从素材库挑），切为当前
ipcMain.handle('add-pet', () => {
  const asset = withMediaDefaults({
    id: 'a_' + Date.now(),
    name: '新宠物',
    type: null,
    file: null,
    interactions: [],
    events: {}
  });
  config.assets.push(asset);
  config.currentAssetId = asset.id;
  saveConfig(config);
  broadcastConfig();
  return publicConfig();
});

// 删除宠物：素材文件归素材库共有，这里不删文件
ipcMain.handle('delete-pet', (_e, id) => {
  const idx = config.assets.findIndex((a) => a.id === id);
  if (idx === -1) return publicConfig();
  config.assets.splice(idx, 1);
  if (config.currentAssetId === id) {
    config.currentAssetId = config.assets.length ? config.assets[0].id : null;
  }
  saveConfig(config);
  broadcastConfig();
  return publicConfig();
});

ipcMain.handle('set-current-asset', (_e, id) => {
  config.currentAssetId = id;
  saveConfig(config);
  broadcastConfig();
  return publicConfig();
});

ipcMain.handle('rename-pet', (_e, id, name) => {
  const a = findAsset(id);
  if (a) { a.name = name; saveConfig(config); broadcastConfig(); }
  return publicConfig();
});

// 设置宠物「待机」素材（从素材库挑一个描述符拷过来）
ipcMain.handle('set-pet-idle', (_e, id, descriptor) => {
  const a = findAsset(id);
  if (a) { Object.assign(a, withMediaDefaults(Object.assign({}, descriptor))); saveConfig(config); broadcastConfig(); }
  return publicConfig();
});

// ---- 互动 ----
ipcMain.handle('add-interaction', (_e, assetId, label) => {
  const a = findAsset(assetId);
  if (a) { a.interactions = a.interactions || []; a.interactions.push(newInteraction(label)); saveConfig(config); broadcastConfig(); }
  return publicConfig();
});

// 删除互动：素材文件归素材库共有，不删文件
ipcMain.handle('delete-interaction', (_e, assetId, interId) => {
  const a = findAsset(assetId);
  if (a) {
    const i = (a.interactions || []).findIndex((it) => it.id === interId);
    if (i !== -1) { a.interactions.splice(i, 1); saveConfig(config); broadcastConfig(); }
  }
  return publicConfig();
});

ipcMain.handle('rename-interaction', (_e, assetId, interId, label) => {
  const a = findAsset(assetId);
  const it = a && (a.interactions || []).find((x) => x.id === interId);
  if (it) { it.label = label; saveConfig(config); broadcastConfig(); }
  return publicConfig();
});

// 绑定系统动作（点击/聊天/番茄钟/久坐）的素材；传空则清除
ipcMain.handle('set-event-material', (_e, assetId, key, descriptor) => {
  const a = findAsset(assetId);
  if (a) {
    a.events = a.events || {};
    if (descriptor && descriptor.file) a.events[key] = withMediaDefaults(Object.assign({}, descriptor));
    else delete a.events[key];
    saveConfig(config); broadcastConfig();
  }
  return publicConfig();
});

// 设置某个互动的素材（从素材库挑一个描述符拷过来）
ipcMain.handle('set-interaction-material', (_e, assetId, interId, descriptor) => {
  const a = findAsset(assetId);
  const it = a && (a.interactions || []).find((x) => x.id === interId);
  if (it) {
    const keepLabel = it.label, keepId = it.id;
    Object.assign(it, withMediaDefaults(Object.assign({}, descriptor)), { label: keepLabel, id: keepId });
    saveConfig(config); broadcastConfig();
  }
  return publicConfig();
});

// ---------------------------------------------------------------------------
// IPC：素材库（library）—— 可复用素材，含从精灵图切出的单帧
// ---------------------------------------------------------------------------
const findLib = (id) => (config.library || []).find((m) => m.id === id);

// 上传一个素材到库（整图 / 视频）
ipcMain.handle('add-library-media', async () => {
  const media = await pickAndCopyMedia('上传素材到库（图片或视频）');
  if (!media) return publicConfig();
  config.library = config.library || [];
  config.library.push(withMediaDefaults({
    id: 'lib_' + Date.now(), name: media.name, type: media.type, file: media.file
  }));
  saveConfig(config);
  broadcastConfig();
  return publicConfig();
});

// 改库项的名字/网格（用于把图标成精灵图）
ipcMain.handle('update-library-media', (_e, libId, partial) => {
  const m = findLib(libId);
  if (m) { Object.assign(m, partial); saveConfig(config); broadcastConfig(); }
  return publicConfig();
});

// 从一张精灵图库项里切出某一格，作为新的单帧素材加入库
ipcMain.handle('slice-library-frame', (_e, libId, index) => {
  const m = findLib(libId);
  if (m && m.type === 'image') {
    config.library.push(withMediaDefaults({
      id: 'lib_' + Date.now() + '_' + index,
      name: `${m.name} #${index}`,
      type: 'image', file: m.file,
      cols: m.cols, rows: m.rows, frames: [index], fps: 0,
      frameIndex: index // 标记：这是从精灵图切出的单帧（与“精灵图源”区分）
    }));
    saveConfig(config);
    broadcastConfig();
  }
  return publicConfig();
});

// 渲染层把某一格裁好（已抠绿幕、透明）的 PNG dataURL 发来，存为独立素材
ipcMain.handle('save-cropped-frame', (_e, name, dataUrl) => {
  const mm = /^data:image\/png;base64,(.+)$/.exec(dataUrl || '');
  if (!mm) return publicConfig();
  const file = 'm_' + Date.now() + '.png';
  try { fs.writeFileSync(path.join(USER_MEDIA_DIR, file), Buffer.from(mm[1], 'base64')); }
  catch (e) { console.error('保存裁剪帧失败:', e); return publicConfig(); }
  config.library = config.library || [];
  config.library.push(withMediaDefaults({
    id: 'lib_' + Date.now(), name: name || '帧', type: 'image', file, derived: true
  }));
  saveConfig(config);
  broadcastConfig();
  return publicConfig();
});

ipcMain.handle('delete-library-media', (_e, libId) => {
  const idx = (config.library || []).findIndex((m) => m.id === libId);
  if (idx !== -1) {
    const m = config.library[idx];
    config.library.splice(idx, 1);
    if (!fileStillReferenced(m.file, libId)) removeMediaFile(m.file);
    saveConfig(config);
    broadcastConfig();
  }
  return publicConfig();
});

// ---------------------------------------------------------------------------
// IPC：移动宠物窗口（渲染层走路时调用）
// ---------------------------------------------------------------------------
// 所有显示器并集范围（夹边界用，支持多屏又不拖丢）
function unionBounds() {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const d of screen.getAllDisplays()) {
    const b = d.bounds;
    minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width); maxY = Math.max(maxY, b.y + b.height);
  }
  return { minX, minY, maxX, maxY };
}

// 窗口覆盖整个虚拟桌面、固定不动；宠物在窗口内用 CSS 定位移动。
// 渲染层据此把宠物初始放到主屏右下角（坐标相对窗口左上角，即并集原点）。
ipcMain.handle('get-layout', () => {
  const u = unionBounds();
  const p = screen.getPrimaryDisplay().workArea; // 主屏工作区（屏幕坐标）
  return {
    width: u.maxX - u.minX,
    height: u.maxY - u.minY,
    primary: { x: p.x - u.minX, y: p.y - u.minY, w: p.width, h: p.height }
  };
});

// 鼠标穿透：true=点得到桌面（穿透），false=接管点击。指针在宠物/菜单上才接管。
ipcMain.handle('set-ignore-mouse', (_e, ignore) => {
  if (petWindow && !petWindow.isDestroyed()) petWindow.setIgnoreMouseEvents(!!ignore, { forward: true });
});

// ---------------------------------------------------------------------------
// IPC：AI 对话（意图路由 → 工具调用 → 模型/模板包装）
// 安全设计：API Key 只在主进程；写操作必须用户确认；每步进 trace。
// ---------------------------------------------------------------------------
ipcMain.handle('ai-chat', async (_e, userText) => {
  const route = routeIntent(userText);
  convoHistory.push({ role: 'user', content: userText });

  // 闲聊：不触发任何工具
  if (!route.tool) {
    let text = await modelWrap(userText, null);
    if (!text) {
      const pool = config.responses && config.responses.length ? config.responses : ['汪~'];
      text = pool[Math.floor(Math.random() * pool.length)];
    }
    convoHistory.push({ role: 'assistant', content: text });
    logTrace({ tool: 'chat', args: {}, status: 'replied', source: process.env.ANTHROPIC_API_KEY ? 'model' : 'fallback' });
    return { text, source: 'chat' };
  }

  const tool = TOOLS[route.tool];

  // 写操作：不执行，返回待确认提案
  if (tool.risk === 'write') {
    const id = 'p_' + Date.now();
    pendingProposals[id] = { tool: route.tool, args: route.args };
    logTrace({ tool: route.tool, args: route.args, status: 'proposed', source: 'router' });
    const preview =
      route.tool === 'add_todo' ? `要我帮你记下「${route.args.text}」吗？`
      : route.tool === 'complete_todo' ? `把「${route.args.text}」标记为完成？`
      : `要执行 ${tool.desc} 吗？`;
    return { text: preview, proposal: { id, tool: route.tool, desc: tool.desc }, source: 'proposal' };
  }

  // 读操作：直接执行，结果作为唯一事实交给模型包装（无 Key 用模板）
  const result = tool.run(route.args);
  logTrace({ tool: route.tool, args: route.args, status: 'executed', source: 'router' });
  const factNote = `${tool.desc} 的结果：${JSON.stringify(result)}`;
  let text = await modelWrap(userText, factNote);
  if (!text) text = templateForResult(route.tool, result, route.args);
  convoHistory.push({ role: 'assistant', content: text });
  return { text, source: 'tool-read' };
});

// 确认 / 取消一个写操作提案
ipcMain.handle('confirm-tool', async (_e, id, ok) => {
  const p = pendingProposals[id];
  if (!p) return { text: '（这个操作已经过期啦）', source: 'expired' };
  delete pendingProposals[id];
  if (!ok) {
    logTrace({ tool: p.tool, args: p.args, status: 'denied', source: 'user' });
    return { text: '好的，那就不记啦~', source: 'denied' };
  }
  const result = TOOLS[p.tool].run(p.args);
  logTrace({ tool: p.tool, args: p.args, status: result && result.ok === false ? 'failed' : 'executed', source: 'user' });
  return { text: templateForResult(p.tool, result, p.args), source: 'tool-write' };
});

// 统计事件：互动 / 番茄钟完成
ipcMain.handle('stat-event', (_e, kind) => {
  rolloverDaily(config);
  if (kind === 'interaction') config.stats.interactions++;
  else if (kind === 'pomodoro') config.stats.pomodorosDone++;
  saveConfig(config);
  broadcastConfig();
  return config.stats;
});

// 待办勾选 / 清空 trace（后台面板用）
ipcMain.handle('toggle-todo', (_e, id) => {
  const t = (config.todos || []).find((x) => x.id === id);
  if (t) { t.done = !t.done; saveConfig(config); broadcastConfig(); }
  return publicConfig();
});
ipcMain.handle('clear-trace', () => {
  config.trace = [];
  saveConfig(config);
  broadcastConfig();
  return publicConfig();
});

// ---------------------------------------------------------------------------
// 启动
// ---------------------------------------------------------------------------
app.whenReady().then(() => {
  initPaths();
  config = loadConfig();
  createPetWindow();

  // 陪伴时长：应用运行期间每分钟 +1（确定性，不由 AI 估算）
  setInterval(() => {
    rolloverDaily(config);
    config.stats.focusMinutes++;
    saveConfig(config);
    broadcastConfig();
  }, 60000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createPetWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
