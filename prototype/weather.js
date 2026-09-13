/* Open-Meteo 日预报。历史日期及超出 16 天的日期绝不套用最近一天的天气。 */
(function () {
  'use strict';
  const DAY = 86400000, cache = new Map();
  function today(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const part = t => parts.find(p => p.type === t).value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  }
  function dates(start, days) {
    const ms = Date.parse(start + 'T00:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== start) return [];
    return Array.from({ length: Math.max(1, Math.min(7, Number(days) || 1)) }, (_, i) => new Date(ms + i * DAY).toISOString().slice(0, 10));
  }
  function description(code) {
    if (code === 0) return '晴';
    if ([1, 2, 3].includes(code)) return '多云';
    if ([45, 48].includes(code)) return '雾';
    if ([51, 53, 55, 56, 57].includes(code)) return '毛毛雨';
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return '雨';
    if ([71, 73, 75, 77, 85, 86].includes(code)) return '雪';
    if ([95, 96, 99].includes(code)) return '雷暴';
    return '天气现象未提供';
  }
  function advice(row) {
    const lo = Number.isFinite(row.feelsMin) ? row.feelsMin : row.min;
    const hi = Number.isFinite(row.feelsMax) ? row.feelsMax : row.max;
    const tips = [];
    if (lo <= -10) tips.push('厚羽绒服或棉袄、保暖内层、帽子手套及保暖鞋');
    else if (lo <= 5) tips.push('羽绒服或厚外套，准备保暖内层');
    else if (lo <= 15) tips.push('长袖配外套，早晚加一层');
    else if (hi >= 26) tips.push('透气短袖，室内空调较冷时加薄外套');
    else tips.push('轻薄长袖或短袖配薄外套');
    if (hi - lo >= 10) tips.push('早晚温差大，分层穿着方便增减');
    if (hi >= 30) tips.push('带水、遮阳帽，减少午间暴晒');
    if ([95, 96, 99].includes(row.code)) tips.push('备雨具，雷暴时暂停水上和露天活动并进入室内');
    else if ((row.probability !== null && row.probability >= 40) || row.rain > 0.5 || /雨/.test(description(row.code))) tips.push('带雨伞或雨衣');
    if (row.snow > 0 || /雪/.test(description(row.code))) tips.push('穿防滑防水鞋，注意积雪结冰');
    if (row.wind >= 30) tips.push('备防风外套，风大时优先用雨衣');
    return tips;
  }
  const numberAt = (daily, key, index) => {
    const value = daily[key]?.[index];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  };
  async function load({ center, date, days }, { now = new Date(), fetcher = globalThis.fetch, timeoutMs = 9000, refresh = false } = {}) {
    const wanted = dates(date, days), current = today(now);
    if (!wanted.length) return { status: 'invalid', rows: [], message: '请选择有效的出发日期。' };
    const rows = wanted.map(date => {
      const offset = (Date.parse(date) - Date.parse(current)) / DAY;
      return { date, status: offset < 0 ? 'past' : offset > 15 ? 'out-of-range' : 'pending' };
    });
    if (!rows.some(r => r.status === 'pending')) return { status: 'unavailable', rows };
    if (!Array.isArray(center) || center.length !== 2 || !center.every(Number.isFinite)) return { status: 'error', rows: rows.map(r => r.status === 'pending' ? { ...r, status: 'error' } : r), message: '暂未确定目的地位置。' };
    const key = `${center.join(',')}|${current}`;
    let data = cache.get(key);
    try {
      if (refresh || !data || now.getTime() - data.fetchedAt > 10 * 60000) {
        const controller = new AbortController();
        let timer;
        try {
          const query = new URLSearchParams({ latitude: center[0], longitude: center[1], timezone: 'Asia/Shanghai', forecast_days: '16', daily: 'weather_code,temperature_2m_min,temperature_2m_max,apparent_temperature_min,apparent_temperature_max,precipitation_probability_max,precipitation_sum,snowfall_sum,wind_speed_10m_max' });
          const request = (async () => {
            const res = await fetcher('https://api.open-meteo.com/v1/forecast?' + query, { signal: controller.signal });
            if (!res.ok) throw new Error('weather-http');
            const body = await res.json();
            if (!body.daily || !Array.isArray(body.daily.time) || body.timezone !== 'Asia/Shanghai') throw new Error('weather-schema');
            return { daily: body.daily, fetchedAt: now.getTime() };
          })();
          data = await Promise.race([request, new Promise((_, reject) => {
            timer = setTimeout(() => { controller.abort(); reject(new Error('weather-timeout')); }, timeoutMs);
          })]);
          cache.set(key, data);
        } finally { clearTimeout(timer); }
      }
      const result = rows.map(row => {
        if (row.status !== 'pending') return row;
        const i = data.daily.time.indexOf(row.date);
        const min = numberAt(data.daily, 'temperature_2m_min', i), max = numberAt(data.daily, 'temperature_2m_max', i);
        if (i < 0 || min === null || max === null || min > max) return { ...row, status: 'missing' };
        const r = { ...row, status: 'forecast', min, max, feelsMin: numberAt(data.daily, 'apparent_temperature_min', i), feelsMax: numberAt(data.daily, 'apparent_temperature_max', i), code: numberAt(data.daily, 'weather_code', i), probability: numberAt(data.daily, 'precipitation_probability_max', i), rain: numberAt(data.daily, 'precipitation_sum', i), snow: numberAt(data.daily, 'snowfall_sum', i), wind: numberAt(data.daily, 'wind_speed_10m_max', i) };
        return { ...r, tips: advice(r) };
      });
      return { status: result.every(r => r.status === 'forecast') ? 'ready' : 'partial', rows: result, fetchedAt: data.fetchedAt };
    } catch (_) {
      return { status: 'error', rows: rows.map(r => r.status === 'pending' ? { ...r, status: 'error' } : r), message: '天气获取失败，可重试；不会用季节参考冒充预报。' };
    }
  }
  function seasonal(city, date) {
    const month = Number(date.slice(5, 7));
    const winter = [12, 1, 2].includes(month), summer = [6, 7, 8].includes(month);
    if (winter && city === '哈尔滨') return '冬季通常严寒，提前准备厚羽绒服或棉袄、保暖内层、帽子手套和保暖鞋。';
    if (winter && ['北京', '威海'].includes(city)) return '冬季准备羽绒服、保暖内层和防风衣物；具体厚度按临行预报调整。';
    if (winter && city !== '广州') return '冬季准备厚外套、长裤和保暖内层，留意湿冷体感。';
    if (winter) return '冬季以长袖配外套为基础，遇降温需加厚。';
    if (summer) return '夏季可准备透气短袖、遮阳帽和薄外套；便携雨具可作备用，是否有雨以临行预报为准。';
    return '换季可准备长袖、长裤和可增减的外套；出发前根据预报调整。';
  }
  globalThis.TourisWeather = { load, dates, today, advice, description, seasonal };
})();
