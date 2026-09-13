#!/usr/bin/env node
/* ==========================================================================
   Touris 知途 · 扩充景点配图搜索

   给 spots-expansion.js 里新补的景点逐个找图。产物只有一个：
   把「景点名 → Commons 文件名」并进 tools/image-sources.json——
   下载、images.js 重新生成、img/CREDITS.md 署名，全部交给既有的
   node tools/fetch-images.js（不要在这里重复造那套轮子）。

   检索策略（每个景点按序尝试，取到即停）：
     1. OVERRIDES 里手工指定的词条（zh 词条名或搜索词）
     2. zh.wikipedia 精确标题的首图（pageimages，pilicense=free）
     3. zh.wikipedia 全文搜索里**标题确实对得上这个景点**的词条的首图

   相关性闸门（别拆）：第 3 步只认标题能与景点名对上的词条。目标词条常常
   存在但没有首图，早先的写法会一路顺延到第一个「碰巧有图」的结果，于是
   红砖美术馆配上了泰特不列顛、五道营胡同配上了民俗学者金受申的肖像。
   宁可没图，不放错图——这是本仓库的既定口径，不是保守。

   版权口径（务必读完）：
     · 候选文件必须满足 imagerepository === 'shared'，即文件托管在
       Wikimedia Commons —— Commons 只收录自由许可媒体，非自由文件
       一律存在本地仓库（imagerepository === 'local'），会被这里拒掉。
     · 额外排除文件名带 map / logo / flag / icon / seal / diagram 的
       定位图与徽章类图。
     · API 走 zh.wikipedia.org、下载走 upload.wikimedia.org（见 fetch-images.js）。
       脚本默认放宽证书校验，但实测本机严格校验（TOURIS_TLS_STRICT=1）是通
       的，那就该用严格校验——放宽只在证书链确实自签时才需要。
     · 搜不到就如实跳过，让页面保留 SVG 占位。

   用法：
     node tools/search-expansion-images.js            # 搜索并合并进清单
     node tools/search-expansion-images.js --dry      # 只报告，不写清单
     node tools/search-expansion-images.js --only 龙井村 --only 泡桐树街
     node tools/search-expansion-images.js --recheck  # 复核既有清单配错的图
   ========================================================================== */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const PROTO = path.join(ROOT, 'prototype');
const SOURCES = path.join(__dirname, 'image-sources.json');
const LOG = path.join(__dirname, 'expansion-image-log.json');

const DRY = process.argv.includes('--dry');
const RECHECK = process.argv.includes('--recheck');
const onlyArg = (() => {
  const i = process.argv.indexOf('--only');
  return i >= 0 ? process.argv.slice(i + 1) : null;
})();

const STRICT = process.env.TOURIS_TLS_STRICT === '1';
const UA = 'Touris-image-search/1.0 (local prototype; build-time asset fetch)';
const DELAY_MS = 2000;   // Wikimedia 对突发很敏感（实测 150ms 就触发 429/403），放慢是礼貌也是可靠

/* ---------------- 手工指定词条 ----------------
   常见名/别名/易撞名点位在这里给准确的 zh 词条或搜索词。 */
