import { richmondDay, forecastCondition, weatherIcon } from './weather-shared.js';
import { renderHourlyStrip, initOutdoorPlanner } from './weather-planner.js';
import { initDesk, renderRain, renderForecastDays } from './desk-ui.js';
import { initAccuracyChart } from './accuracy-chart.js';
import { PROVIDERS } from './insights-model.js';
const providerName = name => PROVIDERS[name] || name;
initDesk();
const updateChart = initAccuracyChart(document.getElementById('chartWrap'));
async function fetchJson(p) {
  const res = await fetch(p, { cache: "no-store", signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`Failed to load ${p}`);
  return res.json();
}

function el(tag, attrs = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else n.setAttribute(k, v);
  }
  for (const c of children) n.append(c);
  return n;
}

function getRichmondFormatter(options = {}) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    ...options
  });
}

function formatRichmondDay(dateStr, weekdayStyle = "short") {
  const d = new Date(`${dateStr}T12:00:00-04:00`);
  const weekday = getRichmondFormatter({ weekday: weekdayStyle }).format(d);
  const monthDay = getRichmondFormatter({ month: "numeric", day: "numeric" }).format(d);
  return { weekday, monthDay };
}

function formatRichmondHour(isoStr) {
  const d = new Date(isoStr);
  return getRichmondFormatter({
    weekday: "short",
    hour: "numeric",
    minute: "2-digit"
  }).format(d);
}

