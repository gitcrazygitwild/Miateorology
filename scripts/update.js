import { DateTime } from "luxon";
import fs from "node:fs";
import path from "node:path";

const TZ = "America/New_York";
const RICHMOND = { name: "Richmond, VA", lat: 37.5407, lon: -77.4360 };

// ---- Helpers ----
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

function fFromC(c) { return (c == null || Number.isNaN(c)) ? null : (c * 9) / 5 + 32; }
function round1(x) { return x == null ? null : Math.round(x * 10) / 10; }
function mean(nums) {
  const v = nums.filter(n => typeof n === "number" && !Number.isNaN(n));
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

// ---- NWS ----
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

async function getNwsDailyHighLowForDate(forecastUrl, targetDate) {
  const data = await fetchJson(forecastUrl, { headers: { "User-Agent": "mia-teorology (github actions)" } });
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
    const c = f?.properties?.temperature?.value; // Celsius
    if (!t || c == null) continue;
    const ts = DateTime.fromISO(t).setZone(TZ);
    if (ts < dayStart || ts >= dayEnd) continue;
    const tf = fFromC(c);
    if (tf != null) tempsF.push(tf);
  }
  if (!tempsF.length) return { obsHighF: null, obsLowF: null, n: 0 };
  return { obsHighF: Math.max(...tempsF), obsLowF: Math.min(...tempsF), n: tempsF.length };
}

// ---- Open-Meteo ----
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
  return dates.map((d, i) => ({ date: d, highF: maxArr[i] ?? null, lowF: minArr[i] ?? null }));
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

// ---- MET Norway ----
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
    out.push({ date: day, highF: round1(Math.max(...temps)), lowF: round1(Math.min(...temps)) });
  }
  return out;
}

// ---- Blending ----
function indexByTime(arr) {
  const m = new Map();
  for (const x of arr) m.set(x.timeISO, x.tempF);
  return m;
}
function indexByDate(arr) {
  const m = new Map();
  for (const x of arr) m.set(x.date, { highF: x.highF, lowF: x.lowF });
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
      sources: { nws: a ?? null, openMeteo: b ?? null, metNo: c ?? null }
    };
  });
}

function blendDaily(nwsArr, omArr, metArr) {
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
      sources: { nws: a ?? null, openMeteo: b ?? null, metNo: c ?? null }
    };
  });
}

// ---- Main ----
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
  const omTomorrowArr = await getOpenMeteoDailyHighLow(RICHMOND.lat, RICHMOND.lon, tomorrow.toISODate(), tomorrow.toISODate());
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

  // 2) Score yesterday (live) if snapshot exists
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

  // 3) Live leaderboard (last 30)
  const scoresDir = `${dataDir}/scores`;
  ensureDir(scoresDir);

  const files = fs.existsSync(scoresDir)
    ? fs.readdirSync(scoresDir).filter(f => f.endsWith(".json")).sort()
    : [];

  const last30 = files.slice(-30).map(f => readJsonIfExists(path.join(scoresDir, f))).filter(Boolean);

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

  // 4) Blended forecasts (daily 7d + hourly 48h)
  const start = now.toISODate();
  const end = now.plus({ days: 6 }).toISODate();

  const nwsDaily = [];
  for (let i = 0; i < 7; i++) {
    const d = now.plus({ days: i }).startOf("day");
    const r = await getNwsDailyHighLowForDate(links.forecastUrl, d);
    nwsDaily.push({ date: d.toISODate(), highF: r.highF, lowF: r.lowF });
  }

  const omDaily = await getOpenMeteoDailyHighLow(RICHMOND.lat, RICHMOND.lon, start, end);
  const metDaily7 = await getMetNoDailyHighLow(RICHMOND.lat, RICHMOND.lon, 7);
  const blendedDaily = blendDaily(nwsDaily, omDaily, metDaily7);

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

  // 5) Open-Meteo 1-year backfill summaries (only if backfill files exist)
  const omDir = `${dataDir}/scores_openmeteo`;
  if (fs.existsSync(omDir)) {
    const omFiles = fs.readdirSync(omDir).filter(f => f.endsWith(".json")).sort();
    const omLast365Files = omFiles.slice(-365);
    const omDays = omLast365Files
      .map(f => readJsonIfExists(path.join(omDir, f)))
      .filter(Boolean);

    const omLatest = omDays.length ? omDays[omDays.length - 1] : null;
    if (omLatest) writeJson(`${dataDir}/latest_openmeteo_year.json`, omLatest);

    const errors = omDays
      .map(d => d?.errors?.overallAbsF)
      .filter(v => typeof v === "number" && !Number.isNaN(v));

    writeJson(`${dataDir}/leaderboard_openmeteo_year.json`, {
      windowDays: Math.min(365, omDays.length),
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
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