const OVERRIDES = {
  // 北京
  '白塔寺': '妙应寺',
  '北大校园': '北京大学',
  '清华校园': '清华大学',
  '奥林匹克公园': '北京奥林匹克公园',
  '奥林匹克森林公园': '奥林匹克森林公园',
  '国家植物园': '中国科学院植物研究所植物园',
  // 「三里河 (北京)」是消歧义页（无首图无摘要），别当词条用；
  // 而「三里河路」的银杏大道属于路那边，不是东城的这座公园——交给闸门去挡
  '天桥演艺区': '天桥 (北京)',
  '湖广会馆': '湖广会馆 (北京)',
  '潘家园旧货市场': '潘家园',
  // 「军事博物馆」是简称，直接查会重定向到泛称词条「博物馆」的军事小节
  '军事博物馆': '中国人民革命军事博物馆',
  // 上海
  'M50创意园': 'M50创意园',
  '1933老场坊': '1933年老场坊',
  '张园': '张园 (上海)',
  '古城公园': '上海古城公园',
  '世博文化公园': '上海世博文化公园',
  '苏州河华政段': '华东政法大学长宁校区',
  '鲁迅公园': '鲁迅公园 (上海)',
  '多伦路': '多伦路 (上海)',
  // 广州
  '海珠国家湿地公园': '海珠湿地',
  '泮塘五约': '泮塘',
  '白鹅潭大湾区艺术中心': '白鹅潭大湾区艺术中心',
  '广州艺术博物院（新馆）': '广州艺术博物院',
  '海心沙': '海心沙 (广州)',
  '天河路商圈': '天河路 (广州)',
  '珠岛': '珠岛宾馆',
  '基督教东山堂': '东山堂',
  '越秀公园五羊': '五羊石像',
  '长隆野生动物世界': '长隆野生动物世界',
  // 杭州
  '断桥残雪': '断桥 (杭州)',
  '吴山城隍阁': '城隍阁',
  '法喜寺': '上天竺法喜讲寺',
  '孤山': '孤山 (杭州)',
  '湖滨步行街': '湖滨路 (杭州)',
  '中国茶叶博物馆（双峰馆区）': '中国茶叶博物馆',
  '京杭大运河': '京杭大运河',
  '运河天地': '拱宸桥',
  // 成都
  '成都自然博物馆': '成都理工大学博物馆',
  '天府熊猫塔': '四川广播电视塔',
  '麓湖': '麓湖 (成都)',
  '猛追湾': '猛追湾',
  '奎星楼街': '奎星楼街',
  '铁像寺水街': '铁像寺',
  // 威海
  '天鹅湖': '荣成天鹅湖',
  '赤山景区': '赤山法华院',
  '神雕山野生动物园': '神雕山野生动物自然保护区',
  '烟墩角': '烟墩角村',
  '环翠楼公园': '环翠楼',
  '刘公岛': '刘公岛',
  '那香海': '那香海',
  '威海站': '威海站',
  // 通用防撞（短名 + 城市）
  '人民广场': '威海人民广场'
};

/* 泛化名直接搜会撞别的城市，一律带城市前缀查 */
const GENERIC_RE = /(广场|公园|市场|大集|夜市|码头|步道|绿道|车站|浴场|沙滩|大桥|商圈|步行街|湿地|水库|湖$)/;

/* 排除定位图 / 徽章 / 图标 / 旗帜 / 平面图 */
const BAD_FILE_RE = /(map|locator|location|diagram|plan\b|logo|icon|flag|seal|coat_of_arms|blason|\.svg$|\.svg\))/i;

/* 词条标题必须与景点名真的对得上，配不上就宁可没图。
   背景：目标词条常常**存在但没有首图**，早先的逻辑会一路顺延到第一个
   「碰巧有图」的结果——于是红砖美术馆配上了伦敦泰特不列颠、五道营胡同配上了
   民俗学者金受申的肖像、泡桐树街配上了青羊宫。仓库的红线是「宁可没图，
   不放错图」，所以这里直接放弃，而不是拿一个无关词条的图凑数。 */
const GENERIC_SUFFIX_RE = /(公园|广场|大街|胡同|步行街|商圈|市场|夜市|湿地|古镇|绿道|步道|码头|浴场|沙滩|街区|遗址|景区|乐园|博物馆|美术馆|纪念馆|图书馆|大剧院|车站|中心|山|湖|岛|桥|塔|楼|阁|院|堂|宫|庙|观|门|园|寺|馆|街|路|巷|村|城|湾|滩|港|站)$/;

/** 剥掉通用后缀得到「核心名」；剥完不足 2 字（如「孤山」→「孤」）就保留原样 */
function coreName(name) {
  const bare = name.replace(/[（(].*?[)）]/g, '').trim();
  const cut = bare.replace(GENERIC_SUFFIX_RE, '');
  return cut.length >= 2 ? cut : bare;
}

/** 类型后缀（「三里河公园」→「公园」）；没有就 null。用来挡「同名不同类」 */
function suffixOf(name) {
  const m = name.replace(/[（(].*?[)）]/g, '').match(GENERIC_SUFFIX_RE);
  return m ? m[1] : null;
}

