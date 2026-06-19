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

## Not done / next
- GUI 端到端真机验证（素材库、拖拽切帧、旧配置迁移）——目前都没在真窗口点过
- 不规则精灵图：逐帧自由框选（当前框内为均匀划分）
- A4 提交件随新模型同步更新；确认后再发新 Release 安装包

## Tests run
- 2026-06-17 — 每次改动做了：`node --check` 主进程 + vm 编译校验两个渲染层脚本 + 应用启动冒烟（生成 config.json 视为稳定）+ `npm test`（意图路由单测 13/13）
- 2026-06-17 — 未做 GUI 端到端，是当前最大验证缺口
- 2026-06-19 — 开箱即用：首启自动播种示例宠物（豆豆，含待机/开心/睡觉帧+摸摸头/睡觉互动+点击反应）；生命感：久未互动偶尔碎碎念；打磨：右键开后台、开场提示。安装包已带示例图。
