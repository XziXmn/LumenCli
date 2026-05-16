# TUI 键盘 Walkthrough 测试清单

本文档用于在真实终端中逐项验证 Lumen TUI 的键盘交互。

## 启动方式

```bash
cd packages/coding-agent
bun run src/cli.ts --tui
```

或在 MSYS2 tmux 中：

```bash
tmux new-session -d -s lumen-test -x 120 -y 32
tmux send-keys -t lumen-test "cd packages/coding-agent && bun run src/cli.ts --tui" Enter
sleep 3 && tmux capture-pane -t lumen-test -p
```

## 测试矩阵

### 1. Command Palette

| 步骤 | 操作 | 预期结果 | 通过 |
|------|------|----------|------|
| 1.1 | `Ctrl+P` | 打开 command palette | [ ] |
| 1.2 | 输入 `docs` | 显示 disabled "Open documentation" entry | [ ] |
| 1.3 | 输入 `which-key` | 显示多个 disabled which-key 命令 | [ ] |
| 1.4 | 输入 `display_thinking` | 显示 ready alias | [ ] |
| 1.5 | `Ctrl+N` / `Ctrl+P` | 上下导航 | [ ] |
| 1.6 | `PgDn` / `PgUp` | 翻页导航 | [ ] |
| 1.7 | `Home` / `End` | 跳首/跳尾 | [ ] |
| 1.8 | 选中 disabled entry 按 Enter | 不执行，无 crash | [ ] |
| 1.9 | 选中 ready entry 按 Enter | 执行命令 | [ ] |
| 1.10 | `Esc` | 关闭 palette | [ ] |

### 2. Select Dialog

| 步骤 | 操作 | 预期结果 | 通过 |
|------|------|----------|------|
| 2.1 | `Ctrl+X` then `m` (model list) | 打开 model select dialog | [ ] |
| 2.2 | `Ctrl+N` / `Down` | 向下导航 | [ ] |
| 2.3 | `Ctrl+P` / `Up` | 向上导航 | [ ] |
| 2.4 | `PgDn` / `PgUp` | 翻页 | [ ] |
| 2.5 | `Home` / `End` | 跳首/跳尾 | [ ] |
| 2.6 | 输入过滤文本 | 列表过滤 | [ ] |
| 2.7 | `Enter` | 选中并关闭 | [ ] |
| 2.8 | `Esc` | 取消并关闭 | [ ] |

### 3. Input Dialog

| 步骤 | 操作 | 预期结果 | 通过 |
|------|------|----------|------|
| 3.1 | `Ctrl+P` → 搜索 `rename` → Enter | 打开 rename input dialog | [ ] |
| 3.2 | 输入新名称 | 文本显示在输入框 | [ ] |
| 3.3 | `Enter` | 提交并关闭 | [ ] |
| 3.4 | 重复 3.1，按 `Esc` | 取消并关闭 | [ ] |

### 4. Confirm Dialog

| 步骤 | 操作 | 预期结果 | 通过 |
|------|------|----------|------|
| 4.1 | 输入 `/import test.jsonl` | 打开 confirm dialog | [ ] |
| 4.2 | 确认按钮 | 执行确认动作 | [ ] |
| 4.3 | 重复 4.1，按 `Esc` | 取消 | [ ] |

### 5. Model/Agent/Theme/Tool Toggles

| 步骤 | 操作 | 预期结果 | 通过 |
|------|------|----------|------|
| 5.1 | `F2` | 切换到下一个 model | [ ] |
| 5.2 | `Shift+F2` | 切换到上一个 model | [ ] |
| 5.3 | `Ctrl+X` then `a` | 打开 agent list | [ ] |
| 5.4 | `Ctrl+X` then `t` | 打开 theme dialog | [ ] |
| 5.5 | `Ctrl+P` → `tools` → Enter | 打开 tools toggle | [ ] |

### 6. Session Operations

