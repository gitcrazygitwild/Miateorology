import { DateTime } from "luxon";
import fs from "node:fs";
import path from "node:path";

const TZ = "America/New_York";
const RICHMOND = { name: "Richmond, VA", lat: 37.5407, lon: -77.4360 };

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

function writeJson(filePath, obj) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

async function fetchJson(url, { headers = {} } = {}) {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Fetch failed ${res.status} ${res.statusText} for ${url}\n${txt.slice(0, 500)}`);
  }
  return res.json();
}

function fFromC(c) {
  return (c == null || Number.isNaN(c)) ? null : (c * 9) / 5 + 32;
}

function mphFromMs(ms) {
  return (ms == null || Number.isNaN(ms)) ? null : ms * 2.2369362921;
}

function round1(x) {
  return x == null ? null : Math.round(x * 10) / 10;
}

function round0(x) {
  return x == null ? null : Math.round(x);
}

function mean(nums) {
  const v = nums.filter(n => typeof n === "number" && !Number.isNaN(n));
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

function minVal(nums) {
  const v = nums.filter(n => typeof n === "number" && !Number.isNaN(n));
  return v.length ? Math.min(...v) : null;
}

function maxVal(nums) {
  const v = nums.filter(n => typeof n === "number" && !Number.isNaN(n));
  return v.length ? Math.max(...v) : null;
}

function classifySpread(spreadF) {
  if (spreadF == null) return "unknown";
  if (spreadF <= 2) return "high";
  if (spreadF <= 5) return "medium";
  return "low";
}

function truthyCount(arr) {
  return arr.filter(Boolean).length;
}

function signalStrength(count) {
  if (count >= 3) return "strong";
  if (count === 2) return "medium";
  if (count === 1) return "weak";
  return "off";
}

function normalizeText(s) {
  return String(s || "").toLowerCase();
}

function textHasAny(text, words) {
  const t = normalizeText(text);
  return words.some(w => t.includes(w));
}

function safeMax(arr) {
  const vals = arr.filter(v => typeof v === "number" && !Number.isNaN(v));
  return vals.length ? Math.max(...vals) : null;
}

function classifyWindSignal(maxWindMph) {
  if (maxWindMph == null) return "off";
  if (maxWindMph >= 30) return "strong";
  if (maxWindMph >= 20) return "medium";
  if (maxWindMph >= 12) return "weak";
  return "off";
}

function rainbowScoreFromDay(day) {
  const avgPrecip = day?.consensus?.avgPrecipProbability ?? null;
  const rainSignal = day?.consensus?.rainSignal ?? "off";
  const summary = normalizeText(day?.consensus?.summary || "");
  const sources = day?.sources || {};

  let score = 0;

  if (avgPrecip != null) {
    if (avgPrecip >= 30) score += 20;
    if (avgPrecip >= 45) score += 15;
    if (avgPrecip >= 60) score += 10;
  }

  if (rainSignal === "weak") score += 8;
  if (rainSignal === "medium") score += 18;
  if (rainSignal === "strong") score += 25;

  if (textHasAny(summary, ["quiet"])) score -= 18;
  if (textHasAny(summary, ["thunder"])) score += 6;

  const sourceTexts = [
    sources.nws?.summary,
    sources.openMeteo?.summary,
    sources.metNo?.summary
  ].filter(Boolean).join(" ").toLowerCase();

  if (textHasAny(sourceTexts, ["partly", "sun", "clear", "cloud"])) score += 12;
  if (textHasAny(sourceTexts, ["overcast"])) score -= 8;
  if (textHasAny(sourceTexts, ["showers"])) score += 8;

  score = Math.max(0, Math.min(100, score));

  const band =
    score >= 70 ? "High" :
    score >= 45 ? "Medium" :
    score >= 20 ? "Low" :
    "Slim";

  const summaryText =
    score >= 70 ? "Best setup for sun plus showers." :
    score >= 45 ? "A decent post-shower rainbow setup." :
    score >= 20 ? "A small rainbow chance if breaks in the clouds line up." :
    "Not much of a rainbow setup right now.";

  return { score: round0(score), band, summary: summaryText };
}

// ---------- Condition parsing ----------
function inferRainFromText(text) {
  return textHasAny(text, ["rain", "showers", "drizzle", "sprinkles"]);
}

function inferSnowFromText(text) {
  return textHasAny(text, ["snow", "flurries", "sleet", "wintry mix", "freezing rain", "ice pellets"]);
}

function inferThunderFromText(text) {
  return textHasAny(text, ["thunder", "t-storm", "storm", "thunderstorm"]);
}

function summarizeConsensus(day) {
  const rainCount = truthyCount([
    day.sources.nws?.rain,
    day.sources.openMeteo?.rain,
    day.sources.metNo?.rain
  ]);

  const snowCount = truthyCount([
    day.sources.nws?.snow,
    day.sources.openMeteo?.snow,
    day.sources.metNo?.snow
  ]);

  const thunderCount = truthyCount([
    day.sources.nws?.thunder,
    day.sources.openMeteo?.thunder,
    day.sources.metNo?.thunder
  ]);

  const avgPrecip = mean([
    day.sources.nws?.precipProbability,
    day.sources.openMeteo?.precipProbability,
    day.sources.metNo?.precipProbability
  ]);

  const avgWindMph = mean([
    day.sources.nws?.windMph,
    day.sources.openMeteo?.windMph,
    day.sources.metNo?.windMph
  ]);

  const maxWindMph = safeMax([
    day.sources.nws?.windMph,
    day.sources.openMeteo?.windMph,
    day.sources.metNo?.windMph
  ]);

  return {
    rainSignal: signalStrength(rainCount),
    snowSignal: signalStrength(snowCount),
    thunderSignal: signalStrength(thunderCount),
    avgPrecipProbability: avgPrecip == null ? null : round1(avgPrecip),
    avgWindMph: avgWindMph == null ? null : round1(avgWindMph),
    windSignal: classifyWindSignal(maxWindMph),
    summary:
      thunderCount >= 2 ? "Thunder signal present" :
      snowCount >= 2 ? "Snow signal present" :
      rainCount >= 2 ? "Rain signal present" :
      avgPrecip != null && avgPrecip >= 50 ? "Some precipitation possible" :
      "Mostly quiet signal"
  };
}

function buildWeatherStory(days) {
  const today = days?.[0];
  const tomorrow = days?.[1];
  if (!today) {
    return {
      title: "Weather story",
      summary: "Forecast story not ready yet."
    };
  }

  const c = today.consensus || {};
  const tC = tomorrow?.consensus || {};
  const wind = c.avgWindMph;
  const hi = today.blendedHighF;
  const lo = today.blendedLowF;

  let title = "Quiet weather day";
  let summary = "No major Richmond weather signal stands out right now.";

  if (c.thunderSignal === "strong" || c.thunderSignal === "medium") {
    title = "Storm risk in focus";
    summary = `Rain and thunder are the main story today, with ${c.avgPrecipProbability ?? "some"}% average precipitation signal${wind != null ? ` and average wind near ${round0(wind)} mph` : ""}.`;
  } else if (c.rainSignal === "strong" || c.rainSignal === "medium") {
    title = "Rainy setup today";
    summary = `Showers look like the main story today, with about ${c.avgPrecipProbability ?? "some"}% average precipitation signal${wind != null ? ` and breeze around ${round0(wind)} mph` : ""}.`;
  } else if (c.windSignal === "strong" || c.windSignal === "medium") {
    title = "Windy pattern today";
    summary = `Wind is the standout today${wind != null ? `, averaging near ${round0(wind)} mph` : ""}${hi != null && lo != null ? ` with temperatures around ${round0(hi)}° / ${round0(lo)}°` : ""}.`;
  } else if (hi != null && lo != null && hi - lo >= 18) {
    title = "Big temperature swing";
    summary = `Richmond looks set for a notable swing today, from roughly ${round0(lo)}° to ${round0(hi)}°.`;
  }

  if (tomorrow && tC && hi != null && tomorrow.blendedHighF != null) {
    const delta = tomorrow.blendedHighF - hi;
    if (delta <= -12) {
      summary += ` A sharp cooldown follows into tomorrow.`;
    } else if (delta >= 12) {
      summary += ` A noticeable warm-up follows into tomorrow.`;
    }
  }

  return { title, summary };
}

function buildDailyWriteup(day, nextDay = null) {
  const c = day.consensus || {};
  const hi = day.blendedHighF;
  const lo = day.blendedLowF;
  const wind = c.avgWindMph;

  let parts = [];

  if (c.thunderSignal === "strong" || c.thunderSignal === "medium") {
    parts.push("Storms are the main story");
  } else if (c.rainSignal === "strong" || c.rainSignal === "medium") {
    parts.push("Showers look likely");
  } else if (c.snowSignal === "strong" || c.snowSignal === "medium") {
    parts.push("Snow is in play");
  } else if (c.windSignal === "strong" || c.windSignal === "medium") {
    parts.push("It looks breezy to windy");
  } else {
    parts.push("Weather looks fairly quiet");
  }

  if (hi != null && lo != null) {
    parts.push(`with temperatures near ${round0(hi)}° / ${round0(lo)}°`);
  }

  if (c.avgPrecipProbability != null && c.avgPrecipProbability >= 35) {
    parts.push(`and about ${round0(c.avgPrecipProbability)}% average precipitation signal`);
  }

  if (wind != null && wind >= 15) {
    parts.push(`plus wind around ${round0(wind)} mph`);
  }

  let sentence = parts.join(" ") + ".";

  if (nextDay?.blendedHighF != null && hi != null) {
    const delta = nextDay.blendedHighF - hi;
    if (delta <= -12) sentence += " A sharp cooler turn follows the next day.";
    if (delta >= 12) sentence += " A warmer turn follows the next day.";
  }

  return sentence;
}

// ---------- NWS ----------
async function getNwsLinks(lat, lon) {
  const url = `https://api.weather.gov/points/${lat},${lon}`;
  const data = await fetchJson(url, { headers: { "User-Agent": "mia-teorology (github actions)" } });
  const props = data?.properties || {};
  return {
    forecastUrl: props.forecast,
    forecastHourlyUrl: props.forecastHourly,
    observationStationsUrl: props.observationStations
  };
}

