# 需求文档：Wire 协议层

## 简介

在 Lumen Agent 核心与 UI 层之间引入结构化事件传输层（Wire Protocol Layer）。该层将 agent 运行时产生的事件统一为版本化、可序列化的 Wire 事件流，作为 `TuiRuntime` 的底层传输机制。Wire 层不替代现有 `TuiRuntime` 契约，而是为其提供结构化事件来源，同时为未来 Web UI、IDE 插件、远程驱动等场景预留扩展能力。

## 术语表

- **Wire_Event**: Wire 协议中的结构化事件单元，包含类型标识、时间戳、关联 ID 和负载数据
- **WireHub**: Wire 事件的中央调度器，负责事件的发布、订阅和回放
- **Wire_Consumer**: 订阅并消费 Wire 事件的组件（如 TuiRuntime、未来的 Web UI）
- **Wire_Producer**: 产生并发布 Wire 事件的组件（如 AgentSessionTuiRuntime 适配器）
- **Session_Trace**: 一次会话中所有 Wire 事件的有序记录，以 JSONL 格式持久化
- **JSONL**: JSON Lines 格式，每行一个独立 JSON 对象
- **TuiRuntime**: Lumen TUI 的运行时契约接口，定义 UI 状态和操作方法
- **AgentSessionTuiRuntime**: 连接 AgentSession 和 TuiRuntime 的适配器层
- **Steer_Input**: 在 agent 执行过程中由用户注入的引导消息
- **Turn**: agent 的一次完整响应周期，包含助手消息和工具调用/结果

## 需求

### 需求 1：Wire 事件类型定义

**用户故事：** 作为开发者，我希望有一套完整的 Wire 事件类型定义，以便所有 agent 运行时事件都能以结构化方式表达和传输。

#### 验收标准

1. THE Wire_Event SHALL 包含以下公共字段：事件类型标识（type）、单调递增序列号（seq）、ISO 8601 时间戳（timestamp）、会话 ID（sessionId）
2. THE Wire_Event SHALL 定义以下生命周期事件类型：TurnBegin、TurnEnd、StepBegin、StepEnd
3. THE Wire_Event SHALL 定义以下内容事件类型：ContentPart（文本片段）、ThinkingPart（推理片段）
4. THE Wire_Event SHALL 定义以下工具事件类型：ToolCall（工具调用开始）、ToolResult（工具执行结果）
5. THE Wire_Event SHALL 定义以下状态事件类型：StatusUpdate（状态变更通知）
6. THE Wire_Event SHALL 定义以下交互事件类型：ApprovalRequest（审批请求）、ApprovalResponse（审批响应）
7. THE Wire_Event SHALL 定义以下注入事件类型：SteerInput（用户引导消息注入）
8. THE Wire_Event SHALL 定义以下通知事件类型：Notification（后台通知，用于触发自动行为）
9. WHEN 定义 TurnBegin 事件时，THE Wire_Event SHALL 包含 turnId 和可选的 triggerSource 字段（user_prompt | steer_input | auto_trigger）
10. WHEN 定义 ToolCall 事件时，THE Wire_Event SHALL 包含 toolCallId、toolName 和 args 字段
11. WHEN 定义 ToolResult 事件时，THE Wire_Event SHALL 包含 toolCallId、toolName、result 和 isError 字段
12. THE Wire_Event SHALL 定义协议版本号字段（version），初始值为 "1.0"

### 需求 2：WireHub 接口定义

**用户故事：** 作为开发者，我希望有一个中央事件调度器接口，以便 Wire 事件的生产者和消费者能够解耦通信。

#### 验收标准

1. THE WireHub SHALL 提供 publish 方法，接受一个 Wire_Event 并分发给所有已注册的订阅者
2. THE WireHub SHALL 提供 subscribe 方法，接受一个回调函数并返回取消订阅的函数
3. THE WireHub SHALL 提供 replay 方法，将指定会话的历史事件按序列号顺序重放给指定订阅者
4. THE WireHub SHALL 支持多个并发订阅者，每个订阅者独立接收事件
5. WHEN 一个订阅者的回调抛出异常时，THE WireHub SHALL 捕获该异常并继续向其他订阅者分发事件
6. THE WireHub SHALL 提供 dispose 方法，释放所有资源并取消所有订阅

### 需求 3：JSONL 文件持久化

**用户故事：** 作为开发者，我希望 Wire 事件能持久化为 JSONL 文件，以便支持 session replay 和 trace 可视化。

#### 验收标准

1. THE Session_Trace SHALL 将每个 Wire_Event 序列化为一行 JSON 并追加写入 JSONL 文件
2. THE Session_Trace SHALL 将 trace 文件存储在会话目录下，文件名格式为 `wire-trace.jsonl`
3. WHEN 写入 trace 文件时，THE Session_Trace SHALL 使用追加模式（append），避免覆盖已有记录
4. THE Session_Trace SHALL 提供 readTrace 方法，从 JSONL 文件中按行解析并返回 Wire_Event 数组
5. IF 解析某行 JSON 失败，THEN THE Session_Trace SHALL 跳过该行并继续解析后续行
6. THE Session_Trace SHALL 在每次 TurnEnd 事件写入后执行 flush 操作，确保数据持久化
7. FOR ALL 有效的 Wire_Event 对象，序列化为 JSON 再反序列化 SHALL 产生等价对象（round-trip 属性）

### 需求 4：AgentSessionTuiRuntime 集成

