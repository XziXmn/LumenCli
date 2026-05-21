# LumenCli

个人深度定制的 [Pi](https://github.com/earendil-works/pi-mono) coding agent fork。

## 当前状态

- 主线交互实现集中在 `packages/coding-agent/src/modes/interactive/`
- 输入框上方任务栏是唯一主动进度面，`todo` / `task` 在 transcript 中只保留语义痕迹
- `.lumen/` 是首选配置目录，`.pi/` fallback 仍保留用于兼容社区配置

## 特性

- **中文优先**：系统提示词默认中文回复，slash 命令描述中文化
- **本地推理**：默认配置指向本地 mimo 推理服务（`mimo-v2.5-pro` 编程特化 + `mimo-v2.5` 多模态）
- **Pi 全功能继承**：保留 Pi 原生 tools、extensions、themes、skills 能力
- **社区兼容**：保留 `.pi/` 目录 fallback 读取，社区插件可直接复用

## 文档导航

- [docs/README.md](docs/README.md)：Lumen 根文档索引，包含当前计划、分析报告、历史归档的入口
- [packages/coding-agent/docs/index.md](packages/coding-agent/docs/index.md)：Pi/package 级正式手册，侧重 CLI、providers、settings、extensions
- [CUSTOMIZATION_MANIFEST.md](CUSTOMIZATION_MANIFEST.md)：fork 定制面的高层 merge-intent 清单

## 安装

```bash
npm install
npm run build
# 全局链接（可选）
npm link -w packages/coding-agent
```

## 使用

```bash
# 默认交互模式
lumen

# 带初始提示
lumen "列出 src/ 下所有 .ts 文件"

# 非交互模式
lumen -p "重构这段代码"

# 使用本地 mimo
lumen --provider local-mimo --model mimo-v2.5-pro

# 从源码运行（开发时，推荐）
npx tsx packages/coding-agent/src/cli.ts

# 或直接用仓库脚本
./lumen-test.sh
# Windows PowerShell:
# .\lumen-test.ps1
```

`--tui` 已移除。现在直接启动就是唯一保留的 `pi-tui` 交互界面。

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

- `extensions/` - 项目扩展
- `prompts/` - 提示词模板
- `skills/` - 技能文件
- `themes/` - 主题
- `settings.json` - 项目设置
- `SYSTEM.md` - 自定义系统提示词
- `APPEND_SYSTEM.md` - 追加系统提示词

## 包结构

| 包 | 说明 |
|---|---|
| [packages/coding-agent](packages/coding-agent) | 交互式编程 agent CLI |
| [packages/agent](packages/agent) | Agent 运行时（tool calling、状态管理） |
| [packages/ai](packages/ai) | 统一多 provider LLM API |
| [packages/tui](packages/tui) | 终端 UI 库（差分渲染） |
| [packages/web-ui](packages/web-ui) | Web AI 聊天组件 |

## 开发

```bash
npm install
npm run check
```

## 上游同步

- `upstream` 只用于 `fetch` / `pull` / `merge` / `rebase`，不要推送
- `origin` 作为自己的 fork 远端，用于推送分支和主线

```bash
git fetch upstream
git checkout main
git merge upstream/main
git push origin main
```

如果在功能分支上工作，也先从 `upstream/main` 同步，再推到 `origin/<your-branch>`。默认约束不变：**不要向 `upstream` 执行 `push`**。

## 当前重点

- `interactive-mode` 核心进度面与 transcript 分层继续收口
- `todo` / `task` / `queue` / `banner` 语义继续统一
- `.lumen/` 配置面与本地模型工作流继续稳定化

## 上游

Fork from [earendil-works/pi-mono](https://github.com/earendil-works/pi-mono)

## License

MIT
