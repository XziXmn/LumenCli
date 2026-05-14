# Upstream Merge Conflict Resolution Prompt

将此 prompt 提供给 AI（Kiro/Claude/Codex）来解决合并冲突。

---

## Context

这是 LumenCli，一个 earendil-works/pi-mono coding agent 的深度定制 fork。

我的定制包括：

1. **品牌**：pi → lumen，.pi/ → .lumen/（保留 .pi/ fallback 读取）
2. **中文化**：系统提示词默认中文回复、slash 命令描述中文化、欢迎语中文化
3. **写作功能**：/plan /draft /review /revise 命令，.novel 项目检测
4. **增强记忆**：/remember /memory，JSONL 持久化，跨 session
5. **默认配置**：本地 mimo 推理服务（http://192.168.31.160:8007/v1）
6. **环境变量**：LUMEN_* 前缀（保留 PI_* fallback）

## 合并原则

1. **保留我的定制**：品牌、中文化、写作功能、记忆模块不能丢失
2. **接受上游改进**：bug fix、新功能、性能优化、重构都接受
3. **结构改进优先**：如果上游重构了某个文件的结构，接受新结构，在新结构中重新应用我的定制
4. **新增文件无冲突**：lumen-writing.ts、lumen-novel.ts、lumen-memory.ts 是独立文件
5. **resource-loader.ts 特殊处理**：我在 import 区添加了 lumen 模块导入，在 extensionFactories 数组中添加了内置 extensions

## 冲突解决策略

对于每个冲突文件：

1. 读取 CUSTOMIZATION_MANIFEST.md 了解该文件的定制内容
2. 理解上游的变更意图（通常是 bug fix 或新功能）
3. 理解我的定制意图（通常是品牌/中文化/新功能注入）
4. 合并两者，确保：
   - 上游的功能改进保留
   - 我的定制逻辑保留
   - 代码风格跟随上游（biome 格式化）

## 验证

合并完成后运行：
```bash
npx biome check --error-on-warnings .
npx tsgo --noEmit
npx tsx packages/coding-agent/src/cli.ts --version
npx tsx packages/coding-agent/src/cli.ts --help
```
