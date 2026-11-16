import { richmondDay } from './weather-shared.js';
import { upcomingHours, bestOutdoorWindow, OUTDOOR_ACTIVITIES } from './planner-model.js';

const $ = id => document.getElementById(id);
const format = options => new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', ...options });
const number = (value, suffix = '') => Number.isFinite(value) ? `${Math.round(value)}${suffix}` : '—';

export function renderHourlyStrip(data, now = new Date()) {
  const hours = upcomingHours(data, now, 48).filter(hour => +new Date(hour.timeISO) < +now + 24 * 3600000);
  const container = $('hourlyStrip');
  if (!hours.length) {
    container.textContent = 'The next hourly forecast is not available yet. Try refreshing in a little while.';
    $('hourlyTrend').replaceChildren(); $('hourlyIssued').textContent = ''; return;
  }
  const cards = hours.map(hour => {
    const stamp = new Date(hour.timeISO), current = stamp <= now && +stamp + 3600000 > +now;
    const card = document.createElement('div'); card.className = 'hour-card'; card.setAttribute('role', 'listitem');
    for (const [tag, className, text] of [
      ['span','hour-label',current ? 'This hour' : format({hour:'numeric'}).format(stamp)],
      ['small','hour-day',richmondDay(stamp) === richmondDay(now) ? 'Today' : format({weekday:'short'}).format(stamp)],
      ['strong','hour-temp',number(hour.blendedTempF, '°')],
      ['span','hour-rain',`${number(hour.blendedPrecipProbability, '%')} rain`],
      ['small','hour-wind',`${number(hour.blendedWindMph)} mph`]
    ]) { const element = document.createElement(tag); element.className = className; element.textContent = text; card.append(element); }
    const bar = document.createElement('span'); bar.className = 'hour-rain-bar'; bar.setAttribute('aria-hidden','true');
    bar.style.setProperty('--rain', `${Number.isFinite(hour.blendedPrecipProbability) ? Math.min(100, Math.max(0, hour.blendedPrecipProbability)) : 0}%`);
    card.append(bar); return card;
  });
  container.replaceChildren(...cards);
  const values = hours.map(hour => hour.blendedTempF);
  if (values.every(Number.isFinite) && values.length > 1) {
    const min = Math.min(...values) - 2, span = Math.max(4, Math.max(...values) - min + 2);
    const points = values.map((value, index) => `${(index / (values.length - 1) * 900 + 10).toFixed(1)},${(78 - (value - min) / span * 66).toFixed(1)}`).join(' ');
    $('hourlyTrend').innerHTML = `<svg viewBox="0 0 920 90" role="img" aria-label="Temperature trend for the next ${values.length} forecast hours, from ${Math.round(Math.min(...values))} to ${Math.round(Math.max(...values))} degrees Fahrenheit"><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  } else $('hourlyTrend').replaceChildren();
  $('hourlyIssued').textContent = `Forecast issued ${format({month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(data.generatedAt))} ET · °F`;
}

export function initOutdoorPlanner() {
  let data, conditions, activity = 'walk';
  try { if (Object.hasOwn(OUTDOOR_ACTIVITIES, localStorage.getItem('mia_outdoor_activity'))) activity = localStorage.getItem('mia_outdoor_activity'); } catch {}
  function render() {
    document.querySelectorAll('[data-outdoor-activity]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.outdoorActivity === activity)));
    const now = new Date(), window = bestOutdoorWindow(data, conditions, activity, now);
    if (!window) {
      $('outdoorWhen').textContent = 'No clear window just yet.';
      $('outdoorDetails').textContent = upcomingHours(data, now).length ? 'The available daylight hours don’t match this activity’s rain, wind, and temperature preferences. Try another activity.' : 'Waiting for a current hourly forecast.';
      $('outdoorDay').textContent = 'A LITTLE WEATHER PLANNING'; return;
    }
    $('outdoorDay').textContent = `${format({weekday:'long',month:'short',day:'numeric'}).format(window.start)} · RICHMOND`;
    $('outdoorWhen').textContent = format({hour:'numeric',minute:'2-digit'}).formatRange(window.start, window.end);
    $('outdoorDetails').textContent = `${number(window.low)}–${number(window.high)}°F · rain chance up to ${number(window.rain)}% · wind up to ${number(window.wind)} mph`;
  }
  document.querySelectorAll('[data-outdoor-activity]').forEach(button => button.addEventListener('click', () => {
    activity = button.dataset.outdoorActivity;
    try { localStorage.setItem('mia_outdoor_activity', activity); } catch {}
    render();
  }));
  return (nextData, nextConditions) => { data = nextData; conditions = nextConditions; render(); };
}
