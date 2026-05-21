# 规划体系重构设计

## 背景

Lumen 当前的规划信息分散在多层文档中：

- 当前活跃主线主要存在于 `docs/superpowers/plans/`
- 旧的 Phase 规划沉淀在 `docs/archive/fork-bootstrap/`
- 更早的 blueprint / spec / migration 路线沉淀在 `docs/archive/lumen-archive/Docs/`

这些文档各自都有价值，但现在已经出现两个问题：

1. 当前真源不清晰：总路线图、施工图、历史记录混在一起
2. 历史规划中的很多功能没有被重新提炼到现行主线中，导致“代码已经有能力，但规划入口看不出来”或“旧规划仍有价值，但没人知道该看哪里”

## 目标

重构后的规划体系要满足以下目标：

1. 用一份总路线图作为唯一总规划入口
2. 用一份能力矩阵承接历史规划中提到的所有重要功能
3. 把 `docs/superpowers/plans/` 收敛为专题施工图区，而不是项目总规划区
4. 明确保留 `.pi/` fallback 兼容层，不把兼容面误写成技术债或待删除项
5. 给新文档加入详细中文注解，避免只剩标题和列表

## 设计决策

### 1. 采用“单一总路线图 + 能力矩阵 + 专题子计划”

新规划体系分成三层：

- `docs/ROADMAP.md`
  - 唯一总路线图
  - 负责回答项目定位、当前状态、阶段路线、近期焦点和中长期方向
- `docs/CAPABILITY_MATRIX.md`
  - 功能账本
  - 负责把已完成、进行中、已规划、暂缓、已放弃的能力统一登记
- `docs/superpowers/plans/*.md`
  - 专题施工图
  - 只保留当前活跃且可执行的专项计划

### 2. 采用“混合型中文注解”

- `ROADMAP.md` 使用讲解型中文
  - 重点解释为什么要这样分阶段、当前优先级如何形成、每个阶段解决什么问题
- `CAPABILITY_MATRIX.md` 使用矩阵 + 简洁中文注解
  - 保持可查阅性，但每项都提供足够语义
- `PLANNING_RULES.md` 使用规则型中文
  - 短、硬、明确，负责治理未来文档增量

### 3. 废弃旧的历史 Phase 编号

以下命名不再作为当前主线：

- `Phase 1/2/3/4`
- `Phase 3A/3B/3C...`
- `S1.5/S2.0`

原因：

- 这些编号强绑定历史上下文，已经无法准确表达当前仓库状态
- 当前很多能力跨越多轮实现，继续沿用旧编号只会增加误导

### 4. 改用能力导向的 Stage 命名

新的阶段命名为：

- `Stage A — Runtime & Compatibility`
- `Stage B — Interactive Surface`
- `Stage C — Workflow Tools`
- `Stage D — Context & Memory`
- `Stage E — Agentic Execution`
- `Stage F — Model & Ecosystem`
- `Stage G — Governance & Upstream`

这些 Stage 与能力矩阵一一对应，便于长期维护。

## 文档落地方案

### 新建文件

1. `docs/ROADMAP.md`
2. `docs/CAPABILITY_MATRIX.md`
3. `docs/PLANNING_RULES.md`

### 需要重写的入口

1. `docs/README.md`
2. `docs/superpowers/plans/2026-05-20-core-progress-surface-plan.md`
3. `docs/superpowers/plans/2026-05-20-claude-aligned-progress-workflow-plan.md`

### 需要降级说明的旧文档

1. `docs/archive/fork-bootstrap/design.md`
2. `docs/archive/fork-bootstrap/requirements.md`
3. `docs/archive/fork-bootstrap/tasks.md`
4. 其他 archive 文档通过目录级 `README` 和新入口文档统一降级，不逐份重写

## 实施范围

本次只重构规划文档体系，不做以下事情：

1. 不调整已有功能的实现代码
2. 不重写分析类专题文档，如 Claude UI 样式分析文档
3. 不删除 `.pi/` 兼容层，也不改变 `.pi/` 的 fallback 读取逻辑
4. 不把 package 级正式文档整体去 Pi 化

## 验证方式

文档落地后应满足：

1. `docs/README.md` 能明确指向新的总规划真源
2. `ROADMAP.md` 能读出当前主线、阶段路线和约束
3. `CAPABILITY_MATRIX.md` 能覆盖历史规划中重要功能，不再遗漏已完成或仍待推进的能力
4. 活跃专题计划能明确自己属于哪个 Stage，不再扮演总路线图
5. 旧规划文档仍可追溯，但不会与当前真源竞争

## 备注

根据仓库规则与当前用户要求，本次只写文档，不提交 commit。
