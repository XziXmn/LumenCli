# LumenCli

基于 [Pi](https://github.com/earendil-works/pi-mono) 的个人增强版 agent runtime / terminal harness，并选择性融合 [oh-my-pi](https://github.com/can1357/oh-my-pi) 的补充功能。

## 当前状态

- 主线交互实现集中在 `packages/coding-agent/src/modes/interactive/`
- 输入框上方任务栏是唯一主动进度面，`todo` / `task` 在 transcript 中只保留语义痕迹
- `.lumen/` 是首选配置目录，`.pi/` 仅作为旧配置迁移来源
- 功能策略上以 `pi` 兼容为基础，按需吸收 `oh-my-pi` 的增强能力，但避免偏离 `pi` 主线过远，确保后续仍能相对顺畅地同步上游更新

## 新定位

Lumen 当前不再把自己定义为“未来最终产品界面”，而是更明确地收口为：

- **runtime / adapter**：承载模型接入、tools、skills、memory、session、宿主适配与本地工作流能力
- **临时启动界面**：当前保留的 `TUI` 用于启动、调试、验证能力和日常终端使用，不承担最终产品形态
- **前台能力来源**：后续写作辅助、陪伴型助手和其他产品前台应复用 Lumen runtime，而不是继续把终端界面当最终主战场

按这个定位，Lumen 的终端界面后续重点会收口到：

- 当前 `interactive-mode` 主线继续稳定化
- 更彻底的中文化
- 输入框底部状态栏与被动状态信息优化

而更具体的产品能力，尤其是 `Obsidian` 写作辅助，应当在独立宿主 / 前台中生长。

## 特性

- **中文优先**：系统提示词默认中文回复，slash 命令描述中文化
- **模型可替换**：运行时模型不定死；当前仓库里的本地 `mimo` 配置只是为了便于联调和测试而保留的临时默认示例
- **Pi 全功能继承**：保留 Pi 原生 tools、extensions、themes、skills 能力
- **oh-my-pi 增强吸收**：将 `oh-my-pi` 视为 `pi` 的功能补充来源，按需移植稳定且有价值的增强能力
- **社区兼容**：可从旧 `.pi/` 目录迁移配置与插件资产到 `.lumen/`

## 文档导航

- [docs/README.md](docs/README.md)：Lumen 根文档索引，包含当前计划、分析报告、历史归档的入口
- [docs/FEATURE_OVERVIEW.md](docs/FEATURE_OVERVIEW.md)：白话版功能总览，适合快速看“已经做了什么、还缺什么”
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

# 使用本地 mimo（当前仅作便于测试的默认示例）
lumen --provider local-mimo --model mimo-v2.5-pro

# 从源码运行（开发时，推荐）
npx tsx packages/coding-agent/src/cli.ts

# 或直接用仓库脚本
./lumen-test.sh
# Windows PowerShell:
# .\lumen-test.ps1

# Windows 中文输入法 / progress surface 手工验证
# .\ime-progress-surface-debug.ps1
```

手工验证说明见 [docs/ime-manual-check.md](docs/ime-manual-check.md)。

如果启动时提示插件、扩展或 skill 兼容性问题，可以在交互模式里运行 `/compat` 查看当前诊断；修完后运行 `/reload` 重新检查。如果仍不兼容，再移除对应插件或 skill。

`--tui` 已移除。现在直接启动就是唯一保留的 `pi-tui` 交互界面。

## 配置

配置目录：`~/.lumen/agent/`

### 本地 mimo 推理服务

说明：`mimo` 不是写死的唯一模型，只是当前仓库为了方便本地验证和测试保留的临时默认配置。实际使用时可以自由切换到其他 provider / model，或改写 `models.json` 与 preset。

将 `.lumen/default-models.json` 复制到 `~/.lumen/agent/models.json`：

```bash
mkdir -p ~/.lumen/agent
cp .lumen/default-models.json ~/.lumen/agent/models.json
```

### 项目级配置

项目根目录下 `.lumen/` 目录：

- `extensions/` - 项目扩展
- `prompts/` - 提示词模板
- `skills/` - 技能文件
- `themes/` - 主题
- `settings.json` - 项目设置
- `SYSTEM.md` - 自定义系统提示词
- `APPEND_SYSTEM.md` - 追加系统提示词

如果你以前用的是 Pi，可以把旧 `.pi/` 里的相应文件手动迁移到 `.lumen/`，新版本不再把 `.pi/` 当运行时读取目标。

## 包结构

| 包 | 说明 |
|---|---|
| [packages/coding-agent](packages/coding-agent) | 当前运行时主入口与临时终端启动界面 |
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
- 将 `LumenAgent = runtime + adapter`、`TUI = 临时启动界面` 这条定位持续收口到文档和代码边界

## 上游

Fork from [earendil-works/pi-mono](https://github.com/earendil-works/pi-mono)

## License

MIT
