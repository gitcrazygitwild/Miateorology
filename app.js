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

async function loadLive(meta) {
  const lb = await fetchJson("./data/leaderboard.json");
  document.getElementById("meta").textContent = `Location: ${meta.location.name} • Window: ${lb.windowDays} days`;
  renderLeaderboard(document.getElementById("leaderboard"), lb);

  // Find newest recent live score file (probe last ~40 days)
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
}

async function loadBackfill(meta) {
  const lb = await fetchJson("./data/leaderboard_openmeteo_year.json");
  const latest = await fetchJson("./data/latest_openmeteo_year.json");

  document.getElementById("meta").textContent = `Location: ${meta.location.name} • Window: ${lb.windowDays} days`;
  renderLeaderboard(document.getElementById("leaderboard"), lb);

  const converted = {
    targetDate: latest.targetDate,
    observedFromStation: "Open-Meteo historical weather (reanalysis)",
    observationCount: null,
    observed: { highF: latest.actual?.highF ?? null, lowF: latest.actual?.lowF ?? null },
    snapshotUsed: "Open-Meteo historical forecast (archive)",
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

  // Blended forecasts (always show if present)
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
