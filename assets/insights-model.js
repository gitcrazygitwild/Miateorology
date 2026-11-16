import { upcomingHours } from "./planner-model.js";
const HOUR = 3600000;
export const PROVIDERS = {
  nws: "NWS",
  openMeteo: "Open-Meteo",
  metNo: "MET Norway",
};

// Fixed time slots keep gaps visible instead of pulling later hours forward.
export function rainOutlook(data, now = new Date()) {
  const first = Math.floor(+now / HOUR) * HOUR;
  const available = new Map(
    upcomingHours(data, now, 48).map((hour) => [
      +new Date(hour.timeISO),
      hour.blendedPrecipProbability,
    ]),
  );
  const slots = Array.from({ length: 24 }, (_, i) => {
    const time = first + i * HOUR,
      value = available.get(time);
    return {
      time,
      chance:
        Number.isFinite(value) && value >= 0 && value <= 100 ? value : null,
    };
  });
  const known = slots.filter((slot) => slot.chance !== null);
  const start = slots.findIndex(
    (slot) => slot.chance !== null && slot.chance >= 30,
  );
  let end = start;
  while (
    end >= 0 &&
    end + 1 < slots.length &&
    slots[end + 1].chance !== null &&
    slots[end + 1].chance >= 30
  )
    end++;
  return {
    slots,
    known: known.length,
    peak: known.length ? Math.max(...known.map((slot) => slot.chance)) : null,
    next:
      start < 0
        ? null
        : {
            start: slots[start].time,
            end: slots[end].time + HOUR,
            peak: Math.max(
              ...slots.slice(start, end + 1).map((slot) => slot.chance),
            ),
          },
  };
}

export function chartDataset(data, range = "30") {
  const validDate = (date) =>
    typeof date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(date)) &&
    new Date(date).toISOString().slice(0, 10) === date;
  const series = Object.fromEntries(
    Object.keys(PROVIDERS).map((name) => [
      name,
      [
        ...new Map(
          (Array.isArray(data?.series?.[name]) ? data.series[name] : [])
            .filter(
              (p) =>
                validDate(p?.date) && Number.isFinite(p.value) && p.value >= 0,
            )
            .map((p) => [p.date, p]),
        ).values(),
      ].sort((a, b) => a.date.localeCompare(b.date)),
    ]),
  );
  const dates = [
    ...new Set(
      Object.values(series)
        .flat()
        .map((p) => p.date),
    ),
  ].sort();
  if (!dates.length) return { dates: [], series, start: 0, end: 0, max: 1 };
  const end = Date.parse(dates.at(-1)),
    start =
      range === "all"
        ? Date.parse(dates[0])
        : Math.max(Date.parse(dates[0]), end - (Number(range) - 1) * 86400000);
  for (const name of Object.keys(series))
    series[name] = series[name].filter((p) => Date.parse(p.date) >= start);
  return {
    dates: dates.filter((date) => Date.parse(date) >= start),
    series,
    start,
    end,
    max: Math.max(
      1,
      ...Object.values(series)
        .flat()
        .map((p) => p.value),
    ),
  };
}

export function temperatureRange(day, days) {
  const values = days
    .flatMap((row) => [row.blend?.blendedLowF, row.blend?.blendedHighF])
    .filter(Number.isFinite);
  const low = day.blend?.blendedLowF,
    high = day.blend?.blendedHighF;
  if (
    !values.length ||
    !Number.isFinite(low) ||
    !Number.isFinite(high) ||
    high < low
  )
    return null;
  const min = Math.min(...values),
    span = Math.max(1, Math.max(...values) - min);
  return {
    left: ((low - min) / span) * 100,
    width: Math.max(2, ((high - low) / span) * 100),
  };
}