async function getNwsForecastData(forecastUrl) {
  return fetchJson(forecastUrl, { headers: { "User-Agent": "mia-teorology (github actions)" } });
}

async function getNwsHourlyForecastData(forecastHourlyUrl) {
  return fetchJson(forecastHourlyUrl, { headers: { "User-Agent": "mia-teorology (github actions)" } });
}

async function getNwsDailyHighLowForDate(forecastUrl, targetDate) {
  const data = await getNwsForecastData(forecastUrl);
  const periods = data?.properties?.periods || [];
  let highF = null, lowF = null;

  for (const p of periods) {
    const start = DateTime.fromISO(p.startTime).setZone(TZ);
    if (start.toISODate() !== targetDate.toISODate()) continue;
    if (p.isDaytime && typeof p.temperature === "number") highF = p.temperature;
    if (!p.isDaytime && typeof p.temperature === "number") lowF = p.temperature;
  }
  return { highF, lowF };
}

async function getNwsDailyConditions(forecastUrl, days = 7) {
  const data = await getNwsForecastData(forecastUrl);
  const periods = data?.properties?.periods || [];

  const byDate = new Map();

  for (const p of periods) {
    const start = DateTime.fromISO(p.startTime).setZone(TZ);
    const date = start.toISODate();
    if (!byDate.has(date)) {
      byDate.set(date, {
        date,
        dayPeriod: null,
        nightPeriod: null
      });
    }
    const row = byDate.get(date);
    if (p.isDaytime) row.dayPeriod = p;
    else row.nightPeriod = p;
  }

  const out = [];
  for (const date of Array.from(byDate.keys()).sort().slice(0, days)) {
    const row = byDate.get(date);
    const texts = [
      row.dayPeriod?.shortForecast,
      row.dayPeriod?.detailedForecast,
      row.nightPeriod?.shortForecast,
      row.nightPeriod?.detailedForecast
    ].filter(Boolean).join(" ");

    const precipVals = [
      row.dayPeriod?.probabilityOfPrecipitation?.value,
      row.nightPeriod?.probabilityOfPrecipitation?.value
    ].filter(v => typeof v === "number");

    const windSpeeds = [
      row.dayPeriod?.windSpeed,
      row.nightPeriod?.windSpeed
    ].filter(Boolean).flatMap(s => {
      const nums = String(s).match(/\d+/g)?.map(Number) || [];
      return nums;
    });

    out.push({
      date,
      summary: row.dayPeriod?.shortForecast || row.nightPeriod?.shortForecast || "—",
      precipProbability: precipVals.length ? Math.max(...precipVals) : null,
      windMph: windSpeeds.length ? Math.max(...windSpeeds) : null,
      rain: inferRainFromText(texts),
      snow: inferSnowFromText(texts),
      thunder: inferThunderFromText(texts)
    });
  }

  return out;
}