const CITY_NAMES = ['北京', '上海', '广州', '杭州', '成都', '威海'];

/* 行政级别错配：词条是「绍兴市」这种行政区，景点却是「绍兴路」这种点位——
   绍兴是城市，不是那条路。同理挡掉「青羊区」配给「泡桐树街」。 */
const ADMIN_TAIL_RE = /(市|省|县|区|镇|乡|街道)$/;
const STATION_RE = /(站|车站|地铁站)$/;

/** 标题是不是只剩通用词（「胡同」「公园」「步行街」…）——这种标题认不出具体点位 */
function isBlandTitle(t) {
  return t.replace(GENERIC_SUFFIX_RE, '').replace(GENERIC_RE, '').length === 0;
}

/** 词条标题是否真的对应这个景点（city 传了就顺带挡掉同名异地） */
function titleRelevant(title, spotName, city) {
  if (!title || !spotName) return false;
  const a = title.replace(/\s/g, ''), b = spotName.replace(/\s/g, '');
  if (!a || !b) return false;
  /* 同名异地的坑：搜「绍兴路」会撞上杭州那条，而这个景点在上海。
     标题里出现别的城市名，直接否掉。 */
  if (city && CITY_NAMES.some(c => c !== city && a.includes(c))) return false;
  const bare = s => s.replace(/[（(].*?[)）]/g, '');
  if (ADMIN_TAIL_RE.test(bare(a)) && !ADMIN_TAIL_RE.test(bare(b))) return false;
  /* 词条是车站（「东郊记忆站」），景点却是那个地方（「东郊记忆」）——车站词条的
     首图是站名牌/站台，不是景点。车站类词条一律不能当景点图源。 */
  if (STATION_RE.test(bare(a)) && !STATION_RE.test(bare(b))) return false;
  /* 景点名是「X + 类型词」，而词条只有 X 时，词条讲的是 X 这个**事物**、不是这个点位：
     「天鹅湖」撞上「天鹅」（那是鸟）、「威海市博物馆」撞上「威海市」（那是城市）、
     「五道营胡同」撞上「胡同」。这类必须挡掉。 */
  const stripped = bare(spotName).replace(GENERIC_SUFFIX_RE, '');
  if (stripped.length >= 2 && stripped !== bare(spotName) && a === stripped) return false;
  /* 标题里含景点名时，名字**前面**的限定语必须就是本城（或为空）：
     「无锡IFS国金中心」不能配给成都的 IFS国金中心，而「北京明城墙遗址公园」
     「上海鲁迅公园」的前缀正是本城，照收。品牌前缀（「SOLANA蓝色港湾」）会被
     这条一并挡掉——宁可少一张图，不要错一张图。 */
  const at = a.indexOf(b);
  if (at >= 0) return at === 0 || (!!city && a.slice(0, at).includes(city));
  /* 用剥后缀后的核心名去匹配，但要两道约束：
     ① 核心名必须够长（≥3 字）——2 字太容易撞：「小石岛」剥成「小石」就命中了
        植物词条「小石积」，配来一张植物照片；
     ② 类型词必须一致——「三里河公园」不能配「三里河路」那张图，虽然都叫三里河，
        但一个是公园、一个是路，是两处地方（银杏大道其实是路那边的）。 */
  const core = coreName(spotName);
  if (core.length >= 3 && a.includes(core) && suffixOf(spotName) === suffixOf(title)) return true;
  /* 反向：景点名以词条名**开头**（「断桥残雪」↔「断桥」——那是同一个地方的雪景）。
     必须是真的前缀，不能只是包含：「京杭大运河博物馆」含「大运河」，但词条讲的是那条
     河、不是这座馆。词条名也不能只剩通用词，否则五道营胡同会配上「胡同」那张
     泛泛的老北京胡同照。 */
  return a.length >= 2 && b.startsWith(a) && !isBlandTitle(a);
}

