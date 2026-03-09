async function fetchJson(p) {
  const res = await fetch(p, { cache: "no-store" });
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

function pillClassForConfidence(conf) {
  if (conf === "high") return "disagreementPill confHigh";
  if (conf === "medium") return "disagreementPill confMedium";
  if (conf === "low") return "disagreementPill confLow";
  return "disagreementPill";
}

function pillLabelForConfidence(conf) {
  if (conf === "high") return "High confidence";
  if (conf === "medium") return "Mixed";
  if (conf === "low") return "Low confidence";
  return "Unknown";
}

function pillClassForSignal(signal) {
  if (signal === "strong") return "conditionPill signalStrong";
  if (signal === "medium") return "conditionPill signalMedium";
  if (signal === "weak") return "conditionPill signalWeak";
  return "conditionPill signalOff";
}

function pillLabelForSignal(signal) {
  if (signal === "strong") return "Strong";
  if (signal === "medium") return "Moderate";
  if (signal === "weak") return "Weak";
  return "None";
}

function renderLeaderboard(container, data) {
  const table = el("table");
  table.append(
    el("thead", {}, [
      el("tr", {}, [
        el("th", {}, ["Rank"]),
        el("th", {}, ["Provider"]),
        el("th", {}, ["Mean error (°F)"]),
        el("th", {}, ["Days scored"])
      ])
    ])
  );

  const tbody = el("tbody");
  data.leaderboard.forEach((row, i) => {
    tbody.append(
      el("tr", {}, [
        el("td", {}, [String(i + 1)]),
        el("td", {}, [row.provider]),
        el("td", {}, [row.meanOverallAbsF == null ? "—" : row.meanOverallAbsF.toFixed(1)]),
        el("td", {}, [String(row.daysScored ?? 0)])
      ])
    );
  });

  table.append(tbody);
  container.replaceChildren(table);
}

function renderLatest(container, latestScore) {
  const header = el("div", {}, [
    el("div", {}, [
      el("span", { class: "badge" }, [latestScore.targetDate]),
      document.createTextNode(" "),
      el("span", { class: "muted" }, [
        `Observed: ${latestScore.observedFromStation}${latestScore.observationCount != null ? ` (n=${latestScore.observationCount})` : ""}`
      ])
    ]),
    el("p", { class: "muted" }, [
      `Observed high/low: ${latestScore.observed.highF ?? "—"}° / ${latestScore.observed.lowF ?? "—"}°`
    ])
  ]);

  const table = el("table");
  table.append(
    el("thead", {}, [
      el("tr", {}, [
        el("th", {}, ["Provider"]),
        el("th", {}, ["Pred high/low"]),
        el("th", {}, ["High err"]),
        el("th", {}, ["Low err"]),
        el("th", {}, ["Overall"])
      ])
    ])
  );

  const tbody = el("tbody");
  for (const s of latestScore.scores) {
    const p = s.predicted || {};
    const e = s.errors || {};
    tbody.append(
      el("tr", {}, [
        el("td", {}, [s.provider]),
        el("td", {}, [`${p.highF ?? "—"}° / ${p.lowF ?? "—"}°`]),
        el("td", {}, [e.highAbsF == null ? "—" : `${e.highAbsF.toFixed(1)}°`]),
        el("td", {}, [e.lowAbsF == null ? "—" : `${e.lowAbsF.toFixed(1)}°`]),
        el("td", {}, [e.overallAbsF == null ? "—" : `${e.overallAbsF.toFixed(1)}°`])
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
        el("th", {}, ["Date"]),
        el("th", {}, ["Blend High/Low"]),
        el("th", {}, ["NWS"]),
        el("th", {}, ["Open-Meteo"]),
        el("th", {}, ["MET.no"])
      ])
    ])
  );

  const tbody = el("tbody");
  for (const d of data.days) {
    tbody.append(
      el("tr", {}, [
        el("td", {}, [d.date]),
        el("td", {}, [`${d.blendedHighF ?? "—"}° / ${d.blendedLowF ?? "—"}°`]),
        el("td", {}, [d.sources.nws ? `${d.sources.nws.highF ?? "—"}° / ${d.sources.nws.lowF ?? "—"}°` : "—"]),
        el("td", {}, [d.sources.openMeteo ? `${d.sources.openMeteo.highF ?? "—"}° / ${d.sources.openMeteo.lowF ?? "—"}°` : "—"]),
        el("td", {}, [d.sources.metNo ? `${d.sources.metNo.highF ?? "—"}° / ${d.sources.metNo.lowF ?? "—"}°` : "—"])
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
        el("th", {}, ["Blend Temp"]),
        el("th", {}, ["NWS"]),
        el("th", {}, ["Open-Meteo"]),
        el("th", {}, ["MET.no"])
      ])
    ])
  );

  const tbody = el("tbody");
  for (const h of data.hours) {
    const t = new Date(h.timeISO);
    const label = t.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });

    tbody.append(
      el("tr", {}, [
        el("td", {}, [label]),
        el("td", {}, [h.blendedTempF == null ? "—" : `${h.blendedTempF.toFixed(1)}°`]),
        el("td", {}, [h.sources.nws == null ? "—" : `${h.sources.nws}°`]),
        el("td", {}, [h.sources.openMeteo == null ? "—" : `${h.sources.openMeteo}°`]),
        el("td", {}, [h.sources.metNo == null ? "—" : `${h.sources.metNo}°`])
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
      el("div", { class: "statValue" }, [leader.provider]),
      el("div", { class: "statSub" }, [`${leader.meanOverallAbsF.toFixed(1)}° mean error`])
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
        el("th", {}, ["Mean error"]),
        el("th", {}, ["Days"])
      ])
    ])
  );

  const tbody = el("tbody");
  standings.forEach((row, i) => {
    tbody.append(
      el("tr", {}, [
        el("td", {}, [String(i + 1)]),
        el("td", {}, [row.provider]),
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
        el("th", {}, ["Date"]),
        el("th", {}, ["Confidence"]),
        el("th", {}, ["Overall spread"]),
        el("th", {}, ["High spread"]),
        el("th", {}, ["Low spread"])
      ])
    ])
  );

  const tbody = el("tbody");
  for (const row of data.days) {
    tbody.append(
      el("tr", {}, [
        el("td", {}, [row.date]),
        el("td", {}, [el("span", { class: pillClassForConfidence(row.confidence) }, [pillLabelForConfidence(row.confidence)])]),
        el("td", {}, [row.overallSpreadF == null ? "—" : `${row.overallSpreadF.toFixed(1)}°`]),
        el("td", {}, [row.highSpreadF == null ? "—" : `${row.highSpreadF.toFixed(1)}°`]),
        el("td", {}, [row.lowSpreadF == null ? "—" : `${row.lowSpreadF.toFixed(1)}°`])
      ])
    );
  }

  table.append(tbody);
  container.replaceChildren(table);
}

