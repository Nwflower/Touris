/* 临时验证：real-maps.js 的 setDay / applyTo（切天后谁亮谁暗、动线图视野跟随）。
   用最小 Leaflet 桩，记录创建的 marker / polyline。跑完即删。 */
const fs = require('fs'), vm = require('vm');

const markers = [], lines = [];

function mkEl(){
  return { tagName:'DIV', style:{}, hidden:false, textContent:'',
    classList:{ add(){}, remove(){}, toggle(){}, contains(){return false} },
    _kids:{}, querySelector(sel){ return this._kids[sel] || null; },
    addEventListener(){}, appendChild(){}, remove(){} };
}

const L = {
  map: () => ({ _fit:null, setMaxBounds(){}, setView(){}, fitBounds(b){ this._fit = b; },
    on(){}, invalidateSize(){}, remove(){}, scrollWheelZoom:{ enable(){}, disable(){} } }),
  tileLayer: () => ({ addTo(){ return { on(){}, redraw(){} }; } }),
  marker: () => { const m = { _el:{ style:{}, classList:{ toggle(){} } },
      getElement(){ return this._el; }, on(){}, addTo(){ return this; }, bindPopup(){ return this; } };
    markers.push(m); return m; },
  divIcon: () => ({}),
  polyline: () => { const l = { _style:{}, setStyle(s){ Object.assign(this._style, s); }, addTo(){ return this; } };
    lines.push(l); return l; },
  latLngBounds: () => ({ getSouth:()=>0, getWest:()=>0, getNorth:()=>0, getEast:()=>0 }),
  latLng: (a,b) => ({ lat:a, lng:b })
};

/* 两天、每天两个点 */
const ROUTES = [
  [ {name:'大慈寺',lat:30.657,lng:104.081,day:1}, {name:'熊猫塔',lat:30.666,lng:104.099,day:1} ],
  [ {name:'人民公园',lat:30.662,lng:104.055,day:2}, {name:'交子公园',lat:30.575,lng:104.064,day:2} ]
];
const container = mkEl();
container.dataset = { city:'成都', routes: JSON.stringify(ROUTES), center:'[30.66,104.06]',
                      mapMode:'overview', highlight:'1' };
container._kids['.real-map-status'] = mkEl();
container._kids['.real-map-canvas'] = mkEl();
container._kids['[data-map-retry]'] = mkEl();

const ctx = { console, JSON, Math, Set, Map, Date, Promise, Number, Object, Array, String, Error,
  URLSearchParams, setTimeout, clearTimeout, requestAnimationFrame: fn => fn(),
  location: { search: '' },
  document: { createElement: () => mkEl(), querySelectorAll: sel => (sel === '.real-map' ? [container] : []) },
  IntersectionObserver: undefined,
  fetch: () => Promise.reject(new Error('no-probe')),
  L };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('prototype/real-maps.js', 'utf8'), ctx, { filename:'real-maps.js' });

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if(!c) fails++; };

(async () => {
  ctx.TourisMaps.mount();
  for (let i = 0; i < 100 && markers.length < 4; i++) await new Promise(r => setTimeout(r, 10));

  ok(markers.length === 4, `4 个标记已建立（实得 ${markers.length}）`);
  ok(lines.length === 2, `2 条连线已建立（实得 ${lines.length}）`);

  const op = m => m._el.style.opacity;
  console.log('\n--- 初始 highlight=1（D1 亮、D2 淡）---');
  ok(op(markers[0]) === '' && op(markers[1]) === '', 'D1 的标记不淡化');
  ok(op(markers[2]) === '0.28' && op(markers[3]) === '0.28', 'D2 的标记淡化到 0.28');
  ok(lines[0]._style.opacity === 1 && lines[1]._style.opacity === 0.12, 'D1 线实、D2 线淡');

  console.log('\n--- setDay(2) ---');
  ctx.TourisMaps.setDay(2);
  ok(op(markers[0]) === '0.28' && op(markers[1]) === '0.28', 'D1 的标记转为淡化');
  ok(op(markers[2]) === '' && op(markers[3]) === '', 'D2 的标记恢复');
  ok(lines[0]._style.opacity === 0.12 && lines[1]._style.opacity === 1, 'D2 线实、D1 线淡');

  console.log('\n--- 概览图不应该跟着当天缩放视野 ---');
  ok(container.dataset.mapMode === 'overview', 'mode=overview');

  console.log('\n--- 换成 mode=day 的图：只显示当天（用 display 真隐藏，不是淡化）---');
  const disp = m => m._el.style.display;
  markers.length = 0; lines.length = 0;
  container.dataset.mapMode = 'day'; container.dataset.highlight = '1';
  ctx.TourisMaps.dispose();
  ctx.TourisMaps.mount();
  for (let i = 0; i < 100 && markers.length < 4; i++) await new Promise(r => setTimeout(r, 10));
  ok(disp(markers[0]) === '' && disp(markers[2]) === 'none', 'day 模式：只留 D1，D2 隐藏');
  ctx.TourisMaps.setDay(2);
  ok(disp(markers[0]) === 'none' && disp(markers[2]) === '', 'setDay(2) 后换成只留 D2');
  ok(lines[0]._style.opacity === 0 && lines[1]._style.opacity === 1, '连线同步（D1 隐、D2 显）');

  console.log('\n' + (fails ? `${fails} 项失败` : '全部通过'));
  process.exit(fails ? 1 : 0);
})();
