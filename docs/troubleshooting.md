# Troubleshooting

**Status:** living document — owned by bug-fixer.

Purpose: debugging lessons and repeated pitfalls, so the same mistake is not made twice.
Add an entry whenever a non-obvious bug is fixed.

| Symptom | Root cause | Fix | Verified |
| --- | --- | --- | --- |
| 桌宠定格单帧仍一抽/精灵图源设网格后切帧入口消失 | 用 frames 数组长度判断「源 vs 已切帧」不可靠 | 给切出的帧打 frameIndex/derived 标记来区分 | - |
| 改动后桌面或配置异常、像是没生效 | timeout 杀 electron 不彻底，残留多个实例读到旧 config | taskkill /F /IM electron.exe 后再 npm start；必要时删 assets/config.json 重来 | - |
