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
  if (conf === "high") return "High confidence";
  if (conf === "medium") return "Mixed confidence";
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

function windLabel(signal) {
  if (signal === "strong") return "Wind: Strong";
  if (signal === "medium") return "Wind: Moderate";
  if (signal === "weak") return "Wind: Breezy";
  return "Wind: Light";
}

function pickWeatherIcon(day) {
  const c = day.consensus || {};
  const summary = String(c.summary || "").toLowerCase();

  if (c.thunderSignal === "strong" || c.thunderSignal === "medium" || summary.includes("thunder")) return "⛈️";
  if (c.snowSignal === "strong" || c.snowSignal === "medium" || summary.includes("snow")) return "🌨️";
  if (c.rainSignal === "strong" || c.rainSignal === "medium" || summary.includes("rain")) return "🌧️";
  if (summary.includes("cloud")) return "☁️";
  if (summary.includes("overcast")) return "☁️";
  if (summary.includes("partly")) return "⛅";
  if (summary.includes("clear")) return "☀️";
  if (summary.includes("quiet")) return "☀️";
  return "🌤️";
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

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function renderTitleTodayBadge(container, mergedDays) {
  const today = mergedDays?.[0];
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
      `${hi ?? "—"}°/${lo ?? "—"}°`
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
  if (!data?.today) {
    container.textContent = "Rainbow watch not ready yet.";
    return;
  }

  const today = data.today;
  const best = data.bestNext7;

  const grid = el("div", { class: "statGrid" }, [
    el("div", { class: "statCard rainbowCard" }, [
      el("div", { class: "statLabel" }, ["Today"]),
      el("div", { class: "statValue" }, [`${today.score ?? "—"}%`]),
      el("div", { class: "statSub" }, [`${today.band} rainbow potential`]),
      el("div", { class: "smallMuted" }, [today.summary || ""])
    ]),
    el("div", { class: "statCard rainbowCard" }, [
      el("div", { class: "statLabel" }, ["Best next 7 days"]),
      el("div", { class: "statValue" }, [
        best?.date ? `${formatRichmondDay(best.date).weekday} ${formatRichmondDay(best.date).monthDay}` : "—"
      ]),
      el("div", { class: "statSub" }, [
        best?.score != null ? `${best.score}% • ${best.band}` : "—"
      ])
    ])
  ]);

  container.replaceChildren(grid);
}

function renderConfidenceSnapshot(container, data) {
  const locked = data?.mostLockedInDay;
  const uncertain = data?.mostUncertainDay;

  const card = el("div", { class: "statGrid" }, [
    el("div", { class: "statCard" }, [
      el("div", { class: "statLabel" }, ["Most locked-in day"]),
      el("div", { class: "statValue" }, [
        locked?.date ? `${formatRichmondDay(locked.date).weekday} ${formatRichmondDay(locked.date).monthDay}` : "—"
      ]),
      el("div", { class: "statSub" }, [
        locked?.overallSpreadF != null
          ? `Temp spread ${locked.overallSpreadF.toFixed(1)}°`
          : "—"
      ])
    ]),
    el("div", { class: "statCard" }, [
      el("div", { class: "statLabel" }, ["Most uncertain day"]),
      el("div", { class: "statValue" }, [
        uncertain?.date ? `${formatRichmondDay(uncertain.date).weekday} ${formatRichmondDay(uncertain.date).monthDay}` : "—"
      ]),
      el("div", { class: "statSub" }, [
        uncertain?.overallSpreadF != null
          ? `Temp spread ${uncertain.overallSpreadF.toFixed(1)}°`
          : "—"
      ])
    ])
  ]);

  container.replaceChildren(card);
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
        el("td", {}, [row.provider]),
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
      `Observed high/low: ${observed.highF ?? "—"}° / ${observed.lowF ?? "—"}° • Max wind: ${observed.maxWindMph ?? "—"} mph • Precip: ${observed.precipOccurred ? "Yes" : "No"}`
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
        el("td", {}, [s.provider]),
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
          `${d.sources.nws?.highF ?? "—"}° / ${d.sources.nws?.lowF ?? "—"}° • ${d.sources.nws?.precipProbability ?? "—"}% • ${d.sources.nws?.windMph ?? "—"} mph`
        ]),
        el("td", {}, [
          `${d.sources.openMeteo?.highF ?? "—"}° / ${d.sources.openMeteo?.lowF ?? "—"}° • ${d.sources.openMeteo?.precipProbability ?? "—"}% • ${d.sources.openMeteo?.windMph ?? "—"} mph`
        ]),
        el("td", {}, [
          `${d.sources.metNo?.highF ?? "—"}° / ${d.sources.metNo?.lowF ?? "—"}° • ${d.sources.metNo?.precipProbability ?? "—"}% • ${d.sources.metNo?.windMph ?? "—"} mph`
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
          h.sources.nws
            ? `${h.sources.nws.tempF ?? "—"}° • ${h.sources.nws.precipProbability ?? "—"}% • ${h.sources.nws.windMph ?? "—"} mph`
            : "—"
        ]),
        el("td", {}, [
          h.sources.openMeteo
            ? `${h.sources.openMeteo.tempF ?? "—"}° • ${h.sources.openMeteo.precipProbability ?? "—"}% • ${h.sources.openMeteo.windMph ?? "—"} mph`
            : "—"
        ]),
        el("td", {}, [
          h.sources.metNo
            ? `${h.sources.metNo.tempF ?? "—"}° • ${h.sources.metNo.precipProbability ?? "—"}% • ${h.sources.metNo.windMph ?? "—"} mph`
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
      el("div", { class: "statValue" }, [leader.provider]),
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
        `Avg precip: ${today.consensus?.avgPrecipProbability == null ? "—" : `${today.consensus.avgPrecipProbability.toFixed(0)}%`} • Avg wind: ${today.consensus?.avgWindMph == null ? "—" : `${today.consensus.avgWindMph.toFixed(0)} mph`}`
      ])
    ]),
    el("div", { class: "statCard" }, [
      el("div", { class: "statLabel" }, ["Rain signal"]),
      el("div", { class: "statValue" }, [String(next7.rainDays ?? 0)]),
      el("div", { class: "statSub" }, ["days in next 7 with moderate/strong rain signal"])
    ]),
    el("div", { class: "statCard" }, [
      el("div", { class: "statLabel" }, ["Windy days"]),
      el("div", { class: "statValue" }, [String(next7.windyDays ?? 0)]),
      el("div", { class: "statSub" }, ["days in next 7 with moderate/strong wind signal"])
    ]),
    el("div", { class: "statCard" }, [
      el("div", { class: "statLabel" }, ["Thunder signal"]),
      el("div", { class: "statValue" }, [String(next7.thunderDays ?? 0)]),
      el("div", { class: "statSub" }, ["days in next 7 with moderate/strong thunder signal"])
    ])
  ]);

  container.replaceChildren(grid);
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
        el("th", {}, ["Wind"]),
        el("th", {}, ["Sources"])
      ])
    ])
  );

  const tbody = el("tbody");

  for (const day of data.days || []) {
    const c = day.consensus || {};
    const s = day.sources || {};
    const label = formatRichmondDay(day.date);

    const dateCell = el("div", { class: "dayCell" }, [
      el("div", { class: "dayWeek" }, [label.weekday]),
      el("div", { class: "dayDate" }, [label.monthDay])
    ]);

    const consensusCell = el("div", { class: "consensusCell" }, [
      el("div", { class: "consensusMain" }, [c.summary || "—"]),
      el("div", { class: "smallMuted" }, [
        `Avg precip: ${c.avgPrecipProbability == null ? "—" : `${c.avgPrecipProbability.toFixed(0)}%`} • Avg wind: ${c.avgWindMph == null ? "—" : `${c.avgWindMph.toFixed(0)} mph`}`
      ]),
      el("div", { class: "smallMuted" }, [day.writeup || ""])
    ]);

    const sourceCell = el("div", { class: "conditionSources" }, [
      el("div", { class: "sourceLine" }, [
        el("span", { class: "sourceName" }, ["NWS"]),
        document.createTextNode(`: ${s.nws?.summary || "—"}${s.nws?.precipProbability != null ? ` (${s.nws.precipProbability}%)` : ""}${s.nws?.windMph != null ? ` • ${s.nws.windMph} mph` : ""}`)
      ]),
      el("div", { class: "sourceLine smallMuted" }, [
        el("span", { class: "sourceName" }, ["Open-Meteo"]),
        document.createTextNode(`: ${s.openMeteo?.summary || "—"}${s.openMeteo?.precipProbability != null ? ` (${s.openMeteo.precipProbability}%)` : ""}${s.openMeteo?.windMph != null ? ` • ${s.openMeteo.windMph} mph` : ""}`)
      ]),
      el("div", { class: "sourceLine smallMuted" }, [
        el("span", { class: "sourceName" }, ["MET.no"]),
        document.createTextNode(`: ${s.metNo?.summary || "—"}${s.metNo?.precipProbability != null ? ` (${s.metNo.precipProbability}%)` : ""}${s.metNo?.windMph != null ? ` • ${s.metNo.windMph} mph` : ""}`)
      ])
    ]);

    tbody.append(
      el("tr", {}, [
        el("td", {}, [dateCell]),
        el("td", {}, [consensusCell]),
        el("td", {}, [el("span", { class: pillClassForSignal(c.rainSignal) }, [pillLabelForSignal(c.rainSignal)])]),
        el("td", {}, [el("span", { class: pillClassForSignal(c.snowSignal) }, [pillLabelForSignal(c.snowSignal)])]),
        el("td", {}, [el("span", { class: pillClassForSignal(c.thunderSignal) }, [pillLabelForSignal(c.thunderSignal)])]),
        el("td", {}, [el("span", { class: pillClassForSignal(c.windSignal) }, [windLabel(c.windSignal)])]),
        el("td", {}, [sourceCell])
      ])
    );
  }

  table.append(tbody);
  outer.append(table);
  container.replaceChildren(outer);
}

