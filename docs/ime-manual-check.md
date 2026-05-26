# IME Manual Check

本文件用于在 Windows Terminal / PowerShell 中，基于当前本地 harness，快速做一次中文输入法现场验证。

## 启动

```powershell
.\ime-progress-surface-debug.ps1
```

不想记录 ANSI 原始输出时：

```powershell
.\ime-progress-surface-debug.ps1 --no-log
```

直接从某个关键场景启动：

```powershell
.\ime-progress-surface-debug.ps1 --scenario approval
.\ime-progress-surface-debug.ps1 --scenario retry
.\ime-progress-surface-debug.ps1 --scenario bash
.\ime-progress-surface-debug.ps1 --scenario branch-summary
.\ime-progress-surface-debug.ps1 --scenario complete
```

做一个自动退出的短时 smoke：

```powershell
.\ime-progress-surface-debug.ps1 --scenario complete --exit-after-ms 1500
```

做一轮自动切场景的半自动观察：

```powershell
.\ime-progress-surface-debug.ps1 --scenario approval --auto-cycle-ms 2500
```

只轮播关键场景集合：

```powershell
.\ime-progress-surface-debug.ps1 --scenario-list critical --auto-cycle-ms 2500
```

`critical` 当前等价于：

- `approval`
- `ask-user`
- `retry`
- `reconnect`
- `parallel`
- `bash`
- `branch-summary`
- `complete`

说明：

- 脚本会启动真实 `ProcessTerminal` 场景，不是虚拟终端
- 会打开硬件光标定位
- 会写 ANSI 输出日志到 `.tmp/ime-progress-surface-debug-ansi.log`
- footer 会显示：
  - 当前场景名
  - `suppress=on/off`
  - `progress=on/off`
  - `ops=<终端写入操作计数>`

如果 PowerShell 被执行策略拦住，可以直接临时绕过执行策略：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\ime-progress-surface-debug.ps1 --scenario-list critical --auto-cycle-ms 2500
```

## 操作

1. 切换到中文输入法
2. 在输入框里输入拼音，但先不要上屏
3. 使用 `Ctrl+N` 轮流切这些场景：
   - `todo-task`
   - `approval`
   - `ask-user`
   - `retry`
   - `reconnect`
   - `parallel`
   - `bash`
   - `branch-summary`
   - `complete`
4. 每个场景里都重复输入拼音，观察任务栏、待发送区、正文区、footer
5. 额外快捷键：
   - `Ctrl+P` 暂停/恢复动画推进
   - `Ctrl+R` 清零终端写入操作计数

## 通过标准

- 拼音候选窗始终跟随真实输入框
- 正文区不闪出拼音
- 任务栏不闪出拼音
- footer 不闪出拼音
- 输入位置不跑偏
- `complete` 场景下任务栏可靠消失
- `complete` 场景下 terminal progress 也应关闭，不再继续写终端 keepalive
- 输入拼音过程中，`ops` 不应持续快速增长
- 输入拼音过程中，`progress` 应在 suppress 窗口内切到 `off`
- `bash` 场景下，bash transcript 流式输出不应把拼音候选窗抢到正文区
- `branch-summary` 场景下，branch summary loader 出现时不应把拼音候选窗抢到任务栏或 footer
- 使用 `--auto-cycle-ms` 时，仍要在自动切场景期间持续输入拼音，观察切场景瞬间候选窗是否跑偏

## 失败时记录

请尽量记录：

- 出问题的场景名
- 发生时是否正在输入拼音候选态
- 拼音闪到了哪一层：
  - 正文区
  - 任务栏
  - 待发送区
  - footer
- 是否伴随光标跳动
- 如果是 `bash` 或 `branch-summary` 场景，说明是在：
  - transcript 流式输出阶段
  - loader 首帧出现阶段
  - 完成收尾阶段
- 如果有需要，可附带 `.tmp/ime-progress-surface-debug-ansi.log`