async function getNwsHourlyTemps(forecastHourlyUrl, hours = 48) {
  const data = await getNwsHourlyForecastData(forecastHourlyUrl);
  const periods = data?.properties?.periods || [];
  return periods.slice(0, hours).map(p => ({
    timeISO: DateTime.fromISO(p.startTime).setZone(TZ).toISO(),
    tempF: typeof p.temperature === "number" ? p.temperature : null,
    windMph: (() => {
      const nums = String(p.windSpeed || "").match(/\d+/g)?.map(Number) || [];
      return nums.length ? Math.max(...nums) : null;
    })(),
    precipProbability: typeof p.probabilityOfPrecipitation?.value === "number"
      ? p.probabilityOfPrecipitation.value
      : null
  }));
}

async function getNwsStationId(observationStationsUrl) {
  const data = await fetchJson(observationStationsUrl, { headers: { "User-Agent": "mia-teorology (github actions)" } });
  const stations = data?.observationStations || data?.features || [];
  if (Array.isArray(stations) && typeof stations[0] === "string") {
    const parts = stations[0].split("/");
    return parts[parts.length - 1];
  }
  if (Array.isArray(stations) && stations[0]?.properties?.stationIdentifier) {
    return stations[0].properties.stationIdentifier;
  }
  return null;
}

async function getNwsObservationsForDay(stationId, dayStart, dayEnd) {
  const start = dayStart.toUTC().toISO();
  const end = dayEnd.toUTC().toISO();
  const url = `https://api.weather.gov/stations/${stationId}/observations?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&limit=500`;
  const data = await fetchJson(url, { headers: { "User-Agent": "mia-teorology (github actions)" } });
  return data?.features || [];
}

function obsDailySummary(observationFeatures, dayStart, dayEnd) {
  const tempsF = [];
  const windsMph = [];
  let precipObsCount = 0;

  for (const f of observationFeatures) {
    const tsRaw = f?.properties?.timestamp;
    if (!tsRaw) continue;
    const ts = DateTime.fromISO(tsRaw).setZone(TZ);
    if (ts < dayStart || ts >= dayEnd) continue;

    const tempC = f?.properties?.temperature?.value;
    const windMs = f?.properties?.windSpeed?.value;
    const precipMm = f?.properties?.precipitationLastHour?.value;

    const tf = fFromC(tempC);
    if (tf != null) tempsF.push(tf);

    const mph = mphFromMs(windMs);
    if (mph != null) windsMph.push(mph);

    if (typeof precipMm === "number" && precipMm > 0) precipObsCount += 1;
  }

  return {
    obsHighF: tempsF.length ? Math.max(...tempsF) : null,
    obsLowF: tempsF.length ? Math.min(...tempsF) : null,
    obsMaxWindMph: windsMph.length ? Math.max(...windsMph) : null,
    precipOccurred: precipObsCount > 0,
    n: observationFeatures.length
  };
}

// ---------- Open-Meteo ----------
function decodeOpenMeteoWeatherCode(code) {
  const rainCodes = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82]);
  const snowCodes = new Set([71, 73, 75, 77, 85, 86]);
  const thunderCodes = new Set([95, 96, 99]);

  return {
    rain: rainCodes.has(code),
    snow: snowCodes.has(code),
    thunder: thunderCodes.has(code)
  };
}

function openMeteoSummaryFromCode(code) {
  const map = {
    0: "Clear",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Rime fog",
    51: "Light drizzle",
    53: "Drizzle",
    55: "Dense drizzle",
    56: "Freezing drizzle",
    57: "Dense freezing drizzle",
    61: "Light rain",
    63: "Rain",
    65: "Heavy rain",
    66: "Freezing rain",
    67: "Heavy freezing rain",
    71: "Light snow",
    73: "Snow",
    75: "Heavy snow",
    77: "Snow grains",
    80: "Rain showers",
    81: "Heavy rain showers",
    82: "Violent rain showers",
    85: "Snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with hail",
    99: "Severe thunderstorm"
  };
  return map[code] || "—";
}

async function getOpenMeteoDailyHighLow(lat, lon, startDate, endDate) {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lon}` +
    `&daily=temperature_2m_max,temperature_2m_min` +
    `&temperature_unit=fahrenheit` +
    `&timezone=${encodeURIComponent(TZ)}` +
    `&start_date=${startDate}&end_date=${endDate}`;

  const data = await fetchJson(url);
  const daily = data?.daily || {};
  const dates = daily.time || [];
  const maxArr = daily.temperature_2m_max || [];
  const minArr = daily.temperature_2m_min || [];

  return dates.map((d, i) => ({
    date: d,
    highF: maxArr[i] ?? null,
    lowF: minArr[i] ?? null
  }));
}

async function getOpenMeteoDailyConditions(lat, lon, startDate, endDate) {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lon}` +
    `&daily=weather_code,precipitation_probability_max,windspeed_10m_max,wind_gusts_10m_max` +
    `&wind_speed_unit=mph` +
    `&timezone=${encodeURIComponent(TZ)}` +
    `&start_date=${startDate}&end_date=${endDate}`;

  const data = await fetchJson(url);
  const dates = data?.daily?.time || [];
  const codes = data?.daily?.weather_code || [];
  const precipMax = data?.daily?.precipitation_probability_max || [];
  const windMax = data?.daily?.windspeed_10m_max || [];
  const gustMax = data?.daily?.wind_gusts_10m_max || [];

  return dates.map((date, i) => {
    const code = codes[i];
    const decoded = decodeOpenMeteoWeatherCode(code);
    return {
      date,
      summary: openMeteoSummaryFromCode(code),
      precipProbability: typeof precipMax[i] === "number" ? precipMax[i] : null,
      windMph: typeof gustMax[i] === "number"
        ? gustMax[i]
        : (typeof windMax[i] === "number" ? windMax[i] : null),
      rain: decoded.rain,
      snow: decoded.snow,
      thunder: decoded.thunder
    };
  });
}

