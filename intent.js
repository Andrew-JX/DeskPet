'use strict';

// 规则意图路由（纯函数，不依赖 electron / 全局状态，便于单测）。
// 返回 { tool, args }；tool 为 null 表示闲聊，不触发任何工具。
// 设计：工具由规则触发而非模型决定，避免 AI 幻觉误触发用户数据操作。
function routeIntent(text) {
  const t = (text || '').trim();

  // 查看待办（必须是明确的“列出”意图，避免 bare “待办” 误命中）
  if (/(有(什么|哪些)?待办|待办列表|待办有哪些|看.*待办|todo\s*list|我的任务)/i.test(t)) {
    return { tool: 'list_todos', args: {} };
  }

  // 完成待办（需同时出现“完成类动词”和“待办/任务/todo”）
  if (/(完成|做完|搞定|划掉)/.test(t) && /待办|任务|todo/i.test(t)) {
    const m = t.match(/(完成|做完|搞定|划掉)\s*[:：]?\s*(.+)/);
    return { tool: 'complete_todo', args: { text: m ? m[2].replace(/待办|任务/g, '').trim() : '' } };
  }

  // 新增待办
  if (/(记一?下|记一笔|加(个|条)?待办|提醒我|帮我记|新增待办|添加待办|todo|待办)/i.test(t)) {
    let body = t
      .replace(/.*?(记一?下|记一笔|加(个|条)?待办|提醒我|帮我记|添加待办|新增待办)\s*[:：]?\s*/, '')
      .replace(/^(一下|个|条)\s*/, '')
      .trim();
    if (!body) body = t;
    return { tool: 'add_todo', args: { text: body } };
  }

  // 查看陪伴数据
  if (/(专注|陪.*(多久|多长)|今天.*(数据|统计|多久)|多少个?番茄|坐了多久|工作.*多久)/.test(t)) {
    return { tool: 'get_stats', args: {} };
  }

  return { tool: null, args: {} };
}

module.exports = { routeIntent };
