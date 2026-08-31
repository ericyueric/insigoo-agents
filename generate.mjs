#!/usr/bin/env node
// agents/generate.mjs
// 扫描 agents/*/ 下标准 agent 角色四件套（agent.md/soul.md/memory.md/collab.md），
// 为每个角色生成对齐 dsh 真实 preset 机制（已对 ~/.dsh 安装核实）的产物：
//   1) agent.cordis.yml — dsh agent-preset 组合文件（顶层 cordis 插件行数组）
//   2) preset.yml       — 展示元数据（name/description/order），仅展示用
// 聚合：
//   3) AGENTS.md        — dsh 工作区级多 Agent 协作指令
//
// dsh 真实机制（权威来源：~/.dsh 安装 + 包内 config/agent-presets/standard/agent.cordis.yml）：
//   - 一个 preset = 一个目录，含 agent.cordis.yml（composition，顶层 cordis 插件行数组）
//     + 可选 preset.yml（仅 name/description/order 展示元数据）
//   - preset id = 目录名，须匹配 ^[a-z0-9][a-z0-9-]*$（knowledge-architect 等均符合）
//   - 多 agent = 主 agent(orchestrator) 用 dsh-tool-subagent 动态 spawn 子代理，
//     子代理 join 父的 standing composition（正是「main spawn sub」架构）
//   - 非破坏接入：把本目录(或其中角色)作为 dsh preset root，dsh 自动发现，不碰 ~/.dsh 生产数据
//
// 零依赖：仅 Node 内置。YAML 手写序列化。cordis 行 name 用真实包名
//（@deepseek-ai/dsh-*，从 standard preset 实证），不写 TODO 占位。
//
// 导出纯函数供测试导入；main() 仅在被直接执行时运行（import.meta.url 判定）。
// 生成：node agents/generate.mjs
// 测试：node --test --experimental-strip-types agents/tests/generate.test.ts

