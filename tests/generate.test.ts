// agents/tests/generate.test.ts
// 零依赖集成测试：验证 generate.mjs 的解析与生成逻辑（与 insigoo-os 既有
// `node --test --experimental-strip-types` 测试风格对齐）。
//
// 运行：node --test --experimental-strip-types agents/tests/generate.test.ts
// 或：  npm test   （从项目根目录，递归发现所有 *.test.ts）

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseFrontmatter,
  parseSkills,
  extractSection,
  stripH1,
  generateCordisPreset,
  generatePresetMeta,
  generateAgentsMd,
  AGENTS_DIR,
} from '../generate.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// 读取真实角色四件套（纯只读，不写文件），供集成断言
function readRole(roleName) {
  const dir = join(AGENTS_DIR, roleName);
  const pick = (k) => {
    const p = join(dir, `${k}.md`);
    return existsSync(p) ? readFileSync(p, 'utf8') : '';
  };
  return { agent: pick('agent'), soul: pick('soul'), memory: pick('memory'), collab: pick('collab') };
}

// 本仓库仅承载 4 个内部角色（知识库架构师独立开源于 insigoo-knowledge-architect）
const ALL_ROLES = ['orchestrator', 'data-analyst', 'sia-diagnostic', 'course-developer'];

test('parseFrontmatter 解析 name/display/harness/skill_ref/role', () => {
  const fm = parseFrontmatter(readRole('data-analyst').agent);
  assert.equal(fm.name, 'insigoo-data-analyst');
  assert.equal(fm.display, '数据分析师');
  assert.match(fm.harness, /dsh/);
  assert.match(fm.skill_ref, /gdt-task-wizard/);
});

test('parseFrontmatter orchestrator 标记为 main', () => {
  const fm = parseFrontmatter(readRole('orchestrator').agent);
  assert.equal(fm.name, 'insigoo-orchestrator');
  assert.equal(fm.role, 'main');
});

test('parseSkills 处理中/英逗号与空值', () => {
  assert.deepEqual(parseSkills('a，b,c'), ['a', 'b', 'c']);
  assert.deepEqual(parseSkills(''), []);
  assert.deepEqual(parseSkills(undefined), []);
});

test('extractSection 提取 ## 章节', () => {
  const md = readRole('data-analyst').collab;
  const sec = extractSection(md, '角色定位');
  assert.match(sec, /数据基础设施/);
});

test('stripH1 去掉一级标题', () => {
  const soul = readRole('data-analyst').soul;
  assert.doesNotMatch(stripH1(soul), /^# /);
});

test('generateCordisPreset 产出真实 dsh preset 组合（persona + tool 行）', () => {
  const files = readRole('data-analyst');
  const yaml = generateCordisPreset('data-analyst', files, false);
  // persona 行（含 dsh 真实包名 + 运行时占位）
  assert.match(yaml, /- id: persona/);
  assert.match(yaml, /@deepseek-ai\/dsh-persona/);
  assert.match(yaml, /\{\{model\}\}/);
  assert.match(yaml, /\{\{cwd\}\}/);
  // 基础工具行（真实包名）
  assert.match(yaml, /@deepseek-ai\/dsh-tool-fs/);
  assert.match(yaml, /@deepseek-ai\/dsh-tool-fs-search/);
  assert.match(yaml, /@deepseek-ai\/dsh-tool-skill/);
  assert.match(yaml, /@deepseek-ai\/dsh-skill-filesystem/);
  // Windows 平台禁用判定
  assert.match(yaml, /disabled: !!js process\.platform/);
});

test('generateCordisPreset 仅 orchestrator(isMain) 挂载 subagent 工具', () => {
  const sub = generateCordisPreset('data-analyst', readRole('data-analyst'), false);
  assert.doesNotMatch(sub, /@deepseek-ai\/dsh-tool-subagent/);
  const main = generateCordisPreset('orchestrator', readRole('orchestrator'), true);
  assert.match(main, /@deepseek-ai\/dsh-tool-subagent/);
  assert.match(main, /provider: "spawn"/);
});

test('generatePresetMeta 产出 name/description/order 展示元数据', () => {
  const yaml = generatePresetMeta('data-analyst', readRole('data-analyst'), 2);
  assert.match(yaml, /^name: 数据分析师/m);
  assert.match(yaml, /^description: /m);
  assert.match(yaml, /^order: 2/m);
});

test('generateAgentsMd 聚合全部 4 个角色定位', () => {
  const roles = ALL_ROLES.map((name) => {
    const files = readRole(name);
    const fm = parseFrontmatter(files.agent);
    return { name, files, isMain: (fm.role || 'sub') === 'main', order: 0 };
  });
  const md = generateAgentsMd(roles);
  assert.match(md, /总编排（名称可配置）/);
  assert.match(md, /数据分析师/);
  assert.match(md, /SIA 诊断/);
  assert.match(md, /课程开发/);
  // 角色总览表含类型列
  assert.match(md, /\| 角色 \| 定位 \| 主技能 \| 类型 \|/);
  // orchestrator 标记为 main
  assert.match(md, /\| 总编排（名称可配置） \|.*\| main \|/);
});
