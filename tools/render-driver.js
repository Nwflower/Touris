/* 由 tools/render-tiles.js 调起，在带 Chromium 的容器里跑。
   不要单独执行——城市清单、输出目录、缩放范围都由调用方通过环境变量传进来。
   ==========================================================================
   两个已经踩过的坑，别改回去（详见 render-tiles.js 的文件头）：
     1. canvas.key 是 x:y:z，不是 z:x:y
     2. 每次视野要比步进大一格，否则区块边界的瓦片永远烤不到
   ========================================================================== */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const TARGET = process.env.TARGET;
const OUT = process.env.OUT || '/out';
const ZMIN = Number(process.env.ZMIN || 11);
const ZMAX = Number(process.env.ZMAX || 14);
const JOBS = JSON.parse(process.env.JOBS || '[]');

const BLOCK = 5;
const VIEW = BLOCK + 1;

const lon2x = (lon, z) => Math.floor((lon + 180) / 360 * Math.pow(2, z));
const lat2y = (lat, z) => {
  const r = lat * Math.PI / 180;
  return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, z));
};

function writeTile(z, x, y, dataURL){
  const ext = dataURL.startsWith('data:image/jpeg') ? '.jpg' : '.png';
  const b64 = dataURL.slice(dataURL.indexOf(',') + 1);
  const dir = path.join(OUT, String(z), String(x));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, y + ext), Buffer.from(b64, 'base64'));
}

(async () => {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: VIEW * 256, height: VIEW * 256 });

  const errs = [];
  page.on('pageerror', e => errs.push(String(e.message || e)));
  page.on('console', m => { if(m.type() === 'error') errs.push('[console] ' + m.text()); });

  await page.goto(TARGET, { waitUntil:'networkidle2', timeout:60000 });
  await page.waitForFunction('window.__tiles && window.__tiles.ready !== undefined', { timeout:20000 });

  let grand = 0;

  for(const city of JOBS){
    await page.evaluate(s => window.__tiles.mount(s), city.slug);

    for(let z = ZMIN; z <= ZMAX; z++){
      const r = {
        x0: lon2x(city.bbox[0], z), x1: lon2x(city.bbox[2], z),
        y0: lat2y(city.bbox[3], z), y1: lat2y(city.bbox[1], z)
      };
      const want = new Set();
      for(let x = r.x0; x <= r.x1; x++)
        for(let y = r.y0; y <= r.y1; y++) want.add(`${z}:${x}:${y}`);

      const got = new Set();
      let blocks = 0;

      for(let by = r.y0; by <= r.y1; by += BLOCK){
        for(let bx = r.x0; bx <= r.x1; bx += BLOCK){
          if(got.size >= want.size) break;
          blocks++;
          /* 左上角回退一格，让目标区块落在视野中间 */
          await page.evaluate((z2, x0, y0, c, rw) =>
            window.__tiles.viewBlock(z2, x0, y0, c, rw), z, bx - 1, by - 1, VIEW, VIEW);
          /* 等加载稳定：已加载数量连续两次不变 */
          await page.waitForFunction(() => {
            const n = document.querySelectorAll('canvas.leaflet-tile.leaflet-tile-loaded').length;
            const prev = window.__lastCount;
            window.__lastCount = n;
            return n > 0 && n === prev;
          }, { timeout:15000, polling:300 }).catch(() => {});

          const tiles = await page.evaluate(() => window.__tiles.grab());
          for(const t of tiles){
            const k = `${t.z}:${t.x}:${t.y}`;
            if(want.has(k) && !got.has(k)){ writeTile(t.z, t.x, t.y, t.data); got.add(k); }
          }
        }
      }

      /* 补漏：边缘仍可能漏几张，缺的逐个用 3×3 视野重来 */
      const missing = [...want].filter(k => !got.has(k));
      for(const k of missing){
        const [mz, mx, my] = k.split(':').map(Number);
        await page.evaluate((z2, x0, y0, c, rw) =>
          window.__tiles.viewBlock(z2, x0, y0, c, rw), mz, mx - 1, my - 1, 3, 3);
        await new Promise(r2 => setTimeout(r2, 260));
        const tiles = await page.evaluate(() => window.__tiles.grab());
        for(const t of tiles){
          const kk = `${t.z}:${t.x}:${t.y}`;
          if(want.has(kk) && !got.has(kk)){ writeTile(t.z, t.x, t.y, t.data); got.add(kk); }
        }
      }

      grand += got.size;
      const miss = want.size - got.size;
      console.log(`  ${city.slug.padEnd(10)} z${z}  ${got.size}/${want.size} 张${miss ? '  缺 ' + miss : ''}  (${blocks} 个视野)`);
    }
  }

  if(errs.length){
    console.log('\n  === 页面错误 ===');
    [...new Set(errs)].slice(0, 8).forEach(e => console.log('    ' + e.slice(0, 160)));
  }
  console.log(`\n  合计写出 ${grand} 张 → ${OUT}`);
  await browser.close();
})().catch(e => { console.log('  渲染驱动出错：' + e.message); process.exit(1); });
