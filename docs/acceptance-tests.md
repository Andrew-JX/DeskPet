# Acceptance Tests: 把你自己的宠物变成陪你上班的桌面伙伴——丢一张绿底精灵图就换皮，可对话、会提醒，并支持为已离世宠物的纪念模式。

## Product Acceptance

内测用户中"愿意上传自己宠物照片并持续使用满一周"的比例≥50%；或单条纪念向内容≥50收藏作为真实需求信号。

## Test Scenarios

1. A target user can complete the core workflow: 上传一张宠物绿底精灵图→自动抠图切帧→桌面出现会动可拖动的专属宠物→点击或对话互动、番茄钟到点来提醒。
2. The product records or displays required data: 宠物素材文件、精灵图网格与状态→帧映射、宠物人设/名字/大小、随机回应与提醒文案、纪念模式开关、番茄钟配置（均存本地config.json）。
3. Deterministic rules are calculated without AI guessing: 番茄钟/久坐计时、精灵图切帧与状态机播放、绿幕抠图阈值处理——这些必须确定性，不能交给AI。
4. AI output stays inside the declared boundary: AI只负责符合人设的陪伴式对话；绝不替用户执行系统操作、不改核心数据、纪念模式下不冒充已故宠物本体、不编造主人没说过的事。
5. AI output shows evidence or state: 对话受人设system prompt约束；API Key只在主进程、渲染层经preload白名单通信永不外泄；无Key时退回本地文案，来源可见、行为可预期。
6. Risk guardrails are visible in the workflow: 纪念模式的情感分寸（不消费悲伤、不假装复活）；宠物照片属隐私需本地存储不上传；置顶窗口的打扰度；AI幻觉与越界需人设和边界约束。
