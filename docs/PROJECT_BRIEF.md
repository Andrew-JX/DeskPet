# Project Brief

Purpose: the product source of truth. Read this before any task.
Seeded by `ai-pm-dev prd`.

## One-liner

把你自己的宠物变成陪你上班的桌面伙伴——丢一张绿底精灵图就换皮，可对话、会提醒，并支持为已离世宠物的纪念模式。

## Target users

有宠物或曾经养过宠物的上班族（每天长时间对着电脑），尤其想要"专属形象"或"想纪念已离世毛孩子"的人。

## Pain / scenario

独自办公缺陪伴，市面桌宠都是与我无关的通用卡通形象；宠物离世后的情感寄托几乎没有产品认真承接。

## Current workaround

用现成开源桌宠（通用形象、安装还很geek）、设宠物照片当壁纸/翻相册、或什么都不用硬扛。

## Core workflow

上传一张宠物绿底精灵图→自动抠图切帧→桌面出现会动可拖动的专属宠物→点击或对话互动、番茄钟到点来提醒。

## MVP must-haves (max 3)

①丢图换皮（绿幕抠图+精灵图状态机）；②AI对话+番茄钟/久坐提醒；③后台素材与人设管理。

## The one thing (ships first)

丢一张图就变成"我那只"宠物的换皮能力——这是与所有通用桌宠的根本差异，最能验证想法。

## Non-goals (explicitly not doing)

v1不做"调用本机任意软件"等高风险工具能力，也不做手表/健康数据接入；先把专属陪伴这一最小可信闭环做扎实，降低安全与演示风险。

## Data the product records or generates

宠物素材文件、精灵图网格与状态→帧映射、宠物人设/名字/大小、随机回应与提醒文案、纪念模式开关、番茄钟配置（均存本地config.json）。
