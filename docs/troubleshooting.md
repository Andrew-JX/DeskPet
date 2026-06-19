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
| 桌宠只能在下半屏拖、往上拖不动、往下会拖到消失 | 用普通 mouse 事件拖动，窗口跟随移动时鼠标一旦移出窗口范围就收不到 mousemove，拖拽中断（向上很快触顶丢事件） | 改用 pointerdown/move/up + setPointerCapture 捕获指针，全程不丢事件，跨屏可拖 | - |
| 拖拽越拖越往下漂移、限制变多 | 用累加位移(delta)移动窗口，窗口移动会触发额外指针事件，误差累积漂移 | 改绝对定位：按下记抓取点，窗口左上角=当前鼠标-抓取点(move-pet-to)，不累加 | - |
| 桌宠挡住桌面点击 / 拖拽漂移 | 透明窗口整块矩形拦截鼠标；拖拽偏移在渲染层靠 window.screenX 估算不准 | 默认 setIgnoreMouseEvents(true,{forward}) 穿透、指针在宠物/菜单上才接管；拖拽偏移改由主进程按 getPosition 计算(drag-start/move/end)绝对定位 | - |
| 拖拽空气墙越拖越往下、宠物到不了屏幕顶部 | tall 窗口+夹边界+移动OS窗口，getPosition/getSize/DPI 多重坐标不一致累积 | 改全屏固定窗口、宠物 CSS left/top 定位，单坐标系零漂移，可达任意边缘/跨屏 | - |
