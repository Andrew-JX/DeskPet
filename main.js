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
    assets: [], // { id, name, type, path, cols, rows, frameCount, stateMap }
    petSize: 180,
    petName: '豆豆',
    // 宠物人设：注入到 AI 对话的 system prompt，决定它说话的语气。
    persona:
      '你是用户养的一只桌面宠物狗，名叫豆豆。你温暖、简短、口语化，像真实宠物一样陪伴主人工作。' +
      '你不会假装自己是人类，也不会编造主人没说过的事。回答尽量一两句话。',
    // 纪念模式：用于已离世的宠物。开启后语气更轻柔克制，且明确「陪伴而非复活」。
    memorialMode: false,
    // 互动按钮：每个按钮绑定一个动作（action 对应素材里的某些帧）
    buttons: [
      { label: '摸摸头', action: 'pet' },
      { label: '聊一会儿', action: 'chat' },
      { label: '休息一下', action: 'rest' }
    ],
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

// 动作的可编辑键（与按钮 action 对应）
const ACTION_KEYS = ['idle', 'pet', 'chat', 'rest', 'sleep'];

// 新素材的默认动作映射：每个动作定格在一个单帧（静止，避免不连贯帧轮播导致“一抽一抽”）。
// fps=0 表示不循环，只显示 frames[0]。
function defaultActions(frameCount) {
  const last = Math.max(0, (frameCount || 1) - 1);
  const at = (i) => [Math.min(i, last)];
  return {
    idle:  { frames: at(0), fps: 0 },
    pet:   { frames: at(1), fps: 0 },
    chat:  { frames: at(2), fps: 0 },
    rest:  { frames: at(3), fps: 0 },
    sleep: { frames: [last], fps: 0 }
  };
}

// 兼容旧数据：保证每个图片素材都有 actions；buttons 统一成 {label,action}
function normalizeConfig(cfg) {
  (cfg.assets || []).forEach((a) => {
    if (a.type === 'image' && !a.actions) {
      // 若有旧的 stateMap，用每段首帧迁移；否则用默认
      if (a.stateMap) {
        const f = (k, d) => ({ frames: [(a.stateMap[k] || [d])[0]], fps: 0 });
        a.actions = { idle: f('idle', 0), pet: f('happy', 1), chat: f('happy', 2), rest: f('idle', 3), sleep: f('sleep', (a.frameCount || 1) - 1) };
      } else {
        a.actions = defaultActions(a.frameCount);
      }
    }
  });
  const labelToAction = (label) =>
    /聊|chat|说话/i.test(label) ? 'chat'
    : /休息|睡|rest|sleep/i.test(label) ? 'rest'
    : 'pet';
  cfg.buttons = (cfg.buttons || []).map((b) =>
    typeof b === 'string' ? { label: b, action: labelToAction(b) } : b
  );
  return cfg;
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
      : ext === 'mp4' ? 'video/mp4'
      : ext === 'webm' ? 'video/webm'
      : ext === 'mov' ? 'video/quicktime'
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
    // 动作 → 帧映射：默认每个动作定格单帧（静止），可在后台可视化绑定
    actions: defaultActions(20)
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
