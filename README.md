# LumenCli

个人深度定制的 [Pi](https://github.com/earendil-works/pi-mono) coding agent fork。

## 特性

- **中文优先**：系统提示词默认中文回复，slash 命令描述中文化
- **本地推理**：默认配置指向本地 mimo 推理服务（mimo-v2.5-pro 编程特化 + mimo-v2.5 多模态）
- **Pi 全功能继承**：所有 Pi 原生功能（tools、extensions、themes、skills）完整保留
- **社区兼容**：`.pi/` 目录 fallback 读取，社区插件可直接使用

## 安装

```bash
npm install
npm run build
# 全局链接（可选）
npm link -w packages/coding-agent
```

## 使用

```bash
# 交互模式
lumen

# 带初始提示
lumen "列出 src/ 下所有 .ts 文件"

# 非交互模式
lumen -p "重构这段代码"

# 使用本地 mimo
lumen --provider local-mimo --model mimo-v2.5-pro

# 从源码运行（开发时）
npx tsx packages/coding-agent/src/cli.ts
```

## 配置

配置目录：`~/.lumen/agent/`（兼容读取 `~/.pi/agent/`）

### 本地 mimo 推理服务

将 `.lumen/default-models.json` 复制到 `~/.lumen/agent/models.json`：

```bash
mkdir -p ~/.lumen/agent
cp .lumen/default-models.json ~/.lumen/agent/models.json
```

### 项目级配置

项目根目录下 `.lumen/` 目录（兼容读取 `.pi/`）：
- `extensions/` — 项目扩展
- `prompts/` — 提示词模板
- `skills/` — 技能文件
- `themes/` — 主题
- `settings.json` — 项目设置
- `SYSTEM.md` — 自定义系统提示词
- `APPEND_SYSTEM.md` — 追加系统提示词

## 包结构

| 包 | 说明 |
|---|------|
| [packages/coding-agent](packages/coding-agent) | 交互式编程 agent CLI |
| [packages/agent](packages/agent) | Agent 运行时（tool calling、状态管理） |
| [packages/ai](packages/ai) | 统一多 provider LLM API |
| [packages/tui](packages/tui) | 终端 UI 库（差分渲染） |
| [packages/web-ui](packages/web-ui) | Web AI 聊天组件 |

## 开发

```bash
npm install          # 安装依赖
npm run build        # 构建所有包
npm run check        # Lint + 类型检查
```

## 合并上游

```bash
git fetch upstream
git merge upstream/main
# 冲突交给 AI 处理
```

## 路线图

- [x] Phase 1：品牌与深度定制（pi → lumen，中文化，配置目录）
- [ ] Phase 2：功能集成（写作工作流、增强记忆、orchestrator）
- [ ] Phase 3：验证与清理
- [ ] Cherry-pick oh-my-pi 功能（hashline、TTSR、plan mode、memory、commit tool）

## 上游

Fork from [earendil-works/pi-mono](https://github.com/earendil-works/pi-mono)

## License

MIT
