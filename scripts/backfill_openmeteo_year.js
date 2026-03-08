import { DateTime } from "luxon";
import fs from "node:fs";
import path from "node:path";

const TZ = "America/New_York";
const RICHMOND = { name: "Richmond, VA", lat: 37.5407, lon: -77.4360 };

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeJson(filePath, obj) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Fetch failed ${res.status} ${res.statusText} for ${url}\n${txt.slice(0, 300)}`);
  }
  return res.json();
}

function round1(x) {
  if (x == null) return null;
  return Math.round(x * 10) / 10;
}

async function getOpenMeteoHistoricalForecastDaily(lat, lon, targetDate) {
  // Archived forecast endpoint
  const url =
    `https://historical-forecast-api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lon}` +
    `&daily=temperature_2m_max,temperature_2m_min` +
    `&temperature_unit=fahrenheit` +
    `&timezone=${encodeURIComponent(TZ)}` +
    `&start_date=${targetDate}&end_date=${targetDate}` +
    `&models=best_match`;

  const data = await fetchJson(url);
  const daily = data?.daily || {};
  const hi = daily.temperature_2m_max?.[0] ?? null;
  const lo = daily.temperature_2m_min?.[0] ?? null;
  return { highF: hi, lowF: lo };
}

async function getOpenMeteoHistoricalActualDaily(lat, lon, targetDate) {
  // Historical weather endpoint (reanalysis/gridded)
  const url =
    `https://archive-api.open-meteo.com/v1/archive` +
    `?latitude=${lat}&longitude=${lon}` +
    `&daily=temperature_2m_max,temperature_2m_min` +
    `&temperature_unit=fahrenheit` +
    `&timezone=${encodeURIComponent(TZ)}` +
    `&start_date=${targetDate}&end_date=${targetDate}`;

  const data = await fetchJson(url);
  const daily = data?.daily || {};
  const hi = daily.temperature_2m_max?.[0] ?? null;
  const lo = daily.temperature_2m_min?.[0] ?? null;
  return { highF: hi, lowF: lo };
}

async function main() {
  const now = DateTime.now().setZone(TZ);

  // Backfill completed days only
  const endDay = now.minus({ days: 1 }).startOf("day");     // yesterday
  const startDay = endDay.minus({ days: 364 }).startOf("day"); // 365 days total

  const outDir = "data/scores_openmeteo";
  ensureDir(outDir);

  console.log(`Backfilling Open-Meteo for ${RICHMOND.name}`);
  console.log(`Range: ${startDay.toISODate()} -> ${endDay.toISODate()} (365 days)`);

  for (let d = startDay; d <= endDay; d = d.plus({ days: 1 })) {
    const targetDate = d.toISODate();
    const outPath = `${outDir}/${targetDate}.json`;
    if (fs.existsSync(outPath)) continue;

    const forecast = await getOpenMeteoHistoricalForecastDaily(RICHMOND.lat, RICHMOND.lon, targetDate);
    const actual = await getOpenMeteoHistoricalActualDaily(RICHMOND.lat, RICHMOND.lon, targetDate);

    const highErr = (forecast.highF == null || actual.highF == null) ? null : Math.abs(forecast.highF - actual.highF);
    const lowErr = (forecast.lowF == null || actual.lowF == null) ? null : Math.abs(forecast.lowF - actual.lowF);
    const overall = (highErr == null || lowErr == null) ? null : (highErr + lowErr) / 2;

    writeJson(outPath, {
      targetDate,
      location: RICHMOND,
      note:
        "Backfill uses Open-Meteo Historical Forecast (archived forecasts) vs Open-Meteo Historical Weather (reanalysis) for actuals.",
      forecast,
      actual,
      errors: {
        highAbsF: highErr == null ? null : round1(highErr),
        lowAbsF: lowErr == null ? null : round1(lowErr),
        overallAbsF: overall == null ? null : round1(overall)
      },
      computedAt: now.toISO()
    });

    process.stdout.write(".");
  }

  console.log("\nDone. Commit the data/ folder and push.");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
