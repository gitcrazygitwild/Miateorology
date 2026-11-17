import { DateTime } from "luxon";

export function decodeOpenMeteoWeatherCode(code) {
  const rainCodes = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82]);
  const snowCodes = new Set([71, 73, 75, 77, 85, 86]);
  const thunderCodes = new Set([95, 96, 99]);

  return {
    rain: rainCodes.has(code),
    snow: snowCodes.has(code),
    thunder: thunderCodes.has(code)
  };
}

export function openMeteoSummaryFromCode(code) {
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

const numeric = value => Number.isFinite(value) ? value : null;
const instant = (value, timezone) => typeof value === "number"
  ? DateTime.fromSeconds(value, { zone: timezone })
  : DateTime.fromISO(String(value), { zone: timezone });

export function normalizeDwdIcon(data, { now = DateTime.now(), timezone = "America/New_York", hours = 48 } = {}) {
  if (data?.daily_units?.temperature_2m_max !== "°F" ||
      data?.hourly_units?.temperature_2m !== "°F" ||
      data?.hourly_units?.wind_speed_10m !== "mp/h" ||
      data?.daily_units?.wind_speed_10m_max !== "mp/h") {
    throw new Error("ICON returned unexpected units");
  }

  const daily = data.daily || {}, hourly = data.hourly || {};
  const temps = [], conditions = [];
  for (const [index, stamp] of (daily.time || []).entries()) {
    const date = instant(stamp, timezone);
    if (!date.isValid) continue;
    const code = numeric(daily.weather_code?.[index]);
    const signals = code === null
      ? { rain: null, snow: null, thunder: null }
      : decodeOpenMeteoWeatherCode(code);
    const precipitation = numeric(daily.precipitation_sum?.[index]);
    temps.push({
      date: date.toISODate(),
      highF: numeric(daily.temperature_2m_max?.[index]),
      lowF: numeric(daily.temperature_2m_min?.[index])
    });
    conditions.push({
      date: date.toISODate(),
      summary: code === null ? "—" : openMeteoSummaryFromCode(code),
      // This model feed has no precipitation probabilities. Never substitute zero.
      precipProbability: null,
      windMph: numeric(daily.wind_speed_10m_max?.[index]),
      ...signals,
      precipExpected: precipitation === null
        ? (code === null ? null : signals.rain || signals.snow || signals.thunder)
        : precipitation > 0
    });
  }

  const upcoming = (hourly.time || []).flatMap((stamp, index) => {
    const time = instant(stamp, timezone);
    if (!time.isValid || time.toMillis() < +now) return [];
    return [{
      timeISO: time.toISO(),
      tempF: numeric(hourly.temperature_2m?.[index]),
      windMph: numeric(hourly.wind_speed_10m?.[index]),
      precipProbability: null
    }];
  }).slice(0, hours);
  if (!temps.some(day => day.highF !== null || day.lowF !== null)) {
    throw new Error("ICON returned no daily temperatures");
  }
  return { temps, conditions, hours: upcoming };
}

export async function fetchDwdIcon({ lat, lon, timezone = "America/New_York", now = DateTime.now(), fetcher = fetch } = {}) {
  const url = new URL("https://api.open-meteo.com/v1/dwd-icon");
  url.search = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    daily: "temperature_2m_max,temperature_2m_min,weather_code,wind_speed_10m_max,precipitation_sum",
    hourly: "temperature_2m,wind_speed_10m",
    temperature_unit: "fahrenheit",
    wind_speed_unit: "mph",
    timezone,
    timeformat: "unixtime",
    forecast_days: "7"
  });
  const response = await fetcher(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`ICON request failed (${response.status})`);
  return normalizeDwdIcon(await response.json(), { now, timezone });
}
