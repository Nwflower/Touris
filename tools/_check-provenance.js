#!/usr/bin/env node
/* 复核：被删掉的点，理由站得住吗？ */
const fs = require('fs'), vm = require('vm'), path = require('path');
const ctx = { console };
vm.createContext(ctx);
for (const f of ['semantics.js', 'images.js', 'data.js', 'city-data.js',
                 'city-expansion.js', 'city-hangzhou-guangzhou.js']) {
  vm.runInContext(fs.readFileSync(path.join('prototype', f), 'utf8'), ctx, { filename: f });
}
const g = n => JSON.parse(vm.runInContext('JSON.stringify(' + n + ')', ctx));

const suspects = [['杭州', '保俶塔'], ['广州', '越秀公园'], ['广州', '广东省博物馆'],
                  ['杭州', '中国茶叶博物馆（双峰馆区）'], ['杭州', '雷峰塔'], ['广州', '沙面']];
console.log('点名景点在中英文标签上的实际情况：');
suspects.forEach(([city, name]) => {
  const sp = g(`globalThis.CITY_DATA[${JSON.stringify(city)}].spots[${JSON.stringify(name)}]`);
  if (!sp) { console.log(`  ${city} ${name}: 查不到`); return; }
  const sem = g(`semOf(${JSON.stringify(name)}, globalThis.CITY_DATA[${JSON.stringify(city)}].spots)`);
  console.log(`  ${city} ${name}`);
  console.log(`     tags : ${JSON.stringify(sp.tags)}`);
  console.log(`     sem  : prefer=${JSON.stringify(sem.prefer)} avoid=${JSON.stringify(sem.avoid)}`);
});

console.log('\n=== 把某条记忆单独拿掉，看它是否真的在驱动某条对照 ===');
const probe = (dropId) => {
  const mems = g('MEMORIES').filter(m => m.id !== dropId);
  const out = {};
  for (const city of ['杭州', '广州']) {
    vm.runInContext(`globalThis.__m = ${JSON.stringify(mems)}`, ctx);
    const r = JSON.parse(vm.runInContext(
      `JSON.stringify(CITY_DATA[${JSON.stringify(city)}].resolve({date:'2026-10-02',days:4}, null, globalThis.__m))`, ctx));
    out[city] = r.diffs.map(d => `${d.kind}:${d.target}`).join(' | ');
  }
  return out;
};
const base = probe('__none__');
['m10', 'm19'].forEach(id => {
  const after = probe(id);
  console.log(`\n拿掉 ${id}（${g('MEMORIES').find(m => m.id === id).text}）：`);
  ['杭州', '广州'].forEach(c => {
    console.log(`  ${c} ${after[c] === base[c] ? '无变化 → 这条没在驱动' : '有变化 →'}`);
    if (after[c] !== base[c]) console.log(`      前: ${base[c]}\n      后: ${after[c]}`);
  });
});
