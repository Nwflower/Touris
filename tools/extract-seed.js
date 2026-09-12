#!/usr/bin/env node
/* ==========================================================================
   从 prototype/ 抽取景点素材 → app/data/city-seed.js

   为什么要脚本而不是手工誊写：原型里 24 条景点各自带一段手写简介、评分、
   点评数，手工复制很容易漏字或错位，而且原型改了就再也对不上。

   用法：
     node tools/extract-seed.js            # 重新生成 city-seed.js
     node tools/extract-seed.js --check    # 只报告差异，不写文件

   原型的中文标签到语义标签的映射是机械的，改 TAG_MAP 即可。
   ========================================================================== */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const PROTO = path.join(ROOT, 'prototype');
const OUT = path.join(ROOT, 'app', 'data', 'city-seed.js');

/* 原型的中文标签 → 本项目的语义标签。
   只映射能被 derive.js 用上的；纯描述性标签（拍照/石板街/必看）不进语义。 */
const TAG_MAP = {
  '安静':   'quiet',
  '人少':   'quiet',
  '庭园':   'garden',
  '苔庭':   'garden',
  '枯山水': 'garden',
  '竹林':   'bamboo',
  '自然':   'bamboo',
  '河川':   'river',
  '水路阁': 'river',
  '散步':   'river',
  '神社':   'temple',
  '国宝':   'temple',
  '世界遗产':'temple',
  '傍晚好': 'evening',
  '夜景':   'evening',
  '夜间':   'evening',
  '本地':   'old-town',
  '本地小馆':'local-food',
  '町屋':   'old-town',
  '夜巷':   'old-town',
  '市集':   'market',
  '早市':   'market',
  '小吃':   'street-food',
  '观景台': 'view',
  '伴手礼': 'craft',
  '购物':   'craft',
  '免费':   'free',
  '可久坐': 'quiet'
};

/* 回避类：这些标签说明该景点对某些偏好不合适 */
const AVOID_MAP = {
  '人多':   'crowd',
  '大型馆': 'museum',
  '费体力': 'walk-heavy',
  '体力活': 'walk-heavy',
  '爬山':   'walk-heavy',
  '动线长': 'walk-heavy',
  '游客向': 'crowd'
};

function load(){
  const src = ['data.js', 'images.js'].map(f => fs.readFileSync(path.join(PROTO, f), 'utf8')).join('\n');
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: 'prototype-bundle.js' });
  return {
    spots: JSON.parse(vm.runInContext('JSON.stringify(SPOTS)', ctx)),
    poi:   JSON.parse(vm.runInContext('JSON.stringify(POI)', ctx)),
    img:   JSON.parse(vm.runInContext('JSON.stringify(SPOT_IMG)', ctx))
  };
}

/** 中文标签数组 → 本项目语义标签数组（去重，保序） */
function toSemantics(tags, map){
  const out = [];
  (tags || []).forEach(t => { const s = map[t]; if(s && !out.includes(s)) out.push(s); });
  return out;
}

function build(){
  const { spots, poi, img } = load();
  const lines = [];

  lines.push('/* ==========================================================================');
  lines.push('   Touris 知途 · 景点素材（由 tools/extract-seed.js 生成，请勿手改）');
  lines.push('');
  lines.push('   来源：prototype/data.js 的 SPOTS/POI、prototype/images.js 的 SPOT_IMG。');
  lines.push('   简介与评分是原型里手写的内容，属于产品资产，原样搬运。');
  lines.push('');
  lines.push('   原型的 tags 是中文描述性标签，这里另外附了 prefer/avoid 两个语义数组，');
  lines.push('   由 tools/extract-seed.js 的 TAG_MAP / AVOID_MAP 机械映射而来——');
  lines.push('   这是「记忆语义」那套推导的输入。要调整映射，改脚本再重跑，不要改本文件。');
  lines.push('   ========================================================================== */');
  lines.push('');
  lines.push('const CITY_SEED = {');

  /* ---- 景点 ---- */
  lines.push('  spots: {');
  Object.keys(spots).forEach((name, i) => {
    const s = spots[name];
    const prefer = toSemantics(s.tags, TAG_MAP);
    const avoid = toSemantics(s.tags, AVOID_MAP);
    const parts = [
      `cat:${JSON.stringify(s.cat)}`,
      `score:${s.score}`,
      `count:${s.count}`
    ];
    if(s.src) parts.push(`src:${JSON.stringify(s.src)}`);
    if(prefer.length) parts.push(`prefer:${JSON.stringify(prefer)}`);
    if(avoid.length) parts.push(`avoid:${JSON.stringify(avoid)}`);
    lines.push(`    ${JSON.stringify(name)}: { ${parts.join(', ')},`);
    lines.push(`      intro:${JSON.stringify(s.intro)} },`);
  });
  lines.push('  },');
  lines.push('');

  /* ---- 点位坐标 ---- */
  lines.push('  /* 归一化坐标（0–100），原型的手绘示意图坐标系。');
  lines.push('     接真实地图时这里要换成经纬度，点位清单本身不用动。 */');
  lines.push('  poi: {');
  Object.keys(poi).forEach(name => {
    const p = poi[name];
    lines.push(`    ${JSON.stringify(name)}: { x:${p.x}, y:${p.y} },`);
  });
  lines.push('  },');
  lines.push('');

  /* ---- 图片 ---- */
  lines.push('  /* 图片已下载到本地（app/img/），运行时只读同目录文件，不依赖外部服务。');
  lines.push('     原始来源与署名见 app/img/CREDITS.md。');
  lines.push('     取图逻辑见 views/thumb.js —— 本地相对路径直接用，只有外链才套代理；');
  lines.push('     加载失败会回落到内联 SVG 占位插画，所以缺图不会开天窗。 */');
  lines.push('  images: {');
  Object.keys(img).forEach(name => {
    lines.push(`    ${JSON.stringify(name)}: ${JSON.stringify(img[name])},`);
  });
  lines.push('  }');

  lines.push('};');
  lines.push('');

  return {
    code: lines.join('\n'),
    stats: {
      spots: Object.keys(spots).length,
      withSemantics: Object.keys(spots).filter(n =>
        toSemantics(spots[n].tags, TAG_MAP).length || toSemantics(spots[n].tags, AVOID_MAP).length).length,
      poi: Object.keys(poi).length,
      img: Object.keys(img).length
    }
  };
}

const { code, stats } = build();
const check = process.argv.includes('--check');

if(check){
  const prev = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  const same = prev === code;
  console.log(`景点 ${stats.spots} 条（其中 ${stats.withSemantics} 条带语义标签）| 点位 ${stats.poi} | 图片 ${stats.img}`);
  console.log(same ? '✓ 与 app/data/city-seed.js 一致' : '✗ 原型已变动，需要重跑（去掉 --check）');
  process.exit(same ? 0 : 1);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, code, 'utf8');
console.log(`已写入 ${path.relative(ROOT, OUT)}`);
console.log(`景点 ${stats.spots} 条（${stats.withSemantics} 条带语义）| 点位 ${stats.poi} | 图片 ${stats.img}`);
