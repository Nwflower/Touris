#!/usr/bin/env node
/* 看语义标签方案对杭州/广州的对照产出。跑完即删。 */
const fs = require('fs'), vm = require('vm'), path = require('path');

const ctx = { console };
vm.createContext(ctx);
for (const f of ['semantics.js', 'images.js', 'data.js', 'city-data.js',
                 'city-expansion.js', 'city-hangzhou-guangzhou.js']) {
  vm.runInContext(fs.readFileSync(path.join('prototype', f), 'utf8'), ctx, { filename: f });
}
const g = n => JSON.parse(vm.runInContext('JSON.stringify(' + n + ')', ctx));

const MEM = g('MEMORIES');
const CITY = g('globalThis.CITY_DATA');

console.log('=== 约束推导（20 条预置记忆）===');
const cons = g(`constraintsOf(MEMORIES)`);
console.log('  avoid : ' + JSON.stringify(cons.avoid));
console.log('  prefer: ' + JSON.stringify(cons.prefer));
console.log('  pace  : ' + JSON.stringify(cons.pace));

for (const city of ['杭州', '广州']) {
  console.log(`\n=== ${city} ===`);
  const r = JSON.parse(vm.runInContext(
    `JSON.stringify(CITY_DATA[${JSON.stringify(city)}].resolve({date:'2026-10-02',days:4}, null, MEMORIES))`, ctx));
  console.log(`  对照 ${r.diffs.length} 条（旧实现：杭州 3 / 广州 4）`);
  r.diffs.forEach(d => console.log(`    [${d.kind.padEnd(7)}] ${d.text}   ← ${d.memoryIds.join(',')}`));

  const def = r.itinDefault.days.map(d => d.items.filter(i => i.kind === 'spot').length);
  const mem = r.itinMemory.days.map(d => d.items.filter(i => i.kind === 'spot').length);
  console.log(`  每天点位数 默认 [${def}] → 记忆 [${mem}]`);
  r.itinMemory.days.forEach((d, i) => {
    const names = d.items.map(x => x.name);
    console.log(`    D${i + 1}: ${names.join(' · ')}`);
  });
}

console.log('\n=== 覆盖度：多少条记忆能实际影响推荐 ===');
const all = MEM.length;
const affecting = new Set();
for (const city of ['杭州', '广州']) {
  const r = JSON.parse(vm.runInContext(
    `JSON.stringify(CITY_DATA[${JSON.stringify(city)}].resolve({date:'2026-10-02',days:4}, null, MEMORIES))`, ctx));
  r.diffs.forEach(d => d.memoryIds.forEach(id => affecting.add(id)));
}
console.log(`  ${affecting.size}/${all} 条记忆在杭州/广州产生了可追溯的对照（旧实现 3/20）`);
console.log(`  未被覆盖: ${MEM.filter(m => !affecting.has(m.id)).map(m => m.id).join('、')}`);
