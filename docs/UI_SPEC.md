# UI Spec

Purpose: screens, states, interaction, and visual direction for downstream UI tools.
Seeded by `ai-pm-dev prd`; refine with design-brief-builder / design-maker.

## Screens / states

上传一张宠物绿底精灵图→自动抠图切帧→桌面出现会动可拖动的专属宠物→点击或对话互动、番茄钟到点来提醒。

## Interaction rules

①丢图换皮（绿幕抠图+精灵图状态机）；②AI对话+番茄钟/久坐提醒；③后台素材与人设管理。

## Trust / evidence shown in UI

对话受人设system prompt约束；API Key只在主进程、渲染层经preload白名单通信永不外泄；无Key时退回本地文案，来源可见、行为可预期。