import { readFileSync, readdirSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const AGENTS_DIR = __dirname;

// 解析 markdown frontmatter（agent.md 顶部 --- ... ---）
export function parseFrontmatter(md) {
  md = md.replace(/\r\n/g, '\n'); // 归一化 CRLF（Windows 行尾）为 LF，避免正则只认 \n 致 frontmatter 解析失败
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const fm = {};
  for (const line of m[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const k = line.slice(0, idx).trim();
    let v = line.slice(idx + 1).trim();
    v = v.replace(/^["']|["']$/g, ''); // 去引号
    fm[k] = v;
  }
  return fm;
}

// skill_ref 逗号分隔（中/英逗号）→ 数组
export function parseSkills(ref) {
  if (!ref) return [];
  return ref.split(/[，,]/).map((s) => s.trim()).filter(Boolean);
}

// 提取 markdown 中某 ## 章节文本（到下一个 ## 之前）
export function extractSection(md, heading) {
  const re = new RegExp(`##\\s+${heading}[\\s\\S]*?(?=\\n##\\s|$)`);
  const m = md.match(re);
  return m ? m[0].trim() : '';
}

// 去掉 markdown 一级标题行（用于 persona 块）
export function stripH1(md) {
  return md.replace(/^#\s+.*\n/, '').trim();
}

export function readRole(roleDir) {
  const files = {
    agent: join(roleDir, 'agent.md'),
    soul: join(roleDir, 'soul.md'),
    memory: join(roleDir, 'memory.md'),
    collab: join(roleDir, 'collab.md'),
  };
  const out = {};
  for (const [k, p] of Object.entries(files)) {
    out[k] = existsSync(p) ? readFileSync(p, 'utf8') : '';
  }
  return out;
}

// YAML 块标量（|），内容统一缩进 indent 空格
function yamlBlock(text, indent = 6) {
  const safe = (text || '(见对应 .md)').trim();
  return safe.split('\n').map((l) => ' '.repeat(indent) + l).join('\n');
}

// 组装 persona 文本（身份 + 人格 + 记忆路由 + 边界指针）
function assemblePersona(display, name, files) {
  const identity = extractSection(files.agent, '我是谁').replace(/^##\s+我是谁\s*\n/, '').trim();
  const soul = stripH1(files.soul);
  const memory = stripH1(files.memory);
  return [
    `你是 ${display}（${name}），insigoo OS 的标准 agent 角色，由 dsh 以模型 {{model}} 运行于工作目录 {{cwd}}。`,
    '',
    '## 身份',
    identity,
    '',
    '## 人格',
    soul,
    '',
    '## 跨会话记忆路由',
    memory,
    '',
    '## 协作边界',
    '完整协作边界矩阵见本角色 collab.md；核心能力方法见对应 SKILL.md（如 insigoo-memory），本 persona 不重复方法细节。',
  ].join('\n');
}

// ---- dsh cordis 插件行定义（真实包名，源自 standard/agent.cordis.yml）----
const BASE_TOOL_ROWS = [
  { id: 'tool-fs', name: '@deepseek-ai/dsh-tool-fs' },
  { id: 'tool-fs-search', name: '@deepseek-ai/dsh-tool-fs-search', config: { sampleOverCapGlobResults: false } },
  { id: 'tool-jobs', name: '@deepseek-ai/dsh-tool-jobs' },
  { id: 'tool-ask-user', name: '@deepseek-ai/dsh-tool-ask-user' },
  { id: 'tool-todo', name: '@deepseek-ai/dsh-tool-todo', config: { allowParallelInProgress: true } },
  { id: 'tool-web', name: '@deepseek-ai/dsh-tool-web', config: { fetch: false, searchTimeoutMs: 60000 } },
];
// Windows 平台：pwsh 启用、bash 禁用（与 standard preset 一致）
const WINDOWS_ROWS = [
  { id: 'tool-pwsh', name: '@deepseek-ai/dsh-tool-pwsh', disabledIf: "process.platform !== 'win32'" },
  { id: 'tool-bash', name: '@deepseek-ai/dsh-tool-bash', disabledIf: "process.platform === 'win32'" },
];
// 仅总编排(orchestrator)挂载：委托/子代理能力（spawn 其他角色预设）
const SUBAGENT_ROWS = [
  { id: 'tool-subagent', name: '@deepseek-ai/dsh-tool-subagent', config: { provider: 'spawn', toolName: 'subagent', backgroundMode: 'continuable' } },
  { id: 'tool-subagent-control', name: '@deepseek-ai/dsh-tool-subagent-control' },
  { id: 'tool-subagent-list-agents', name: '@deepseek-ai/dsh-tool-subagent-control/list-agents' },
];
// skills：文件系统发现 + 工具目录（dsh-skill 插件加载 insigoo 的 skill）
const SKILL_ROWS = [
  { id: 'skill-filesystem', name: '@deepseek-ai/dsh-skill-filesystem' },
  { id: 'tool-skill', name: '@deepseek-ai/dsh-tool-skill' },
];

// 序列化一条普通 cordis 行（不含 persona，persona 单独处理块标量）
function serRow(r) {
  const lines = [`- id: ${r.id}`, `  name: '${r.name}'`];
  if (r.disabledIf) lines.push(`  disabled: !!js ${r.disabledIf}`);
  if (r.config) {
    lines.push('  config:');
    for (const [k, v] of Object.entries(r.config)) lines.push(`    ${k}: ${JSON.stringify(v)}`);
  }
  return lines.join('\n');
}

// 1) dsh-native agent-preset composition（agent.cordis.yml）
export function generateCordisPreset(roleName, files, isMain) {
  const fm = parseFrontmatter(files.agent);
  const name = fm.name || roleName;
  const display = fm.display || roleName;
  const personaText = assemblePersona(display, name, files);

  const rows = [];
  rows.push({ id: 'agent-instructions', name: '@deepseek-ai/dsh-agent-instructions', config: { maxBytes: 65536 } });
  for (const r of BASE_TOOL_ROWS) rows.push(r);
  for (const r of WINDOWS_ROWS) rows.push(r);
  if (isMain) for (const r of SUBAGENT_ROWS) rows.push(r);
  for (const r of SKILL_ROWS) rows.push(r);

  const header = `# Generated by agents/generate.mjs — dsh agent-preset composition (agent.cordis.yml)
# 真实 dsh preset 机制：一个 preset = 目录含 agent.cordis.yml(+preset.yml)。
# preset id = 目录名(${roleName})，须 ^[a-z0-9][a-z0-9-]*$。把本目录作为 dsh preset root 即被发现。
# persona 文本 shadow 部署默认；{{model}}/{{cwd}} 由 dsh 运行时替换。
# 方法细节见对应 SKILL.md，本文件只放置身份/人格/记忆路由/边界指针。`;

  const personaBlock = [
    '- id: persona',
    "  name: '@deepseek-ai/dsh-persona'",
    '  config:',
    '    text: |',
    yamlBlock(personaText, 6),
  ].join('\n');

  const body = rows.map(serRow).join('\n');
  return `${header}\n${personaBlock}\n${body}\n`;
}

// 2) dsh preset 展示元数据（preset.yml，仅 name/description/order）
export function generatePresetMeta(roleName, files, order) {
  const fm = parseFrontmatter(files.agent);
  const display = fm.display || roleName;
  const identityLine = extractSection(files.agent, '我是谁')
    .replace(/^##\s+我是谁\s*\n/, '')
    .trim()
    .split('\n')
    .find((l) => l.trim() && !l.startsWith('#')) || display;
  const desc = identityLine.slice(0, 80).replace(/\n/g, ' ');
  return `# Generated by agents/generate.mjs — dsh preset 展示元数据（preset.yml）
# 仅展示文本；id 由目录名决定、trust 由 preset root 决定，二者此处不可写。
name: ${display}
description: ${desc}
order: ${order}
`;
}

// 3) 聚合生成 AGENTS.md（dsh 工作区级多 Agent 协作指令）
export function generateAgentsMd(roles) {
  const lines = [];
  lines.push('# insigoo OS · 多 Agent 协作约定（AGENTS.md）');
  lines.push('');
  lines.push('> 本文件由 `agents/generate.mjs` 聚合各角色 `collab.md` 自动生成。dsh 会加载工作区里的 `AGENTS.md` 让 Agent 了解项目约定。');
  lines.push('');
  lines.push('## 角色总览');
  lines.push('');
  lines.push('| 角色 | 定位 | 主技能 | 类型 |');
  lines.push('|------|------|--------|------|');
  for (const r of roles) {
    const fm = parseFrontmatter(r.files.agent);
    const roleLine = extractSection(r.files.collab, '角色定位');
    const locLine = roleLine.split('\n').find((l) => l.trim() && !l.startsWith('##')) || '-';
    const loc = locLine.replace(/\*\*/g, '').trim();
    lines.push(`| ${fm.display || r.name} | ${loc} | ${fm.skill_ref || '-'} | ${fm.role || 'sub'} |`);
  }
  lines.push('');
  lines.push('## 协作边界（节选自各角色 collab.md）');
  lines.push('');
  for (const r of roles) {
    const fm = parseFrontmatter(r.files.agent);
    lines.push(`### ${fm.display || r.name}（${fm.name || r.name}）`);
    lines.push('');
    const matrix = extractSection(r.files.collab, '协作边界矩阵');
    lines.push(matrix || '(无)');
    lines.push('');
  }
  return lines.join('\n');
}

// 上一轮错误假设期产物，重写时清理
const LEGACY_FILES = ['agent.yaml', 'preset.dsh.yaml', 'cordis.profile.yml', 'harness.sample.yaml'];

export function main() {
  // 清理旧产物（错误假设期生成）
  for (const dir of readdirSync(AGENTS_DIR, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    for (const f of LEGACY_FILES) {
      const p = join(AGENTS_DIR, dir.name, f);
      if (existsSync(p)) { unlinkSync(p); console.log(`✗ removed legacy ${p}`); }
    }
  }
  for (const f of LEGACY_FILES) {
    const p = join(AGENTS_DIR, f);
    if (existsSync(p)) { unlinkSync(p); console.log(`✗ removed legacy ${p}`); }
  }

  const entries = readdirSync(AGENTS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(AGENTS_DIR, e.name, 'agent.md')))
    .map((e) => e.name);

  const roles = [];
  let subOrder = 1;
  for (const name of entries) {
    const roleDir = join(AGENTS_DIR, name);
    const files = readRole(roleDir);
    const fm = parseFrontmatter(files.agent);
    const isMain = (fm.role || 'sub') === 'main';
    const order = isMain ? 0 : subOrder++;
    roles.push({ name, files, isMain, order });
    writeFileSync(join(roleDir, 'agent.cordis.yml'), generateCordisPreset(name, files, isMain), 'utf8');
    console.log(`✓ generated ${join(roleDir, 'agent.cordis.yml')}`);
    writeFileSync(join(roleDir, 'preset.yml'), generatePresetMeta(name, files, order), 'utf8');
    console.log(`✓ generated ${join(roleDir, 'preset.yml')}`);
  }

  writeFileSync(join(AGENTS_DIR, 'AGENTS.md'), generateAgentsMd(roles), 'utf8');
  console.log(`✓ generated ${join(AGENTS_DIR, 'AGENTS.md')}`);

  console.log(`\nDone. ${roles.length} roles → agent.cordis.yml + preset.yml + AGENTS.md（已清理旧 agent.yaml/cordis.profile.yml 等）`);
}

// 仅在被直接执行时运行（被测试 import 时不触发写文件）
const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (invoked === import.meta.url) {
  main();
}
