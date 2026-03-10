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

function round1(x) {
  return x == null ? null : Math.round(x * 10) / 10;
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

  return {
    rainSignal: signalStrength(rainCount),
    snowSignal: signalStrength(snowCount),
    thunderSignal: signalStrength(thunderCount),
    avgPrecipProbability: avgPrecip == null ? null : round1(avgPrecip),
    summary:
      thunderCount >= 2 ? "Thunder signal present" :
      snowCount >= 2 ? "Snow signal present" :
      rainCount >= 2 ? "Rain signal present" :
      avgPrecip != null && avgPrecip >= 50 ? "Some precipitation possible" :
      "Mostly quiet signal"
  };
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

    out.push({
      date,
      summary: row.dayPeriod?.shortForecast || row.nightPeriod?.shortForecast || "—",
      precipProbability: precipVals.length ? Math.max(...precipVals) : null,
      rain: inferRainFromText(texts),
      snow: inferSnowFromText(texts),
      thunder: inferThunderFromText(texts)
    });
  }

  return out;
}

async function getNwsHourlyTemps(forecastHourlyUrl, hours = 48) {
  const data = await fetchJson(forecastHourlyUrl, { headers: { "User-Agent": "mia-teorology (github actions)" } });
  const periods = data?.properties?.periods || [];
  return periods.slice(0, hours).map(p => ({
    timeISO: DateTime.fromISO(p.startTime).setZone(TZ).toISO(),
    tempF: typeof p.temperature === "number" ? p.temperature : null
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

function obsHighLowF(observationFeatures, dayStart, dayEnd) {
  const tempsF = [];
  for (const f of observationFeatures) {
    const t = f?.properties?.timestamp;
    const c = f?.properties?.temperature?.value;
    if (!t || c == null) continue;
    const ts = DateTime.fromISO(t).setZone(TZ);
    if (ts < dayStart || ts >= dayEnd) continue;
    const tf = fFromC(c);
    if (tf != null) tempsF.push(tf);
  }
  if (!tempsF.length) return { obsHighF: null, obsLowF: null, n: 0 };
  return {
    obsHighF: Math.max(...tempsF),
    obsLowF: Math.min(...tempsF),
    n: tempsF.length
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
    `&daily=weather_code,precipitation_probability_max` +
    `&timezone=${encodeURIComponent(TZ)}` +
    `&start_date=${startDate}&end_date=${endDate}`;

  const data = await fetchJson(url);
  const dates = data?.daily?.time || [];
  const codes = data?.daily?.weather_code || [];
  const precipMax = data?.daily?.precipitation_probability_max || [];

  return dates.map((date, i) => {
    const code = codes[i];
    const decoded = decodeOpenMeteoWeatherCode(code);
    return {
      date,
      summary: openMeteoSummaryFromCode(code),
      precipProbability: typeof precipMax[i] === "number" ? precipMax[i] : null,
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
    `&hourly=temperature_2m` +
    `&temperature_unit=fahrenheit` +
    `&timezone=${encodeURIComponent(TZ)}` +
    `&start_date=${start.toISODate()}&end_date=${end.toISODate()}`;

  const data = await fetchJson(url);
  const times = data?.hourly?.time || [];
  const temps = data?.hourly?.temperature_2m || [];

  const out = [];
  for (let i = 0; i < times.length && out.length < hours; i++) {
    const t = DateTime.fromISO(times[i]).setZone(TZ);
    if (t < now) continue;
    out.push({ timeISO: t.toISO(), tempF: temps[i] ?? null });
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
    if (!t || c == null) continue;
    const ts = DateTime.fromISO(t).setZone(TZ);
    if (ts < now) continue;
    out.push({ timeISO: ts.toISO(), tempF: round1(fFromC(c)) });
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
    if (!t || c == null) continue;
    const ts = DateTime.fromISO(t).setZone(TZ);
    const day = ts.toISODate();
    const tf = fFromC(c);
    if (tf == null) continue;
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(tf);
  }

  const sortedDays = Array.from(byDay.keys()).sort();
  const out = [];
  for (const day of sortedDays.slice(0, days)) {
    const temps = byDay.get(day);
    out.push({
      date: day,
      highF: round1(Math.max(...temps)),
      lowF: round1(Math.min(...temps))
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
        rain: false,
        snow: false,
        thunder: false
      });
    }

    const row = byDay.get(date);
    const next1 = item?.data?.next_1_hours || {};
    const next6 = item?.data?.next_6_hours || {};
    const next12 = item?.data?.next_12_hours || {};

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

    if (symbol) row.summaries.push(symbol);
    if (typeof precip === "number") row.precips.push(precip);

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
  for (const x of arr) m.set(x.timeISO, x.tempF);
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
    const blended = mean([a, b, c]);
    return {
      timeISO: row.timeISO,
      blendedTempF: blended == null ? null : round1(blended),
      sources: {
        nws: a ?? null,
        openMeteo: b ?? null,
        metNo: c ?? null
      }
    };
  });
}

function blendDailyTemps(nwsArr, omArr, metArr) {
  const spine = nwsArr?.length ? nwsArr : (omArr?.length ? omArr : metArr);
  const nws = indexByDate(nwsArr || []);
  const om = indexByDate(omArr || []);
  const met = indexByDate(metArr || []);

  return spine.map(row => {
    const d = row.date;
    const a = nws.get(d);
    const b = om.get(d);
    const c = met.get(d);

    const hi = mean([a?.highF, b?.highF, c?.highF]);
    const lo = mean([a?.lowF, b?.lowF, c?.lowF]);

    return {
      date: d,
      blendedHighF: hi == null ? null : round1(hi),
      blendedLowF: lo == null ? null : round1(lo),
      sources: {
        nws: a ? { highF: a.highF, lowF: a.lowF } : null,
        openMeteo: b ? { highF: b.highF, lowF: b.lowF } : null,
        metNo: c ? { highF: c.highF, lowF: c.lowF } : null
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
  const tomorrow = now.plus({ days: 1 }).startOf("day");
  const yesterday = now.minus({ days: 1 }).startOf("day");

  const dataDir = "data";
  ensureDir(dataDir);

  writeJson(`${dataDir}/meta.json`, {
    timezone: TZ,
    location: RICHMOND,
    updatedAt: now.toISO()
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

  writeJson(forecastSnapshotPath, {
    issuedAt: now.toISO(),
    issuedDate: issueDate,
    targetDate: tomorrow.toISODate(),
    location: RICHMOND,
    forecasts: {
      nws: { highF: nwsTomorrow.highF, lowF: nwsTomorrow.lowF },
      openMeteo: { highF: omTomorrow.highF, lowF: omTomorrow.lowF },
      metNo: { highF: metTomorrow.highF, lowF: metTomorrow.lowF }
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
      const { obsHighF, obsLowF, n } = obsHighLowF(obsFeatures, dayStart, dayEnd);

      const providers = scoringSnapshot.forecasts;
      const providerScores = Object.entries(providers).map(([key, v]) => {
        const highErr = (v.highF == null || obsHighF == null) ? null : Math.abs(v.highF - obsHighF);
        const lowErr = (v.lowF == null || obsLowF == null) ? null : Math.abs(v.lowF - obsLowF);
        const overall = mean([highErr, lowErr]);
        return {
          provider: key,
          predicted: v,
          errors: {
            highAbsF: highErr == null ? null : round1(highErr),
            lowAbsF: lowErr == null ? null : round1(lowErr),
            overallAbsF: overall == null ? null : round1(overall)
          }
        };
      }).sort((a, b) => (a.errors.overallAbsF ?? 1e9) - (b.errors.overallAbsF ?? 1e9));

      writeJson(scoreOutPath, {
        targetDate: yesterday.toISODate(),
        observedFromStation: stationId,
        observationCount: n,
        observed: {
          highF: obsHighF == null ? null : round1(obsHighF),
          lowF: obsLowF == null ? null : round1(obsLowF)
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
      if (!providerAgg[p]) providerAgg[p] = [];
      if (typeof s.errors.overallAbsF === "number") providerAgg[p].push(s.errors.overallAbsF);
    }
  }

  const leaderboard = Object.entries(providerAgg)
    .map(([provider, arr]) => ({
      provider,
      daysScored: arr.length,
      meanOverallAbsF: round1(mean(arr))
    }))
    .sort((a, b) => (a.meanOverallAbsF ?? 1e9) - (b.meanOverallAbsF ?? 1e9));

  writeJson(`${dataDir}/leaderboard.json`, {
    windowDays: 30,
    asOf: now.toISO(),
    leaderboard
  });

  // 4) Blended forecasts
  const start = now.toISODate();
  const end = now.plus({ days: 6 }).toISODate();

  const nwsDailyTemps = [];
  for (let i = 0; i < 7; i++) {
    const d = now.plus({ days: i }).startOf("day");
    const r = await getNwsDailyHighLowForDate(links.forecastUrl, d);
    nwsDailyTemps.push({ date: d.toISODate(), highF: r.highF, lowF: r.lowF });
  }

  const omDailyTemps = await getOpenMeteoDailyHighLow(RICHMOND.lat, RICHMOND.lon, start, end);
  const metDailyTemps = await getMetNoDailyHighLow(RICHMOND.lat, RICHMOND.lon, 7);
  const blendedDaily = blendDailyTemps(nwsDailyTemps, omDailyTemps, metDailyTemps);

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

  // 8) Disagreement
  const nwsConditionsForSpread = await getNwsDailyConditions(links.forecastUrl, 7);
  const omConditionsForSpread = await getOpenMeteoDailyConditions(RICHMOND.lat, RICHMOND.lon, start, end);
  const metConditionsForSpread = await getMetNoDailyConditions(RICHMOND.lat, RICHMOND.lon, 7);

  const condByDate = new Map();

  for (const x of nwsConditionsForSpread) {
    if (!condByDate.has(x.date)) condByDate.set(x.date, {});
    condByDate.get(x.date).nws = x;
  }

  for (const x of omConditionsForSpread) {
    if (!condByDate.has(x.date)) condByDate.set(x.date, {});
    condByDate.get(x.date).openMeteo = x;
  }

  for (const x of metConditionsForSpread) {
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

    return {
      date: day.date,
      overallSpreadF: overallSpread == null ? null : round1(overallSpread),
      highSpreadF: highSpread,
      lowSpreadF: lowSpread,
      precipSpread,
      confidence: classifySpread(overallSpread)
    };
  });

  writeJson(`${dataDir}/disagreement_daily.json`, {
    generatedAt: now.toISO(),
    days: disagreementDays
  });

  // 9) Conditions
  const nwsConditions = nwsConditionsForSpread;
  const omConditions = omConditionsForSpread;
  const metConditions = metConditionsForSpread;
  const blendedConditions = blendDailyConditions(nwsConditions, omConditions, metConditions);

  writeJson(`${dataDir}/conditions_daily.json`, {
    location: RICHMOND,
    generatedAt: now.toISO(),
    days: blendedConditions
  });

  const todayConditions = blendedConditions[0] || null;
  const next7 = blendedConditions;

  writeJson(`${dataDir}/conditions_summary.json`, {
    location: RICHMOND,
    generatedAt: now.toISO(),
    today: todayConditions,
    next7Summary: {
      rainDays: next7.filter(d => d.consensus.rainSignal === "strong" || d.consensus.rainSignal === "medium").length,
      snowDays: next7.filter(d => d.consensus.snowSignal === "strong" || d.consensus.snowSignal === "medium").length,
      thunderDays: next7.filter(d => d.consensus.thunderSignal === "strong" || d.consensus.thunderSignal === "medium").length
    }
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});