async function getOpenMeteoHourlyTemps(lat, lon, hours = 48) {
  const now = DateTime.now().setZone(TZ);
  const start = now.startOf("hour");
  const end = start.plus({ hours: hours - 1 });

  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lon}` +
    `&hourly=temperature_2m,precipitation_probability,windspeed_10m` +
    `&temperature_unit=fahrenheit` +
    `&wind_speed_unit=mph` +
    `&timezone=${encodeURIComponent(TZ)}` +
    `&start_date=${start.toISODate()}&end_date=${end.toISODate()}`;

  const data = await fetchJson(url);
  const times = data?.hourly?.time || [];
  const temps = data?.hourly?.temperature_2m || [];
  const precips = data?.hourly?.precipitation_probability || [];
  const winds = data?.hourly?.windspeed_10m || [];

  const out = [];
  for (let i = 0; i < times.length && out.length < hours; i++) {
    const t = DateTime.fromISO(times[i]).setZone(TZ);
    if (t < now) continue;
    out.push({
      timeISO: t.toISO(),
      tempF: temps[i] ?? null,
      precipProbability: typeof precips[i] === "number" ? precips[i] : null,
      windMph: typeof winds[i] === "number" ? winds[i] : null
    });
  }
  return out.slice(0, hours);
}

// ---------- MET Norway ----------
function metNoSummaryFromSymbol(symbol) {
  if (!symbol) return "—";
  return symbol
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}

async function getMetNoTimeseries(lat, lon) {
  const ua = process.env.METNO_USER_AGENT;
  if (!ua || ua.trim().length < 10) {
    throw new Error("METNO_USER_AGENT is required (set it in GitHub Actions env).");
  }
  const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lon}`;
  const data = await fetchJson(url, { headers: { "User-Agent": ua } });
  return data?.properties?.timeseries || [];
}

async function getMetNoHourlyTemps(lat, lon, hours = 48) {
  const series = await getMetNoTimeseries(lat, lon);
  const now = DateTime.now().setZone(TZ);

  const out = [];
  for (const item of series) {
    const t = item?.time;
    const c = item?.data?.instant?.details?.air_temperature;
    const windMs = item?.data?.instant?.details?.wind_speed;
    if (!t || c == null) continue;
    const ts = DateTime.fromISO(t).setZone(TZ);
    if (ts < now) continue;
    out.push({
      timeISO: ts.toISO(),
      tempF: round1(fFromC(c)),
      windMph: round1(mphFromMs(windMs)),
      precipProbability:
        item?.data?.next_1_hours?.details?.probability_of_precipitation ??
        item?.data?.next_6_hours?.details?.probability_of_precipitation ??
        null
    });
    if (out.length >= hours) break;
  }
  return out;
}

async function getMetNoDailyHighLow(lat, lon, days = 7) {
  const series = await getMetNoTimeseries(lat, lon);
  const byDay = new Map();

  for (const item of series) {
    const t = item?.time;
    const c = item?.data?.instant?.details?.air_temperature;
    const windMs = item?.data?.instant?.details?.wind_speed;
    if (!t || c == null) continue;
    const ts = DateTime.fromISO(t).setZone(TZ);
    const day = ts.toISODate();
    const tf = fFromC(c);
    const mph = mphFromMs(windMs);
    if (tf == null) continue;
    if (!byDay.has(day)) byDay.set(day, { temps: [], winds: [] });
    byDay.get(day).temps.push(tf);
    if (mph != null) byDay.get(day).winds.push(mph);
  }

  const sortedDays = Array.from(byDay.keys()).sort();
  const out = [];
  for (const day of sortedDays.slice(0, days)) {
    const row = byDay.get(day);
    out.push({
      date: day,
      highF: round1(Math.max(...row.temps)),
      lowF: round1(Math.min(...row.temps)),
      windMph: row.winds.length ? round1(Math.max(...row.winds)) : null
    });
  }
  return out;
}

async function getMetNoDailyConditions(lat, lon, days = 7) {
  const series = await getMetNoTimeseries(lat, lon);
  const byDay = new Map();

  for (const item of series) {
    const ts = DateTime.fromISO(item?.time || "").setZone(TZ);
    if (!ts.isValid) continue;
    const date = ts.toISODate();

    if (!byDay.has(date)) {
      byDay.set(date, {
        date,
        summaries: [],
        precips: [],
        winds: [],
        rain: false,
        snow: false,
        thunder: false
      });
    }

    const row = byDay.get(date);
    const next1 = item?.data?.next_1_hours || {};
    const next6 = item?.data?.next_6_hours || {};
    const next12 = item?.data?.next_12_hours || {};
    const instant = item?.data?.instant?.details || {};

    const symbol =
      next6?.summary?.symbol_code ||
      next1?.summary?.symbol_code ||
      next12?.summary?.symbol_code ||
      null;

    const precip =
      next6?.details?.probability_of_precipitation ??
      next1?.details?.probability_of_precipitation ??
      next12?.details?.probability_of_precipitation ??
      null;

    const windMph = mphFromMs(instant.wind_speed);

    if (symbol) row.summaries.push(symbol);
    if (typeof precip === "number") row.precips.push(precip);
    if (windMph != null) row.winds.push(windMph);

    const txt = normalizeText(symbol);
    if (txt.includes("rain") || txt.includes("drizzle") || txt.includes("sleet")) row.rain = true;
    if (txt.includes("snow") || txt.includes("sleet")) row.snow = true;
    if (txt.includes("thunder")) row.thunder = true;
  }

  const out = [];
  for (const date of Array.from(byDay.keys()).sort().slice(0, days)) {
    const row = byDay.get(date);
    out.push({
      date,
      summary: row.summaries.length ? metNoSummaryFromSymbol(row.summaries[0]) : "—",
      precipProbability: row.precips.length ? Math.max(...row.precips) : null,
      windMph: row.winds.length ? round1(Math.max(...row.winds)) : null,
      rain: row.rain,
      snow: row.snow,
      thunder: row.thunder
    });
  }

  return out;
}