function renderOutlookHighlight(container, mergedDays) {
  const ranked = [...mergedDays]
    .filter(x => typeof x?.disagreement?.overallSpreadF === "number")
    .sort((a, b) => (b.disagreement.overallSpreadF ?? -1) - (a.disagreement.overallSpreadF ?? -1));

  const top = ranked[0];
  if (!top) {
    container.textContent = "";
    return;
  }

  const label = formatRichmondDay(top.date);
  const text = `${label.weekday} ${label.monthDay}`;
  const precipSpread = top.disagreement?.precipSpread;
  const windSpread = top.disagreement?.windSpreadMph;

  const card = el("div", { class: "highlightCard" }, [
    el("div", { class: "highlightTitle" }, ["Most uncertain upcoming day"]),
    el("div", { class: "highlightMain" }, [text]),
    el("div", { class: "highlightSub" }, [
      `Temp spread: ${top.disagreement?.overallSpreadF == null ? "—" : `${top.disagreement.overallSpreadF.toFixed(1)}°`} • Precip spread: ${precipSpread == null ? "—" : `${precipSpread.toFixed(0)} pts`} • Wind spread: ${windSpread == null ? "—" : `${windSpread.toFixed(0)} mph`} • ${pillLabelForConfidence(top.disagreement?.confidence)}`
    ])
  ]);

  container.replaceChildren(card);
}

