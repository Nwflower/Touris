/* ==========================================================================
   检查图片是否都真的落地了

   这个脚本以前是拿景点名拼出 wsrv.nl 代理地址、逐个发 HTTP HEAD 看通不通。
   图片本地化之后那套没意义了——现在的风险不是「网络取不到」，而是
   「地图里写了这个文件，但文件不在仓库里」，而那种错在浏览器里表现为
   一片安静的 SVG 占位图，不报错、没人会发现。

   所以改成两件事，全部离线：
     1) 每个城市每个景点，按 app.js 的取图规则算出来的路径，文件必须存在
     2) 源码里出现的每一处本地资源路径（img/...、assets/...）也必须存在
        —— 这条兜住 DEST_CARDS、HOME_HERO_IMAGES 这类不在 spots 里的图

   用法：node _imgcheck.js
   ========================================================================== */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const HERE = __dirname;
const ctx = { console };
vm.createContext(ctx);
// 从入口读数据脚本顺序，确保扩充候选池也在检查范围内。
const scripts = [...fs.readFileSync(path.join(HERE, 'index.html'), 'utf8')
  .matchAll(/<script\s+src="([^"]+)"/g)].map(m => m[1]);
const dataEnd = scripts.indexOf('coords.js');
if(dataEnd < 0) throw new Error('入口的数据加载边界已改变，请更新图片检查器');
for(const f of scripts.slice(0, dataEnd)){
  vm.runInContext(fs.readFileSync(path.join(HERE, f), 'utf8'), ctx, { filename: f });
}
const g = n => vm.runInContext(n, ctx);

const SPOT_IMG = JSON.parse(g('JSON.stringify(SPOT_IMG)'));
const CITY_DATA = JSON.parse(g('JSON.stringify(globalThis.CITY_DATA)'));
const SPOT_PHOTOS = g('typeof SPOT_PHOTOS === "undefined" ? {} : JSON.parse(JSON.stringify(SPOT_PHOTOS))');
const requireReviewed = process.argv.includes('--reviewed');
const manifestFile = path.join(HERE, '../docs/spot-images/manifest.json');
const manifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : [];
const reviewed = new Map(manifest.map(r => [r.city + '·' + r.name, r]));

/** 与 app.js 的 spotImages() 同一条规则：城市自带的图优先，其余从公共图库补 */
function imageFor(city, name){
  return (SPOT_PHOTOS[city.name] && SPOT_PHOTOS[city.name][name] && SPOT_PHOTOS[city.name][name].src)
    || (city && city.images && city.images[name]) || SPOT_IMG[name] || null;
}

const missing = [];
const foreign = [];
let checked = 0;
let spotCount = 0;

function check(label, ref){
  if(!ref) { missing.push(label + '  →  （没有配置图片）'); return; }
  if(/^https?:/.test(ref)) { foreign.push(label + '  →  ' + ref); return; }
  checked++;
  if(!fs.existsSync(path.join(HERE, ref))) missing.push(label + '  →  ' + ref);
}

/* ---- 1. 每个城市的每个景点 ---- */
const cities = Object.entries(CITY_DATA).map(([k, v]) => ({ name:k, ...v }));
cities.forEach(c => {
  Object.keys(c.spots || {}).forEach(n => {
    spotCount++;
    check(c.name + ' · ' + n, imageFor(c, n));
    if(requireReviewed){
      const label = c.name + '·' + n;
      const record = reviewed.get(label);
      const photo = SPOT_PHOTOS[c.name] && SPOT_PHOTOS[c.name][n];
      if(!record || !photo || !record.author || !record.license || !record.source || !record.matchEvidence){
        missing.push(label + ' → 缺少已核对的照片来源、作者、许可或景点匹配依据');
      } else if(record.visualReview !== 'passed'){
        missing.push(label + ' → 尚未完成照片视觉核对');
      } else if(record.file !== photo.src || record.file !== imageFor(c, n)){
        missing.push(label + ' → 页面使用的照片与核对清单不一致');
      } else {
        const file = path.join(HERE, record.file);
        if(fs.existsSync(file) && crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== record.sha256){
          missing.push(label + ' → 图片字节已改变，需要重新核对');
        }
      }
    }
  });
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
const miss = uniq(missing), fore = uniq(foreign);

console.log(`检查 ${spotCount} 个点位、${checked} 处已配置图片引用（${cities.length} 座城市）。`);

if(fore.length){
  console.log(`\n✗ 有 ${fore.length} 处仍指向外部地址 —— 图片本地化的目的是运行时零外部请求：`);
  fore.forEach(x => console.log('   ' + x));
}
if(miss.length){
  console.log(`\n✗ 有 ${miss.length} 处缺少可用图片或所要求的核对记录：`);
  miss.forEach(x => console.log('   ' + x));
}
if(!fore.length && !miss.length){
  console.log('✓ 全部为本地文件且都存在');
}

process.exitCode = (fore.length || miss.length) ? 1 : 0;
