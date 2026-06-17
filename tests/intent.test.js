'use strict';

// 意图路由单测：node tests/intent.test.js
const assert = require('assert');
const { routeIntent } = require('../intent');

const cases = [
  ['有什么待办', 'list_todos', null],
  ['看一下我的待办', 'list_todos', null],
  ['我的任务有哪些', 'list_todos', null],
  ['记一下：买牛奶', 'add_todo', '买牛奶'],
  ['帮我记 下午三点开会', 'add_todo', '下午三点开会'],
  ['提醒我交周报', 'add_todo', '交周报'],
  ['加个待办 写PRD', 'add_todo', '写PRD'],
  ['完成待办 买牛奶', 'complete_todo', '买牛奶'],
  ['搞定任务 写PRD', 'complete_todo', '写PRD'],
  ['今天专注了多久', 'get_stats', null],
  ['我做了多少个番茄钟', 'get_stats', null],
  ['你今天好可爱', null, null],
  ['在吗', null, null]
];

let pass = 0;
for (const [text, tool, argText] of cases) {
  const r = routeIntent(text);
  assert.strictEqual(r.tool, tool, `「${text}」应路由到 ${tool}，实际 ${r.tool}`);
  if (argText !== null) {
    assert.strictEqual(r.args.text, argText, `「${text}」待办正文应为 "${argText}"，实际 "${r.args.text}"`);
  }
  pass++;
}
console.log(`intent.test: ${pass}/${cases.length} passed`);
