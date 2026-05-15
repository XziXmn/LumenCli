# lumen-writing 模块已删除

## 删除原因

当前实现不可用，需重新设计。四个 slash 命令仅做简单 prompt 包装发送给模型，
没有上下文管理、文件关联、版本追踪等写作工作流必需的能力。

## 原实现内容

文件：`packages/coding-agent/src/core/lumen-writing.ts`

提供 4 个 slash 命令：
- `/plan` — 创建写作或工作计划
- `/draft` — 根据 brief 起草正文
- `/review` — 审阅文本的结构、语言和连续性
- `/revise` — 对文本给出修订版本和修改理由

## 后续重新设计方向

- 可能走 sub-agent 编排（写作 agent 有独立 context + 专用 tools）
- 或上下文标记方案（在 session 中标记"写作模式"，注入写作专用 system prompt）
- 待定，需要先确定写作场景的核心需求

## 恢复方式

旧实现可在 git history 中找回。搜索最后包含该文件的 commit 即可。