| 步骤 | 操作 | 预期结果 | 通过 |
|------|------|----------|------|
| 6.1 | `Ctrl+X` then `n` | 新建 session | [ ] |
| 6.2 | `Ctrl+X` then `g` | 打开 session tree | [ ] |
| 6.3 | tree 中导航并选择 | 切换到选中 session | [ ] |
| 6.4 | `Ctrl+X` then `j` | 打开 timeline | [ ] |
| 6.5 | `Ctrl+P` → `fork` → Enter | fork session | [ ] |
| 6.6 | `Ctrl+P` → `switch` → Enter | 打开 session list | [ ] |
| 6.7 | `Ctrl+P` → `delete` → Enter | 打开 delete 确认 | [ ] |

### 7. Undo/Redo Prompt Prefill

| 步骤 | 操作 | 预期结果 | 通过 |
|------|------|----------|------|
| 7.1 | 发送一条消息，等待回复 | 正常对话 | [ ] |
| 7.2 | `Ctrl+X` then `u` | undo，prompt 预填上一条消息 | [ ] |
| 7.3 | `Ctrl+X` then `r` | redo，恢复 | [ ] |

### 8. Shell Mode

| 步骤 | 操作 | 预期结果 | 通过 |
|------|------|----------|------|
| 8.1 | `Tab` (空 prompt) | 切换到 shell mode | [ ] |
| 8.2 | 输入 `echo hello` | 文本显示 | [ ] |
| 8.3 | `Enter` | 执行命令，显示 shell tool block | [ ] |
| 8.4 | `Tab` | 切回 normal mode | [ ] |

### 9. ask_user Interactions

| 步骤 | 操作 | 预期结果 | 通过 |
|------|------|----------|------|
| 9.1 | 触发 ask_user select（需要 agent 触发） | 显示 select dialog | [ ] |
| 9.2 | 选择一个选项 | 回答并继续 | [ ] |
| 9.3 | 触发 ask_user confirm | 显示 confirm dialog | [ ] |
| 9.4 | 确认/拒绝 | 回答并继续 | [ ] |
| 9.5 | 触发 ask_user input | 显示 input dialog | [ ] |
| 9.6 | 输入并提交 | 回答并继续 | [ ] |

### 10. Abort/Interruption

| 步骤 | 操作 | 预期结果 | 通过 |
|------|------|----------|------|
| 10.1 | 发送长 prompt，agent 开始工作 | status 显示 working | [ ] |
| 10.2 | `Esc` | 中断，toast 显示 "Interrupted" | [ ] |
| 10.3 | running tools 标记为 aborted | 工具状态正确 | [ ] |
| 10.4 | 可以继续输入新 prompt | 恢复 idle | [ ] |

### 11. Leader Which-Key Overlay

| 步骤 | 操作 | 预期结果 | 通过 |
|------|------|----------|------|
| 11.1 | `Ctrl+X` | 显示 which-key overlay | [ ] |
| 11.2 | 检查所有 entry | 显示 a/b/c/e/g/j/m/n/r/s/t/u/x/y | [ ] |
| 11.3 | 按任意 leader key | 执行对应命令 | [ ] |
| 11.4 | `Esc` | 关闭 overlay | [ ] |

### 12. External Editor

| 步骤 | 操作 | 预期结果 | 通过 |
|------|------|----------|------|
| 12.1 | 设置 `VISUAL=notepad` 或 `EDITOR=vim` | 环境变量就绪 | [ ] |
| 12.2 | `Ctrl+X` then `e` | 打开外部编辑器 | [ ] |
| 12.3 | 编辑并保存退出 | 内容填入 prompt | [ ] |
| 12.4 | 无 VISUAL/EDITOR 时 `Ctrl+X` then `e` | toast 提示配置缺失 | [ ] |

### 13. Resize 验证

| 步骤 | 操作 | 预期结果 | 通过 |
|------|------|----------|------|
| 13.1 | 120x32 启动 | sidebar 可见，布局正常 | [ ] |
| 13.2 | 缩小到 80x24 | sidebar 隐藏，prompt/footer 不溢出 | [ ] |
| 13.3 | 缩小到 60x20 | 极窄模式，无 crash | [ ] |
| 13.4 | 放大到 200x50 | 宽屏模式，布局拉伸正常 | [ ] |

## 完成标准

- 所有 `[ ]` 标记为 `[x]` 后，在 `tui-opencode-parity.md` 中标记 `Manual keyboard walkthrough` 为完成。
- 发现的 bug 立即修复，修复后重新验证对应步骤。
