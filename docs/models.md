# 模型配置指南

## 概念

Lumen 的模型系统分三层：

1. **模型定义** — 告诉 Lumen "世界上有哪些模型可用"
2. **认证** — 告诉 Lumen "我有哪些模型的 API key"
3. **Preset 路由** — 告诉 Lumen "什么情况下用哪个模型"

---

## 1. 模型定义

### 内置模型

Lumen 继承 Pi 的内置模型列表（`packages/ai/src/models.generated.ts`），包含 200+ 个模型：
- Anthropic (Claude 系列)
- OpenAI (GPT 系列)
- Google (Gemini 系列)
- DeepSeek, Groq, xAI, Mistral, MoonShot, MiniMax, Z.AI 等

这些模型不需要额外配置，只要有对应的 API key 就能用。

### 自定义模型（`.lumen/default-models.json`）

对于不在内置列表里的模型（比如私有部署、新 provider），在项目根目录或 `~/.lumen/agent/` 下创建 `default-models.json`：

```json
[
  {
    "provider": "xiaomi-token-plan-sgp",
    "id": "mimo-v2.5-pro",
    "name": "MiMo v2.5 Pro",
    "api": "openai-chat",
    "baseUrl": "https://api.xiaomi.com/v1",
    "reasoning": true,
    "input": ["text"],
    "contextWindow": 131072,
    "maxTokens": 32768,
    "cost": {
      "input": 0,
      "output": 0,
      "cacheRead": 0,
      "cacheWrite": 0
    }
  },
  {
    "provider": "my-local-ollama",
    "id": "qwen3-32b",
    "name": "Qwen3 32B (local)",
    "api": "openai-chat",
    "baseUrl": "http://localhost:11434/v1",
    "reasoning": false,
    "input": ["text"],
    "contextWindow": 32768,
    "maxTokens": 8192,
    "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 }
  }
]
```

**字段说明**：

| 字段 | 必填 | 说明 |
|------|------|------|
| `provider` | 是 | Provider 标识符（用于 API key 查找和 preset 引用） |
| `id` | 是 | 模型 ID（发给 API 的 model 参数） |
| `name` | 是 | 显示名称 |
| `api` | 是 | API 协议类型（见下表） |
| `baseUrl` | 是 | API 端点 URL |
| `reasoning` | 是 | 是否支持深度思考 |
| `input` | 是 | 支持的输入类型：`["text"]` 或 `["text", "image"]` |
| `contextWindow` | 是 | 最大上下文窗口（tokens） |
| `maxTokens` | 是 | 最大输出 tokens |
| `cost` | 是 | 每百万 token 成本（美元），本地模型填 0 |
| `thinkingLevelMap` | 否 | 思考等级映射（见"深度思考"章节） |

**支持的 `api` 类型**：

| api | 适用 |
|-----|------|
| `openai-chat` | OpenAI 兼容 API（最通用：Ollama, vLLM, LiteLLM, 小米, Groq 等） |
| `openai-responses` | OpenAI Responses API（GPT-5 系列） |
| `anthropic` | Anthropic Messages API |
| `google-gemini` | Google Gemini API |
| `bedrock-converse-stream` | AWS Bedrock |
| `azure-openai-responses` | Azure OpenAI |

### 通过 Extension 注册

在 `.lumen/extensions/` 下的 TypeScript 文件中：

```typescript
export default function(pi) {
  pi.registerProvider("my-provider", {
    name: "My Provider",
    baseUrl: "https://api.example.com/v1",
    apiKey: "MY_PROVIDER_API_KEY",  // 环境变量名
    api: "openai-chat",
    models: [
      {
        id: "my-model-v1",
        name: "My Model v1",
        reasoning: false,
        input: ["text", "image"],
        cost: { input: 1.0, output: 3.0, cacheRead: 0.5, cacheWrite: 1.0 },
        contextWindow: 128000,
        maxTokens: 16384,
      }
    ]
  });
}
```

---

## 2. 认证（API Keys）

### 环境变量（推荐）

```bash
# Windows PowerShell
$env:ANTHROPIC_API_KEY = "sk-ant-..."
$env:OPENAI_API_KEY = "sk-..."
$env:XIAOMI_API_KEY = "..."
$env:GROQ_API_KEY = "gsk_..."

# Unix
export ANTHROPIC_API_KEY="sk-ant-..."
```

**完整的环境变量列表**（按 provider）：

