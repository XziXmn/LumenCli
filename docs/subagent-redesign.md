# 子代理系统重设计：从进程隔离到同进程 task 模型

## 现状问题

当前方案（`agent_spawn` + `agent_status` + `agent_wait`）：
- LLM 必须轮询 `agent_status` 获取进度 → 浪费 token
- 没有实时进度（只能看到 "running" 或最终结果）
- 每次轮询消耗 input/output token，长任务可能轮询 10+ 次
- 用户看不到子代理在做什么

## 目标方案

参考 oh-my-pi 的 `task` tool 模型：
- 一个 `task` tool 替代 5 个 tool（spawn/status/send/wait/kill）
- 同进程执行，通过 `Agent` 类直接实例化子代理
- 实时事件流（subscribe）→ UI 实时显示子代理活动
- 批量并行调度（一次 tool call 启动 N 个子代理）

## 架构设计

### 核心组件

```
┌─────────────────────────────────────────────────┐
│ 主 Agent (interactive-mode)                      │
│                                                  │
│  ┌─────────────────────────────────────────────┐│
│  │ task tool                                    ││
│  │  - 接收 { agent, tasks: [...] }             ││
│  │  - 实例化 N 个子 Agent                       ││
│  │  - 并行执行，收集结果                         ││
│  │  - 通过 EventBus 广播进度                    ││
│  └─────────────────────────────────────────────┘│
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │ Agent #1 │  │ Agent #2 │  │ Agent #3 │      │
│  │ (explore)│  │ (worker) │  │ (worker) │      │
│  │ tools:   │  │ tools:   │  │ tools:   │      │
│  │ read,grep│  │ read,edit│  │ read,edit│      │
│  └──────────┘  └──────────┘  └──────────┘      │
│       │              │              │            │
│       └──────────────┼──────────────┘            │
│                      ▼                           │
│              EventBus (progress)                  │
│                      │                           │
│                      ▼                           │
│              TUI 树形渲染                         │
└─────────────────────────────────────────────────┘
```

### Tool Schema

```typescript
const TaskParams = Type.Object({
  agent: Type.String({ description: "Agent type name (from .lumen/agents/)" }),
  context: Type.Optional(Type.String({ description: "Shared context prepended to all tasks" })),
  tasks: Type.Array(Type.Object({
    id: Type.String({ description: "CamelCase identifier, max 48 chars" }),
    description: Type.String({ description: "Short one-liner for UI display" }),
    assignment: Type.String({ description: "Full task instructions for the subagent" }),
  })),
});
```

### 执行流程

1. LLM 调用 `task` tool，传入 agent 类型 + tasks 数组
2. `task` tool 为每个 task 实例化一个 `Agent`：
   - 从 `.lumen/agents/` 加载 agent 配置（system prompt, tools, model）
   - 使用主 agent 的 `streamFn`（共享 API key）
   - 限制 tools 为 agent 配置中指定的子集
3. 并行执行所有 tasks（`Promise.all`）
4. 每个子 Agent 通过 `subscribe()` 转发事件到 EventBus
5. UI 订阅 EventBus，实时渲染树形进度
6. 所有 tasks 完成后，`task` tool 返回聚合结果

### 进度追踪

```typescript
interface SubagentProgress {
  index: number;
  id: string;
  agent: string;
  status: "pending" | "running" | "completed" | "failed" | "aborted";
  description: string;
  currentTool?: string;
  currentToolArgs?: string;
  toolCount: number;
  tokens: number;
  durationMs: number;
}
```

通过 EventBus 广播：
```typescript
eventBus.emit("task:subagent:progress", progress);
eventBus.emit("task:subagent:lifecycle", { id, status: "started" | "completed" | "failed" });
```

### UI 渲染

消息流中显示：
```
⠋ task: 3 agents running
├─ ⠋ explore: 分析仓库结构 · grep "import" · 4 tools · 12.3s
├─ ✓ worker: 修复 config.ts · 8.1s · 2,100 tokens
└─ ⠋ worker: 更新 README · edit README.md · 3 tools · 5.2s
```

