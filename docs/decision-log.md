# Decision Log

**Status:** living document — every skill appends here.

Purpose: record meaningful decisions (what the MVP includes/excludes and why) so the
reasoning is not lost. Append newest at the bottom.

| Date | Decision | Why | Owner |
| --- | --- | --- | --- |
| 2026-06-17 | MVP scope set from PRD interview | ①丢图换皮（绿幕抠图+精灵图状态机）；②AI对话+番茄钟/久坐提醒；③后台素材与人设管理。 | prd-generator |
| 2026-06-17 | 素材模型定为「宠物=待机素材+自定义互动，每个互动各带一段素材，统一从素材库挑选」 | 视频无法在一张图里切帧；该模型统一图片/视频，且让用户自定义互动并复用素材 | you |
| 2026-06-17 | 精灵图切帧交互改为拖拽边框圈选 + 列行均分 | 机械均分会把带留白/不规则的精灵图切坏（狗被切两半）；拖框所见即所裁 | you |
| 2026-06-17 | 移除应用内「图生视频提示词」生成器 | 用户判断没必要，保持界面聚焦 | you |
| 2026-06-17 | 迭代记录写入 docs/（ai-pm-dev 操作层）而非另建 CHANGELOG | 遵循项目操作层，保持单一记录源 | you |
| 2026-06-17 | 点击宠物弹出菜单（互动+小工具），手动拖动区分点击/拖拽；番茄钟改为用户主动开启并在宠物角上显示倒计时 | 用户要点击才有反应而非悬停；单纯拖动时不该弹任何东西；小工具应收进点击菜单并能看到状态 | you |
