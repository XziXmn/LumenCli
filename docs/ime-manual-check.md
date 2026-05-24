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

说明：

- 脚本会启动真实 `ProcessTerminal` 场景，不是虚拟终端
- 会打开硬件光标定位
- 会写 ANSI 输出日志到 `.tmp/ime-progress-surface-debug-ansi.log`
- footer 会显示：
  - 当前场景名
  - `suppress=on/off`
  - `progress=on/off`
  - `ops=<终端写入操作计数>`

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
- 输入拼音过程中，`ops` 不应持续快速增长
- 输入拼音过程中，`progress` 应在 suppress 窗口内切到 `off`

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
- 如果有需要，可附带 `.tmp/ime-progress-surface-debug-ansi.log`
