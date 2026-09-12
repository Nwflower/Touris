#!/usr/bin/env node
/* 一次性脚本：给 prototype/data.js 的 MEMORIES 与 REASON_TO_MEMORY 补语义标签。
   跑完即删。 */
const fs = require('fs');
const p = 'prototype/data.js';
let s = fs.readFileSync(p, 'utf8');
const before = s.length;

/* 记忆 id → 语义标签。空对象 = 这条记忆无法表达成可执行的约束（如实留空）。 */
const MEM = {
  m01: { pace: 'slow' },
  m02: { prefer: ['market'] },
  m03: { avoid: ['museum'] },
  m04: { pace: 'slow' },
  m05: { prefer: ['old-town'], avoid: ['mall'] },
  m06: { prefer: ['dessert'] },
  m07: { avoid: ['queue', 'crowd'] },
  m08: { prefer: ['bamboo', 'garden', 'quiet'] },
  m09: { pace: 'slow' },
  m10: { avoid: ['walk-heavy'] },
  m11: { prefer: ['river', 'evening'] },
  m12: { avoid: ['mall'] },
  m13: { prefer: ['small-museum'] },
  m14: {},                                    // 关于「正式晚饭」的预算意愿 —— 推不进行程过滤
  m15: { avoid: ['tour-group'] },
  m16: { prefer: ['garden', 'quiet'] },
  m17: { prefer: ['evening', 'temple'] },
  m18: { avoid: ['theme-park'] },
  m19: { avoid: ['walk-heavy'] },
  m20: { prefer: ['local-food'] }
};

/* 理由标签 → 语义标签。空对象 = 点了会记住，但推不出可执行的约束。 */
const RULE = {
  '太赶': { pace: 'slow' },
  '太远': { avoid: ['walk-heavy'] },
  '我晕博物馆': { avoid: ['museum'] },
  '人太多': { avoid: ['crowd', 'queue'] },
  '不感兴趣': {},
  '不想早起': { pace: 'slow' },
  '太早出门': { pace: 'slow' },
  '换乘太多': { avoid: ['walk-heavy'] },
  '太松了': { pace: 'fast' },
  '要排队': { avoid: ['queue'] },
  '太贵': {},
  '游客向': { prefer: ['local-food'], avoid: ['crowd'] },
  '不合口味': {},
  '离得远': {},
  '周边没吃的': { prefer: ['old-town'] },
  '太吵': { avoid: ['mall', 'crowd'] },
  '不喜欢商圈': { prefer: ['old-town'], avoid: ['mall'] },
  '不需要休息': { pace: 'fast' },
  '浪费时间': { pace: 'fast' },
  '想多待会儿': { pace: 'slow' },
  '正是我想要的': {},
  '安静': { prefer: ['quiet', 'garden'] },
  '风景好': { prefer: ['view'] },
  '想吃这个': {},
  '本地感': { prefer: ['local-food'] },
  '不用排队': { avoid: ['queue'] },
  '性价比高': { prefer: ['local-food'] },
  '节奏舒服': { pace: 'slow' },
  '不用早起': { pace: 'slow' },
  '走得不多': { avoid: ['walk-heavy'] },
  '位置合适': {},
  '周边有夜宵': { prefer: ['old-town'] },
  '有庭院': { prefer: ['garden'] },
  '需要这个空档': { pace: 'slow' }
};

const fmt = t => {
  const parts = [];
  if (t.pace) parts.push(`pace:'${t.pace}'`);
  if (t.avoid) parts.push(`avoid:${JSON.stringify(t.avoid)}`);
  if (t.prefer) parts.push(`prefer:${JSON.stringify(t.prefer)}`);
  return parts.join(', ');
};

/* ---- 1. MEMORIES：在 used:xxx, 之后插入 ---- */
let memHit = 0;
s = s.replace(/(\{ id:'(m\d+)',[^\n]*?used:(?:true|false),)/g, (all, head, id) => {
  if (!(id in MEM)) return all;
  const t = fmt(MEM[id]);
  if (!t) return all;                      // 无标签的保持原样
  memHit++;
  return `${head} ${t},`;
});

/* ---- 2. REASON_TO_MEMORY：在最后一行 `'标签': { text:..., type:... }` 的 } 前插入 ---- */
let ruleHit = 0;
s = s.replace(/^(\s*'(?:[^'\\]|\\.)+':\s*\{ text:'(?:[^'\\]|\\.)*', type:'(?:[^'\\]|\\.)*')( \},)$/gm,
  (all, head, tail, off) => {
    // head 形如 "  '太赶':        { text:'...', type:'节奏'"
    const m = head.match(/'((?:[^'\\]|\\.)+)':/);
    if (!m) return all;
    const label = m[1];
    if (!(label in RULE)) return all;
    const t = fmt(RULE[label]);
    ruleHit++;
    if (!t) return `${head} },`;           // 无标签的也照样计数（要报告）
    return `${head}, ${t} },`;
  });

fs.writeFileSync(p, s);
console.log(`MEMORIES 打标 ${memHit}/${Object.keys(MEM).length} 条（无标签的未改动）`);
console.log(`理由规则打标 ${ruleHit}/${Object.keys(RULE).length} 条`);
console.log(`文件 ${before} → ${s.length} 字节`);
