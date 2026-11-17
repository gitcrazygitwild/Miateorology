import { chartDataset, PROVIDERS } from "./insights-model.js";
import { node } from "./desk-ui.js";
const colors = { nws: "#8ccff0", openMeteo: "#a7d8ad", metNo: "#d7b1ed", dwdIcon: "#efbd85" };
const svgNode = (tag, attrs) => {
  const n = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attrs)) n.setAttribute(key, value);
  return n;
};

export function initAccuracyChart(container) {
  let source,
    range = "30";
  function render() {
    const data = chartDataset(source, range);
    document
      .querySelectorAll("[data-chart-days]")
      .forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.chartDays === range),
        ),
      );
    if (!data.dates.length) {
      container.textContent = "No scored readings in this range yet.";
      return;
    }
    const width = 900,
      height = 240,
      left = 42,
      right = 882,
      top = 15,
      bottom = 205;
    const x = (stamp) =>
      data.end === data.start
        ? (left + right) / 2
        : left +
          ((stamp - data.start) / (data.end - data.start)) * (right - left);
    const ceiling = Math.ceil(data.max / 5) * 5,
      y = (value) => bottom - (value / ceiling) * (bottom - top);
    const svg = svgNode("svg", {
      viewBox: `0 0 ${width} ${height}`,
      class: "chartSvg",
      role: "img",
      "aria-label":
        "Mean high and low temperature error by date, in degrees Fahrenheit. Lower is better. Use the date slider for exact readings.",
    });
    for (let i = 0; i <= 4; i++) {
      const value = (ceiling * i) / 4;
      svg.append(
        svgNode("line", {
          x1: left,
          x2: right,
          y1: y(value),
          y2: y(value),
          stroke: "#ffffff12",
        }),
      );
      const label = svgNode("text", {
        x: 2,
        y: y(value) + 4,
        fill: "#9cacbd",
        "font-size": 12,
      });
      label.textContent = `${value.toFixed(value % 1 ? 1 : 0)}°`;
      svg.append(label);
    }
    const legend = node("div", "chartLegend");
    for (const [name, values] of Object.entries(data.series)) {
      if (!values.length) continue;
      const item = node("span", "legendItem", PROVIDERS[name]);
      item.style.setProperty("--provider", colors[name]);
      legend.append(item);
      let previous;
      const path = values
        .map((p) => {
          const stamp = Date.parse(p.date),
            command =
              previous !== undefined && stamp - previous === 86400000
                ? "L"
                : "M";
          previous = stamp;
          return `${command}${x(stamp)},${y(p.value)}`;
        })
        .join(" ");
      svg.append(
        svgNode("path", {
          d: path,
          fill: "none",
          stroke: colors[name],
          "stroke-width": 2.5,
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
        }),
      );
      for (const point of values)
        svg.append(
          svgNode("circle", {
            cx: x(Date.parse(point.date)),
            cy: y(point.value),
            r: values.length > 100 ? 1.5 : 2.7,
            fill: colors[name],
          }),
        );
    }
    for (const [date, anchor, place] of [
      [data.dates[0], "start", left],
      [data.dates.at(-1), "end", right],
    ]) {
      const label = svgNode("text", {
        x: place,
        y: 233,
        fill: "#9cacbd",
        "font-size": 12,
        "text-anchor": anchor,
      });
      label.textContent = date;
      svg.append(label);
    }
    const cursor = svgNode("line", {
      y1: top,
      y2: bottom,
      stroke: "#f4ead5",
      "stroke-dasharray": "3 4",
      "stroke-width": 1,
    });
    svg.append(cursor);
    const readout = node("div", "chart-readout");
    readout.setAttribute("role", "status");
    const label = node("label", "chart-slider-label", "Explore a scored date");
    label.htmlFor = "chartDate";
    const slider = node("input", "chart-slider");
    slider.type = "range";
    slider.id = "chartDate";
    slider.min = 0;
    slider.max = data.dates.length - 1;
    slider.value = data.dates.length - 1;
    function inspect(index) {
      const date = data.dates[index];
      slider.value = index;
      slider.setAttribute("aria-valuetext", date);
      cursor.setAttribute("x1", x(Date.parse(date)));
      cursor.setAttribute("x2", x(Date.parse(date)));
      readout.replaceChildren(node("strong", "", date));
      for (const [name, values] of Object.entries(data.series)) {
        if (!values.length) continue;
        const value = values.find((p) => p.date === date)?.value;
        const item = node(
          "span",
          "",
          `${PROVIDERS[name]} ${Number.isFinite(value) ? value.toFixed(1) + "°" : "—"}`,
        );
        item.style.color = colors[name];
        readout.append(item);
      }
    }
    slider.addEventListener("input", () => inspect(Number(slider.value)));
    svg.addEventListener("pointermove", (event) => {
      const box = svg.getBoundingClientRect(),
        relative = ((event.clientX - box.left) / box.width) * width;
      const stamp =
        data.start +
        Math.max(0, Math.min(1, (relative - left) / (right - left))) *
          (data.end - data.start);
      const nearest = data.dates.reduce(
        (best, date, i) =>
          Math.abs(Date.parse(date) - stamp) <
          Math.abs(Date.parse(data.dates[best]) - stamp)
            ? i
            : best,
        0,
      );
      inspect(nearest);
    });
    inspect(data.dates.length - 1);
    container.replaceChildren(
      legend,
      svg,
      readout,
      label,
      slider,
      node(
        "p",
        "smallMuted",
        "Dates use a shared scale. Gaps mean no scored observation; a dash means no reading from that source. Ranges end at the latest scored date.",
      ),
    );
  }
  document.querySelectorAll("[data-chart-days]").forEach((button) =>
    button.addEventListener("click", () => {
      range = button.dataset.chartDays;
      render();
    }),
  );
  return (data) => {
    source = data;
    render();
  };
}