/* ---------------- 数据装载 ---------------- */
function loadPrototype() {
  const ctx = { console, window: { addEventListener() {} } };
  vm.createContext(ctx);
  for (const f of ['semantics.js', 'images.js', 'data.js', 'city-data.js', 'city-expansion.js',
    'city-hangzhou-guangzhou.js', 'city-chengdu.js', 'spots-expansion.js']) {
    vm.runInContext(fs.readFileSync(path.join(PROTO, f), 'utf8'), ctx, { filename: f });
  }
  return {
    SPOT_IMG: JSON.parse(vm.runInContext('JSON.stringify(SPOT_IMG)', ctx)),
    // 扩充包新增的景点名——只有这批归本脚本负责（早期手工阶段那批另有出处）
    expanded: JSON.parse(vm.runInContext(
      'JSON.stringify(Object.values(globalThis.TOURIS_SPOT_EXPANSION.EXPANSIONS)' +
      '.flatMap(e => Object.keys(e.spots)))', ctx)),
    CITY_DATA: JSON.parse(vm.runInContext('JSON.stringify(globalThis.CITY_DATA)', ctx))
  };
}

const CITY_SLUG = { 北京: 'beijing', 上海: 'shanghai', 广州: 'guangzhou', 杭州: 'hangzhou', 成都: 'chengdu', 威海: 'weihai' };

/** 全部需要配图的景点（车站除外）；cur = 当前已配的图，为 null 即待配 */
function allSpots({ SPOT_IMG, CITY_DATA }) {
  const out = [];
  Object.entries(CITY_DATA).forEach(([city, c]) => {
    Object.keys(c.spots || {}).forEach(name => {
      if (c.spots[name].cat === 'station') return;             // 车站不给配图
      out.push({ name, city, slug: CITY_SLUG[city] || city,
        cur: (c.images && c.images[name]) || SPOT_IMG[name] || null });
    });
  });
  return out;
}

const imagelessSpots = data => allSpots(data).filter(s => !s.cur);

/* ---------------- Wikimedia API ---------------- */
const sleep = ms => new Promise(r => setTimeout(r, ms));