完成后：
```
✓ task: 3 agents completed · 15.2s · 8,400 tokens
├─ ✓ explore: 分析仓库结构 · 12.3s · 4,200 tokens
├─ ✓ worker: 修复 config.ts · 8.1s · 2,100 tokens
└─ ✓ worker: 更新 README · 5.2s · 2,100 tokens
```

## 实现计划

### Phase 1：同步单任务（MVP）

**文件**：`packages/coding-agent/src/core/lumen-task.ts`

- 实现 `task` tool（单个 task，阻塞执行）
- 直接实例化 `Agent` 类
- 使用主 agent 的 streamFn 和 API key
- 从 `.lumen/agents/` 加载 agent 配置
- 返回子 agent 的最终文本输出
- renderCall/renderResult 用 status line 格式

**验证**：能用 `task` tool 调用 explore agent 完成一个查询任务

### Phase 2：并行执行

- tasks 数组支持多个 task
- `Promise.all` 并行执行
- 每个 task 独立的 Agent 实例
- 聚合结果返回

### Phase 3：实时进度

- `agent.subscribe()` 转发事件到 EventBus
- 新建 `TaskProgressComponent` 渲染树形进度
- interactive-mode 订阅 EventBus 更新 UI
- spinner + 当前 tool + elapsed time

### Phase 4：废弃旧方案

- 标记 `agent_spawn/status/send/wait/kill` 为 deprecated
- 迁移 `.lumen/agents/` 配置格式（如需要）
- 移除旧代码

## 技术细节

### Agent 实例化

```typescript
import { Agent } from "@earendil-works/pi-agent-core";

const subAgent = new Agent({
  initialState: {
    systemPrompt: [agentConfig.systemPrompt],
    model: resolveModel(agentConfig.model),
    tools: filterTools(agentConfig.tools),
  },
  streamFn: parentStreamFn,  // 共享 API key
  getApiKey: parentGetApiKey,
  toolExecution: "parallel",
});

subAgent.subscribe((event) => {
  // 转发到 EventBus
  eventBus.emit("task:subagent:event", { id, index, event });
});

await subAgent.prompt(assignment);
await subAgent.waitForIdle();
```

### Tools 限制

子 agent 只能使用其配置中指定的 tools。例如 explore agent：
```yaml
tools: read, grep, find, ls, bash
```

从主 agent 的 tool registry 中筛选出这些 tools 传给子 agent。

### 共享资源

- **API key**：通过 `getApiKey` 回调共享
- **streamFn**：共享同一个 stream 函数
- **cwd**：共享工作目录
- **model**：子 agent 可以 override model，否则继承主 agent

### 不共享的资源

- **messages**：每个子 agent 独立的消息历史
- **system prompt**：每个子 agent 有自己的 system prompt
- **session**：子 agent 不持久化 session（一次性执行）

## 与旧方案对比

| | 旧方案 (agent_spawn) | 新方案 (task) |
|---|---|---|
| Tool 数量 | 5 个 | 1 个 |
| 执行方式 | 进程外 spawn | 同进程 Agent 实例 |
| 状态获取 | LLM 轮询 agent_status | EventBus 实时推送 |
| Token 消耗 | 高（轮询开销） | 低（无轮询） |
| 实时进度 | 无 | 有（当前 tool + elapsed） |
| 并行 | 需要多次 agent_spawn | 一次 task call |
| 隔离 | 进程级别 | 无（同进程） |
| 稳定性 | 子 agent 崩溃不影响主 | 子 agent 异常需 try/catch |

## 风险和缓解

1. **子 agent 死循环** → 设置 max steps 限制 + timeout
2. **内存泄漏** → 子 agent 完成后清理 messages 和 tools
3. **并发文件冲突** → Phase 1 不做并行编辑；后续可加 worktree 隔离
4. **API rate limit** → 并行子 agent 共享 rate limiter

## 迁移策略

1. 新建 `lumen-task.ts`，与旧 `lumen-agents.ts` / `lumen-agents-bg.ts` 并存
2. 在 system prompt 中引导 LLM 优先使用 `task` tool
3. 验证稳定后，从 resource-loader 中移除旧 extension 注册
4. 归档旧文件到 `.lumen-archive/`