| Provider | 环境变量 |
|----------|----------|
| Anthropic | `ANTHROPIC_API_KEY` |
| OpenAI | `OPENAI_API_KEY` |
| Google | `GEMINI_API_KEY` 或 `GOOGLE_API_KEY` |
| DeepSeek | `DEEPSEEK_API_KEY` |
| Groq | `GROQ_API_KEY` |
| xAI | `XAI_API_KEY` |
| Mistral | `MISTRAL_API_KEY` |
| OpenRouter | `OPENROUTER_API_KEY` |
| MoonShot | `MOONSHOTAI_API_KEY` |
| MiniMax | `MINIMAX_API_KEY` |
| Z.AI | `ZAI_API_KEY` |
| 小米 | `XIAOMI_API_KEY` |
| Together | `TOGETHER_API_KEY` |
| Fireworks | `FIREWORKS_API_KEY` |
| HuggingFace | `HUGGINGFACE_API_KEY` |
| Cerebras | `CEREBRAS_API_KEY` |
| AWS Bedrock | `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` |
| Azure | `AZURE_OPENAI_API_KEY` |
| GitHub Copilot | `GITHUB_COPILOT_TOKEN` |

### `/login` 命令

运行 Lumen 后输入 `/login`，交互式输入 API key。Key 存储在 `~/.lumen/agent/auth.json`（加密）。

### 命令行临时指定

```bash
lumen --api-key sk-ant-xxx --model anthropic/claude-sonnet-4-6
```

仅本次 session 有效，不持久化。

---

## 3. Preset 路由（`.lumen/presets.json`）

### 基本概念

Preset 是"模型组合的快捷方式"。定义多个角色槽位，运行时按情况自动切换。

### 配置文件

放在项目根目录 `.lumen/presets.json`：

```json
{
  "default": "mimo",
  "presets": {
    "mimo": {
      "description": "MiMo 主力 + Claude 看图",
      "primary": "xiaomi-token-plan-sgp/mimo-v2.5-pro",
      "vision": "anthropic/claude-sonnet-4-6"
    },
    "claude": {
      "description": "Claude 全家桶",
      "primary": "anthropic/claude-sonnet-4-6",
      "thinking": "anthropic/claude-opus-4-7:high"
    },
    "cheap": {
      "description": "Groq 快速迭代",
      "primary": "groq/openai/gpt-oss-120b"
    },
    "full": {
      "description": "四角色全配",
      "primary": "xiaomi-token-plan-sgp/mimo-v2.5-pro",
      "vision": "anthropic/claude-sonnet-4-6",
      "thinking": "anthropic/claude-opus-4-7:high",
      "fast": "groq/openai/gpt-oss-120b"
    }
  }
}
```

### 角色槽位

| 槽位 | 必填 | 触发条件 | 说明 |
|------|------|----------|------|
| `primary` | **是** | 默认 | 所有普通请求都用这个 |
| `vision` | 否 | 用户消息含图片 | primary 不支持 vision 时自动切换 |
| `thinking` | 否 | 用户要求深度思考 | 检测到"仔细分析/think hard"等关键词时切换 |
| `fast` | 否 | 用户要求快速回答 | 检测到"快速/briefly"等关键词时切换 |

### 引用格式

每个槽位的值是 `"provider/modelId"` 或 `"provider/modelId:thinkingLevel"`：

```
"anthropic/claude-opus-4-7"        → 用默认 thinking level
"anthropic/claude-opus-4-7:high"   → 强制 thinking level = high
"xiaomi-token-plan-sgp/mimo-v2.5-pro:medium" → 中等思考
```

### 运行时命令

| 命令 | 效果 |
|------|------|
| `/preset mimo` | 激活 mimo preset |
| `/preset list` | 列出所有 preset |
| `/preset show` | 查看当前激活的 preset |
| `/preset save` | 把当前 preset 设为默认 |
| `/presets` | 同 `/preset list` |

### 自动路由逻辑

每次用户发消息时，按以下优先级决定用哪个模型：

1. **有图片** → 用 `vision`（如果配了）
2. **深度思考关键词** → 用 `thinking`（如果配了）
3. **快速关键词** → 用 `fast`（如果配了）
4. **其他** → 用 `primary`

深度思考关键词（中英文）：
- think hard, deeply analyze, step by step, reason through
- 仔细思考, 深入分析, 逐步分析, 详细推理, 系统性, 全面考虑

