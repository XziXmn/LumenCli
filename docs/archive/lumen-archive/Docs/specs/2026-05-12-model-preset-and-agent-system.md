# Model Preset System + Agent System 设计 Spec

日期：2026-05-12
状态：Ready to implement
前置：S1.10.A/B 完成（catalog + /model 命令已存在）

## 1. 概述

本 spec 覆盖两个紧密关联的功能：

1. **Model Preset System**：把模型配置从"6 个独立槽位"改为"主模型 + 预设模板"
2. **Agent System**：Build/Plan 主代理 + Task/Explore 子代理 + 用户可扩展

## 2. Model Preset System

### 2.1 核心概念

| 概念 | 说明 |
|------|------|
| 主模型（Primary Model） | 用户通过 `/model` 选择的当前模型，所有子系统默认用它 |
| 子系统（Sub-System） | 内部路由类别：coding / vision / writing / fast / long-context |
| 预设（Preset） | 命名的路由配置，映射子系统到特定模型 |
| 路由引擎（Routing Engine） | 解析某子系统该用哪个模型：Active Preset → Primary Model |

### 2.2 用户体验

**简单场景（零配置）**：
- `/model` → 显示模型列表 → 选一个 → 完事，所有功能都用这个模型

**高级场景（预设）**：
- 用户在 `~/.lumen/config.json` 的 `presets` 段定义路由模板
- `/model preset <name>` 激活某个预设
- `/model preset off` 关闭预设，回到全用主模型

### 2.3 Vision 自动降级

当用户输入包含图片，且当前主模型不支持 vision 时：
1. 路由引擎自动查找 registry 中声明 `supports: ["vision"]` 的模型
2. 用该模型解析图片，产出结构化文本描述
3. 把描述作为文本上下文喂给主模型继续处理
4. 如果没有任何 vision 模型可用 → 返回中文错误"没有可用的视觉模型"

这个过程对用户透明，不需要手动切模型，不走子代理。

### 2.4 配置格式

```jsonc
// ~/.lumen/config.json
{
  // 主模型（持久化）
  "primaryModel": "mimo-v2.5-pro",

  // 模型注册表（不变）
  "models": {
    "mimo-v2.5-pro": {
      "baseUrl": "http://192.168.31.160:8007/v1",
      "supports": ["tool-calling"],
      "label": "编程特化"
    },
    "mimo-v2.5": {
      "baseUrl": "http://192.168.31.160:8007/v1",
      "supports": ["vision", "tool-calling"],
      "label": "多模态"
    }
  },

  // 预设（可选，高级用户用）
  "presets": {
    "all-pro": {
      "coding": "mimo-v2.5-pro",
      "vision": "mimo-v2.5",
      "writing": "mimo-v2.5-pro"
    }
  }
}
```

### 2.5 路由解析规则

```
resolve(subSystem):
  1. 如果有 activePreset 且 preset.mapping[subSystem] 存在且模型在 registry 中
     → 返回该模型
  2. 否则 → 返回 primaryModel
  3. 特殊：vision 子系统，如果解析到的模型不声明 supports: ["vision"]
     → 走 2.3 的自动降级流程
```

### 2.6 /model 命令（简化后）

| 命令 | 行为 |
|------|------|
| `/model` | 显示模型列表，选一个切换主模型 |
| `/model <model-id>` | 直接设主模型（非交互） |
| `/model preset <name>` | 激活预设 |
| `/model preset off` | 关闭预设 |
| `/model preset list` | 列出所有预设 |
| `/model status` | 显示主模型 + 当前预设 + 各子系统实际路由 |

移除的命令：`/model use`、`/model reset`、`/model --save`、`/model lock/unlock`、`/model <slot> <id>`

### 2.7 迁移

- 旧 `capabilities.default` → 自动变成 `primaryModel`
- 旧 `capabilities` 其他字段 → 自动生成隐式 "legacy" 预设
- 两者共存时发 warning 建议迁移

### 2.8 事件

替换 `model_binding_changed` 为：
- `primary_model_changed { previousModelId, newModelId }`
- `preset_activated { presetName }`
- `preset_deactivated { presetName }`

---

## 3. Agent System

### 3.1 分层

| 层级 | 代理 | 模式 | 说明 |
|------|------|------|------|
| Primary | **Build** | 主代理 | 默认，全工具权限，写代码/改文件/跑命令 |
| Primary | **Plan** | 主代理 | 只读分析，不改代码，规划和审查 |
| Subagent | **Task** | 子代理 | 通用子任务执行，有写权限，可并行 |
| Subagent | **Explore** | 子代理 | 只读代码探索，快速搜索/找文件 |

另外有隐藏系统代理（compaction / title），用户不可见。

### 3.2 主代理切换

- Tab 键或 `/agent <name>` 切换 Build ↔ Plan
- Plan 模式下所有写操作被拒绝（permission: deny）
- 切换不影响 session 历史

### 3.3 子代理调用

- 主代理通过内置 tool `lumen.task` 调度子代理
- 子代理有独立 transcript，不污染主代理 history
- 子代理执行完只返回最终结果给主代理
- 子代理走同一权限引擎

### 3.4 可扩展

用户自定义代理通过 markdown 文件：

```
~/.lumen/agents/<name>.md       （用户全局）
<cwd>/.lumen/agents/<name>.md   （工作区）
```

格式（跟 opencode 对齐）：

```markdown
---
description: 安全审计专家
mode: subagent
model: mimo-v2.5-pro
permission:
  edit: deny
  bash: deny
---

你是一个安全专家，专注于识别认证和授权漏洞...
```

扫描逻辑复用 skills loader 模式：内置 < 用户 < 工作区，同名覆盖。

### 3.5 代理定义结构

```typescript
interface AgentDefinition {
  id: string;
  description: string;
  mode: "primary" | "subagent";
  model?: string;          // 覆盖模型，不指定则跟主代理
  prompt?: string;         // system prompt
  permission?: {
    edit?: "allow" | "ask" | "deny";
    bash?: "allow" | "ask" | "deny";
    // ...
  };
  hidden?: boolean;        // 隐藏系统代理
}
```

---

## 4. 实施顺序

1. **Model Preset System 核心**（routing-engine + preset-store + migration）
2. **简化 /model 命令**（移除槽位，改为主模型 + preset 子命令）
3. **Vision 自动降级**（内部路由，不走子代理）
4. **Agent System 基础**（AgentDefinition + Build/Plan 切换）
5. **子代理运行时**（Task/Explore + lumen.task tool）
6. **可扩展加载**（~/.lumen/agents/*.md 扫描）

Phase 1 先做 1-3（模型系统），4-6（代理系统）视进度决定是否在 Phase 1 内完成。

---

## 5. 不做的事

- 子代理并行执行（Phase 1 串行）
- 子代理嵌套调用（只允许一层）
- 模型成本预算
- 自动选模型（基于 benchmark 分数）
- 预设的 UI 编辑器（手改 JSON 就行）

---

## 6. 验证

- `smoke:model-preset`：主模型切换 + 预设激活/关闭 + 路由解析
- `smoke:vision-fallback`：vision 自动降级路径
- `smoke:agents`：Build/Plan 切换 + Task 子代理调度
- 现有 `smoke:model-switch` 更新断言适配新接口
