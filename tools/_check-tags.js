#!/usr/bin/env node
const fs = require('fs'), vm = require('vm'), path = require('path');
const c = { console }; vm.createContext(c);
['images.js', 'data.js'].forEach(f =>
  vm.runInContext(fs.readFileSync(path.join('prototype', f), 'utf8'), c));
const RULES = JSON.parse(vm.runInContext('JSON.stringify(REASON_TO_MEMORY)', c));
const MEMS = JSON.parse(vm.runInContext('JSON.stringify(MEMORIES)', c));

const noTag = Object.entries(RULES).filter(([, v]) => !v.pace && !v.avoid && !v.prefer).map(([k]) => k);
console.log(`规则总数 ${Object.keys(RULES).length}，其中无语义标签 ${noTag.length} 条：`);
noTag.forEach(k => console.log(`  ${k.padEnd(10)} → ${RULES[k].text}`));

const src = fs.readFileSync('prototype/data.js', 'utf8');
const lines = src.split('\n');
const re = /^\s*'([^']+)':\s*\{ text:/;
const missed = [];
lines.forEach((l, i) => {
  const m = l.match(re);
  if (m && !/pace:|avoid:|prefer:/.test(l)) missed.push(`${m[1]} (第 ${i + 1} 行)`);
});
console.log(`\n源码里仍只有 text/type 两字段的 ${missed.length} 条：${missed.join('、') || '无'}`);

const memNoTag = MEMS.filter(m => !m.pace && !m.avoid && !m.prefer);
console.log(`\n无语义标签的记忆 ${memNoTag.length} 条：`);
memNoTag.forEach(m => console.log(`  ${m.id} → ${m.text}`));