**用户故事：** 作为开发者，我希望现有的 AgentSessionTuiRuntime 适配器能通过 WireHub 发布事件，以便 TUI 组件从 Wire 事件流中获取数据。

#### 验收标准

1. WHEN AgentSession 发出 turn_start 事件时，THE AgentSessionTuiRuntime SHALL 通过 WireHub 发布对应的 TurnBegin Wire_Event
2. WHEN AgentSession 发出 turn_end 事件时，THE AgentSessionTuiRuntime SHALL 通过 WireHub 发布对应的 TurnEnd Wire_Event
3. WHEN AgentSession 发出 message_update 事件且包含文本内容时，THE AgentSessionTuiRuntime SHALL 通过 WireHub 发布 ContentPart Wire_Event
4. WHEN AgentSession 发出 message_update 事件且包含推理内容时，THE AgentSessionTuiRuntime SHALL 通过 WireHub 发布 ThinkingPart Wire_Event
5. WHEN AgentSession 发出 tool_execution_start 事件时，THE AgentSessionTuiRuntime SHALL 通过 WireHub 发布 ToolCall Wire_Event
6. WHEN AgentSession 发出 tool_execution_end 事件时，THE AgentSessionTuiRuntime SHALL 通过 WireHub 发布 ToolResult Wire_Event
7. THE AgentSessionTuiRuntime SHALL 在初始化时创建 WireHub 实例并注册为 AgentSession 事件的订阅者
8. THE TuiRuntime 契约接口 SHALL 保持不变，TUI 组件的消费方式不受影响

### 需求 5：TUI 组件消费 Wire 事件

**用户故事：** 作为开发者，我希望 TUI 组件能通过 TuiRuntime 间接消费 Wire 事件，以便现有 UI 行为保持一致。

#### 验收标准

1. THE AgentSessionTuiRuntime SHALL 订阅 WireHub 并将 Wire_Event 转换为 TuiState 更新
2. WHEN 收到 ContentPart Wire_Event 时，THE AgentSessionTuiRuntime SHALL 更新对应 TuiMessage 的 TuiTextPart
3. WHEN 收到 ToolCall Wire_Event 时，THE AgentSessionTuiRuntime SHALL 创建或更新对应的 TuiToolPart（status 为 running）
4. WHEN 收到 ToolResult Wire_Event 时，THE AgentSessionTuiRuntime SHALL 更新对应 TuiToolPart 的 status 和 result 字段
5. WHEN 收到 StatusUpdate Wire_Event 时，THE AgentSessionTuiRuntime SHALL 更新 TuiState.session.status 字段
6. THE TUI 组件 SHALL 继续通过 TuiRuntime.subscribe 接收状态变更，无需感知 Wire 层的存在

### 需求 6：Steer Input 支持

**用户故事：** 作为用户，我希望在 agent 执行过程中能注入引导消息，以便实时调整 agent 的行为方向。

#### 验收标准

1. THE Wire_Event SHALL 支持 SteerInput 事件类型，包含 message 文本字段和 priority 字段（queued | immediate）
2. WHEN 用户在 TUI prompt 中提交 steer 消息时，THE TuiRuntime SHALL 通过 WireHub 发布 SteerInput Wire_Event
3. WHEN priority 为 queued 时，THE Agent_Core SHALL 在当前步骤结束后处理该 steer 消息
4. WHEN priority 为 immediate 时，THE Agent_Core SHALL 尽快中断当前处理并注入该 steer 消息
5. THE Agent_Core SHALL 将 steer 消息作为 user message 追加到对话上下文中
6. WHEN steer 消息被成功消费时，THE WireHub SHALL 发布一个 StatusUpdate 事件通知消费完成

### 需求 7：Background Auto-trigger 支持

**用户故事：** 作为用户，我希望后台任务完成时能自动触发新的 agent turn，以便无需手动干预即可继续工作流。

#### 验收标准

1. THE Wire_Event SHALL 支持 Notification 事件类型，包含 source（事件来源标识）、title 和 payload 字段
2. WHEN 后台任务完成时，THE Wire_Producer SHALL 通过 WireHub 发布 Notification Wire_Event
3. WHEN TUI 检测到特定类型的 Notification 事件时，THE TuiRuntime SHALL 自动触发新的 agent turn
4. THE Notification 事件 SHALL 包含 autoTrigger 布尔字段，指示是否应自动触发新 turn
5. WHILE agent 已在执行中，THE TuiRuntime SHALL 将 auto-trigger 请求排队等待当前 turn 结束

### 需求 8：渐进式迁移兼容性

**用户故事：** 作为开发者，我希望 Wire 层能渐进式引入，以便在不破坏现有功能的前提下逐步替换 ad-hoc 事件传递。

#### 验收标准

1. THE Wire 层 SHALL 作为可选组件存在，当 WireHub 未初始化时，AgentSessionTuiRuntime 的现有行为保持不变
2. WHILE Wire 层处于渐进迁移阶段，THE AgentSessionTuiRuntime SHALL 同时支持直接回调和 Wire 事件两种模式
3. THE Wire_Event 类型定义 SHALL 独立于 TuiRuntime 类型，避免循环依赖
4. THE Wire 层代码 SHALL 位于 `packages/coding-agent/src/core/wire/` 目录下，与现有代码物理隔离
5. IF WireHub 实例不可用，THEN THE AgentSessionTuiRuntime SHALL 回退到现有的直接状态更新模式