// ---------- Blending ----------
function indexByTime(arr) {
  const m = new Map();
  for (const x of arr) m.set(x.timeISO, x);
  return m;
}

function indexByDate(arr) {
  const m = new Map();
  for (const x of arr) m.set(x.date, x);
  return m;
}

function blendHourly(nws, om, met) {
  const spine = nws?.length ? nws : (om?.length ? om : met);
  const nwsM = indexByTime(nws || []);
  const omM = indexByTime(om || []);
  const metM = indexByTime(met || []);

  return spine.map(row => {
    const a = nwsM.get(row.timeISO);
    const b = omM.get(row.timeISO);
    const c = metM.get(row.timeISO);

    const blendedTemp = mean([a?.tempF, b?.tempF, c?.tempF]);
    const blendedPrecip = mean([a?.precipProbability, b?.precipProbability, c?.precipProbability]);
    const blendedWind = mean([a?.windMph, b?.windMph, c?.windMph]);

    return {
      timeISO: row.timeISO,
      blendedTempF: blendedTemp == null ? null : round1(blendedTemp),
      blendedPrecipProbability: blendedPrecip == null ? null : round1(blendedPrecip),
      blendedWindMph: blendedWind == null ? null : round1(blendedWind),
      sources: {
        nws: a ? { tempF: a.tempF ?? null, precipProbability: a.precipProbability ?? null, windMph: a.windMph ?? null } : null,
        openMeteo: b ? { tempF: b.tempF ?? null, precipProbability: b.precipProbability ?? null, windMph: b.windMph ?? null } : null,
        metNo: c ? { tempF: c.tempF ?? null, precipProbability: c.precipProbability ?? null, windMph: c.windMph ?? null } : null
      }
    };
  });
}

function blendDaily(nwsTemps, omTemps, metTemps, nwsCond, omCond, metCond) {
  const spine = nwsTemps?.length ? nwsTemps : (omTemps?.length ? omTemps : metTemps);
  const nwsT = indexByDate(nwsTemps || []);
  const omT = indexByDate(omTemps || []);
  const metT = indexByDate(metTemps || []);
  const nwsC = indexByDate(nwsCond || []);
  const omC = indexByDate(omCond || []);
  const metC = indexByDate(metCond || []);

  return spine.map(row => {
    const d = row.date;
    const nt = nwsT.get(d);
    const ot = omT.get(d);
    const mt = metT.get(d);
    const nc = nwsC.get(d);
    const oc = omC.get(d);
    const mc = metC.get(d);

    const hi = mean([nt?.highF, ot?.highF, mt?.highF]);
    const lo = mean([nt?.lowF, ot?.lowF, mt?.lowF]);
    const precip = mean([nc?.precipProbability, oc?.precipProbability, mc?.precipProbability]);
    const wind = mean([
      nc?.windMph ?? nt?.windMph,
      oc?.windMph ?? ot?.windMph,
      mc?.windMph ?? mt?.windMph
    ]);

    return {
      date: d,
      blendedHighF: hi == null ? null : round1(hi),
      blendedLowF: lo == null ? null : round1(lo),
      blendedPrecipProbability: precip == null ? null : round1(precip),
      blendedWindMph: wind == null ? null : round1(wind),
      sources: {
        nws: {
          highF: nt?.highF ?? null,
          lowF: nt?.lowF ?? null,
          precipProbability: nc?.precipProbability ?? null,
          windMph: nc?.windMph ?? nt?.windMph ?? null
        },
        openMeteo: {
          highF: ot?.highF ?? null,
          lowF: ot?.lowF ?? null,
          precipProbability: oc?.precipProbability ?? null,
          windMph: oc?.windMph ?? ot?.windMph ?? null
        },
        metNo: {
          highF: mt?.highF ?? null,
          lowF: mt?.lowF ?? null,
          precipProbability: mc?.precipProbability ?? null,
          windMph: mc?.windMph ?? mt?.windMph ?? null
        }
      }
    };
  });
}

function blendDailyConditions(nwsArr, omArr, metArr) {
  const spine = nwsArr?.length ? nwsArr : (omArr?.length ? omArr : metArr);
  const nws = indexByDate(nwsArr || []);
  const om = indexByDate(omArr || []);
  const met = indexByDate(metArr || []);

  return spine.map(row => {
    const d = row.date;
    const a = nws.get(d);
    const b = om.get(d);
    const c = met.get(d);

    const day = {
      date: d,
      sources: {
        nws: a || null,
        openMeteo: b || null,
        metNo: c || null
      }
    };

    return {
      ...day,
      consensus: summarizeConsensus(day)
    };
  });
}