function renderLineChart(container, chartData, mode) {
  const seriesEntries = Object.entries(chartData.series || {})
    .map(([name, arr]) => [name, (arr || []).filter(p => typeof p.value === "number")])
    .filter(([, arr]) => arr.length);

  if (!seriesEntries.length) {
    container.textContent = "Not enough chart data yet.";
    return;
  }

  const allPoints = seriesEntries.flatMap(([, arr]) => arr);
  const values = allPoints.map(p => p.value);
  const minY = Math.min(...values);
  const maxY = Math.max(...values);
  const rangeY = Math.max(1, maxY - minY);

  const width = 820;
  const height = 280;
  const padL = 44;
  const padR = 16;
  const padT = 16;
  const padB = 30;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const palette = {
    nws: "#7dd3fc",
    openMeteo: mode === "backfill" ? "#c4b5fd" : "#86efac",
    metNo: "#fca5a5"
  };

  const xAt = (i, n) => padL + (n <= 1 ? innerW / 2 : (i * innerW) / (n - 1));
  const yAt = (v) => padT + innerH - ((v - minY) / rangeY) * innerH;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("class", "chartSvg");

  for (let i = 0; i < 4; i++) {
    const y = padT + (innerH * i) / 3;
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", padL);
    line.setAttribute("x2", width - padR);
    line.setAttribute("y1", y);
    line.setAttribute("y2", y);
    line.setAttribute("stroke", "rgba(255,255,255,.08)");
    line.setAttribute("stroke-width", "1");
    svg.appendChild(line);

    const labelVal = (maxY - ((maxY - minY) * i) / 3).toFixed(1);
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", 4);
    text.setAttribute("y", y + 4);
    text.setAttribute("fill", "#a8b3d6");
    text.setAttribute("font-size", "12");
    text.textContent = `${labelVal}°`;
    svg.appendChild(text);
  }

  for (const [name, arr] of seriesEntries) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const d = arr.map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(i, arr.length)} ${yAt(p.value)}`).join(" ");
    path.setAttribute("d", d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", palette[name] || "#fff");
    path.setAttribute("stroke-width", "3");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.appendChild(path);
  }

  const firstPoint = allPoints[0];
  const lastPoint = allPoints[allPoints.length - 1];
  if (firstPoint && lastPoint) {
    const leftText = document.createElementNS("http://www.w3.org/2000/svg", "text");
    leftText.setAttribute("x", padL);
    leftText.setAttribute("y", height - 6);
    leftText.setAttribute("fill", "#a8b3d6");
    leftText.setAttribute("font-size", "12");
    leftText.textContent = firstPoint.date;
    svg.appendChild(leftText);

    const rightText = document.createElementNS("http://www.w3.org/2000/svg", "text");
    rightText.setAttribute("x", width - padR);
    rightText.setAttribute("y", height - 6);
    rightText.setAttribute("text-anchor", "end");
    rightText.setAttribute("fill", "#a8b3d6");
    rightText.setAttribute("font-size", "12");
    rightText.textContent = lastPoint.date;
    svg.appendChild(rightText);
  }

  const legend = el("div", { class: "chartLegend" });
  if (mode === "live") {
    legend.append(
      el("span", { class: "legendItem" }, [el("span", { class: "legendSwatch swatchNws" }), "NWS"]),
      el("span", { class: "legendItem" }, [el("span", { class: "legendSwatch swatchOm" }), "Open-Meteo"]),
      el("span", { class: "legendItem" }, [el("span", { class: "legendSwatch swatchMet" }), "MET.no"])
    );
  } else {
    legend.append(
      el("span", { class: "legendItem" }, [el("span", { class: "legendSwatch swatchBackfill" }), "Open-Meteo backfill"])
    );
  }

  const wrapper = el("div", { class: "chartBox" }, [legend]);
  wrapper.append(svg);
  container.replaceChildren(wrapper);
}

function renderConditionsSummary(container, data) {
  if (!data?.today) {
    container.textContent = "Conditions summary not ready yet.";
    return;
  }

  const today = data.today;
  const next7 = data.next7Summary || {};

  const grid = el("div", { class: "statGrid" }, [
    el("div", { class: "statCard" }, [
      el("div", { class: "statLabel" }, ["Today"]),
      el("div", { class: "statValue" }, [today.consensus?.summary || "—"]),
      el("div", { class: "statSub" }, [
        `Avg precip chance: ${today.consensus?.avgPrecipProbability == null ? "—" : `${today.consensus.avgPrecipProbability.toFixed(0)}%`}`
      ])
    ]),
    el("div", { class: "statCard" }, [
      el("div", { class: "statLabel" }, ["Rain signal"]),
      el("div", { class: "statValue" }, [String(next7.rainDays ?? 0)]),
      el("div", { class: "statSub" }, ["days in next 7 with moderate/strong rain signal"])
    ]),
    el("div", { class: "statCard" }, [
      el("div", { class: "statLabel" }, ["Snow signal"]),
      el("div", { class: "statValue" }, [String(next7.snowDays ?? 0)]),
      el("div", { class: "statSub" }, ["days in next 7 with moderate/strong snow signal"])
    ]),
    el("div", { class: "statCard" }, [
      el("div", { class: "statLabel" }, ["Thunder signal"]),
      el("div", { class: "statValue" }, [String(next7.thunderDays ?? 0)]),
      el("div", { class: "statSub" }, ["days in next 7 with moderate/strong thunder signal"])
    ])
  ]);

  container.replaceChildren(grid);
}

function formatDayLabel(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  const weekday = d.toLocaleDateString(undefined, { weekday: "short" });
  const monthDay = d.toLocaleDateString(undefined, { month: "numeric", day: "numeric" });
  return { weekday, monthDay };
}

function renderConditionsTable(container, data) {
  const outer = el("div", { class: "tableScroll" });
  const table = el("table", { class: "conditionsTable" });

  table.append(
    el("thead", {}, [
      el("tr", {}, [
        el("th", {}, ["Day"]),
        el("th", {}, ["Consensus"]),
        el("th", {}, ["Rain"]),
        el("th", {}, ["Snow"]),
        el("th", {}, ["Thunder"]),
        el("th", {}, ["Sources"])
      ])
    ])
  );

  const tbody = el("tbody");

  for (const day of data.days || []) {
    const c = day.consensus || {};
    const s = day.sources || {};
    const { weekday, monthDay } = formatDayLabel(day.date);

    const dateCell = el("div", { class: "dayCell" }, [
      el("div", { class: "dayWeek" }, [weekday]),
      el("div", { class: "dayDate" }, [monthDay])
    ]);

    const consensusCell = el("div", { class: "consensusCell" }, [
      el("div", { class: "consensusMain" }, [c.summary || "—"]),
      el("div", { class: "smallMuted" }, [
        c.avgPrecipProbability == null ? "Avg precip: —" : `Avg precip: ${c.avgPrecipProbability.toFixed(0)}%`
      ])
    ]);

    const sourceCell = el("div", { class: "conditionSources" }, [
      el("div", { class: "sourceLine" }, [
        el("span", { class: "sourceName" }, ["NWS"]),
        document.createTextNode(` ${s.nws?.summary || "—"}${s.nws?.precipProbability != null ? ` (${s.nws.precipProbability}%)` : ""}`)
      ]),
      el("div", { class: "sourceLine smallMuted" }, [
        el("span", { class: "sourceName" }, ["Open-Meteo"]),
        document.createTextNode(` ${s.openMeteo?.summary || "—"}${s.openMeteo?.precipProbability != null ? ` (${s.openMeteo.precipProbability}%)` : ""}`)
      ]),
      el("div", { class: "sourceLine smallMuted" }, [
        el("span", { class: "sourceName" }, ["MET.no"]),
        document.createTextNode(` ${s.metNo?.summary || "—"}${s.metNo?.precipProbability != null ? ` (${s.metNo.precipProbability}%)` : ""}`)
      ])
    ]);

    tbody.append(
      el("tr", {}, [
        el("td", {}, [dateCell]),
        el("td", {}, [consensusCell]),
        el("td", {}, [el("span", { class: pillClassForSignal(c.rainSignal) }, [pillLabelForSignal(c.rainSignal)])]),
        el("td", {}, [el("span", { class: pillClassForSignal(c.snowSignal) }, [pillLabelForSignal(c.snowSignal)])]),
        el("td", {}, [el("span", { class: pillClassForSignal(c.thunderSignal) }, [pillLabelForSignal(c.thunderSignal)])]),
        el("td", {}, [sourceCell])
      ])
    );
  }

  table.append(tbody);
  outer.append(table);
  container.replaceChildren(outer);
}

  const tbody = el("tbody");
  for (const day of data.days || []) {
    const c = day.consensus || {};
    const s = day.sources || {};

    const sourceCell = el("div", { class: "conditionCell" }, [
      el("div", {}, [`NWS: ${s.nws?.summary || "—"}${s.nws?.precipProbability != null ? ` (${s.nws.precipProbability}%)` : ""}`]),
      el("div", { class: "smallMuted" }, [`Open-Meteo: ${s.openMeteo?.summary || "—"}${s.openMeteo?.precipProbability != null ? ` (${s.openMeteo.precipProbability}%)` : ""}`]),
      el("div", { class: "smallMuted" }, [`MET.no: ${s.metNo?.summary || "—"}${s.metNo?.precipProbability != null ? ` (${s.metNo.precipProbability}%)` : ""}`])
    ]);

    tbody.append(
      el("tr", {}, [
        el("td", {}, [day.date]),
        el("td", {}, [
          el("div", {}, [c.summary || "—"]),
          el("div", { class: "smallMuted" }, [
            c.avgPrecipProbability == null ? "Avg precip: —" : `Avg precip: ${c.avgPrecipProbability.toFixed(0)}%`
          ])
        ]),
        el("td", {}, [el("span", { class: pillClassForSignal(c.rainSignal) }, [pillLabelForSignal(c.rainSignal)])]),
        el("td", {}, [el("span", { class: pillClassForSignal(c.snowSignal) }, [pillLabelForSignal(c.snowSignal)])]),
        el("td", {}, [el("span", { class: pillClassForSignal(c.thunderSignal) }, [pillLabelForSignal(c.thunderSignal)])]),
        el("td", {}, [sourceCell])
      ])
    );
  }

  table.append(tbody);
  container.replaceChildren(table);
}

async function loadLive(meta) {
  const lb = await fetchJson("./data/leaderboard.json");
  document.getElementById("meta").textContent = `Location: ${meta.location.name} • Window: ${lb.windowDays} days`;
  renderLeaderboard(document.getElementById("leaderboard"), lb);

  const today = new Date();
  let latest = null;
  for (let i = 0; i < 40; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    try {
      latest = await fetchJson(`./data/scores/${iso}.json`);
      break;
    } catch {}
  }
  if (latest) renderLatest(document.getElementById("latest"), latest);
  else document.getElementById("latest").textContent = "No scored days yet (wait for the action to run).";

  document.getElementById("viewNote").textContent =
    "Live leaderboard uses daily snapshots from all three sources, scored against recent NWS station observations.";

  try {
    const monthly = await fetchJson("./data/monthly_winner_live.json");
    renderMonthlyWinner(document.getElementById("monthlyWinner"), monthly);
  } catch {
    document.getElementById("monthlyWinner").textContent = "Monthly standings not ready yet.";
  }

  try {
    const chart = await fetchJson("./data/chart_live.json");
    renderLineChart(document.getElementById("chartWrap"), chart, "live");
  } catch {
    document.getElementById("chartWrap").textContent = "Chart not ready yet.";
  }
}

async function loadBackfill(meta) {
  try {
    const lb = await fetchJson("./data/leaderboard_openmeteo_year.json");
    const latest = await fetchJson("./data/latest_openmeteo_year.json");

    document.getElementById("meta").textContent = `Location: ${meta.location.name} • Window: ${lb.windowDays} days`;
    renderLeaderboard(document.getElementById("leaderboard"), lb);

    const converted = {
      targetDate: latest.targetDate,
      observedFromStation: "Open-Meteo historical weather (reanalysis)",
      observationCount: null,
      observed: {
        highF: latest.actual?.highF ?? null,
        lowF: latest.actual?.lowF ?? null
      },
      scores: [
        {
          provider: "openMeteo",
          predicted: latest.forecast,
          errors: {
            highAbsF: latest.errors?.highAbsF ?? null,
            lowAbsF: latest.errors?.lowAbsF ?? null,
            overallAbsF: latest.errors?.overallAbsF ?? null
          }
        }
      ]
    };

    renderLatest(document.getElementById("latest"), converted);

    document.getElementById("viewNote").textContent =
      "Backfill is Open-Meteo only: archived forecasts vs historical weather (reanalysis) for the past year.";

    document.getElementById("monthlyWinner").innerHTML = "";
    document.getElementById("monthlyWinner").append(
      el("div", { class: "statGrid" }, [
        el("div", { class: "statCard" }, [
          el("div", { class: "statLabel" }, ["Mode"]),
          el("div", { class: "statValue" }, ["Backfill"]),
          el("div", { class: "statSub" }, ["Monthly winner card only applies to live scoring."])
        ])
      ])
    );

    try {
      const chart = await fetchJson("./data/chart_backfill_openmeteo_year.json");
      renderLineChart(document.getElementById("chartWrap"), chart, "backfill");
    } catch {
      document.getElementById("chartWrap").textContent = "Backfill chart not ready yet.";
    }
  } catch {
    document.getElementById("viewNote").textContent =
      "Backfill data not generated yet. Run the 'Backfill Open-Meteo (1 year)' GitHub Action once.";
    document.getElementById("leaderboard").textContent = "—";
    document.getElementById("latest").textContent = "—";
    document.getElementById("chartWrap").textContent = "—";
    document.getElementById("monthlyWinner").textContent = "—";
  }
}

async function main() {
  const meta = await fetchJson("./data/meta.json");

  const btnLive = document.getElementById("btnLive");
  const btnBackfill = document.getElementById("btnBackfill");

  async function setMode(mode) {
    if (mode === "backfill") {
      btnBackfill.classList.add("active");
      btnLive.classList.remove("active");
      await loadBackfill(meta);
      localStorage.setItem("accuracyView", "backfill");
    } else {
      btnLive.classList.add("active");
      btnBackfill.classList.remove("active");
      await loadLive(meta);
      localStorage.setItem("accuracyView", "live");
    }
  }

  btnLive.addEventListener("click", () => setMode("live").catch(console.error));
  btnBackfill.addEventListener("click", () => setMode("backfill").catch(console.error));

  const pref = localStorage.getItem("accuracyView") || "live";
  await setMode(pref);

  try {
    const disagreement = await fetchJson("./data/disagreement_daily.json");
    renderDisagreement(document.getElementById("disagreement"), disagreement);
  } catch {
    document.getElementById("disagreement").textContent = "Disagreement data not ready yet.";
  }

  try {
    const condSummary = await fetchJson("./data/conditions_summary.json");
    renderConditionsSummary(document.getElementById("conditionsSummary"), condSummary);
  } catch {
    document.getElementById("conditionsSummary").textContent = "Conditions summary not ready yet.";
  }

  try {
    const conditions = await fetchJson("./data/conditions_daily.json");
    renderConditionsTable(document.getElementById("conditionsTable"), conditions);
  } catch {
    document.getElementById("conditionsTable").textContent = "Conditions table not ready yet.";
  }

  try {
    const blendDaily = await fetchJson("./data/blend_daily.json");
    renderBlendDaily(document.getElementById("blendDaily"), blendDaily);

    const blendHourly = await fetchJson("./data/blend_hourly.json");
    renderBlendHourly(document.getElementById("blendHourly"), blendHourly);
  } catch {
    document.getElementById("blendDaily").textContent = "Blend not generated yet (wait for action).";
    document.getElementById("blendHourly").textContent = "Blend not generated yet (wait for action).";
  }

  document.getElementById("updated").textContent = `Last updated: ${meta.updatedAt}`;
}

main().catch(err => {
  console.error(err);
  document.body.append(el("pre", {}, [String(err)]));
});