function api(host, params, retry) {
  const qs = new URLSearchParams(Object.assign({ format: 'json', formatversion: 2 }, params)).toString();
  const url = `https://${host}${'/w/api.php?' + qs}`;
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': UA },
      rejectUnauthorized: !STRICT ? false : undefined
    }, res => {
      if (res.statusCode === 429 || res.statusCode === 403 || res.statusCode >= 500) {
        res.resume();
        retry = (retry || 0) + 1;
        if (retry > 4) { const e = new Error('HTTP ' + res.statusCode + '（重试 4 次仍失败）'); e.noRetry = true; return reject(e); }
        // 429/403 是限流：退避要给足，1.5s 那种小睡只会火上浇油
        return setTimeout(() => resolve(api(host, params, retry)), 5000 * retry);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode} @ ${host}`)); }
      let buf = '';
      res.on('data', d => { buf += d; });
      res.on('end', () => { try { resolve(JSON.parse(buf)); } catch (e) { reject(new Error('bad json')); } });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('超时')));
  });
}

/** 一个文件是否可用：托管在 Commons（shared）、位图、宽够、非定位图 */
async function usableFile(fileName) {
  if (BAD_FILE_RE.test(fileName)) return null;
  const j = await api('zh.wikipedia.org', {
    action: 'query', titles: 'File:' + fileName,
    prop: 'imageinfo', iiprop: 'size|url|mime'
  });
  const page = j.query && j.query.pages && j.query.pages[0];
  const ii = page && page.imageinfo && page.imageinfo[0];
  if (!ii) return null;
  if (page.imagerepository !== 'shared') return null;          // 本地仓库 = 非自由许可
  if (!/^image\/(jpeg|png)$/.test(ii.mime || '')) return null;
  /* 缩略卡最大显示 120px 宽，400px 已足够（fetch-images 对窄图会退回原图）。
     早年 Commons 上不少景点只有 400-500px 的老照片，卡在 640 会白白丢图。 */
  if ((ii.width || 0) < 400) return null;
  return { file: fileName, width: ii.width, mime: ii.mime, url: ii.url };
}

/** 一个词条的首图（free），返回文件名或 null */
function pageImageOf(page) {
  return (page && page.pageimage) || null;
}

/** 精确标题查首图（一批最多 25 个）。返回 请求名 → { img, title }，
    title 是**重定向之后**的真实词条名——必须留着它，否则「军事博物馆」
    被重定向到泛称词条「博物馆」这种事就看不出来了。 */
async function exactTitles(names) {
  const hits = {};
  for (let i = 0; i < names.length; i += 25) {
    const chunk = names.slice(i, i + 25);
    const j = await api('zh.wikipedia.org', {
      action: 'query', titles: chunk.join('|'), redirects: 1,
      prop: 'pageimages', piprop: 'name', pilicense: 'free'
    });
    const byTitle = {};
    (j.query && j.query.pages || []).forEach(p => {
      const img = pageImageOf(p);
      if (img) byTitle[p.title] = img;
    });
    // 重定向后的真实标题可能与请求名不同；拿 redirect 映射对齐
    const reds = {};
    ((j.query && j.query.redirects) || []).forEach(r => { reds[r.from] = r.to; });
    chunk.forEach(n => {
      if (hits[n]) return;
      const t = reds[n] || n;
      if (byTitle[t]) hits[n] = { img: byTitle[t], title: t };
      else if (byTitle[n]) hits[n] = { img: byTitle[n], title: n };
    });
    await sleep(DELAY_MS);
  }
  return hits;
}

/** 全文搜索：返回**标题确实对应这个景点**、且带 free 首图的词条，按相关度排序。
    相关度被闸门挡住的一律不返回——没有相关词条就是空数组。 */
async function searchImage(query, spotName, city) {
  const j = await api('zh.wikipedia.org', {
    action: 'query', generator: 'search',
    // 闸门会淘汰掉无关结果，所以多取几个，给「排在第 3 位但真是它」的词条留机会
    gsrsearch: query, gsrnamespace: 0, gsrlimit: 10, redirects: 1,
    prop: 'pageimages', piprop: 'name', pilicense: 'free'
  });
  const pages = (j.query && j.query.pages) || [];
  pages.sort((a, b) => (a.index || 99) - (b.index || 99));     // index = 相关度顺序
  const out = [];
  for (const p of pages) {
    const img = pageImageOf(p);
    if (img && titleRelevant(p.title, spotName, city)) out.push({ title: p.title, img });
  }
  return out;
}

/* ---------------- 复核模式 ----------------
   排查清单里「已经配错的图」。判据要客观、可复算，否则只会把好图也标成可疑——
   早先试过「清单上的文件是不是本脚本的第一选择」，结果是 142 个景点全被标红：
   同一个景点本来就有很多张合法照片，不是首图不等于错图。

   现在用两条互相独立的旁证：
     1) 这张图被某个中文词条引用，且那个词条名对得上这个景点（走 fileusage）
        ——「泰特不列顛」引用 Tate_Britain 而对不上红砖美术馆，一查就露馅
     2) 文件名里直接写着景点名——中文文件名的图很多（「茅家埠.JPG」），
        它们未必被哪个词条引用，但文件名本身就是出处

   两条都不满足就报可疑。脚本只负责把可疑项挑出来，删不删是人的决定。
   已知盲区：词条对了但首图不是这个点位的（如 OVERRIDES 挑错了词条），
   以及同名异地——标题能对上、却是另一个城市的那个同名地点。 */
async function recheck(data) {
  const store = JSON.parse(fs.readFileSync(SOURCES, 'utf8'));
  let spots = allSpots(data).filter(s => store.sources[s.name]);
  if (onlyArg) spots = spots.filter(s => onlyArg.includes(s.name));
  console.log(`复核 ${spots.length} 个已配图景点（--recheck 只报告，不改清单）\n`);

  const bad = [], unknown = [];
  for (let i = 0; i < spots.length; i += 20) {
    const chunk = spots.slice(i, i + 20);
    let j;
    try {
      j = await api('zh.wikipedia.org', {
        action: 'query', formatversion: 2,
        titles: chunk.map(s => 'File:' + store.sources[s.name]).join('|'),
        prop: 'fileusage', fuprop: 'title', fulimit: 'max'
      });
    } catch (e) {
      process.stdout.write(`  · 第 ${i}–${i + chunk.length} 个查询失败，跳过（${e.message}）\n`);
      await sleep(DELAY_MS);
      continue;
    }
    const pages = (j.query && j.query.pages) || [];
    chunk.forEach((s, k) => {
      const file = store.sources[s.name];
      const norm = t => t.replace(/^File:/, '').replace(/_/g, ' ');
      const p = pages.find(x => norm(x.title).toLowerCase() === norm(file).toLowerCase()) || pages[k] || {};
      const used = (p.fileusage || []).map(u => u.title);
      if (used.some(t => titleRelevant(t, s.name, s.city))) return;   // 旁证 1
      if (file.replace(/_/g, ' ').toLowerCase().replace('.jpg', '').replace('.png', '')
              .includes(coreName(s.name).toLowerCase())) return;      // 旁证 2
      /* 分两档报：有引用但对不上 = 实锤配错；查无引用 = 判读不了，不作为证据。
         Commons 上的图很多只在别的语种维基或 Commons 页面出现，中文维基查不到
         引用是常态，把这种也报成「错」只会淹没真问题。 */
      const row = { name: s.name, city: s.city, file, usedBy: used };
      if (used.length) { bad.push(row); process.stdout.write(`  ✗ ${s.city}·${s.name} ← ${file}\n      引用它的是：${used.slice(0, 4).join('、')}\n`); }
      else { unknown.push(row); }
    });
    await sleep(DELAY_MS);
  }

  console.log(`\n✗ 实锤配错 ${bad.length} · ？查无引用、需人看 ${unknown.length} · 共 ${spots.length}`);
  if (unknown.length) {
    console.log('  查无引用的那些（其中多数是对的，只是中文维基没引用）：');
    unknown.forEach(r => console.log(`    ${r.city}·${r.name} ← ${r.file}`));
  }
  const out = path.join(__dirname, 'recheck-report.json');
  fs.writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), wrong: bad, unknown }, null, 2), 'utf8');
  console.log(`明细见 ${path.relative(ROOT, out)}`);
}

/* ---------------- 主流程 ---------------- */
(async () => {
  const data = loadPrototype();
  if (RECHECK) return recheck(data);

  /* 跨城同名会撞键：sources 与 SPOT_IMG 都**只按景点名**做键，两座城的同名景点
     只能共用一张图，必然有一边配错（「广州城隍庙」就是这么显示上上海豫园的）。
     当前模型表达不了，这种一律不配，留占位图。加城市级 images 覆盖也能解，
     但下载脚本的主流程不处理它，图不会落地，反而多一个坑。 */
  const nameCount = {};
  allSpots(data).forEach(s => { nameCount[s.name] = (nameCount[s.name] || 0) + 1; });
  const collided = new Set(Object.keys(nameCount).filter(n => nameCount[n] > 1));

  let spots = imagelessSpots(data);
  if (onlyArg) spots = spots.filter(s => onlyArg.includes(s.name));
  const collidedHere = spots.filter(s => collided.has(s.name));
  spots = spots.filter(s => !collided.has(s.name));
  if (collidedHere.length) {
    console.log(`跨城同名、无法在现模型下配图（留占位图）：${[...new Set(collidedHere.map(s => s.name))].join('、')}\n`);
  }

  const store = JSON.parse(fs.readFileSync(SOURCES, 'utf8'));
  const sources = store.sources;
  const logRows = [];
  let found = 0, skipped = 0, dupes = 0;

  console.log(`待配图景点 ${spots.length} 个（--dry 只报告不写清单）\n`);

  /* 先整批跑精确标题 */
  const wantExact = spots.filter(s => !OVERRIDES[s.name] || !/\s/.test(OVERRIDES[s.name]));
  const exactHits = await exactTitles(wantExact.map(s => (OVERRIDES[s.name] || s.name)));

  for (const s of spots) {
    if (sources[s.name]) { dupes++; continue; }        // 断点续跑：已并入的直接跳过
    const ov = OVERRIDES[s.name];
    const q = ov || (GENERIC_RE.test(s.name) ? `${s.city} ${s.name}` : s.name);
    let rawFile = null, via = '';
    try {
      /* 1) 精确标题。OVERRIDES 是人挑的词条，信任；用景点本名查出来的必须再验一次
         ——「军事博物馆」会被重定向到泛称词条「博物馆」，那张通用图不能要。 */
      const ex = exactHits[ov || s.name];
      if (ex && (ov || titleRelevant(ex.title, s.name, s.city))) {
        rawFile = ex.img; via = '词条首图「' + ex.title + '」';
      }
      // 2) 全文搜索（只认标题对得上的词条）
      if (!rawFile) {
        const [hit] = await searchImage(q, s.name, s.city);
        if (hit) { rawFile = hit.img; via = '搜索「' + q + '」→ ' + hit.title; }
        await sleep(DELAY_MS);
      }
      if (!rawFile) {
        skipped++;
        logRows.push({ name: s.name, city: s.city, ok: false, reason: '检索不到合适词条' });
        process.stdout.write(`  ✗ ${s.city}·${s.name} — 无结果\n`);
        continue;
      }
      let ok = await usableFile(rawFile);
      if (!ok) {
        // 精确命中的文件可能被排除（地图/太小/本地仓库）——再试一次搜索
        const [hit] = await searchImage(q, s.name, s.city);
        await sleep(DELAY_MS);
        const ok2 = hit ? await usableFile(hit.img) : null;
        if (!ok2) {
          skipped++;
          logRows.push({ name: s.name, city: s.city, ok: false, reason: '候选被排除（' + rawFile + '）' });
          process.stdout.write(`  ✗ ${s.city}·${s.name} — 候选被排除（${rawFile}）\n`);
          continue;
        }
        // 这里必须整个换掉 ok：ok 为 null 时 Object.assign(null, …) 会抛
        // TypeError，兜底路径就永远走不通（旧版正是这么静默失败的）
        ok = ok2; via += '→搜索兜底(' + hit.title + ')';
      }
      if (sources[s.name] === ok.file) { dupes++; continue; }
      if (sources[s.name] && sources[s.name] !== ok.file) {
        // 已有条目不覆盖（手工校准优先）
        skipped++;
        logRows.push({ name: s.name, city: s.city, ok: false, reason: '已有条目，不覆盖' });
        continue;
      }
      if (!DRY) {
        sources[s.name] = ok.file;
        // 增量落盘：中断后重跑不重复搜（十几分钟的活，丢一次就烦一次）
        fs.writeFileSync(SOURCES, JSON.stringify(store, null, 2) + '\n', 'utf8');
      }
      found++;
      logRows.push({ name: s.name, city: s.city, ok: true, via, file: ok.file, width: ok.width,
        commons: 'https://commons.wikimedia.org/wiki/File:' + encodeURIComponent(ok.file).replace(/%20/g, '_') });
      process.stdout.write(`  ✓ ${s.city}·${s.name} ← ${ok.file}（${ok.width}px，${via}）\n`);
    } catch (e) {
      skipped++;
      logRows.push({ name: s.name, city: s.city, ok: false, reason: '异常：' + e.message });
      process.stdout.write(`  ✗ ${s.city}·${s.name} — ${e.message}\n`);
    }
  }

  console.log(`\n找到 ${found} · 跳过 ${skipped}${dupes ? ' · 与既有条目相同 ' + dupes : ''}`);
  if (!DRY) {
    fs.writeFileSync(SOURCES, JSON.stringify(store, null, 2) + '\n', 'utf8');
    console.log(`已并入 ${path.relative(ROOT, SOURCES)} —— 接下来运行：\n  node tools/fetch-images.js`);
  } else {
    console.log('（--dry：未写清单）');
  }
  /* 日志追加而不是覆盖：上一轮的记录就是这么被下一次调试 run 冲掉的，
     结果「找到过什么、按什么口径找到的」再也查不回来。按景点名去重，后写的赢。 */
  const byName = new Map();
  try { (JSON.parse(fs.readFileSync(LOG, 'utf8')).rows || []).forEach(r => byName.set(r.name, r)); } catch (e) {}
  logRows.forEach(r => byName.set(r.name, r));
  fs.writeFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), strictTls: STRICT, rows: [...byName.values()] }, null, 2), 'utf8');
})();
