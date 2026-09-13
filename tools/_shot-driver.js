/* 由 tools/_shot.js 调起，在带 Chromium 的容器里跑。不要单独执行。 */
const puppeteer = require('puppeteer');
const path = require('path');

const TARGET = process.env.TARGET;
const OUT = process.env.OUT || '/out';
const W = Number(process.env.W || 1440);
const H = Number(process.env.H || 900);
const SHOTS = JSON.parse(process.env.SHOTS || '[]');
const PROBE_MAP = process.env.PROBE_MAP === '1';

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H });

  const errs = [];
  const tileMiss = [];       // 没烤到的瓦片（tiles-raster 只有 z11–14）
  page.on('pageerror', e => errs.push('pageerror: ' + String(e.message || e)));
  page.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text().slice(0, 150)); });
  page.on('requestfailed', r => errs.push('[请求失败] ' + r.url().slice(0, 110) + ' ' + (r.failure() || {}).errorText));
  page.on('response', r => {
    const u = r.url();
    if (r.status() >= 400) {
      const m = /tiles-raster\/(\d+)\//.exec(u);
      if (m) tileMiss.push('z' + m[1] + '  ' + u.slice(u.indexOf('tiles-raster')));
      else errs.push('[HTTP ' + r.status() + '] ' + u.slice(0, 110));
    }
  });

  /* 不用 networkidle2：首页有轮播图 + 瓦片，网络一直不静默，会一直等到超时 */
  await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction('!!document.querySelector("#heroSlides .hs.on")', { timeout: 20000 });
  await sleep(1200);

  for (const s of SHOTS) {
    /* click：按选择器先点一下再拍。首页之外（S0/攻略/方案页）的顶栏状态只能这么进去，
       否则拍来拍去都只有首页。 */
    if (s.click) { await page.click(s.click); await sleep(s.afterClick || 700); }
    /* home 模式下滚的是 window，不是 #work（#work 只在工作台模式下滚） */
    if (s.scroll) await page.evaluate(y => window.scrollTo(0, y), s.scroll);
    if (s.wait) await sleep(s.wait);
    await page.screenshot({ path: path.join(OUT, s.name + '.png'), fullPage: !!s.full });
    console.log('  ✓ ' + s.name + '.png');
  }

  /* 控制台里直接量一遍几何：比肉眼看更早发现问题，但不能替代肉眼看 */
  const geo = await page.evaluate(() => {
    const c = document.querySelector('.hero-ctrl');
    const d = document.querySelectorAll('#heroDots .hc-dot');
    const hero = document.getElementById('hero');
    if (!c) return { err: '.hero-ctrl 不存在' };
    const r = c.getBoundingClientRect(), hr = hero.getBoundingClientRect();
    return {
      控件盒: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      hero盒: [Math.round(hr.x), Math.round(hr.y), Math.round(hr.width), Math.round(hr.height)],
      距右: Math.round(hr.right - r.right),
      距底: Math.round(hr.bottom - r.bottom),
      圆点数: d.length,
      箭头数: document.querySelectorAll('.hc-arrow').length,
      播放键数: document.querySelectorAll('.hc-play').length,
      计数器数: document.querySelectorAll('.hc-label').length,
      控件文本: c.textContent.trim()
    };
  });
  console.log('\n  实测几何：');
  Object.entries(geo).forEach(([k, v]) => console.log('    ' + k + ' = ' + JSON.stringify(v)));

  /* ---------------- 地图探针 ----------------
     用户报的问题：预览组件缩小时会去取**没烤过的层级**的瓦片，缩下去是一片空白。
     这里就照做：进到有地图的页面，一路缩小 + 把地图拖到角落，
     然后看 tiles-raster 有没有 z<11 的请求，以及视野里还剩不剩瓦片。 */
  if (PROBE_MAP) {
    console.log('\n  === 地图探针 ===');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.click('[data-act="start"]');
    await page.waitForSelector('.real-map-canvas .leaflet-tile-loaded', { timeout: 40000 });
    await sleep(1500);

    await page.evaluate(() => {
      const el = document.querySelector('.real-map');
      if (el) el.scrollIntoView({ block: 'center' });
    });
    await sleep(600);
    await page.screenshot({ path: path.join(OUT, '10-地图-初始.png') });
    console.log('  ✓ 10-地图-初始.png');

    const readTiles = () => page.evaluate(() => {
      const tiles = [...document.querySelectorAll('.leaflet-tile')];
      const urls = tiles.map(t => t.src).filter(u => u.includes('tiles-raster'));
      const zs = [...new Set(urls.map(u => Number(/tiles-raster\/(\d+)\//.exec(u)[1])))].sort((a, b) => a - b);
      const loaded = tiles.filter(t => t.classList.contains('leaflet-tile-loaded')).length;
      return { 瓦片总数: tiles.length, 已加载: loaded, 瓦片层级: zs,
               状态条: (document.querySelector('.real-map-status') || {}).textContent };
    });

    console.log('  缩小前：' + JSON.stringify(await readTiles()));

    /* 用缩放控件狂点缩小 */
    for (let i = 0; i < 8; i++) {
      const btn = await page.$('.leaflet-control-zoom-out');
      if (!btn) break;
      await btn.click();
      await sleep(350);
    }
    console.log('  狂点缩小 ×8 之后：' + JSON.stringify(await readTiles()));
    await page.screenshot({ path: path.join(OUT, '11-地图-缩到最小.png') });
    console.log('  ✓ 11-地图-缩到最小.png');

    /* 再把地图往东北方向猛拖，看能不能拖出数据范围 */
    const box = await page.$('.real-map-canvas');
    if (box) {
      const b = await box.boundingBox();
      const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
      for (let i = 0; i < 5; i++) {
        await page.mouse.move(cx, cy);
        await page.mouse.down();
        await page.mouse.move(cx + 600, cy - 500, { steps: 12 });
        await page.mouse.up();
        await sleep(300);
      }
      /* 拖完再缩小试试 */
      for (let i = 0; i < 4; i++) {
        const btn = await page.$('.leaflet-control-zoom-out');
        if (!btn) break;
        await btn.click();
        await sleep(300);
      }
      console.log('  猛拖 + 再缩小之后：' + JSON.stringify(await readTiles()));
      await page.screenshot({ path: path.join(OUT, '12-地图-拖到边界.png') });
      console.log('  ✓ 12-地图-拖到边界.png');
    }

    console.log('\n  没烤到的瓦片请求：' + (tileMiss.length ? tileMiss.length + ' 个 ✗' : '0 个 ✓'));
    [...new Set(tileMiss)].slice(0, 12).forEach(t => console.log('    ' + t));
  }

  if (errs.length) {
    console.log('\n  === 页面错误 ===');
    [...new Set(errs)].slice(0, 10).forEach(e => console.log('    ' + e.slice(0, 170)));
  } else {
    console.log('\n  无页面错误。');
  }
  await browser.close();
})().catch(e => { console.log('  截图驱动出错：' + e.message); process.exit(1); });
