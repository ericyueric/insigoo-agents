# insigoo-agents

> insigoo OS 标准 Agent 角色配置（开源版，MIT）。主选 harness = **dsh**（MIT + Cordis `Service`），Codex app-server 作备选 / 逃逸舱。

本仓库定义 harness 之上的「标准 agent 角色」——人类可读、可审计、可映射到 dsh Agent Preset 的角色配置。每个角色一个子目录，含四个文件（**四件套**）：

| 文件 | 职责 | 不做什么 |
|------|------|---------|
| `agent.md` | 身份声明、权限边界、skill 加载约定、session 隔离 | 不写建库 / 编译步骤 |
| `soul.md` | 人格、价值观、行为纪律 | 不写方法细节 |
| `memory.md` | 跨会话记忆路由 | 不写 skill 方法 |
| `collab.md` | 与其他 agent 的协作边界、交接协议 | 不定义底层能力 |

## TL;DR

insigoo OS 不自研 harness 内核，但需要在 harness 之上定义**标准 agent 角色**。本仓库承载其中 **4 个内部角色**（通用化、不绑定 insigoo 内部业务）：

| 角色目录 | 角色 | 主技能（可替换） | 类型 |
|----------|------|------------------|------|
| `orchestrator/` | 总编排（名称可配置） | `agent-core`（原 insigoo 内部调度技能，可替换） | **main**（入口，调度其余角色） |
| `data-analyst/` | 数据分析师 | `gdt-task-wizard`（原 insigoo 内部 GDT-DB 向导）+ `db-connector`（原内部数据库连接，可替换） | sub |
| `sia-diagnostic/` | SIA 诊断 | `insigoo-sia`@2.0.0（开源 SIA 标准） | sub |
| `course-developer/` | 课程开发 | `course-dev`（可替换） | sub |

> 第 5 个角色「知识库架构师」已独立开源于 [`insigoo-knowledge-architect`](https://github.com/ericyueric/insigoo-knowledge-architect)（含 `insigoo-memory` / `insigoo-knowledge-base` / `insigoo-sag` 主技能），本仓库不重复承载。

## 分层原则（铁律）

**人格层（md）↔ 能力层（SKILL.md）↔ 知识层（SAG）**，三层互不重复：

- **不重复方法**：harness md 只写「约束兜底 + 路由 + 人格」，方法细节全部引用 skill。绝不把 schema / 通信协议搬进 md。
- **消耗品**：Skill 是消耗品，知识库能调度即可，md 不固化方法流程。
- **治理优先**：所有结论可溯到受治理语料与 `locked_contract`。

## 与 dsh 的映射（真实 preset 机制）

dsh 是 Cordis 装配系统。一个 **preset = 一个目录**，含 `agent.cordis.yml`（composition，顶层 cordis 插件行数组）+ 可选 `preset.yml`（仅展示元数据）；**preset id = 目录名**（须 `^[a-z0-9][a-z0-9-]*$`，本目录角色名均已符合）。多 agent 靠 main agent（orchestrator）用 `dsh-tool-subagent` **动态 spawn 子代理预设**——正是「main spawn sub」架构。本规范的 md 是人类可读源，由生成器编译为：

| 本规范文件 | 映射到 dsh |
|-----------|-----------|
| `agent.md` + `soul.md` + `memory.md` | 角色目录 `agent.cordis.yml` 的 `persona` 文本（身份 + 人格 + 记忆路由 + 边界指针） |
| `agent.md` 的 skill 加载清单 | 角色目录 `agent.cordis.yml` 的 skill 行（`dsh-skill-filesystem` + `dsh-tool-skill`） |
| `collab.md` | 顶层 `AGENTS.md` 的多 agent 协作约定段 |
| 四角色集合 | dsh **preset root** 下的 4 个 preset 目录（orchestrator=main 含 subagent 工具，其余 sub） |

## 生成器（generate.mjs）

零依赖 Node 脚本，把四件套编译成 dsh 真实 preset 格式（与 dsh 包内 `config/agent-presets/standard/agent.cordis.yml` 同构，cordis 行 name 用真实 `@deepseek-ai/dsh-*` 包名，无 TODO 占位）：

```bash
node generate.mjs
```

产出：
- 每个角色目录 **`agent.cordis.yml`** — dsh agent-preset composition（persona 文本 + 工具 / 技能 cordis 行）
- 每个角色目录 **`preset.yml`** — 展示元数据（name/description/order），仅展示
- 顶层 **`AGENTS.md`** — dsh 工作区级多 Agent 协作指令（聚合各角色 `collab.md`）

测试（零依赖）：

```bash
node --test
```

> 本目录所有 `.md` 是**人类可读源**，生成器只做「源 → dsh preset」的单向编译。改角色请改四件套 `.md` 后重跑 `node generate.mjs`，勿手改 `agent.cordis.yml` / `preset.yml`。

## 非破坏接入真实 dsh

dsh 通过 **preset root** 发现 preset：把角色目录（含 `agent.cordis.yml` + `preset.yml`）放到 dsh 可发现的 preset root 下，启动即出现在 Agent Preset 选择器。**不碰 `~/.dsh` 生产数据**。

**方式 B · user root（最简）**
```bash
# dsh 每个实例自动把 <dshHome>/.agent-presets 作为 user-trust preset root 扫描
cp -r <repo>/agents/{orchestrator,data-analyst,sia-diagnostic,course-developer} ~/.dsh/.agent-presets/
dsh --profile web     # 选择器出现这 4 个预设（trust=user）
```

**方式 A · 独立自定义 profile（隔离生产）**
```bash
mkdir -p my-insigoo-profile/presets && cd my-insigoo-profile
cp -r <repo>/agents/{orchestrator,data-analyst,sia-diagnostic,course-developer} presets/
# 写 profile 清单：参考 ~/.dsh/profiles/web/package.json 的 dsh.profile.bundles（引用 @deepseek-ai/dsh-base 等）
# + cordis.patch.yml 把 presets/ 注册为额外 preset root
dsh --profile ./my-insigoo-profile web
```

## 相关开源仓库

- [insigoo-knowledge-architect](https://github.com/ericyueric/insigoo-knowledge-architect) — 第 5 个角色「知识库架构师」独立仓库（含 `insigoo-memory` / `insigoo-knowledge-base` / `insigoo-sag` 主技能）。
- [insigoo-memory](https://github.com/ericyueric/insigoo-memory) — 组织记忆 / 知识库建设主技能（KA 主技能）。
- [insigoo-knowledge-base](https://github.com/ericyueric/insigoo-knowledge-base) — 组织知识库建设标准（LLM Wiki 三层索引 + GDT v1.1，通用版）。

## License

[MIT](./LICENSE) © 2026 insigoo（因思阁）
