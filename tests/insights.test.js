import test from "node:test";
import assert from "node:assert/strict";
import {
  rainOutlook,
  chartDataset,
  temperatureRange,
} from "../assets/insights-model.js";
const now = new Date("2026-11-16T15:20:00Z");
const feed = (values) => ({
  generatedAt: "2026-11-16T14:00:00Z",
  hours: values.map((chance, i) => ({
    timeISO: new Date(
      Date.parse("2026-11-16T15:00:00Z") + i * 3600000,
    ).toISOString(),
    blendedPrecipProbability: chance,
  })),
});
test("rain windows keep missing hours unknown and stop at a gap, including true zero readings", () => {
  const result = rainOutlook(feed([0, 40, 60, null, 80, 120, -1]), now);
  assert.equal(result.slots.length, 24);
  assert.equal(result.known, 4);
  assert.equal(result.slots[0].chance, 0);
  assert.equal(result.peak, 80);
  assert.deepEqual(result.next, {
    start: Date.parse("2026-11-16T16:00:00Z"),
    end: Date.parse("2026-11-16T18:00:00Z"),
    peak: 60,
  });
  assert.equal(result.slots[3].chance, null);
  assert.equal(result.slots[5].chance, null);
  assert.equal(
    rainOutlook({ ...feed([0]), generatedAt: "2026-11-01T00:00:00Z" }, now)
      .known,
    0,
  );
});
test("rain slots preserve both repeated Eastern hours on the fall DST change", () => {
  const data = {
    generatedAt: "2026-11-01T04:00:00Z",
    hours: [
      { timeISO: "2026-11-01T01:00:00-04:00", blendedPrecipProbability: 50 },
      { timeISO: "2026-11-01T01:00:00-05:00", blendedPrecipProbability: 60 },
    ],
  };
  const result = rainOutlook(data, new Date("2026-11-01T05:15:00Z"));
  assert.equal(result.known, 2);
  assert.equal(result.next.end - result.next.start, 7200000);
});
test("accuracy charts share calendar bounds across sources and exclude missing or malformed readings", () => {
  const data = {
    series: {
      nws: [
        { date: "2026-11-01", value: 5 },
        { date: "2026-11-03", value: 7 },
        { date: "2026-11-10", value: null },
      ],
      openMeteo: [
        { date: "2026-11-02", value: 0 },
        { date: "2026-11-10", value: 2 },
        { date: "2026-02-30", value: 9 },
      ],
      metNo: [{ date: "2026-11-10", value: -2 }],
    },
  };
  const all = chartDataset(data, "all");
  assert.deepEqual(all.dates, [
    "2026-11-01",
    "2026-11-02",
    "2026-11-03",
    "2026-11-10",
  ]);
  assert.equal(all.end - all.start, 9 * 86400000);
  assert.equal(all.series.openMeteo[0].value, 0);
  assert.deepEqual(all.series.metNo, []);
  const week = chartDataset(data, "7");
  assert.deepEqual(week.dates, ["2026-11-10"]);
  assert.deepEqual(week.series.nws, []);
  assert.deepEqual(chartDataset(null).dates, []);
});
test("weekly temperature ranges share a scale without coercing missing data to zero", () => {
  const a = { blend: { blendedLowF: 30, blendedHighF: 50 } },
    b = { blend: { blendedLowF: 40, blendedHighF: 70 } };
  assert.deepEqual(temperatureRange(a, [a, b]), { left: 0, width: 50 });
  assert.deepEqual(temperatureRange(b, [a, b]), { left: 25, width: 75 });
  assert.equal(
    temperatureRange({ blend: { blendedLowF: null, blendedHighF: 50 } }, [
      a,
      b,
    ]),
    null,
  );
});
