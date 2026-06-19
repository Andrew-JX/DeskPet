# Troubleshooting

**Status:** living document — owned by bug-fixer.

Purpose: debugging lessons and repeated pitfalls, so the same mistake is not made twice.
Add an entry whenever a non-obvious bug is fixed.

| Symptom | Root cause | Fix | Verified |
| --- | --- | --- | --- |
| 桌宠定格单帧仍一抽/精灵图源设网格后切帧入口消失 | 用 frames 数组长度判断「源 vs 已切帧」不可靠 | 给切出的帧打 frameIndex/derived 标记来区分 | - |
| 改动后桌面或配置异常、像是没生效 | timeout 杀 electron 不彻底，残留多个实例读到旧 config | taskkill /F /IM electron.exe 后再 npm start；必要时删 assets/config.json 重来 | - |
| 素材库橙色裁剪框四条边拖不动 | 可见边框设了 pointer-events:none，真正抓取条只有 8px 且压在图片边界、被 overflow:hidden 裁掉 | 去掉 overflow:hidden；抓取条加粗到 12px 贴框内侧并加半透明橙色背景，可见可抓 | - |
| 切换素材/触发互动时画面闪一下（出现旧豆豆或空白） | playMaterial 切换时先把 processedCanvas 置空再异步加载新图，中间一帧无图；且示例豆豆的互动/点击事件绑在豆豆帧上 | 改为新图加载好再替换、加 loadToken 防竞态，保持旧画面无缝；移除自动播种示例宠物 | - |
| 桌宠只能在主屏范围内拖，到不了第二个显示器 | move-pet 把位置夹在 getPrimaryDisplay().workAreaSize 的 0..宽高 内 | 改夹在 getAllDisplays() 所有屏幕 bounds 的并集范围内，支持跨屏 | - |
