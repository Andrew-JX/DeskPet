# DeskPet 在线换皮 Demo

桌宠核心能力的纯前端演示：上传绿底精灵图 → 浏览器实时绿幕抠图 + 网格切帧 + 状态机动画。
默认加载 `sample.png`（由 `tools/make-sample-sprite.js` 生成）。

纯静态，零依赖，单文件 + 一张图。

## 本地预览

```bash
npx serve web-demo -l 5599
# 打开 http://localhost:5599
```

## 部署成可分享的链接

**Vercel**（与作者其他项目一致）：
```bash
cd web-demo && vercel       # 首次按提示登录/选项目
```

**Cloudflare Pages**：
```bash
npx wrangler pages deploy web-demo
```

> 部署后把链接放进简历 / A4 / 面试，对方点开即可拖图体验，无需安装。
