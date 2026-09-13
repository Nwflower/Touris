/* 容器里的 puppeteer 驱动：加载临时验证页，回报实际走了哪条引擎。
   由 _tmp-e2e.js 调起，跑完即删。 */
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 700 });

  const errs = [], bad = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  page.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
  page.on('requestfailed', r => bad.push('FAILED ' + r.url()));

  await page.goto(process.env.TARGET, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 7000));

  const out = await page.evaluate(() => {
    const el = document.querySelector('.real-map');
    return {
      engine: el && el.dataset.mapEngine,
      status: el ? el.querySelector('.real-map-status').textContent : null,
      vectorCanvasTiles: document.querySelectorAll('canvas.leaflet-tile').length,
      rasterImgTiles: document.querySelectorAll('img.leaflet-tile').length,
      markers: document.querySelectorAll('.touris-marker').length,
      hasL: typeof L !== 'undefined',
      hasProtomapsL: typeof protomapsL !== 'undefined',
      hasPmtiles: typeof pmtiles !== 'undefined'
    };
  });

  console.log('=== 结果 ===');
  console.log(JSON.stringify(out, null, 2));
  console.log('失败请求:', bad.length ? bad.slice(0, 8) : '无');
  console.log('页面错误:', errs.length ? errs.slice(0, 8) : '无');

  const pass = out.engine === 'vector' && out.vectorCanvasTiles > 0 && out.markers === 4;
  console.log('\n判定:', pass ? '✓ 矢量路径端到端跑通' : '✗ 未达预期');

  await browser.close();
})().catch(e => { console.log('✗ 驱动异常:', e.message); process.exit(1); });