快速关键词：
- quick, briefly, short answer
- 快速, 简短, 简单回答

---

## 4. 深度思考（Thinking Levels）

### 等级定义

| 等级 | 预估 tokens | 适用场景 |
|------|-------------|----------|
| `off` | 0 | 不需要推理的简单任务 |
| `minimal` | ~1k | 一句话解释 |
| `low` | ~2k | 简单逻辑推理 |
| `medium` | ~8k | 中等复杂度分析 |
| `high` | ~16k | 深度代码审查、架构设计 |
| `xhigh` | ~32k | 极复杂推理（仅部分模型支持） |

### 切换方式

1. **TUI 选择器**：按 Ctrl+T 打开 thinking level 选择器
2. **命令行 flag**：`lumen --thinking high`
3. **Preset 内置**：`"thinking": "model:high"` 自动设置
4. **运行时命令**：`/model claude-opus:high`

### 模型兼容性

不是所有模型都支持所有等级。每个模型有 `thinkingLevelMap` 定义支持的等级：

```json
{
  "thinkingLevelMap": {
    "off": null,       // null = 不支持关闭思考（模型总是思考）
    "xhigh": "max"    // "max" = 映射到 provider 的 "max" 值
  }
}
```

- 缺失的 key = 使用 provider 默认值（直接传等级名）
- `null` = 该等级不支持（会被 clamp 到最近的支持等级）
- 字符串 = 映射到 provider 特定的值

### Provider 协议差异

Lumen 自动处理不同 provider 的 wire format：

| Provider | 协议 |
|----------|------|
| OpenAI | `reasoning_effort: "low"/"medium"/"high"` |
| Anthropic | `thinking: { type: "enabled", budget_tokens: N }` |
| DeepSeek | `thinking: { type }` + `reasoning_effort` |
| OpenRouter | `reasoning: { effort }` |
| Z.AI / GLM | `enable_thinking: boolean` |
| Qwen | `enable_thinking: boolean` |

用户不需要关心这些差异，只需要选等级。

---

## 5. 常见配置示例

### 只用小米 MiMo

```json
// .lumen/presets.json
{
  "default": "mimo",
  "presets": {
    "mimo": {
      "primary": "xiaomi-token-plan-sgp/mimo-v2.5-pro"
    }
  }
}
```

环境变量：`XIAOMI_API_KEY=...`

### MiMo + Claude 混合

```json
{
  "default": "mix",
  "presets": {
    "mix": {
      "description": "MiMo 日常 + Claude 看图和深度思考",
      "primary": "xiaomi-token-plan-sgp/mimo-v2.5-pro",
      "vision": "anthropic/claude-sonnet-4-6",
      "thinking": "anthropic/claude-opus-4-7:high"
    }
  }
}
```

环境变量：`XIAOMI_API_KEY=...` + `ANTHROPIC_API_KEY=...`

### 本地 Ollama + 云端 fallback

```json
// .lumen/default-models.json
[
  {
    "provider": "ollama",
    "id": "qwen3-32b",
    "name": "Qwen3 32B (local)",
    "api": "openai-chat",
    "baseUrl": "http://localhost:11434/v1",
    "reasoning": false,
    "input": ["text"],
    "contextWindow": 32768,
    "maxTokens": 8192,
    "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 }
  }
]
```

```json
// .lumen/presets.json
{
  "default": "local",
  "presets": {
    "local": {
      "primary": "ollama/qwen3-32b",
      "thinking": "anthropic/claude-sonnet-4-6:medium"
    }
  }
}
```

### 纯 Anthropic

```json
{
  "default": "claude",
  "presets": {
    "claude": {
      "primary": "anthropic/claude-sonnet-4-6",
      "thinking": "anthropic/claude-opus-4-7:high"
    }
  }
}
```

---

## 6. 命令行快速操作

```bash
# 临时用特定模型（不改配置）
lumen --model anthropic/claude-opus-4-7

# 临时用特定模型 + 高思考
lumen --model anthropic/claude-opus-4-7 --thinking high

# 列出所有可用模型
lumen --list-models

# 用特定 provider
lumen --provider xiaomi-token-plan-sgp --model mimo-v2.5-pro

# 离线模式（不检查更新、不联网搜索）
lumen --offline
```

运行中切换：
```
/model claude-opus        # 模糊匹配切换
/model mimo               # 切到 MiMo
/preset full              # 切到 full preset
```
