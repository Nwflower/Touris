const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const path = require('node:path');
for (const f of ['time-rules.js', 'planner.js', 'weather.js']) vm.runInThisContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), { filename: f });

const geo = { lat: 23.112, lng: 113.268 };
const spot = (name, visitMin, cat = 'river', tags = []) => ({ name, spot: { visitMin, cat, tags }, geo });
const c = { geo: { '码头': geo, '公园': geo }, restPoi: { breakfast: '码头', mixed: '公园' }, dining: {
  breakfast: { area: '早餐区', picks: [{ style: '早点铺', cuisine: '早餐' }] },
  mixed: { area: '混合区', theme: '社区早餐', picks: [{ style: '早餐铺' }, { style: '面馆' }] }
} };
const result = TourisPlanner.scheduleDay(c, [spot('天字码头', 30), spot('公园', 120, 'garden'), spot('博物馆', 100, 'museum')], 'fast', {}, geo);
const night = result.items.find(x => x.kind === 'spot' && x.g.name === '天字码头');
assert(night && night.arrive >= 19 * 60, '08:20 天字码头回归：必须在 19:00 后');
assert(result.items.find(x => x.kind === 'spot' && x.g.name === '公园').arrive < night.arrive, '白天点优先，不能等到晚上才游公园');
assert(result.items.some(x => x.kind === 'food' && x.meal === 'lunch'), '午餐不被夜游等待挤掉');
assert(result.items.filter(x => x.kind === 'food').every(x => x.id !== 'breakfast'), '最近早餐区域不可用于午晚餐');
assert.equal(TourisTime.diningForMeal(c.dining.mixed, 'lunch').picks.length, 1);
assert(!TourisTime.diningForMeal(c.dining.mixed, 'lunch').theme.includes('早餐'));
assert.equal(TourisTime.spotWindow('广州塔', { tags: ['夜景'] }).start, 0, '夜景特色不等于只能夜间参观');
assert.equal(TourisTime.spotWindow('东城路夜市', {}).start, 1140);
const impossible = TourisPlanner.scheduleDay(c, [spot('珠江夜游', 180)], 'slow', {}, geo);
assert.equal(impossible.spots, 0, '无法在回程前结束的夜游必须跳过');
console.log('✓ 夜游排序、用餐窗口、候选过滤与放不下的活动回退');

(async () => {
  const now = new Date('2026-09-13T03:00:00Z');
  assert.equal(TourisWeather.today(new Date('2026-09-12T17:00:00Z')), '2026-09-13', '按目的地日期判断预报范围');
  assert.deepEqual(TourisWeather.dates('2026-02-30', 3), []);
  let calls = 0;
  const fetcher = async url => {
    calls++;
    assert(url.includes('forecast_days=16') && url.includes('timezone=Asia%2FShanghai'));
    return { ok: true, json: async () => ({ timezone: 'Asia/Shanghai', daily: {
      time: ['2026-09-13', '2026-09-14', '2026-09-28'],
      temperature_2m_min: [20, null, 16], temperature_2m_max: [31, null, 25],
      apparent_temperature_min: [21, null, 15], apparent_temperature_max: [34, null, 25],
      weather_code: [61, null, 0], precipitation_probability_max: [85, null, null]
    } }) };
  };
  const req = { center: [23, 113], date: '2026-09-13', days: 2 };
  const a = await TourisWeather.load(req, { now, fetcher });
  assert.equal(a.status, 'partial');
  assert(a.rows[0].tips.some(t => t.includes('雨伞')));
  assert(a.rows[0].tips.some(t => t.includes('短袖')));
  assert.equal(a.rows[1].status, 'missing', 'null 温度不能当 0℃');
  const edge = await TourisWeather.load({ ...req, date: '2026-09-28' }, { now, fetcher });
  assert.deepEqual(edge.rows.map(r => r.status), ['forecast', 'out-of-range']);
  assert.equal(edge.rows[0].probability, null, '缺失概率不能当 0%');
  assert.equal(calls, 1, '同城同日请求使用缓存');
  await TourisWeather.load(req, { now, fetcher, refresh: true });
  assert.equal(calls, 2, '明确重试绕过缓存');
  const distant = await TourisWeather.load({ ...req, date: '2026-12-01' }, { now, fetcher });
  assert(distant.rows.every(r => r.status === 'out-of-range'));
  const past = await TourisWeather.load({ ...req, date: '2026-09-01' }, { now, fetcher });
  assert(past.rows.every(r => r.status === 'past'));
  assert.equal(calls, 2, '过去和远期日期不请求无关预报');
  const error = await TourisWeather.load({ ...req, center: [24, 114] }, { now, fetcher: async () => { throw Error('offline'); } });
  assert.equal(error.status, 'error');
  const httpError = await TourisWeather.load({ ...req, center: [25, 115] }, { now, fetcher: async () => ({ ok: false }) });
  assert.equal(httpError.status, 'error');
  const timeout = await TourisWeather.load({ ...req, center: [26, 116] }, { now, timeoutMs: 5, fetcher: () => new Promise(() => {}) });
  assert.equal(timeout.status, 'error', '请求不返回时也必须结束加载状态');
  assert(TourisWeather.advice({ min: -20, max: -12 }).some(t => t.includes('棉袄')));
  assert(TourisWeather.seasonal('哈尔滨', '2026-12-01').includes('棉袄'));
  assert(TourisWeather.seasonal('北京', '2026-07-01').includes('短袖'));
  console.log('✓ 天气日期边界、部分缺失、缓存/重试、失败/超时、冷热与雨具建议');
})().catch(e => { console.error(e); process.exitCode = 1; });
