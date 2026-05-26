# `.lumen` 插件安装后自动评估方案

日期：2026-05-24

## 目标

实现这件事：

- 用户安装了一个新插件或新包
- 当次安装先做一次即时兼容审计
- **下一次启动时**，系统还会自动再跑一次评估
- 如果发现它是 legacy Pi 插件、oh-my-pi 依赖插件、或需要 AI 适配的插件，要主动提示

这件事的重点不是“再打印一次同样的话”，而是把“插件兼容状态”变成一个稳定可追踪的启动流程。

## 当前现状

现在已经有的能力：

1. `installAndPersist()` 之后会跑一次兼容审计
2. 审计结果可以区分：
   - `direct`
   - `light-adapt`
   - `needs-ai-review`
3. CLI 安装命令会即时打印结果

当前缺的部分：

1. 兼容审计结果没有持久化
2. 下次启动时不会自动重新检查
3. 用户如果装完包当时没看终端输出，后面就丢了

## 推荐方案

推荐做法：**增加一个插件兼容评估状态文件**

位置建议：

- 用户级：`~/.lumen/agent/plugin-compat-state.json`
- 项目级：`<cwd>/.lumen/plugin-compat-state.json`

按 scope 分开管理，不混在一起。

## 状态文件职责

状态文件至少记录：

1. 最近安装过、需要下次启动复评估的 source
2. 上次评估结果
3. 上次评估时间
4. 当前安装路径
5. 当前 package.json 指纹（mtime 或 hash）

这样可以解决两个问题：

- 只在插件变化时重新评估，不会每次启动都刷屏
- 能判断“这个插件后来被更新了，旧结论该失效”

## 启动时行为

启动时建议流程：

1. 读取用户级和项目级 compat state
2. 找出：
   - `pending` 的插件
   - 或者 package 指纹已变化的插件
3. 对这些插件重新跑兼容审计
4. 汇总结果
5. 在 interactive 启动时显示一条总提示
6. 对 `needs-ai-review` 给出更明确的后续指引

## UI 呈现建议

interactive 启动时不建议刷很多行。

推荐先收成一条汇总消息，例如：

- `Detected 2 newly installed plugins that were compatibility-checked.`
- `1 plugin is directly usable; 1 plugin needs AI-assisted adaptation.`

如果有高风险插件，再给一条更具体的说明，例如：

- `Plugin npm:@oh-my-pi/foo needs AI-assisted adaptation. Use the pi-config-migration skill.`

非 interactive 模式：

- 不强行提示
- 但可以在日志/diagnostic 中保留

## 为什么不建议只靠 install 时一次性输出

因为 install 不是唯一入口：

1. 用户可能手动改 settings
2. 用户可能 git pull 到新的 project package 配置
3. 已安装包的内容可能变了
4. 启动时的 runtime 检查才是真正离“会不会出问题”最近的位置

## 插件化可行性

这件事**不适合纯插件做**。

原因：

1. 插件兼容评估入口本身发生在 resource/runtime 建立之前
2. 如果等扩展系统起来后再检查，已经太晚了
3. 它本质上更接近 startup bootstrap / package manager 范畴

结论：

- 这件事更适合做在 **core + startup path**
- 但兼容规则本身可以继续复用现有 package audit 逻辑

## 推荐最小实现路径

### 第一步

在 `package-manager` 中补一个可持久化的 compat state 读写器：

- 记录 `pendingReevaluation`
- 记录 `lastAudit`

### 第二步

在 `installAndPersist()` 后：

- 写入 compat state
- 标记该 source 需要下次启动复评估

### 第三步

在 `main.ts` startup path：

- 在 interactive runtime 建立前读取 compat state
- 跑 reevaluation
- 生成一条 `startupCompatibilityMessage`
- 传给 `InteractiveMode`

### 第四步

在 `InteractiveMode` 启动时展示：

- legacy import message
- plugin compatibility reevaluation message

这两类都属于 startup 信息，可以并列存在

## 验收标准

完成后应满足：

1. 新装插件后，会留下待复评估状态
2. 下次 interactive 启动会自动做一次兼容评估
3. 没变化的插件不会每次反复提示
4. 高风险插件会明确提示走 `pi-config-migration` skill
5. 不重新引入 `.pi` runtime fallback

## 对主目标的意义

这项能力是“继续稳定 `.lumen` 配置与旧插件兼容”的直接组成部分。

它会把目前的一次性审计，升级成真正可持续的启动期兼容检查流程。这样旧 Pi 用户迁移过来后，插件兼容问题不会只在安装瞬间出现一次，而是变成有状态、可追踪、可提示的系统行为。
