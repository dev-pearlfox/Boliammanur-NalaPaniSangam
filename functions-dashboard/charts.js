// Chart.js helpers shared by Overview and Explore. If the Chart.js CDN is blocked the charts are skipped and the
// rest of the dashboard (tiles, tables, lists) still works.

const charts = {};

function drawChart(key, canvasId, config) {
  if (charts[key]) {
    charts[key].destroy();
    delete charts[key];
  }
  if (typeof Chart === "undefined") return;
  charts[key] = new Chart($(canvasId), config);
}

function baseOptions() {
  const grid = cssVar("--grid");
  const muted = cssVar("--muted");
  return {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: { grid: { color: grid }, ticks: { color: muted }, stacked: false },
      y: { grid: { color: grid }, ticks: { color: muted }, beginAtZero: true, stacked: false },
    },
    plugins: { legend: { labels: { color: muted } } },
  };
}

// Same options, stacked.
function stackedOptions() {
  const opts = baseOptions();
  opts.scales.x.stacked = true;
  opts.scales.y.stacked = true;
  return opts;
}

// Same options as a horizontal bar chart with no legend (one series).
function horizontalOptions() {
  return { ...baseOptions(), indexAxis: "y", plugins: { legend: { display: false } } };
}