function renderTodayHero(container, mergedDays) {
  const today = mergedDays?.[0];
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
      el("div", { class: "todayHeroSub" }, [consensus.summary || "—"]),
      el("div", { class: "todayHeroTemps" }, [
        `${blend.blendedHighF ?? "—"}° / ${blend.blendedLowF ?? "—"}°`
      ]),
      el("div", { class: "todayHeroMiniRow" }, [
        el("span", { class: "todayMiniPill" }, [
          consensus.avgPrecipProbability == null
            ? "Avg precip: —"
            : `Avg precip: ${consensus.avgPrecipProbability.toFixed(0)}%`
        ]),
        el("span", { class: "todayMiniPill" }, [
          consensus.avgWindMph == null
            ? "Avg wind: —"
            : `Avg wind: ${consensus.avgWindMph.toFixed(0)} mph`
        ]),
        el("span", { class: pillClassForSignal(consensus.rainSignal) }, [`Rain: ${pillLabelForSignal(consensus.rainSignal)}`]),
        el("span", { class: pillClassForSignal(consensus.thunderSignal) }, [`Thunder: ${pillLabelForSignal(consensus.thunderSignal)}`]),
        el("span", { class: pillClassForConfidence(disagreement.confidence) }, [pillLabelForConfidence(disagreement.confidence)])
      ])
    ]),
    el("div", { class: "todayHeroIcon", "aria-hidden": "true" }, [icon])
  ]);

  container.replaceChildren(wrap);
}