// ---------- Main ----------
async function main() {
  const now = DateTime.now().setZone(TZ);
  const today = now.startOf("day");
  const tomorrow = today.plus({ days: 1 });
  const yesterday = today.minus({ days: 1 });

  const dataDir = "data";
  ensureDir(dataDir);

  writeJson(`${dataDir}/meta.json`, {
    timezone: TZ,
    location: RICHMOND,
    updatedAt: now.toISO(),
    todayDate: today.toISODate()
  });

  const links = await getNwsLinks(RICHMOND.lat, RICHMOND.lon);

  // 1) Snapshot tomorrow forecasts
  const issueDate = now.toISODate();
  const forecastSnapshotPath = `${dataDir}/snapshots/${issueDate}_for_${tomorrow.toISODate()}.json`;

  const nwsTomorrow = await getNwsDailyHighLowForDate(links.forecastUrl, tomorrow);
  const omTomorrowArr = await getOpenMeteoDailyHighLow(
    RICHMOND.lat,
    RICHMOND.lon,
    tomorrow.toISODate(),
    tomorrow.toISODate()
  );
  const omTomorrow = omTomorrowArr[0] || { highF: null, lowF: null };
  const metDaily = await getMetNoDailyHighLow(RICHMOND.lat, RICHMOND.lon, 7);
  const metTomorrow = metDaily.find(x => x.date === tomorrow.toISODate()) || { highF: null, lowF: null };

  const nwsConditionsTomorrow = await getNwsDailyConditions(links.forecastUrl, 7);
  const omConditionsTomorrow = await getOpenMeteoDailyConditions(
    RICHMOND.lat,
    RICHMOND.lon,
    tomorrow.toISODate(),
    tomorrow.plus({ days: 6 }).toISODate()
  );
  const metConditionsTomorrow = await getMetNoDailyConditions(RICHMOND.lat, RICHMOND.lon, 7);

  const nwsTomorrowCond = nwsConditionsTomorrow.find(x => x.date === tomorrow.toISODate()) || {};
  const omTomorrowCond = omConditionsTomorrow.find(x => x.date === tomorrow.toISODate()) || {};
  const metTomorrowCond = metConditionsTomorrow.find(x => x.date === tomorrow.toISODate()) || {};

  writeJson(forecastSnapshotPath, {
    issuedAt: now.toISO(),
    issuedDate: issueDate,
    targetDate: tomorrow.toISODate(),
    location: RICHMOND,
    forecasts: {
      nws: {
        highF: nwsTomorrow.highF,
        lowF: nwsTomorrow.lowF,
        windMph: nwsTomorrowCond.windMph ?? null,
        precipProbability: nwsTomorrowCond.precipProbability ?? null,
        precipExpected: !!nwsTomorrowCond.rain
      },
      openMeteo: {
        highF: omTomorrow.highF,
        lowF: omTomorrow.lowF,
        windMph: omTomorrowCond.windMph ?? null,
        precipProbability: omTomorrowCond.precipProbability ?? null,
        precipExpected: !!omTomorrowCond.rain
      },
      metNo: {
        highF: metTomorrow.highF,
        lowF: metTomorrow.lowF,
        windMph: metTomorrowCond.windMph ?? null,
        precipProbability: metTomorrowCond.precipProbability ?? null,
        precipExpected: !!metTomorrowCond.rain
      }
    }
  });

  // 2) Score yesterday
  const scoringSnapshotIssued = yesterday.minus({ days: 1 }).toISODate();
  const scoringSnapshotPath = `${dataDir}/snapshots/${scoringSnapshotIssued}_for_${yesterday.toISODate()}.json`;
  const scoreOutPath = `${dataDir}/scores/${yesterday.toISODate()}.json`;

  if (!fs.existsSync(scoreOutPath)) {
    const scoringSnapshot = readJsonIfExists(scoringSnapshotPath);
    if (scoringSnapshot) {
      const dayStart = yesterday;
      const dayEnd = yesterday.plus({ days: 1 });

      const stationId = await getNwsStationId(links.observationStationsUrl);
      if (!stationId) throw new Error("Could not resolve NWS stationId for observations.");

      const obsFeatures = await getNwsObservationsForDay(stationId, dayStart, dayEnd);
      const observed = obsDailySummary(obsFeatures, dayStart, dayEnd);

      const providers = scoringSnapshot.forecasts;
      const providerScores = Object.entries(providers).map(([key, v]) => {
        const highErr = (v.highF == null || observed.obsHighF == null) ? null : Math.abs(v.highF - observed.obsHighF);
        const lowErr = (v.lowF == null || observed.obsLowF == null) ? null : Math.abs(v.lowF - observed.obsLowF);
        const windErr = (v.windMph == null || observed.obsMaxWindMph == null) ? null : Math.abs(v.windMph - observed.obsMaxWindMph);
        const precipEventErr = (typeof v.precipExpected === "boolean")
          ? (v.precipExpected === observed.precipOccurred ? 0 : 1)
          : null;
        const overall = mean([highErr, lowErr, windErr]);

        return {
          provider: key,
          predicted: v,
          errors: {
            highAbsF: highErr == null ? null : round1(highErr),
            lowAbsF: lowErr == null ? null : round1(lowErr),
            windAbsMph: windErr == null ? null : round1(windErr),
            precipEventMiss: precipEventErr,
            overallAbsF: overall == null ? null : round1(overall)
          }
        };
      }).sort((a, b) => (a.errors.overallAbsF ?? 1e9) - (b.errors.overallAbsF ?? 1e9));

      writeJson(scoreOutPath, {
        targetDate: yesterday.toISODate(),
        observedFromStation: stationId,
        observationCount: observed.n,
        observed: {
          highF: observed.obsHighF == null ? null : round1(observed.obsHighF),
          lowF: observed.obsLowF == null ? null : round1(observed.obsLowF),
          maxWindMph: observed.obsMaxWindMph == null ? null : round1(observed.obsMaxWindMph),
          precipOccurred: observed.precipOccurred
        },
        snapshotUsed: path.basename(scoringSnapshotPath),
        scores: providerScores,
        computedAt: now.toISO()
      });
    }
  }

  // 3) Live leaderboard
  const scoresDir = `${dataDir}/scores`;
  ensureDir(scoresDir);

  const files = fs.existsSync(scoresDir)
    ? fs.readdirSync(scoresDir).filter(f => f.endsWith(".json")).sort()
    : [];

  const allLiveDays = files
    .map(f => readJsonIfExists(path.join(scoresDir, f)))
    .filter(Boolean);

  const last30 = allLiveDays.slice(-30);

  const providerAgg = {};
  for (const day of last30) {
    for (const s of day.scores) {
      const p = s.provider;
      if (!providerAgg[p]) providerAgg[p] = { overall: [], wind: [], precipMisses: [] };
      if (typeof s.errors.overallAbsF === "number") providerAgg[p].overall.push(s.errors.overallAbsF);
      if (typeof s.errors.windAbsMph === "number") providerAgg[p].wind.push(s.errors.windAbsMph);
      if (typeof s.errors.precipEventMiss === "number") providerAgg[p].precipMisses.push(s.errors.precipEventMiss);
    }
  }

  const leaderboard = Object.entries(providerAgg)
    .map(([provider, agg]) => ({
      provider,
      daysScored: agg.overall.length,
      meanOverallAbsF: round1(mean(agg.overall)),
      meanWindAbsMph: round1(mean(agg.wind)),
      precipHitRate:
        agg.precipMisses.length
          ? round1(100 * (1 - mean(agg.precipMisses)))
          : null
    }))
    .sort((a, b) => (a.meanOverallAbsF ?? 1e9) - (b.meanOverallAbsF ?? 1e9));

  writeJson(`${dataDir}/leaderboard.json`, {
    windowDays: 30,
    asOf: now.toISO(),
    leaderboard
  });

  // 4) Blended forecasts
  const start = today.toISODate();
  const end = today.plus({ days: 6 }).toISODate();

  const nwsDailyTemps = [];
  for (let i = 0; i < 7; i++) {
    const d = today.plus({ days: i });
    const r = await getNwsDailyHighLowForDate(links.forecastUrl, d);
    nwsDailyTemps.push({ date: d.toISODate(), highF: r.highF, lowF: r.lowF });
  }

  const omDailyTemps = await getOpenMeteoDailyHighLow(RICHMOND.lat, RICHMOND.lon, start, end);
  const metDailyTemps = await getMetNoDailyHighLow(RICHMOND.lat, RICHMOND.lon, 7);

  const nwsConditions = await getNwsDailyConditions(links.forecastUrl, 7);
  const omConditions = await getOpenMeteoDailyConditions(RICHMOND.lat, RICHMOND.lon, start, end);
  const metConditions = await getMetNoDailyConditions(RICHMOND.lat, RICHMOND.lon, 7);

  const blendedDaily = blendDaily(
    nwsDailyTemps,
    omDailyTemps,
    metDailyTemps,
    nwsConditions,
    omConditions,
    metConditions
  );

  writeJson(`${dataDir}/blend_daily.json`, {
    location: RICHMOND,
    generatedAt: now.toISO(),
    days: blendedDaily
  });

  const nwsHourly = await getNwsHourlyTemps(links.forecastHourlyUrl, 48);
  const omHourly = await getOpenMeteoHourlyTemps(RICHMOND.lat, RICHMOND.lon, 48);
  const metHourly = await getMetNoHourlyTemps(RICHMOND.lat, RICHMOND.lon, 48);
  const blendedHourly = blendHourly(nwsHourly, omHourly, metHourly);

  writeJson(`${dataDir}/blend_hourly.json`, {
    location: RICHMOND,
    generatedAt: now.toISO(),
    hours: blendedHourly
  });

  // 5) Backfill summaries
  const omDir = `${dataDir}/scores_openmeteo`;
  let backfillDays = [];
  if (fs.existsSync(omDir)) {
    const omFiles = fs.readdirSync(omDir).filter(f => f.endsWith(".json")).sort();
    const omLast365Files = omFiles.slice(-365);
    backfillDays = omLast365Files.map(f => readJsonIfExists(path.join(omDir, f))).filter(Boolean);

    const omLatest = backfillDays.length ? backfillDays[backfillDays.length - 1] : null;
    if (omLatest) writeJson(`${dataDir}/latest_openmeteo_year.json`, omLatest);

    const errors = backfillDays
      .map(d => d?.errors?.overallAbsF)
      .filter(v => typeof v === "number" && !Number.isNaN(v));

    writeJson(`${dataDir}/leaderboard_openmeteo_year.json`, {
      windowDays: Math.min(365, backfillDays.length),
      asOf: now.toISO(),
      leaderboard: [
        {
          provider: "openMeteo",
          daysScored: errors.length,
          meanOverallAbsF: round1(mean(errors))
        }
      ]
    });
  }

  // 6) Chart data
  const liveChart = {
    generatedAt: now.toISO(),
    series: {
      nws: [],
      openMeteo: [],
      metNo: []
    }
  };

  for (const day of last30) {
    for (const score of day.scores) {
      if (score.provider === "nws") {
        liveChart.series.nws.push({ date: day.targetDate, value: score.errors.overallAbsF });
      } else if (score.provider === "openMeteo") {
        liveChart.series.openMeteo.push({ date: day.targetDate, value: score.errors.overallAbsF });
      } else if (score.provider === "metNo") {
        liveChart.series.metNo.push({ date: day.targetDate, value: score.errors.overallAbsF });
      }
    }
  }

  writeJson(`${dataDir}/chart_live.json`, liveChart);

  if (backfillDays.length) {
    writeJson(`${dataDir}/chart_backfill_openmeteo_year.json`, {
      generatedAt: now.toISO(),
      series: {
        openMeteo: backfillDays.map(d => ({
          date: d.targetDate,
          value: d?.errors?.overallAbsF ?? null
        }))
      }
    });
  }

  // 7) Monthly winner
  const currentMonth = now.toFormat("yyyy-MM");
  const monthDays = allLiveDays.filter(d => (d.targetDate || "").startsWith(currentMonth));

  const monthlyAgg = {};
  for (const day of monthDays) {
    for (const s of day.scores) {
      if (typeof s?.errors?.overallAbsF !== "number") continue;
      if (!monthlyAgg[s.provider]) monthlyAgg[s.provider] = [];
      monthlyAgg[s.provider].push(s.errors.overallAbsF);
    }
  }

  const monthlyStandings = Object.entries(monthlyAgg)
    .map(([provider, arr]) => ({
      provider,
      daysScored: arr.length,
      meanOverallAbsF: round1(mean(arr))
    }))
    .sort((a, b) => (a.meanOverallAbsF ?? 1e9) - (b.meanOverallAbsF ?? 1e9));

  writeJson(`${dataDir}/monthly_winner_live.json`, {
    month: currentMonth,
    generatedAt: now.toISO(),
    leader: monthlyStandings[0] || null,
    standings: monthlyStandings
  });

  // 8) Disagreement + conditions
  const condByDate = new Map();
  for (const x of nwsConditions) {
    if (!condByDate.has(x.date)) condByDate.set(x.date, {});
    condByDate.get(x.date).nws = x;
  }
  for (const x of omConditions) {
    if (!condByDate.has(x.date)) condByDate.set(x.date, {});
    condByDate.get(x.date).openMeteo = x;
  }
  for (const x of metConditions) {
    if (!condByDate.has(x.date)) condByDate.set(x.date, {});
    condByDate.get(x.date).metNo = x;
  }

  const disagreementDays = blendedDaily.map(day => {
    const highs = [
      day.sources.nws?.highF,
      day.sources.openMeteo?.highF,
      day.sources.metNo?.highF
    ];

    const lows = [
      day.sources.nws?.lowF,
      day.sources.openMeteo?.lowF,
      day.sources.metNo?.lowF
    ];

    const precips = [
      condByDate.get(day.date)?.nws?.precipProbability,
      condByDate.get(day.date)?.openMeteo?.precipProbability,
      condByDate.get(day.date)?.metNo?.precipProbability
    ];

    const winds = [
      condByDate.get(day.date)?.nws?.windMph,
      condByDate.get(day.date)?.openMeteo?.windMph,
      condByDate.get(day.date)?.metNo?.windMph
    ];

    const highSpread = (() => {
      const lo = minVal(highs);
      const hi = maxVal(highs);
      return (lo == null || hi == null) ? null : round1(hi - lo);
    })();

    const lowSpread = (() => {
      const lo = minVal(lows);
      const hi = maxVal(lows);
      return (lo == null || hi == null) ? null : round1(hi - lo);
    })();

    const overallSpread = mean([highSpread, lowSpread]);

    const precipSpread = (() => {
      const lo = minVal(precips);
      const hi = maxVal(precips);
      return (lo == null || hi == null) ? null : round1(hi - lo);
    })();

    const windSpread = (() => {
      const lo = minVal(winds);
      const hi = maxVal(winds);
      return (lo == null || hi == null) ? null : round1(hi - lo);
    })();

    return {
      date: day.date,
      overallSpreadF: overallSpread == null ? null : round1(overallSpread),
      highSpreadF: highSpread,
      lowSpreadF: lowSpread,
      precipSpread,
      windSpreadMph: windSpread,
      confidence: classifySpread(overallSpread)
    };
  });

  writeJson(`${dataDir}/disagreement_daily.json`, {
    generatedAt: now.toISO(),
    days: disagreementDays
  });

  const blendedConditions = blendDailyConditions(nwsConditions, omConditions, metConditions);

  const enrichedConditions = blendedConditions.map((day, i, arr) => ({
    ...day,
    writeup: buildDailyWriteup(
      {
        ...day,
        blendedHighF: blendedDaily.find(x => x.date === day.date)?.blendedHighF ?? null,
        blendedLowF: blendedDaily.find(x => x.date === day.date)?.blendedLowF ?? null
      },
      (() => {
        const next = arr[i + 1];
        if (!next) return null;
        const nextBlend = blendedDaily.find(x => x.date === next.date);
        return nextBlend ? { blendedHighF: nextBlend.blendedHighF } : null;
      })()
    )
  }));

  writeJson(`${dataDir}/conditions_daily.json`, {
    location: RICHMOND,
    generatedAt: now.toISO(),
    days: enrichedConditions
  });

  const todayConditions = enrichedConditions[0] || null;
  const next7 = enrichedConditions;

  writeJson(`${dataDir}/conditions_summary.json`, {
    location: RICHMOND,
    generatedAt: now.toISO(),
    today: todayConditions,
    next7Summary: {
      rainDays: next7.filter(d => d.consensus.rainSignal === "strong" || d.consensus.rainSignal === "medium").length,
      snowDays: next7.filter(d => d.consensus.snowSignal === "strong" || d.consensus.snowSignal === "medium").length,
      thunderDays: next7.filter(d => d.consensus.thunderSignal === "strong" || d.consensus.thunderSignal === "medium").length,
      windyDays: next7.filter(d => d.consensus.windSignal === "strong" || d.consensus.windSignal === "medium").length
    }
  });

  // 9) Story / rainbow / confidence snapshot
  const combinedOutlook = blendedDaily.map(day => {
    const cond = enrichedConditions.find(x => x.date === day.date);
    const disag = disagreementDays.find(x => x.date === day.date);
    return {
      ...day,
      consensus: cond?.consensus || null,
      sources: cond?.sources || null,
      disagreement: disag || null,
      writeup: cond?.writeup || null
    };
  });

  const weatherStory = buildWeatherStory(combinedOutlook);
  writeJson(`${dataDir}/weather_story.json`, {
    generatedAt: now.toISO(),
    ...weatherStory
  });

  const rainbowDays = combinedOutlook.map(day => ({
    date: day.date,
    ...rainbowScoreFromDay(day)
  }));

  writeJson(`${dataDir}/rainbow_watch.json`, {
    generatedAt: now.toISO(),
    today: rainbowDays[0] || null,
    bestNext7: [...rainbowDays].sort((a, b) => (b.score ?? -1) - (a.score ?? -1))[0] || null,
    days: rainbowDays
  });

  const highConfidenceDay = [...disagreementDays]
    .filter(d => typeof d.overallSpreadF === "number")
    .sort((a, b) => (a.overallSpreadF ?? 1e9) - (b.overallSpreadF ?? 1e9))[0] || null;

  const lowConfidenceDay = [...disagreementDays]
    .filter(d => typeof d.overallSpreadF === "number")
    .sort((a, b) => (b.overallSpreadF ?? -1) - (a.overallSpreadF ?? -1))[0] || null;

  writeJson(`${dataDir}/confidence_snapshot.json`, {
    generatedAt: now.toISO(),
    mostLockedInDay: highConfidenceDay,
    mostUncertainDay: lowConfidenceDay
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});