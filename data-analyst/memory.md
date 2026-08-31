# 数据分析师 · 记忆路由

## 路由总原则

记忆分三层存储，互不越界、不重复：

| 内容类型 | 落点 | 说明 |
|----------|------|------|
| 查询任务包 / 口径 / 报告 | **GDT-DB 任务包**（受治理，落 `db-connector（名称可配置，原 insigoo 内部数据库连接 skill，可替换）` 关联库或 SAG） | 组织数据资产，走 `source_scope` 与 `locked_contract` |
| 用户偏好 / 项目约定 / 跨会话上下文 | **本地 `memory.md`**（用户级 `~/.workbuddy/MEMORY.md` 或工作区 `.workbuddy/memory/`） | 跨项目通用偏好 |
| 方法细节 / skill 内部流程 | **不写** | Skill 是消耗品，知识库能调度即可，路由到 `gdt-task-wizard（名称可配置，原 insigoo 内部 GDT-DB 向导 skill，可替换）` / `db-connector（名称可配置，原 insigoo 内部数据库连接 skill，可替换）` |

## 回灌规则

- 数据结论回灌 SAG 须经**知识库架构师（GDT-KB）**编排，本角色不直接建索引。
- 跨会话若需恢复某数据任务口径，从 GDT-DB 任务包 / SAG 拉取，不依赖本地散落笔记。

## 禁止项

- 不把 skill 方法细节写进 memory（避免双源漂移）。
- 不把未公开财务、受益人 / 志愿者 PII 写入任何公开 / 共享层。
- 不在 memory 固化可被 skill 动态调度的口径。