function renderOutlookCardExpanded(row) {
  const conditions = row.conditions || {};
  const disagreement = row.disagreement || {};
  const sources = conditions.sources || {};

  return el("div", { class: "outlookExpanded" }, [
    el("div", { class: "outlookSourceRow" }, [
      el("span", { class: "outlookSourceName" }, ["NWS"]),
      document.createTextNode(`: ${sources.nws?.summary || "—"}${sources.nws?.precipProbability != null ? ` (${sources.nws.precipProbability}%)` : ""}${sources.nws?.windMph != null ? ` • ${sources.nws.windMph} mph` : ""}`)
    ]),
    el("div", { class: "outlookSourceRow" }, [
      el("span", { class: "outlookSourceName" }, ["Open-Meteo"]),
      document.createTextNode(`: ${sources.openMeteo?.summary || "—"}${sources.openMeteo?.precipProbability != null ? ` (${sources.openMeteo.precipProbability}%)` : ""}${sources.openMeteo?.windMph != null ? ` • ${sources.openMeteo.windMph} mph` : ""}`)
    ]),
    el("div", { class: "outlookSourceRow" }, [
      el("span", { class: "outlookSourceName" }, ["MET.no"]),
      document.createTextNode(`: ${sources.metNo?.summary || "—"}${sources.metNo?.precipProbability != null ? ` (${sources.metNo.precipProbability}%)` : ""}${sources.metNo?.windMph != null ? ` • ${sources.metNo.windMph} mph` : ""}`)
    ]),
    el("div", { class: "outlookExpandHint" }, [
      `Temp spread: ${disagreement.overallSpreadF == null ? "—" : `${disagreement.overallSpreadF.toFixed(1)}°`} • Precip spread: ${disagreement.precipSpread == null ? "—" : `${disagreement.precipSpread.toFixed(0)} pts`} • Wind spread: ${disagreement.windSpreadMph == null ? "—" : `${disagreement.windSpreadMph.toFixed(0)} mph`}`
    ])
  ]);
}

function renderDailyOutlook(container, mergedDays) {
  const grid = el("div", { class: "dailyOutlookGrid" });

  for (const row of mergedDays) {
    const blend = row.blend || {};
    const conditions = row.conditions || {};
    const disagreement = row.disagreement || {};
    const consensus = conditions.consensus || {};
    const label = formatRichmondDay(row.date);
    const icon = pickWeatherIcon(conditions);

    const details = el("details", { class: "outlookDetails" }, [
      el("summary", { class: "outlookSummaryButton" }, [
        el("div", { class: "outlookCard" }, [
          el("div", { class: "outlookTop" }, [
            el("div", { class: "outlookDayWrap" }, [
              el("div", { class: "outlookWeekday" }, [label.weekday]),
              el("div", { class: "outlookDate" }, [label.monthDay])
            ]),
            el("div", { class: "outlookIcon", "aria-hidden": "true" }, [icon])
          ]),

          el("div", { class: "outlookTemp" }, [
            `${blend.blendedHighF ?? "—"}° / ${blend.blendedLowF ?? "—"}°`
          ]),

          el("div", { class: "outlookTempSub" }, [
            `Blended high / low • ${blend.blendedWindMph == null ? "—" : `${blend.blendedWindMph.toFixed(0)} mph`} wind`
          ]),

          el("div", { class: "outlookSummary" }, [consensus.summary || "—"]),

          el("div", { class: "outlookMetaRow" }, [
            el("span", { class: "smallMuted" }, [
              blend.blendedPrecipProbability == null
                ? "Avg precip: —"
                : `Avg precip: ${blend.blendedPrecipProbability.toFixed(0)}%`
            ])
          ]),

          el("div", { class: "outlookPills" }, [
            el("span", { class: pillClassForSignal(consensus.rainSignal) }, [`Rain: ${pillLabelForSignal(consensus.rainSignal)}`]),
            el("span", { class: pillClassForSignal(consensus.snowSignal) }, [`Snow: ${pillLabelForSignal(consensus.snowSignal)}`]),
            el("span", { class: pillClassForSignal(consensus.thunderSignal) }, [`Thunder: ${pillLabelForSignal(consensus.thunderSignal)}`]),
            el("span", { class: pillClassForSignal(consensus.windSignal) }, [windLabel(consensus.windSignal)]),
            el("span", { class: pillClassForConfidence(disagreement.confidence) }, [pillLabelForConfidence(disagreement.confidence)])
          ]),

          el("div", { class: "outlookSourcesMini" }, [conditions.writeup || ""]),
          el("div", { class: "outlookExpandHint" }, ["Tap for source details"])
        ])
      ]),
      renderOutlookCardExpanded(row)
    ]);

    grid.append(details);
  }

  container.replaceChildren(grid);
}

