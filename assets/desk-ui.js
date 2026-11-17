import {
  richmondDay,
  forecastCondition,
  weatherIcon,
} from "./weather-shared.js";
import { rainOutlook, temperatureRange, PROVIDERS } from "./insights-model.js";
export function node(tag, className = "", text = "") {
  const item = document.createElement(tag);
  item.className = className;
  item.textContent = text;
  return item;
}
export const formatNumber = (value, suffix = "") =>
  Number.isFinite(value) ? `${Math.round(value)}${suffix}` : "—";
const time = (stamp) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
  }).format(new Date(stamp));
const shortHour = (stamp) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
  }).format(new Date(stamp));

export function initDesk() {
  const tabs = [...document.querySelectorAll("[data-desk-tab]")];
  function select(name) {
    if (!tabs.some((tab) => tab.dataset.deskTab === name)) name = "forecast";
    tabs.forEach((tab) => {
      const active = tab.dataset.deskTab === name;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      document.getElementById(tab.getAttribute("aria-controls")).hidden =
        !active;
    });
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => {
      select(tab.dataset.deskTab);
      history.replaceState(null, "", `#${tab.dataset.deskTab}`);
    });
    tab.addEventListener("keydown", (event) => {
      const next =
        event.key === "ArrowRight"
          ? (index + 1) % tabs.length
          : event.key === "ArrowLeft"
            ? (index + tabs.length - 1) % tabs.length
            : event.key === "Home"
              ? 0
              : event.key === "End"
                ? tabs.length - 1
                : null;
      if (next !== null) {
        event.preventDefault();
        tabs[next].click();
        tabs[next].focus();
      }
    });
  });
  window.addEventListener("hashchange", () => select(location.hash.slice(1)));
  select(location.hash.slice(1));
  for (const [id, direction] of [
    ["earlierHours", -1],
    ["laterHours", 1],
  ])
    document.getElementById(id).addEventListener("click", () => {
      const strip = document.getElementById("hourlyStrip");
      strip.scrollBy({
        left: direction * strip.clientWidth * 0.75,
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
    });
}

export function renderRain(container, data, now = new Date()) {
  const outlook = rainOutlook(data, now);
  if (!outlook.known) {
    container.replaceChildren(
      node("p", "rain-headline", "Waiting on the next forecast"),
      node(
        "p",
        "smallMuted",
        "Hourly rain readings are unavailable. Try refreshing shortly.",
      ),
    );
    return;
  }
  const headline = outlook.next
    ? `${time(outlook.next.start)}–${shortHour(outlook.next.end)}`
    : "Low rain chances ahead";
  const heading = node("p", "rain-headline", headline);
  const description = node(
    "p",
    "rain-description",
    outlook.next
      ? `Next window at 30% or higher · peak ${formatNumber(outlook.next.peak, "%")}`
      : `Peak ${formatNumber(outlook.peak, "%")} across the available hours.`,
  );
  const strip = node("div", "rain-timeline");
  strip.setAttribute("role", "group");
  strip.setAttribute("aria-label", "Rain chance by hour");
  const reading = node("p", "rain-reading");
  reading.id = "rainReading";
  reading.setAttribute("role", "status");
  outlook.slots.forEach((slot, i) => {
    const button = node(
      "button",
      `rain-slot${slot.chance === null ? " missing" : slot.chance >= 30 ? " wet" : ""}`,
    );
    button.type = "button";
    const label = `${time(slot.time)}: ${slot.chance === null ? "no reading" : `${formatNumber(slot.chance, "%")} rain chance`}`;
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-pressed", "false");
    button.title = label;
    const bar = node("span", "rain-bar");
    bar.style.setProperty(
      "--rain-height",
      `${slot.chance === null ? 100 : Math.max(4, slot.chance)}%`,
    );
    bar.setAttribute("aria-hidden", "true");
    button.append(
      bar,
      node(
        "small",
        "",
        i % 6 === 0 ? shortHour(slot.time).replace(" ", "") : "",
      ),
    );
    button.addEventListener("click", () => {
      strip
        .querySelectorAll("button")
        .forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
      reading.textContent = label;
    });
    strip.append(button);
  });
  reading.textContent = "Tap a bar for the hourly rain chance.";
  const note = `${outlook.known}/24 hourly readings · ${outlook.known < 24 ? "Striped bars mean missing data. " : ""}Forecast chance, not rainfall intensity.`;
  container.replaceChildren(
    heading,
    description,
    strip,
    reading,
    node("p", "smallMuted", note),
  );
}

export function renderForecastDays(container, days) {
  const openDate = container.querySelector("details[open]")?.dataset.date;
  if (!days.length) {
    container.textContent =
      "The daily forecast is unavailable. Try refreshing shortly.";
    return;
  }
  const list = node("div", "forecast-days");
  for (const day of days) {
    const details = node("details", "forecast-day");
    details.dataset.date = day.date;
    details.name = "forecast-day";
    details.open = day.date === openDate;
    const summary = node("summary", "day-summary");
    const stamp = new Date(`${day.date}T12:00:00Z`),
      date = node("span", "day-date");
    date.append(
      node(
        "strong",
        "",
        day.date === richmondDay()
          ? "Today"
          : new Intl.DateTimeFormat("en-US", {
              timeZone: "America/New_York",
              weekday: "short",
            }).format(stamp),
      ),
      node(
        "small",
        "",
        new Intl.DateTimeFormat("en-US", {
          timeZone: "America/New_York",
          month: "short",
          day: "numeric",
        }).format(stamp),
      ),
    );
    const condition = forecastCondition(day.conditions || {}),
      icon = node("span", "day-icon");
    icon.innerHTML = weatherIcon(condition.kind);
    icon.setAttribute("aria-hidden", "true");
    const temps = node("span", "day-temps"),
      track = node("span", "temp-track"),
      range = temperatureRange(day, days);
    if (range) {
      const bar = node("span", "temp-range");
      bar.style.left = `${range.left}%`;
      bar.style.width = `${Math.min(range.width, 100 - range.left)}%`;
      track.append(bar);
    }
    track.setAttribute("aria-hidden", "true");
    temps.append(
      node("span", "low-temp", formatNumber(day.blend?.blendedLowF, "°")),
      track,
      node("strong", "", formatNumber(day.blend?.blendedHighF, "°")),
    );
    temps.setAttribute(
      "aria-label",
      `Low ${formatNumber(day.blend?.blendedLowF)} and high ${formatNumber(day.blend?.blendedHighF)} degrees Fahrenheit`,
    );
    const precip = node(
      "span",
      "day-rain",
      `${formatNumber(day.blend?.blendedPrecipProbability, "%")} rain`,
    );
    const expand = node("span", "day-expand", "+");
    expand.setAttribute("aria-hidden", "true");
    summary.append(
      date,
      icon,
      node("span", "day-condition", condition.label),
      temps,
      precip,
      expand,
    );
    const expanded = node("div", "day-detail");
    expanded.append(
      node("p", "day-writeup", day.conditions?.writeup || condition.label),
    );
    const sourceGrid = node("div", "day-sources");
    for (const [key, label] of Object.entries(PROVIDERS)) {
      const source = day.blend?.sources?.[key],
        description = day.conditions?.sources?.[key];
      const card = node("div", `source-reading ${key}`);
      card.append(
        node("strong", "", label),
        node(
          "p",
          "source-temperature",
          `${formatNumber(source?.highF, "°")} / ${formatNumber(source?.lowF, "°")}`,
        ),
        node("p", "", description?.summary || "Conditions unavailable"),
        node(
          "small",
          "",
          `${key === "dwdIcon" ? "Rain chance unavailable" : `${formatNumber(source?.precipProbability, "%")} rain`} · ${formatNumber(source?.windMph)} mph`,
        ),
      );
      sourceGrid.append(card);
    }
    const spread = day.disagreement?.overallSpreadF;
    expanded.append(
      sourceGrid,
      node(
        "p",
        "smallMuted",
        Number.isFinite(spread)
          ? `Temperature spread: ${spread.toFixed(1)}°F · ${day.disagreement.confidence || "Unknown"} agreement. A dash means the source has no reading.`
          : "Source agreement is unavailable. A dash means the source has no reading.",
      ),
    );
    const signals = day.conditions?.consensus || {},
      active = ["snow", "thunder"].filter((key) =>
        ["medium", "strong"].includes(signals[`${key}Signal`]),
      );
    if (active.length)
      expanded.prepend(
        node(
          "p",
          "weather-signal",
          `Forecast signals: ${active.map((key) => `${signals[`${key}Signal`]} ${key}`).join(" · ")}`,
        ),
      );
    details.append(summary, expanded);
    list.append(details);
  }
  container.replaceChildren(list);
}
