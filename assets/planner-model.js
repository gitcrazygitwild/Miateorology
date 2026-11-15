import { richmondDay } from './weather-shared.js';

export const OUTDOOR_ACTIVITIES = {
  walk: { label: 'A walk', hours: 2, minF: 45, maxF: 82, rain: 30, wind: 18 },
  errands: { label: 'Quick errands', hours: 1, minF: 30, maxF: 95, rain: 50, wind: 25 },
  patio: { label: 'Patio time', hours: 2, minF: 60, maxF: 85, rain: 20, wind: 12 }
};

export function upcomingHours(data, now = new Date(), count = 24) {
  const generated = new Date(data?.generatedAt);
  if (!Number.isFinite(+generated) || now - generated > 72 * 3600000 || generated - now > 300000) return [];
  return (Array.isArray(data?.hours) ? data.hours : []).filter(hour => {
    const time = new Date(hour.timeISO);
    return Number.isFinite(+time) && +time + 3600000 > +now && +time < +now + 48 * 3600000;
  }).sort((a,b) => new Date(a.timeISO) - new Date(b.timeISO))
    .filter((hour, index, all) => index === 0 || +new Date(hour.timeISO) !== +new Date(all[index - 1].timeISO)).slice(0, count);
}

export function bestOutdoorWindow(data, conditions, activity = 'walk', now = new Date()) {
  const rule = OUTDOOR_ACTIVITIES[activity] || OUTDOOR_ACTIVITIES.walk;
  const days = new Map((conditions?.days || []).map(day => [day.date, day]));
  const hours = upcomingHours(data, now, 48).filter(hour => new Date(hour.timeISO) >= now);
  const hourFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' });
  const candidates = [];
  for (let i = 0; i <= hours.length - rule.hours; i++) {
    const window = hours.slice(i, i + rule.hours);
    if (!window.every((hour, offset) => {
      const stamp = new Date(hour.timeISO), localHour = Number(hourFormatter.format(stamp));
      const signals = days.get(richmondDay(stamp))?.consensus || {};
      return stamp - new Date(window[0].timeISO) === offset * 3600000 && localHour >= 7 && localHour < 19 &&
        [hour.blendedTempF, hour.blendedPrecipProbability, hour.blendedWindMph].every(Number.isFinite) &&
        hour.blendedTempF >= rule.minF && hour.blendedTempF <= rule.maxF &&
        hour.blendedPrecipProbability >= 0 && hour.blendedPrecipProbability <= rule.rain &&
        hour.blendedWindMph >= 0 && hour.blendedWindMph <= rule.wind &&
        !['strong','medium'].includes(signals.thunderSignal) && !['strong','medium'].includes(signals.snowSignal);
    })) continue;
    const start = new Date(window[0].timeISO), end = new Date(+start + rule.hours * 3600000);
    const low = Math.min(...window.map(hour => hour.blendedTempF)), high = Math.max(...window.map(hour => hour.blendedTempF));
    const rain = Math.max(...window.map(hour => hour.blendedPrecipProbability)), wind = Math.max(...window.map(hour => hour.blendedWindMph));
    const score = rain * 2 + wind + Math.abs((low + high) / 2 - 68);
    candidates.push({ start, end, low, high, rain, wind, score });
  }
  return candidates.sort((a,b) => a.score - b.score || a.start - b.start)[0] || null;
}
