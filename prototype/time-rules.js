/* 编辑规划窗口，不等同于实时营业时间。可用 spot.planningWindow 明确覆盖。 */
(function () {
  'use strict';
  const MEALS = {
    breakfast: { start: 420, end: 630, label: '早餐', duration: 45 },
    lunch: { start: 690, end: 840, label: '午餐', duration: 75 },
    dinner: { start: 1050, end: 1200, label: '晚餐', duration: 60 }
  };
  function spotWindow(name, spot) {
    if (spot.planningWindow) return spot.planningWindow;
    // “夜景”仅是特色；白天可参观的塔、公园、江桥不因此全部变成夜游。
    const explicitNight = /夜游|夜市/.test(name) || ['天字码头', '东门码头'].includes(name)
      || (spot.tags || []).some(t => /^夜游/.test(t));
    if (explicitNight) return { start: 1140, end: 1380, label: '晚间活动 · 19:00 后安排，场次请另行确认' };
    if (spot.cat === 'museum') return { start: 540, end: 1020, label: '日间参观 · 09:00—17:00 规划窗口，开放与预约请确认' };
    return { start: 0, end: 1440, label: '' };
  }
  function pickMeals(pick) {
    if (Array.isArray(pick.mealTypes)) return pick.mealTypes;
    const text = [pick.style, pick.cuisine, pick.note].join(' ');
    if (/饭后|甜品饮品|老茶馆|茶园茶馆|公园旁茶馆/.test(text)) return ['snack'];
    if (/早餐|早饭|早点|早茶|午前营业|7-10/.test(text)) return ['breakfast'];
    if (/午市为主|午饭/.test(text)) return ['lunch'];
    if (/宵夜|夜宵|夜游前后/.test(text)) return ['dinner'];
    return ['lunch', 'dinner'];
  }
  function diningForMeal(group, meal) {
    if (!group || !MEALS[meal]) return null;
    const picks = (group.picks || []).filter(p => pickMeals(p).includes(meal)).map(p => {
      const otherPeriod = meal === 'lunch' ? /晚餐|晚市|傍晚|夜宵/ : /午市|午饭|午后/;
      return otherPeriod.test(p.note || '') ? Object.assign({}, p, { note: '具体供应时段以门店当天安排为准' }) : p;
    });
    if (!picks.length) return null;
    // 混合候选组原主题可能含“早餐”，根据本次实际餐别展示，不能只过滤列表。
    return Object.assign({}, group, { picks, theme: MEALS[meal].label + ' · 周边餐饮', meal });
  }
  globalThis.TourisTime = { MEALS, spotWindow, pickMeals, diningForMeal };
})();
