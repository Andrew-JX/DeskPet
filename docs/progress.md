# Progress

**Status:** living document — owned by dev-builder.

Purpose: running record of what is done, not done, and what was tested. Update after each
build task.

## Done
- v0.1 透明无框置顶桌宠 + 绿幕抠图 + 拖动 + 后台素材管理 + 纪念模式
- v0.2 可信工具调用内核（规则意图路由 + 写操作确认 + 审计 trace + 确定性陪伴数据 + 意图路由单测）
- v0.4 视频模式（绿底循环视频逐帧实时抠绿幕播放）
- v0.5 宠物 + 自定义互动模型（每互动一段素材，触发即播、数秒回待机，多宠物切换）
- v0.6 素材库（上传/切帧复用，待机与互动从库挑选）；移除应用内图生视频提示词
- v0.7 切帧改为拖拽边框圈选；清理界面开发腔文案
- 上线：GitHub 公开仓库 + GitHub Actions 推 `v*` 标签自动出 Windows 安装包（v0.1.0 已发 Release）
- A4 提交件已按作业 5 项要求重写为提交级版本，并接入抖音/小红书观察、竞品观察、一手访谈、MVP、商业判断和两周验证计划
- 提交前致命打包问题已修：安装包现在包含 `intent.js` 和 `samples/`；Release workflow 在打包前跑 `npm test`；Windows 打包关闭不必要的可执行文件签名编辑
- AI 聊天升级：后台可填/清除自己的模型 API Key，支持 OpenAI 兼容接口与 Anthropic；可设置 Base URL 和模型名；支持本地最近对话记忆、长期记忆 notes、清空最近对话记忆；公开配置会隐藏 Key 明文
- 版本升至 0.13.0；README 已重写为完整 GitHub 项目页；A4 提交件已重写为更聚焦的一页机会验证版本

## Not done / next
- GUI 端到端真机验证（素材库、拖拽切帧、旧配置迁移）——目前都没在真窗口点过
- 不规则精灵图：逐帧自由框选（当前框内为均匀划分）
- A4 若转 PDF/图片提交，还需排版确认是否严格落在一页内；确认后再发新 Release 安装包
- 真实模型 API Key 联网对话未在本机实测，提交演示前建议用自己的 Key 做 2 轮聊天验证

## Tests run
- 2026-06-17 — 每次改动做了：`node --check` 主进程 + vm 编译校验两个渲染层脚本 + 应用启动冒烟（生成 config.json 视为稳定）+ `npm test`（意图路由单测 13/13）
- 2026-06-17 — 未做 GUI 端到端，是当前最大验证缺口
- 2026-06-19 — 开箱即用：首启自动播种示例宠物（豆豆，含待机/开心/睡觉帧+摸摸头/睡觉互动+点击反应）；生命感：久未互动偶尔碎碎念；打磨：右键开后台、开场提示。安装包已带示例图。
- 2026-06-19 — A4 文案收口检查：确认覆盖机会判断、用户证据、MVP 样例、商业判断、两周验证计划；未运行代码测试（本次只改文档）。
- 2026-06-19 — 提交前风险修复验证：`npm test` 13/13；`node --check main.js`、`node --check preload.js` 通过；`npm run pack` 成功；`npx asar list dist\win-unpacked\resources\app.asar` 确认包含 `intent.js` 与 `samples/sample-dog-greenscreen.png`；打包后的 `DeskPet.exe` 启动 5 秒仍存活。
- 2026-06-19 — AI Key/记忆功能验证：`npm test` 13/13；`node --check main.js`、`node --check preload.js` 通过；`panel.html` 与 `pet.html` 内联脚本 vm 编译通过；`npm run pack` 成功；打包后的 `DeskPet.exe` 启动 5 秒仍存活。未用真实 Key 调模型接口。
- 2026-06-19 — README/A4/版本收尾验证：`npm test` 13/13；`node --check main.js`、`node --check preload.js` 通过；`panel.html` 与 `pet.html` 内联脚本 vm 编译通过；`npm run pack` 成功；A4 当前约 2036 字符、28 行。
- 2026-06-19 — A4 再压缩：保留 5 项评分结构与 MVP/商业/验证信息，正文降至约 1836 字符、28 行，更适合一页 A4 排版。