function formatRichmondTimestamp(isoStr) {
  const d = new Date(isoStr);
  return getRichmondFormatter({
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(d);
}

function pillClassForConfidence(conf) {
  if (conf === "high") return "disagreementPill confHigh";
  if (conf === "medium") return "disagreementPill confMedium";
  if (conf === "low") return "disagreementPill confLow";
  return "disagreementPill";
}

function pillLabelForConfidence(conf) {
  if (conf === "high") return "High source agreement";
  if (conf === "medium") return "Mixed source agreement";
  if (conf === "low") return "Low source agreement";
  return "Unknown";
}

function pickWeatherIcon(day) {
  const holder = document.createElement('span');
  holder.innerHTML = weatherIcon(forecastCondition(day).kind);
  return holder.firstElementChild;
}

function mergeOutlookData(blendDaily, conditionsDaily, disagreementDaily) {
  const byDate = new Map();

  for (const d of blendDaily?.days || []) {
    byDate.set(d.date, { date: d.date, blend: d });
  }

  for (const d of conditionsDaily?.days || []) {
    if (!byDate.has(d.date)) byDate.set(d.date, { date: d.date });
    byDate.get(d.date).conditions = d;
  }

  for (const d of disagreementDaily?.days || []) {
    if (!byDate.has(d.date)) byDate.set(d.date, { date: d.date });
    byDate.get(d.date).disagreement = d;
  }

  return Array.from(byDate.values()).filter(day => day.date >= richmondDay()).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 7);
}

function renderTitleTodayBadge(container, mergedDays) {
  const today = mergedDays?.find(day => day.date === richmondDay());
  if (!today) {
    container.replaceChildren();
    return;
  }

  const icon = pickWeatherIcon(today.conditions || {});
  const hi = today.blend?.blendedHighF;
  const lo = today.blend?.blendedLowF;

  const badge = el("div", { class: "titleTodayBadgeInner" }, [
    el("span", { class: "titleTodayBadgeIcon", "aria-hidden": "true" }, [icon]),
    el("span", { class: "titleTodayBadgeTemps" }, [
      `${Number.isFinite(hi) ? Math.round(hi) : "—"}° / ${Number.isFinite(lo) ? Math.round(lo) : "—"}°`
    ])
  ]);

  container.replaceChildren(badge);
}

function renderWeatherStory(container, data) {
  if (!data?.summary) {
    container.textContent = "Weather story not ready yet.";
    return;
  }

  const wrap = el("div", { class: "storyCard" }, [
    el("div", { class: "storyTitle" }, [data.title || "Weather story"]),
    el("div", { class: "storySummary" }, [data.summary])
  ]);

  container.replaceChildren(wrap);
}

function renderRainbowWatch(container, data) {
  const today = (data?.days || []).find(day => day.date === richmondDay());
  const future = (data?.days || []).filter(day => day.date >= richmondDay() && Number.isFinite(day.score));
  const best = [...future].sort((a, b) => b.score - a.score)[0];
  if (!today || !Number.isFinite(today.score)) { container.textContent = 'Mia is waiting for today’s rainbow outlook.'; return; }
  container.replaceChildren(el('p', {}, [`${today.band || 'Unknown'} potential today · ${Math.round(today.score)}/100 rainbow index.`]), el('p', {class:'smallMuted'}, [best?.score > today.score ? `Best upcoming setup: ${formatRichmondDay(best.date).weekday} ${formatRichmondDay(best.date).monthDay} · ${Math.round(best.score)}/100. A playful index, not a probability.` : `${today.summary || 'Keep an eye on the sky.'} A playful index, not a probability.`]));
}

function renderLeaderboard(container, data) {
  const table = el("table");
  table.append(
    el("thead", {}, [
      el("tr", {}, [
        el("th", {}, ["Rank"]),
        el("th", {}, ["Provider"]),
        el("th", {}, ["Temp error"]),
        el("th", {}, ["Wind error"]),
        el("th", {}, ["Precip hit rate"]),
        el("th", {}, ["Days"])
      ])
    ])
  );

  const tbody = el("tbody");
  data.leaderboard.forEach((row, i) => {
    tbody.append(
      el("tr", {}, [
        el("td", {}, [String(i + 1)]),
        el("td", {}, [providerName(row.provider)]),
        el("td", {}, [row.meanOverallAbsF == null ? "—" : `${row.meanOverallAbsF.toFixed(1)}°`]),
        el("td", {}, [row.meanWindAbsMph == null ? "—" : `${row.meanWindAbsMph.toFixed(1)} mph`]),
        el("td", {}, [row.precipHitRate == null ? "—" : `${row.precipHitRate.toFixed(0)}%`]),
        el("td", {}, [String(row.daysScored ?? 0)])
      ])
    );
  });

  table.append(tbody);
  container.replaceChildren(table);
}

function renderLatest(container, latestScore) {
  const observed = latestScore.observed || {};

  const header = el("div", {}, [
    el("div", {}, [
      el("span", { class: "badge" }, [latestScore.targetDate]),
      document.createTextNode(" "),
      el("span", { class: "muted" }, [
        `Observed: ${latestScore.observedFromStation}${latestScore.observationCount != null ? ` (n=${latestScore.observationCount})` : ""}`
      ])
    ]),
    el("p", { class: "muted" }, [
      `Observed high/low: ${observed.highF ?? "—"}° / ${observed.lowF ?? "—"}° • Max wind: ${observed.maxWindMph ?? "—"} mph • Precip: ${observed.precipOccurred == null ? "—" : observed.precipOccurred ? "Yes" : "No"}`
    ])
  ]);

  const table = el("table");
  table.append(
    el("thead", {}, [
      el("tr", {}, [
        el("th", {}, ["Provider"]),
        el("th", {}, ["Pred high/low"]),
        el("th", {}, ["Pred wind"]),
        el("th", {}, ["Pred precip"]),
        el("th", {}, ["Temp error"]),
        el("th", {}, ["Wind error"]),
        el("th", {}, ["Precip event"])
      ])
    ])
  );

  const tbody = el("tbody");
  for (const s of latestScore.scores || []) {
    const p = s.predicted || {};
    const e = s.errors || {};
    tbody.append(
      el("tr", {}, [
        el("td", {}, [providerName(s.provider)]),
        el("td", {}, [`${p.highF ?? "—"}° / ${p.lowF ?? "—"}°`]),
        el("td", {}, [p.windMph == null ? "—" : `${p.windMph} mph`]),
        el("td", {}, [typeof p.precipProbability === "number" ? `${p.precipProbability}%` : (p.precipExpected ? "Yes" : "No")]),
        el("td", {}, [e.overallAbsF == null ? "—" : `${e.overallAbsF.toFixed(1)}°`]),
        el("td", {}, [e.windAbsMph == null ? "—" : `${e.windAbsMph.toFixed(1)} mph`]),
        el("td", {}, [
          e.precipEventMiss == null ? "—" : (e.precipEventMiss === 0 ? "Hit" : "Miss")
        ])
      ])
    );
  }
  table.append(tbody);

  container.replaceChildren(header, table);
}

function renderBlendDaily(container, data) {
  const table = el("table");
  table.append(
    el("thead", {}, [
      el("tr", {}, [
        el("th", {}, ["Day"]),
        el("th", {}, ["Blend high/low"]),
        el("th", {}, ["Blend precip"]),
        el("th", {}, ["Blend wind"]),
        el("th", {}, ["NWS"]),
        el("th", {}, ["Open-Meteo"]),
        el("th", {}, ["MET.no"])
      ])
    ])
  );

  const tbody = el("tbody");
  for (const d of data.days || []) {
    const label = formatRichmondDay(d.date);
    tbody.append(
      el("tr", {}, [
        el("td", {}, [`${label.weekday} ${label.monthDay}`]),
        el("td", {}, [`${d.blendedHighF ?? "—"}° / ${d.blendedLowF ?? "—"}°`]),
        el("td", {}, [d.blendedPrecipProbability == null ? "—" : `${d.blendedPrecipProbability.toFixed(0)}%`]),
        el("td", {}, [d.blendedWindMph == null ? "—" : `${d.blendedWindMph.toFixed(0)} mph`]),
        el("td", {}, [
          `${d.sources?.nws?.highF ?? "—"}° / ${d.sources?.nws?.lowF ?? "—"}° • ${d.sources?.nws?.precipProbability ?? "—"}% • ${d.sources?.nws?.windMph ?? "—"} mph`
        ]),
        el("td", {}, [
          `${d.sources?.openMeteo?.highF ?? "—"}° / ${d.sources?.openMeteo?.lowF ?? "—"}° • ${d.sources?.openMeteo?.precipProbability ?? "—"}% • ${d.sources?.openMeteo?.windMph ?? "—"} mph`
        ]),
        el("td", {}, [
          `${d.sources?.metNo?.highF ?? "—"}° / ${d.sources?.metNo?.lowF ?? "—"}° • ${d.sources?.metNo?.precipProbability ?? "—"}% • ${d.sources?.metNo?.windMph ?? "—"} mph`
        ])
      ])
    );
  }

  table.append(tbody);
  container.replaceChildren(table);
}

function renderBlendHourly(container, data) {
  const table = el("table");
  table.append(
    el("thead", {}, [
      el("tr", {}, [
        el("th", {}, ["Time"]),
        el("th", {}, ["Blend temp"]),
        el("th", {}, ["Blend precip"]),
        el("th", {}, ["Blend wind"]),
        el("th", {}, ["NWS"]),
        el("th", {}, ["Open-Meteo"]),
        el("th", {}, ["MET.no"])
      ])
    ])
  );

  const tbody = el("tbody");
  for (const h of data.hours || []) {
    const label = formatRichmondHour(h.timeISO);

    tbody.append(
      el("tr", {}, [
        el("td", {}, [label]),
        el("td", {}, [h.blendedTempF == null ? "—" : `${h.blendedTempF.toFixed(1)}°`]),
        el("td", {}, [h.blendedPrecipProbability == null ? "—" : `${h.blendedPrecipProbability.toFixed(0)}%`]),
        el("td", {}, [h.blendedWindMph == null ? "—" : `${h.blendedWindMph.toFixed(0)} mph`]),
        el("td", {}, [
          h.sources?.nws
            ? `${h.sources?.nws.tempF ?? "—"}° • ${h.sources?.nws.precipProbability ?? "—"}% • ${h.sources?.nws.windMph ?? "—"} mph`
            : "—"
        ]),
        el("td", {}, [
          h.sources?.openMeteo
            ? `${h.sources?.openMeteo.tempF ?? "—"}° • ${h.sources?.openMeteo.precipProbability ?? "—"}% • ${h.sources?.openMeteo.windMph ?? "—"} mph`
            : "—"
        ]),
        el("td", {}, [
          h.sources?.metNo
            ? `${h.sources?.metNo.tempF ?? "—"}° • ${h.sources?.metNo.precipProbability ?? "—"}% • ${h.sources?.metNo.windMph ?? "—"} mph`
            : "—"
        ])
      ])
    );
  }

  table.append(tbody);
  container.replaceChildren(table);
}

function renderMonthlyWinner(container, data) {
  if (!data?.leader) {
    container.textContent = "Not enough scored days yet this month.";
    return;
  }

  const leader = data.leader;
  const standings = data.standings || [];

  const grid = el("div", { class: "statGrid" }, [
    el("div", { class: "statCard" }, [
      el("div", { class: "statLabel" }, ["Leader"]),
      el("div", { class: "statValue" }, [providerName(leader.provider)]),
      el("div", { class: "statSub" }, [`${leader.meanOverallAbsF.toFixed(1)}° mean temp error`])
    ]),
    el("div", { class: "statCard" }, [
      el("div", { class: "statLabel" }, ["Month"]),
      el("div", { class: "statValue" }, [data.month]),
      el("div", { class: "statSub" }, [`${leader.daysScored} scored day${leader.daysScored === 1 ? "" : "s"}`])
    ])
  ]);

  const table = el("table");
  table.append(
    el("thead", {}, [
      el("tr", {}, [
        el("th", {}, ["Rank"]),
        el("th", {}, ["Source"]),
        el("th", {}, ["Mean temp error"]),
        el("th", {}, ["Days"])
      ])
    ])
  );

  const tbody = el("tbody");
  standings.forEach((row, i) => {
    tbody.append(
      el("tr", {}, [
        el("td", {}, [String(i + 1)]),
        el("td", {}, [providerName(row.provider)]),
        el("td", {}, [row.meanOverallAbsF == null ? "—" : `${row.meanOverallAbsF.toFixed(1)}°`]),
        el("td", {}, [String(row.daysScored)])
      ])
    );
  });
  table.append(tbody);

  container.replaceChildren(grid, table);
}

function renderDisagreement(container, data) {
  const table = el("table");
  table.append(
    el("thead", {}, [
      el("tr", {}, [
        el("th", {}, ["Day"]),
        el("th", {}, ["Confidence"]),
        el("th", {}, ["Temp spread"]),
        el("th", {}, ["Precip spread"]),
        el("th", {}, ["Wind spread"]),
        el("th", {}, ["High / low"])
      ])
    ])
  );

  const tbody = el("tbody");
  for (const row of data.days || []) {
    const label = formatRichmondDay(row.date);
    tbody.append(
      el("tr", {}, [
        el("td", {}, [`${label.weekday} ${label.monthDay}`]),
        el("td", {}, [el("span", { class: pillClassForConfidence(row.confidence) }, [pillLabelForConfidence(row.confidence)])]),
        el("td", {}, [row.overallSpreadF == null ? "—" : `${row.overallSpreadF.toFixed(1)}°`]),
        el("td", {}, [row.precipSpread == null ? "—" : `${row.precipSpread.toFixed(0)} pts`]),
        el("td", {}, [row.windSpreadMph == null ? "—" : `${row.windSpreadMph.toFixed(0)} mph`]),
        el("td", {}, [
          `${row.highSpreadF == null ? "—" : `${row.highSpreadF.toFixed(1)}°`} / ${row.lowSpreadF == null ? "—" : `${row.lowSpreadF.toFixed(1)}°`}`
        ])
      ])
    );
  }

  table.append(tbody);
  container.replaceChildren(table);
}

function renderTodayHero(container, mergedDays) {
  const today = mergedDays?.find(day => day.date === richmondDay());
  if (!today) {
    container.textContent = "Today’s forecast not ready yet.";
    return;
  }

  const blend = today.blend || {};
  const conditions = today.conditions || {};
  const disagreement = today.disagreement || {};
  const consensus = conditions.consensus || {};
  const label = formatRichmondDay(today.date, "long");
  const icon = pickWeatherIcon(conditions);

  const wrap = el("div", { class: "todayHeroWrap" }, [
    el("div", { class: "todayHeroMain" }, [
      el("div", { class: "todayHeroLabel" }, ["Today’s Richmond forecast"]),
      el("div", { class: "todayHeroTitle" }, [`${label.weekday} ${label.monthDay}`]),
      el("div", { class: "todayHeroSub" }, [forecastCondition(conditions).label]),
      el("div", { class: "todayHeroTemps" }, [
        `${Number.isFinite(blend.blendedHighF) ? Math.round(blend.blendedHighF) : "—"}° / ${Number.isFinite(blend.blendedLowF) ? Math.round(blend.blendedLowF) : "—"}°`
      ]),
      el("div", { class: "todayHeroMiniRow" }, [
        el("span", { class: "todayMiniPill" }, [
          consensus.avgPrecipProbability == null
            ? "Rain chance: —"
            : `Rain chance: ${consensus.avgPrecipProbability.toFixed(0)}%`
        ]),
        el("span", { class: "todayMiniPill" }, [
          consensus.avgWindMph == null
            ? "Wind: —"
            : `Wind: ${consensus.avgWindMph.toFixed(0)} mph`
        ]),
        el("span", { class: pillClassForConfidence(disagreement.confidence) }, [pillLabelForConfidence(disagreement.confidence)])
      ])
    ]),
    el("div", { class: "todayHeroIcon", "aria-hidden": "true" }, [icon])
  ]);

  container.replaceChildren(wrap);
}

async function loadLive(meta) {
  document.getElementById("monthlyHeading").textContent = "This month’s standings";
  const lb = await fetchJson("./data/leaderboard.json");
  document.getElementById("meta").textContent = `Location: ${meta.location.name} • Window: ${lb.windowDays} days • Time zone: Richmond`;
  renderLeaderboard(document.getElementById("leaderboard"), lb);

  const todayDate = meta.todayDate || null;
  let latest = null;

  if (todayDate) {
    const richmondBase = new Date(`${todayDate}T12:00:00-04:00`);
    for (let i = 0; i < 40; i++) {
      const d = new Date(richmondBase);
      d.setDate(richmondBase.getDate() - i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const iso = `${y}-${m}-${day}`;
      try {
        latest = await fetchJson(`./data/scores/${iso}.json`);
        break;
      } catch {}
    }
  }

  if (latest) renderLatest(document.getElementById("latest"), latest);
  else document.getElementById("latest").textContent = "No scored days yet (wait for the action to run).";

  document.getElementById("viewNote").textContent =
    "Live accuracy compares forecast temperature, wind, and precipitation-event performance using Richmond-centered data.";

  try {
    const monthly = await fetchJson("./data/monthly_winner_live.json");
    renderMonthlyWinner(document.getElementById("monthlyWinner"), monthly);
  } catch {
    document.getElementById("monthlyWinner").textContent = "Monthly standings not ready yet.";
  }

  try {
    const chart = await fetchJson("./data/chart_live.json");
    updateChart(chart);
  } catch {
    updateChart(null);
  }
}

async function loadBackfill(meta) {
  document.getElementById("monthlyHeading").textContent = "Historical comparison";
  try {
    const lb = await fetchJson("./data/leaderboard_openmeteo_year.json");
    const latest = await fetchJson("./data/latest_openmeteo_year.json");

    document.getElementById("meta").textContent = `Location: ${meta.location.name} • Window: ${lb.windowDays} days • Time zone: Richmond`;
    renderLeaderboard(document.getElementById("leaderboard"), {
      leaderboard: lb.leaderboard.map(row => ({
        ...row,
        meanWindAbsMph: null,
        precipHitRate: null
      }))
    });

    const converted = {
      targetDate: latest.targetDate,
      observedFromStation: "Open-Meteo historical weather (reanalysis)",
      observationCount: null,
      observed: {
        highF: latest.actual?.highF ?? null,
        lowF: latest.actual?.lowF ?? null,
        maxWindMph: null,
        precipOccurred: null
      },
      scores: [
        {
          provider: "openMeteo",
          predicted: latest.forecast,
          errors: {
            highAbsF: latest.errors?.highAbsF ?? null,
            lowAbsF: latest.errors?.lowAbsF ?? null,
            overallAbsF: latest.errors?.overallAbsF ?? null,
            windAbsMph: null,
            precipEventMiss: null
          }
        }
      ]
    };

    renderLatest(document.getElementById("latest"), converted);

    document.getElementById("viewNote").textContent =
      "Backfill is Open-Meteo only: archived forecasts vs historical weather for temperature.";

    document.getElementById("monthlyWinner").innerHTML = "";
    document.getElementById("monthlyWinner").append(
      el("div", { class: "statGrid" }, [
        el("div", { class: "statCard" }, [
          el("div", { class: "statLabel" }, ["Mode"]),
          el("div", { class: "statValue" }, ["Backfill"]),
          el("div", { class: "statSub" }, ["Archived predictions versus reanalysis. One provider; temperature only."])
        ])
      ])
    );

    try {
      const chart = await fetchJson("./data/chart_backfill_openmeteo_year.json");
      updateChart(chart);
    } catch {
      updateChart(null);
    }
  } catch {
    document.getElementById("viewNote").textContent =
      "Backfill data not generated yet. Run the 'Backfill Open-Meteo (1 year)' GitHub Action once.";
    document.getElementById("leaderboard").textContent = "—";
    document.getElementById("latest").textContent = "—";
    updateChart(null);
    document.getElementById("monthlyWinner").textContent = "—";
  }
}

async function main() {
  const meta = await fetchJson("./data/meta.json");

  const btnLive = document.getElementById("btnLive");
  const btnBackfill = document.getElementById("btnBackfill");

  let modeLoading = false;
  async function setMode(mode) {
    if (modeLoading) return;
    modeLoading = true; btnLive.disabled = btnBackfill.disabled = true;
    btnLive.setAttribute("aria-pressed", String(mode !== "backfill")); btnBackfill.setAttribute("aria-pressed", String(mode === "backfill"));
    try {
    if (mode === "backfill") {
      btnBackfill.classList.add("active");
      btnLive.classList.remove("active");
      await loadBackfill(meta);
      try { localStorage.setItem("accuracyView", "backfill"); } catch {}
    } else {
      btnLive.classList.add("active");
      btnBackfill.classList.remove("active");
      await loadLive(meta);
      try { localStorage.setItem("accuracyView", "live"); } catch {}
    }
    } catch {
      document.getElementById('viewNote').textContent = 'This accuracy dataset is temporarily unavailable. Try selecting it again.';
      for (const id of ['monthlyWinner','leaderboard','latest']) document.getElementById(id).textContent = 'Unavailable';
      updateChart(null);
    }
    finally { modeLoading = false; btnLive.disabled = btnBackfill.disabled = false; }
  }

  btnLive?.addEventListener("click", () => setMode("live").catch(console.error));
  btnBackfill?.addEventListener("click", () => setMode("backfill").catch(console.error));

  let pref = 'live';
  try { pref = localStorage.getItem('accuracyView') || 'live'; } catch {}
  await setMode(pref);
}

const updateOutdoor = initOutdoorPlanner();
let refreshing = false;
function currentFeed(data) {
  const age = Date.now() - new Date(data?.generatedAt).getTime();
  return Number.isFinite(age) && age >= -300000 && age <= 72 * 3600000 ? data : null;
}
async function refreshForecast() {
  if (refreshing) return;
  refreshing = true;
  const button = document.getElementById('refreshForecast');
  button.disabled = true;
  const names = ['rainbow_watch', 'disagreement_daily', 'conditions_daily', 'blend_daily', 'blend_hourly'];
  try {
    const results = await Promise.allSettled(names.map(name => fetchJson(`./data/${name}.json`)));
    const data = Object.fromEntries(names.map((name, i) => [name, results[i].status === 'fulfilled' ? currentFeed(results[i].value) : null]));
    const renderers = [
      ['rainbow_watch','rainbowWatch',renderRainbowWatch], ['disagreement_daily','disagreement',renderDisagreement],
      ['blend_daily','blendDaily',renderBlendDaily], ['blend_hourly','blendHourly',renderBlendHourly]
    ];
    for (const [key,id,render] of renderers) {
      const target = document.getElementById(id);
      if (data[key]) render(target, data[key]);
      else target.textContent = 'Current forecast unavailable. Please try refreshing.';
    }
    renderHourlyStrip(data.blend_hourly);
    renderRain(document.getElementById('rainOutlook'), data.blend_hourly);
    updateOutdoor(data.blend_hourly, data.conditions_daily);
    const merged = data.blend_daily && data.conditions_daily ? mergeOutlookData(data.blend_daily, data.conditions_daily, data.disagreement_daily) : [];
    renderTitleTodayBadge(document.getElementById('titleTodayBadge'), merged);
    renderTodayHero(document.getElementById('todayHero'), merged);
    renderForecastDays(document.getElementById('dailyOutlook'), merged);
    const today = merged.find(day => day.date === richmondDay());
    renderWeatherStory(document.getElementById('weatherStory'), today ? {title:'The daily read', summary:today.conditions?.writeup || forecastCondition(today.conditions).label} : null);
    const issued = data.blend_daily?.generatedAt;
    const older = issued && Math.min(+new Date(issued), +new Date(data.conditions_daily?.generatedAt)) < Date.now() - 36 * 3600000;
    const status = document.getElementById('forecastStatus');
    status.dataset.stale = String(!merged.length || older);
    status.textContent = !merged.length ? 'Forecast unavailable · try refresh' : `${older ? 'Older forecast' : 'Forecast issued'} ${formatRichmondTimestamp(issued)} ET · checked ${getRichmondFormatter({hour:'numeric',minute:'2-digit'}).format(new Date())}`;
    document.getElementById('updated').textContent = 'Richmond, VA · NWS + Open-Meteo + MET Norway';
  } catch (error) {
    console.error(error);
    document.getElementById('forecastStatus').textContent = 'Could not refresh the forecast. Try again shortly.';
  } finally { refreshing = false; button.disabled = false; }
}
document.getElementById('refreshForecast').addEventListener('click', refreshForecast);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshForecast(); });
setInterval(() => { if (document.visibilityState === 'visible') refreshForecast(); }, 300000);
refreshForecast();
main().catch(() => { document.getElementById('viewNote').textContent = 'Accuracy history is temporarily unavailable. The forecast loads separately.'; });
