/* ==========================================================================
   检查图片是否都真的落地了

   这个脚本以前是拿景点名拼出 wsrv.nl 代理地址、逐个发 HTTP HEAD 看通不通。
   图片本地化之后那套没意义了——现在的风险不是「网络取不到」，而是
   「地图里写了这个文件，但文件不在仓库里」，而那种错在浏览器里表现为
   一片安静的 SVG 占位图，不报错、没人会发现。

   所以改成两件事，全部离线：
     1) 每个城市每个景点，按 app.js 的取图规则算出来的路径，**配了就必须存在**
        （没配的只计数，见下）
     2) 源码里出现的每一处本地资源路径（img/...、assets/...）也必须存在
        —— 这条兜住 DEST_CARDS、HOME_HERO_IMAGES 这类不在 spots 里的图

   没配图的景点不算失败：配图是「搜得到才配」，搜不到就按既定口径留 SVG 占位
   （宁可没图，不放错图）。脚本会把未配图数量报出来，让缺口可见，
   而不是让检查长期变红、然后所有人都学会忽略它。

   用法：node _imgcheck.js
   ========================================================================== */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HERE = __dirname;
const ctx = { console };
vm.createContext(ctx);
/* 加载顺序与 index.html 一致，少一个文件就会少检查一整座城：
   这里曾经漏掉 city-chengdu.js 与 spots-expansion.js，于是成都、以及扩充出来的
   那批景点（正是配图任务在填的）从来没被检查过，还一路显示「通过」。 */
for(const f of ['semantics.js', 'images.js', 'data.js', 'city-data.js', 'city-expansion.js', 'city-hangzhou-guangzhou.js', 'city-chengdu.js', 'spots-expansion.js']){
  vm.runInContext(fs.readFileSync(path.join(HERE, f), 'utf8'), ctx, { filename: f });
}
const g = n => vm.runInContext(n, ctx);

const SPOT_IMG = JSON.parse(g('JSON.stringify(SPOT_IMG)'));
const CITY_DATA = JSON.parse(g('JSON.stringify(globalThis.CITY_DATA)'));

/** 与 app.js 的 spotImages() 同一条规则：城市自带的图优先，其余从公共图库补 */
function imageFor(city, name){
  return (city && city.images && city.images[name]) || SPOT_IMG[name] || null;
}

const missing = [];
const foreign = [];
const imageless = [];
let checked = 0;

function check(label, ref){
  /* 没配图不算失败：配图是「搜得到才配」，没搜到的点位按既定口径留 SVG 占位
     （宁可没图，不放错图）。这里只把它数出来，让缺口可见，而不是让检查常红。 */
  if(!ref) { imageless.push(label); return; }
  if(/^https?:/.test(ref)) { foreign.push(label + '  →  ' + ref); return; }
  checked++;
  if(!fs.existsSync(path.join(HERE, ref))) missing.push(label + '  →  ' + ref);
}

/* ---- 1. 每个城市的每个景点 ---- */
const cities = Object.entries(CITY_DATA).map(([k, v]) => ({ name:k, ...v }));
cities.forEach(c => {
  Object.keys(c.spots || {}).forEach(n => check(c.name + ' · ' + n, imageFor(c, n)));
});

/* ---- 2. 源码里出现的所有本地资源路径 ---- */
/* 只扫 JS/HTML/CSS 的字符串字面量，避免把注释里的示例当成真引用 */
['app.js', 'index.html', ...fs.readdirSync(HERE).filter(f => f.endsWith('.css'))].forEach(f => {
  const p = path.join(HERE, f);
  if(!fs.existsSync(p)) return;
  const src = fs.readFileSync(p, 'utf8');
  for(const m of src.matchAll(/['"](img\/[^'"]+|assets\/[^'"]+)['"]/g)){
    check(f + ' 引用', m[1]);
  }
});

/* ---- 汇总 ---- */
const uniq = a => [...new Set(a)];
const miss = uniq(missing), fore = uniq(foreign), none = uniq(imageless);

console.log(`检查 ${checked} 处图片引用（${cities.length} 座城市）；另有 ${none.length} 个景点未配图（留 SVG 占位）。`);

if(fore.length){
  console.log(`\n✗ 有 ${fore.length} 处仍指向外部地址 —— 图片本地化的目的是运行时零外部请求：`);
  fore.forEach(x => console.log('   ' + x));
}
if(miss.length){
  console.log(`\n✗ 有 ${miss.length} 处引用的文件不在仓库里：`);
  miss.forEach(x => console.log('   ' + x));
}
if(!fore.length && !miss.length){
  console.log('✓ 已配的图全部为本地文件且都存在');
}

process.exitCode = (fore.length || miss.length) ? 1 : 0;