async function loadLive(meta) {
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
    renderLineChart(document.getElementById("chartWrap"), chart, "live");
  } catch {
    document.getElementById("chartWrap").textContent = "Chart not ready yet.";
  }
}

async function loadBackfill(meta) {
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

  btnLive?.addEventListener("click", () => setMode("live").catch(console.error));
  btnBackfill?.addEventListener("click", () => setMode("backfill").catch(console.error));

  const pref = localStorage.getItem("accuracyView") || "live";
  await setMode(pref);

  let disagreement = null;
  let conditions = null;
  let blendDaily = null;

  try {
    const story = await fetchJson("./data/weather_story.json");
    renderWeatherStory(document.getElementById("weatherStory"), story);
  } catch {
    document.getElementById("weatherStory").textContent = "Weather story not ready yet.";
  }

  try {
    const rainbow = await fetchJson("./data/rainbow_watch.json");
    renderRainbowWatch(document.getElementById("rainbowWatch"), rainbow);
  } catch {
    document.getElementById("rainbowWatch").textContent = "Rainbow watch not ready yet.";
  }

  try {
    const confidence = await fetchJson("./data/confidence_snapshot.json");
    renderConfidenceSnapshot(document.getElementById("confidenceSnapshot"), confidence);
  } catch {
    document.getElementById("confidenceSnapshot").textContent = "Confidence snapshot not ready yet.";
  }

  try {
    disagreement = await fetchJson("./data/disagreement_daily.json");
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
    conditions = await fetchJson("./data/conditions_daily.json");
    renderConditionsTable(document.getElementById("conditionsTable"), conditions);
  } catch {
    document.getElementById("conditionsTable").textContent = "Conditions table not ready yet.";
  }

  try {
    blendDaily = await fetchJson("./data/blend_daily.json");
    renderBlendDaily(document.getElementById("blendDaily"), blendDaily);

    const blendHourly = await fetchJson("./data/blend_hourly.json");
    renderBlendHourly(document.getElementById("blendHourly"), blendHourly);
  } catch {
    document.getElementById("blendDaily").textContent = "Blend not generated yet (wait for action).";
    document.getElementById("blendHourly").textContent = "Blend not generated yet (wait for action).";
  }

  try {
    if (blendDaily && conditions && disagreement) {
      const merged = mergeOutlookData(blendDaily, conditions, disagreement);
      renderTitleTodayBadge(document.getElementById("titleTodayBadge"), merged);
      renderTodayHero(document.getElementById("todayHero"), merged);
      renderOutlookHighlight(document.getElementById("outlookHighlight"), merged);
      renderDailyOutlook(document.getElementById("dailyOutlook"), merged);
    } else {
      document.getElementById("todayHero").textContent = "Today’s forecast not ready yet.";
      document.getElementById("outlookHighlight").textContent = "";
      document.getElementById("dailyOutlook").textContent = "7-day outlook not ready yet.";
    }
  } catch {
    document.getElementById("todayHero").textContent = "Today’s forecast not ready yet.";
    document.getElementById("outlookHighlight").textContent = "";
    document.getElementById("dailyOutlook").textContent = "7-day outlook not ready yet.";
  }

  if (meta.updatedAt) {
    document.getElementById("updated").textContent =
      `Last updated: ${formatRichmondTimestamp(meta.updatedAt)} Richmond time`;
  }
}

main().catch(err => {
  console.error(err);
  document.body.append(el("pre", {}, [String(err)]));
});