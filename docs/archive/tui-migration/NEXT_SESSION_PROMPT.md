# OpenTUI 迁移 — 当前进度

## 状态：TUI 成功启动并渲染 ✅

- `npm run check` ✅ 通过
- `bun run src/cli.ts --tui` ✅ 启动成功，渲染终端 UI，进程持续运行
- Provider/Model 数据通过 SessionBridge 注入，prompt 提交路径已连通

## 启动命令

```powershell
cd packages\coding-agent
bun run src/cli.ts --tui
```

## 下一步：手动交互验证

在真实终端中启动 TUI，验证：
1. 输入文字并按 Enter 提交
2. 观察 agent 是否收到 prompt 并开始响应
3. 观察 UI 是否实时显示 streaming 文本
4. 观察 tool 调用是否在 UI 中显示

### 可能需要修复的问题

1. **`local.model.set()` 的 model 格式** — prompt 组件期望 `{ providerID, modelID }`，
   需要确认 `Provider.parseModel()` 返回的格式与 `local.model.set()` 期望的一致

2. **`sync.data.provider` 的 connected 状态** — prompt 组件可能检查 provider 是否 connected

3. **`project.workspace.current()`** — event.ts 用它来过滤事件，如果返回 undefined
   可能导致事件被过滤掉。需要确认 project context 的初始化

4. **`project.instance.directory()`** — event.ts 用它来匹配事件的 directory 字段

## 架构总结

```
tui-mode.tsx
  ├── setSessionBridge({ prompt, getSessionId, getModel })
  │     → shims/sdk.ts 用 getModel() 返回 provider/model 数据给 bootstrap
  ├── createEventBridge(session)
  │     → 将 AgentSession 事件转为 GlobalEvent { type, properties, payload, directory }
  └── tui({ events, config, args: { model: "provider/id" }, directory })
        │
        ├── app.tsx onMount: Provider.parseModel(args.model) → local.model.set()
        │
        ├── SDKProvider(events) → emitter → event.ts → sync.tsx store updates
        │
        ├── SyncProvider.bootstrap() → sdk.client.config.providers() → 返回当前 model
        │                            → sdk.client.app.agents() → 返回 [{name:"coder"}]
        │
        └── Prompt.submit()
              → sdk.client.session.create() → 返回当前 sessionId
              → sdk.client.session.prompt({ parts }) → _bridge.prompt(text)
              → AgentSession.prompt(text) → events → UI update
```
