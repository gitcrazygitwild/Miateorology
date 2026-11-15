// Shared weather classification and artwork for Mia-teorology and Hubert’s House.
// Keep the copies in both repositories identical.
export function richmondDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const value = type => parts.find(part => part.type === type).value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function forecastCondition(day = {}) {
  const c = day.consensus || {};
  const signal = key => ['strong', 'medium', 'weak'].includes(c[key]);
  if (signal('thunderSignal')) return { kind: 'storm', label: 'Thunderstorms possible' };
  if (signal('snowSignal')) return { kind: 'snow', label: 'Snow in the forecast' };
  if (signal('rainSignal')) return { kind: 'rain', label: c.rainSignal === 'weak' ? 'A chance of showers' : 'Rain in the forecast' };
  const summaries = Object.values(day.sources || {}).map(source => String(source?.summary || '').toLowerCase()).filter(Boolean);
  const types = summaries.map(summary => /thunder/.test(summary) ? 'storm' : /snow|sleet/.test(summary) ? 'snow'
    : /rain|shower|drizzle/.test(summary) ? 'rain' : /fog|mist/.test(summary) ? 'fog'
    : /partly|mostly sunny/.test(summary) ? 'partly' : /cloud|overcast/.test(summary) ? 'cloud'
    : /sunny|clear/.test(summary) ? 'sun' : 'unknown');
  if (types.includes('storm')) return { kind: 'storm', label: 'A chance of storms' };
  if (types.includes('snow')) return { kind: 'snow', label: 'A chance of snow' };
  if (types.includes('rain')) return { kind: 'rain', label: 'A chance of showers' };
  if (types.includes('fog')) return { kind: 'fog', label: 'Fog possible' };
  if (types.includes('partly') || (types.includes('sun') && types.includes('cloud'))) return { kind: 'partly', label: 'Sun & clouds' };
  if (types.includes('cloud')) return { kind: 'cloud', label: 'Cloudy skies' };
  if (types.includes('sun')) return { kind: 'sun', label: 'Mostly clear' };
  return { kind: 'unknown', label: 'Conditions unavailable' };
}

// All geometry is fixed; forecast text never becomes SVG markup.
export function weatherIcon(kind = 'unknown') {
  const sun = '<g stroke="#d49b30" stroke-width="2.4" stroke-linecap="round"><path d="M21 4v4m0 26v4M4 21h4m26 0h4M9 9l3 3m18 18 3 3M9 33l3-3m18-18 3-3"/><circle cx="21" cy="21" r="8" fill="#f5cc6a"/></g>';
  const cloud = '<path d="M12 34a8 8 0 0 1 0-16 11 11 0 0 1 21-2 9 9 0 0 1 2 18Z" fill="#f9fcfa" stroke="#7896a2" stroke-width="2.2" stroke-linejoin="round"/>';
  let shape = '<path d="M18 9h12v22a9 9 0 1 1-12 0Z" fill="#f5f4eb" stroke="#8a9b8b" stroke-width="2.4"/><path d="M24 15v20" stroke="#b1bfa4" stroke-width="4" stroke-linecap="round"/><circle cx="24" cy="38" r="4" fill="#b1bfa4"/>';
  if (kind === 'sun') shape = `<g transform="translate(3 3)">${sun}</g>`;
  if (kind === 'partly') shape = `<g transform="translate(0 -1) scale(.85)">${sun}</g><g transform="translate(4 8) scale(.9)">${cloud}</g>`;
  if (kind === 'cloud') shape = `<g transform="translate(2 4)">${cloud}</g>`;
  if (['rain', 'snow', 'storm', 'fog'].includes(kind)) {
    shape = `<g transform="translate(2 -2)">${cloud}</g>`;
    if (kind === 'rain') shape += '<path d="m15 37-2 5m12-5-2 5m12-5-2 5" stroke="#6b9bbb" stroke-width="2.8" stroke-linecap="round"/>';
    if (kind === 'snow') shape += '<g fill="#86adbd"><circle cx="13" cy="39" r="2"/><circle cx="24" cy="42" r="2"/><circle cx="35" cy="39" r="2"/></g>';
    if (kind === 'storm') shape += '<path d="m25 31-7 9h7l-3 7 12-12h-8l4-4" fill="#e8b54d" stroke="#bb8b2c" stroke-width="1.2" stroke-linejoin="round"/>';
    if (kind === 'fog') shape += '<path d="M10 37h28M14 43h21" stroke="#9bada9" stroke-width="2.5" stroke-linecap="round"/>';
  }
  return `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false" data-weather-kind="${['sun','partly','cloud','rain','snow','storm','fog'].includes(kind) ? kind : 'unknown'}">${shape}</svg>`;
}

