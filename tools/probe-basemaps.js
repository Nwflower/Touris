/* 探针：在 Node 里跑 @protomaps/basemaps，实测生成样式与字体栈。
   用法：node probe-basemaps.js */
const fs = require('fs');
const path = require('path');

const V = path.resolve(__dirname, '..', 'tiles', 'assets', 'vendor');
const src = fs.readFileSync(path.join(V, 'basemaps.js'), 'utf8');

// IIFE 包，末尾有 sourceMappingURL 注释，必须补换行再追加 return
const basemaps = new Function(src + '\n; return basemaps;')();

console.log('导出键:', Object.keys(basemaps).join(', '));

const style = basemaps.layers('protomaps', basemaps.namedFlavor('light'), { lang: 'zh-Hans' });
console.log('图层数:', style.length);

const fonts = new Set();
const fields = new Set();
JSON.stringify(style, (k, v) => {
  if (k === 'text-font') fonts.add(JSON.stringify(v));
  if (k === 'text-field') fields.add(JSON.stringify(v).slice(0, 200));
  return v;
});

console.log('\n字体栈:');
[...fonts].forEach(f => console.log('  ' + f));
console.log('\ntext-field 样例:');
[...fields].slice(0, 5).forEach(f => console.log('  ' + f));

// 对比：不传 lang 时是否有 name:zh-Hans
const plain = basemaps.layers('protomaps', basemaps.namedFlavor('light'));
const zhCount = JSON.stringify(style).split('zh-Hans').length - 1;
const plainCount = JSON.stringify(plain).split('zh-Hans').length - 1;
console.log(`\nlang:"zh-Hans" 出现次数 —— 传 lang: ${zhCount} / 不传: ${plainCount}`);
