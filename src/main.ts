import "./style.css";

import { COCOA_CAPACITY_PER_WEEK_PER_STAND, COCOA_PRICE, COCOA_STAND_COST, PATCH_CAPACITY, RENT_MONTHLY, SPECIES } from "./sim/constants";
import { formatSeason, getSeason, isChristmasPeriod } from "./sim/seasons";
import { createInitialState, tickWeek } from "./sim/tick";
import { getDaysUntilRent, getNextRentDate, getWeeksSinceStart } from "./sim/time";
import { buildCocoaAt, bulldozeBaseAt, getDecorUpgradeCost, plantAt, upgradeDecorAt } from "./sim/actions";
import type { Season, Speed, Tile } from "./sim/types";

// #region agent log
window.addEventListener(
  "error",
  (e) => {
    fetch("http://127.0.0.1:7242/ingest/b9508947-ae5c-4f6f-82d7-7b0f031dd08b", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: "pre-fix",
        hypothesisId: "H1",
        location: "src/main.ts:global_error",
        message: "window.error",
        data: {
          message: (e as ErrorEvent).message,
          filename: (e as ErrorEvent).filename,
          lineno: (e as ErrorEvent).lineno,
          colno: (e as ErrorEvent).colno,
          errorName: (e as ErrorEvent).error?.name,
          errorMessage: (e as ErrorEvent).error?.message,
          stack: (e as ErrorEvent).error?.stack,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  },
  { capture: true },
);

window.addEventListener("unhandledrejection", (e) => {
  fetch("http://127.0.0.1:7242/ingest/b9508947-ae5c-4f6f-82d7-7b0f031dd08b", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: "debug-session",
      runId: "pre-fix",
      hypothesisId: "H1",
      location: "src/main.ts:unhandledrejection",
      message: "window.unhandledrejection",
      data: {
        reasonName: (e as PromiseRejectionEvent).reason?.name,
        reasonMessage: (e as PromiseRejectionEvent).reason?.message,
        reason: String((e as PromiseRejectionEvent).reason),
        stack: (e as PromiseRejectionEvent).reason?.stack,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
});
// #endregion agent log

// ============================================================================
// Constants
// ============================================================================

const TILE_SIZE = 80;
const MS_PER_WEEK_AT_1X = 5000; // 1 week per 5 seconds at 1x speed

// ============================================================================
// State
// ============================================================================

const state = createInitialState();
let hoveredTileIdx: number | null = null;

function idx(x: number, y: number, w: number): number {
  return y * w + x;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function formatYearsFromWeeks(weeks: number): string {
  const years = weeks / 52;
  return `${years.toFixed(1)}y`;
}

// ============================================================================
// Season theming (data-season attribute)
// ============================================================================

let appliedSeason: Season | null = null;
let appliedTheme: string | null = null;

function applySeasonTheme(): void {
  const season = getSeason(state.date);
  const isChristmas = isChristmasPeriod(state.date);
  const theme = isChristmas ? "christmas" : season;
  
  if (appliedSeason === season && appliedTheme === theme) return;
  appliedSeason = season;
  appliedTheme = theme;
  document.documentElement.dataset.season = theme;
  cachedCanvasTheme = null; // canvas reads CSS vars, so invalidate cache on season changes
}

// ============================================================================
// DOM Setup
// ============================================================================

const app = document.querySelector<HTMLDivElement>("#app")!;

// HUD Container (postcard header)
const hud = document.createElement("header");
hud.classList.add("hud");
app.appendChild(hud);

const hudInner = document.createElement("div");
hudInner.classList.add("hudInner");
hud.appendChild(hudInner);

const hudLeft = document.createElement("div");
hudLeft.classList.add("hudLeft");
hudInner.appendChild(hudLeft);

// Game title
const gameTitleEl = document.createElement("h1");
gameTitleEl.classList.add("hudGameTitle");
gameTitleEl.textContent = "Evergreen Tycoon";
hudLeft.appendChild(gameTitleEl);

const hudKpis = document.createElement("div");
hudKpis.classList.add("hudKpis");
hudInner.appendChild(hudKpis);

const hudControls = document.createElement("div");
hudControls.classList.add("hudControls");
hudInner.appendChild(hudControls);

// Season title + date subline
const seasonEl = document.createElement("div");
seasonEl.classList.add("hudSeasonTitle");
hudLeft.appendChild(seasonEl);

const dateEl = document.createElement("div");
dateEl.classList.add("hudSeasonSub");
hudLeft.appendChild(dateEl);

// KPI chips
function makeKpi(label: string): { root: HTMLDivElement; valueEl: HTMLDivElement } {
  const root = document.createElement("div");
  root.classList.add("kpi");
  const l = document.createElement("div");
  l.classList.add("kpiLabel");
  l.textContent = label;
  const v = document.createElement("div");
  v.classList.add("kpiValue");
  root.appendChild(l);
  root.appendChild(v);
  return { root, valueEl: v };
}

const moneyKpi = makeKpi("Money");
const moneyEl = moneyKpi.valueEl;
hudKpis.appendChild(moneyKpi.root);

const rentKpi = makeKpi("Rent");
const rentEl = rentKpi.valueEl;
hudKpis.appendChild(rentKpi.root);

const cheerKpi = makeKpi("Cheer");
const cheerEl = cheerKpi.valueEl;
hudKpis.appendChild(cheerKpi.root);

const priceKpi = makeKpi("Tree price");
const priceEl = priceKpi.valueEl;
hudKpis.appendChild(priceKpi.root);

const marketKpi = makeKpi("Last week");
const marketEl = marketKpi.valueEl;
hudKpis.appendChild(marketKpi.root);

// Status + speed pills
const hudPills = document.createElement("div");
hudPills.classList.add("hudPills");
hudControls.appendChild(hudPills);

const statusEl = document.createElement("div");
statusEl.classList.add("pill");
statusEl.classList.add("pillStatus");
hudPills.appendChild(statusEl);

const speedEl = document.createElement("div");
speedEl.classList.add("pill");
speedEl.classList.add("pillSpeed");
hudPills.appendChild(speedEl);

// Week progress (live, visual)
const hudBottom = document.createElement("div");
hudBottom.classList.add("hudBottom");
hud.appendChild(hudBottom);

const weekProgressLabelEl = document.createElement("div");
weekProgressLabelEl.classList.add("hudMeta");
weekProgressLabelEl.classList.add("hudWeekLabel");
weekProgressLabelEl.textContent = "Week progress";
hudBottom.appendChild(weekProgressLabelEl);

const weekProgressBarEl = document.createElement("div");
weekProgressBarEl.classList.add("hudWeekMeter");
weekProgressBarEl.setAttribute("role", "progressbar");
weekProgressBarEl.setAttribute("aria-valuemin", "0");
weekProgressBarEl.setAttribute("aria-valuemax", "100");
hudBottom.appendChild(weekProgressBarEl);

const weekProgressFillEl = document.createElement("div");
weekProgressFillEl.classList.add("hudWeekMeterFill");
weekProgressBarEl.appendChild(weekProgressFillEl);

// Details disclosure (tertiary info)
const detailsEl = document.createElement("details");
detailsEl.classList.add("hudDetails");
hudBottom.appendChild(detailsEl);

const detailsSummary = document.createElement("summary");
detailsSummary.textContent = "Details";
detailsEl.appendChild(detailsSummary);

const detailsBody = document.createElement("div");
detailsBody.classList.add("hudDetailsBody");
detailsEl.appendChild(detailsBody);

detailsEl.addEventListener("toggle", () => {
  hud.classList.toggle("isDetailsOpen", detailsEl.open);
});

const weekEl = document.createElement("div");
weekEl.classList.add("hudMeta");
detailsBody.appendChild(weekEl);

const marketDetailsEl = document.createElement("div");
marketDetailsEl.classList.add("hudMeta");
detailsBody.appendChild(marketDetailsEl);

const selectedEl = document.createElement("div");
selectedEl.classList.add("hudMeta");
detailsBody.appendChild(selectedEl);

// Trends (compact sparklines)
const trendsWrap = document.createElement("div");
trendsWrap.classList.add("hudTrends");
detailsBody.appendChild(trendsWrap);

const trendsTitle = document.createElement("div");
trendsTitle.classList.add("hudDetailsSectionTitle");
trendsTitle.textContent = "Trends (last 26w)";
trendsWrap.appendChild(trendsTitle);

type TrendRowEls = {
  valueEl: HTMLDivElement;
  deltaEl: HTMLDivElement;
  svg: SVGSVGElement;
  poly: SVGPolylineElement;
  dot: SVGCircleElement;
};

function makeSparklineSvg(): { svg: SVGSVGElement; poly: SVGPolylineElement; dot: SVGCircleElement } {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 120 24");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.classList.add("spark");

  const mid = document.createElementNS(ns, "line");
  mid.setAttribute("x1", "0");
  mid.setAttribute("x2", "120");
  mid.setAttribute("y1", "12");
  mid.setAttribute("y2", "12");
  mid.classList.add("sparkMid");
  svg.appendChild(mid);

  const poly = document.createElementNS(ns, "polyline");
  poly.classList.add("sparkLine");
  svg.appendChild(poly);

  const dot = document.createElementNS(ns, "circle");
  dot.setAttribute("r", "1.8");
  dot.classList.add("sparkDot");
  svg.appendChild(dot);

  return { svg, poly, dot };
}

function makeTrendRow(label: string): { root: HTMLDivElement } & TrendRowEls {
  const root = document.createElement("div");
  root.classList.add("trendRow");

  const labelEl = document.createElement("div");
  labelEl.classList.add("trendLabel");
  labelEl.textContent = label;
  root.appendChild(labelEl);

  const valueEl = document.createElement("div");
  valueEl.classList.add("trendValue");
  root.appendChild(valueEl);

  const deltaEl = document.createElement("div");
  deltaEl.classList.add("trendDelta");
  root.appendChild(deltaEl);

  const { svg, poly, dot } = makeSparklineSvg();
  root.appendChild(svg);

  return { root, valueEl, deltaEl, svg, poly, dot };
}

const repTrend = makeTrendRow("Reputation");
const vibeTrend = makeTrendRow("Holiday vibe");
const attractTrend = makeTrendRow("Farm attraction");
trendsWrap.appendChild(repTrend.root);
trendsWrap.appendChild(vibeTrend.root);
trendsWrap.appendChild(attractTrend.root);

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function formatPct01(v01: number): string {
  return `${Math.round(clamp01(v01) * 100)}%`;
}

function formatDeltaPct01(prev01: number, next01: number): { text: string; dir: "up" | "down" | "flat" } {
  const d = Math.round((clamp01(next01) - clamp01(prev01)) * 100);
  if (d > 0) return { text: `+${d}`, dir: "up" };
  if (d < 0) return { text: `${d}`, dir: "down" };
  return { text: "0", dir: "flat" };
}

function setSparkline(el: TrendRowEls, series01: number[]): void {
  const w = 120;
  const h = 24;
  const padY = 2;
  const padX = 1;
  const n = series01.length;
  if (n <= 0) {
    el.poly.setAttribute("points", "");
    el.dot.setAttribute("cx", "0");
    el.dot.setAttribute("cy", "12");
    return;
  }

  const usableW = w - padX * 2;
  const usableH = h - padY * 2;
  const xStep = n <= 1 ? 0 : usableW / (n - 1);

  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const v = clamp01(series01[i] ?? 0);
    const x = padX + i * xStep;
    const y = padY + (1 - v) * usableH;
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  el.poly.setAttribute("points", pts.join(" "));

  // last point marker
  const last = clamp01(series01[n - 1] ?? 0);
  const lastX = padX + (n - 1) * xStep;
  const lastY = padY + (1 - last) * usableH;
  el.dot.setAttribute("cx", `${lastX.toFixed(2)}`);
  el.dot.setAttribute("cy", `${lastY.toFixed(2)}`);
}

// Speed buttons container
const speedButtons = document.createElement("div");
speedButtons.classList.add("segmented");
hudControls.appendChild(speedButtons);

const speeds: Speed[] = [1, 2, 5, 10, 20];

// These get defined before handlers, but depend on accMs, so we declare then assign later.
let accMs = 0;

speeds.forEach((s) => {
  const btn = document.createElement("button");
  btn.classList.add("btn");
  btn.classList.add("segmentedBtn");
  btn.textContent = `${s}×`;
  btn.classList.toggle("isActive", state.speed === s);
  btn.onclick = () => {
    const oldMsPerWeek = MS_PER_WEEK_AT_1X / state.speed;
    const oldProgress01 = clamp(accMs / oldMsPerWeek, 0, 1);

    state.speed = s;

    const newMsPerWeek = MS_PER_WEEK_AT_1X / state.speed;
    accMs = oldProgress01 * newMsPerWeek;

    renderHud();
    updateWeekProgressUi();
  };
  speedButtons.appendChild(btn);
});

// Pause/Play button
const pauseBtn = document.createElement("button");
pauseBtn.classList.add("btn");
pauseBtn.classList.add("btnPrimary");
pauseBtn.textContent = "Pause";
pauseBtn.onclick = () => {
  state.running = !state.running;
  pauseBtn.textContent = state.running ? "Pause" : "Play";
  renderHud();
};
hudControls.appendChild(pauseBtn);

// Step button
const stepBtn = document.createElement("button");
stepBtn.classList.add("btn");
stepBtn.textContent = "Step +1 week";
stepBtn.onclick = () => {
  const report = tickWeek(state);
  if ((report.rentPaid ?? 0) > 0) showReceipt(`Rent paid (-$${report.rentPaid})`);
  accMs = 0;
  render();
  updateWeekProgressUi();
};
hudControls.appendChild(stepBtn);

// Main content row (canvas + detail panel)
const content = document.createElement("div");
content.classList.add("content");
app.appendChild(content);

// Canvas
const canvas = document.createElement("canvas");
canvas.classList.add("farmCanvas");
content.appendChild(canvas);

const ctx = canvas.getContext("2d")!;
if (!ctx) throw new Error("Canvas 2D not supported");

// ============================================================================
// Canvas viewport (HiDPI + responsive sizing)
// ============================================================================

type CanvasViewport = {
  dpr: number;
  scale: number; // logical -> CSS px
  offsetX: number; // CSS px
  offsetY: number; // CSS px
  cssW: number;
  cssH: number;
  logicalW: number;
  logicalH: number;
};

const logicalW = state.gridW * TILE_SIZE;
const logicalH = state.gridH * TILE_SIZE;

let canvasViewport: CanvasViewport = {
  dpr: 1,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  cssW: logicalW,
  cssH: logicalH,
  logicalW,
  logicalH,
};

function applyCanvasTransform(): void {
  const v = canvasViewport;
  ctx.setTransform(v.scale * v.dpr, 0, 0, v.scale * v.dpr, Math.round(v.offsetX * v.dpr), Math.round(v.offsetY * v.dpr));
}

function resizeCanvasToDisplay(): void {
  const rect = canvas.getBoundingClientRect();
  const cssW = rect.width || logicalW;
  const cssH = rect.height || logicalH;

  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const scale = Math.min(cssW / logicalW, cssH / logicalH);
  const offsetX = (cssW - logicalW * scale) / 2;
  const offsetY = (cssH - logicalH * scale) / 2;

  const nextW = Math.round(cssW * dpr);
  const nextH = Math.round(cssH * dpr);

  if (canvas.width !== nextW) canvas.width = nextW;
  if (canvas.height !== nextH) canvas.height = nextH;

  canvasViewport = { dpr, scale, offsetX, offsetY, cssW, cssH, logicalW, logicalH };
  applyCanvasTransform();
}

// Keep the canvas crisp as its CSS size changes.
resizeCanvasToDisplay();
const canvasResizeObserver = new ResizeObserver(() => {
  resizeCanvasToDisplay();
  render();
});
canvasResizeObserver.observe(canvas);

window.addEventListener("resize", () => {
  resizeCanvasToDisplay();
  render();
});

// Hover tooltip (purely UI; no state mutation)
const canvasTooltipEl = document.createElement("div");
canvasTooltipEl.classList.add("canvasTooltip");
canvasTooltipEl.setAttribute("role", "status");
canvasTooltipEl.setAttribute("aria-live", "polite");
canvasTooltipEl.style.display = "none";
content.appendChild(canvasTooltipEl);

// Detail panel
const panel = document.createElement("div");
panel.classList.add("panel");
content.appendChild(panel);

const panelHeader = document.createElement("div");
panelHeader.classList.add("panelHeader");
panel.appendChild(panelHeader);

const panelTitle = document.createElement("div");
panelTitle.classList.add("panelTitle");
panelHeader.appendChild(panelTitle);

const panelBadges = document.createElement("div");
panelBadges.classList.add("panelBadges");
panelHeader.appendChild(panelBadges);

const panelReceiptEl = document.createElement("div");
panelReceiptEl.classList.add("panelReceipt");
panel.appendChild(panelReceiptEl);

const panelBody = document.createElement("div");
panelBody.classList.add("panelBody");
panel.appendChild(panelBody);

const panelActions = document.createElement("div");
panelActions.classList.add("panelActions");
panel.appendChild(panelActions);

// ============================================================================
// Theme (CSS variables -> TS)
// ============================================================================

type CanvasTheme = {
  ground: string;
  grid: string;
  tree: string;
  treeMature: string;
  trunk: string;
  matureIndicator: string;
  sparkline: string;
  stand: string;
  standTrim: string;
  standText: string;
  decor: string;
  frost: string;
  frostSubtle: string;
  glow: string;
};

let cachedCanvasTheme: CanvasTheme | null = null;

function readCssVar(name: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name);
  return v.trim();
}

function getCanvasTheme(): CanvasTheme {
  if (cachedCanvasTheme) return cachedCanvasTheme;
  cachedCanvasTheme = {
    ground: readCssVar("--canvas-ground") || "#0a2118",
    grid: readCssVar("--canvas-grid") || "rgba(234, 243, 240, 0.10)",
    tree: readCssVar("--canvas-tree") || "#1e5a3d",
    treeMature: readCssVar("--canvas-tree-mature") || "#1a4d35",
    trunk: readCssVar("--canvas-trunk") || "#6a2a12",
    matureIndicator: readCssVar("--canvas-mature-indicator") || "#f2c36b",
    sparkline: readCssVar("--canvas-sparkline") || "#a3122a",
    stand: readCssVar("--canvas-stand") || "#1f2937",
    standTrim: readCssVar("--canvas-stand-trim") || "#a3122a",
    standText: readCssVar("--canvas-stand-text") || "rgba(234, 243, 240, 0.95)",
    decor: readCssVar("--canvas-decor") || readCssVar("--canvas-mature-indicator") || "#f2c36b",
    frost: readCssVar("--canvas-frost") || "rgba(200, 220, 255, 0.6)",
    frostSubtle: readCssVar("--canvas-frost-subtle") || "rgba(200, 220, 255, 0.25)",
    glow: readCssVar("--canvas-glow") || "#f2c36b",
  };
  return cachedCanvasTheme;
}

// ============================================================================
// Rendering
// ============================================================================

let receiptTimer: number | null = null;

function showReceipt(message: string): void {
  if (!message) return;
  panelReceiptEl.textContent = message;
  panelReceiptEl.classList.add("isVisible");

  if (receiptTimer !== null) window.clearTimeout(receiptTimer);
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  const ttlMs = reduceMotion ? 1600 : 2200;
  receiptTimer = window.setTimeout(() => {
    panelReceiptEl.classList.remove("isVisible");
  }, ttlMs);
}

function renderHud(): void {
  const season = getSeason(state.date);
  // #region agent log
  fetch("http://127.0.0.1:7242/ingest/b9508947-ae5c-4f6f-82d7-7b0f031dd08b", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: "debug-session",
      runId: "pre-fix",
      hypothesisId: "H2",
      location: "src/main.ts:renderHud",
      message: "renderHud entry",
      data: { season, typeof_formatSeason: typeof (globalThis as any).formatSeason },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion agent log

  seasonEl.textContent = formatSeason(season);

  dateEl.textContent = state.date.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  moneyEl.textContent = `$${state.money.toFixed(0)}`;
  const nextRent = getNextRentDate(state.date);
  const daysUntilRent = getDaysUntilRent(state.date);
  const nextRentLabel = nextRent.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  rentEl.textContent = `$${RENT_MONTHLY} · ${nextRentLabel} (${daysUntilRent}d)`;
  cheerEl.textContent = `${state.cheer}`;

  if (state.lastReport) {
    const p = state.lastReport.prices.trees;
    priceEl.textContent = `D $${p.douglasFir} · F $${p.fraserFir}`;
    marketEl.textContent = `+$${state.lastReport.revenue.total} · ${state.lastReport.visitors} visitors · ${state.lastReport.treesSold} trees`;
  } else {
    priceEl.textContent = "—";
    marketEl.textContent = "—";
  }

  pauseBtn.textContent = state.running ? "Pause" : "Play";
  statusEl.textContent = state.running ? "Running" : "Paused";
  statusEl.classList.toggle("isPaused", !state.running);

  const secondsPerWeek = MS_PER_WEEK_AT_1X / 1000 / state.speed;
  speedEl.textContent = `${state.speed}× · ${secondsPerWeek.toFixed(1)}s/wk`;

  const weeksSinceStart = getWeeksSinceStart(state.date);
  weekEl.textContent = `Week ${weeksSinceStart + 1}`;

  if (state.lastReport) {
    const cap = state.tiles.filter((t) => t.base.kind === "cocoa").length * COCOA_CAPACITY_PER_WEEK_PER_STAND;
    marketDetailsEl.textContent =
      `Last week — visitors ${state.lastReport.visitors}, trees sold ${state.lastReport.treesSold}, ` +
      `cocoa ${state.lastReport.cocoaSold}/${cap}, revenue +$${state.lastReport.revenue.total}`;
  } else {
    marketDetailsEl.textContent = "Last week — (no market yet)";
  }

  if (state.selectedTileIdx === null) {
    selectedEl.textContent = "Selected: (none)";
  } else {
    const sx = state.selectedTileIdx % state.gridW;
    const sy = Math.floor(state.selectedTileIdx / state.gridW);
    const t = state.tiles[state.selectedTileIdx];
    if (t.base.kind === "tree") {
      const def = SPECIES[t.base.speciesId];
      const ratio = clamp(t.base.ageWeeks / def.maturityWeeks, 0, 1);
      selectedEl.textContent =
        `Selected: (${sx},${sy}) — ${def.shortLabel} x${t.base.treesRemaining} ` +
        `${formatYearsFromWeeks(t.base.ageWeeks)} (${Math.round(ratio * 100)}%)`;
    } else if (t.base.kind === "cocoa") {
      selectedEl.textContent = `Selected: (${sx},${sy}) — Cocoa stand`;
    } else {
      selectedEl.textContent = `Selected: (${sx},${sy}) — Empty`;
    }
    if (t.decorLevel > 0) selectedEl.textContent += ` · Décor L${t.decorLevel}`;
  }

  speedButtons.childNodes.forEach((node, i) => {
    if (node instanceof HTMLButtonElement) {
      const isSelected = state.speed === speeds[i];
      node.classList.toggle("isActive", isSelected);
    }
  });

  // Trends
  const repSeries = state.trends?.reputation01 ?? [state.reputation01];
  const vibeSeries = state.trends?.holidayVibe01 ?? [state.holidayVibe01];
  const attractSeries = state.trends?.farmAttraction01 ?? [state.farmAttraction01];

  const repNow = repSeries[repSeries.length - 1] ?? state.reputation01;
  const vibeNow = vibeSeries[vibeSeries.length - 1] ?? state.holidayVibe01;
  const attractNow = attractSeries[attractSeries.length - 1] ?? state.farmAttraction01;

  const repPrev = repSeries.length >= 2 ? repSeries[repSeries.length - 2]! : repNow;
  const vibePrev = vibeSeries.length >= 2 ? vibeSeries[vibeSeries.length - 2]! : vibeNow;
  const attractPrev = attractSeries.length >= 2 ? attractSeries[attractSeries.length - 2]! : attractNow;

  repTrend.valueEl.textContent = formatPct01(repNow);
  vibeTrend.valueEl.textContent = formatPct01(vibeNow);
  attractTrend.valueEl.textContent = formatPct01(attractNow);

  const repD = formatDeltaPct01(repPrev, repNow);
  const vibeD = formatDeltaPct01(vibePrev, vibeNow);
  const attractD = formatDeltaPct01(attractPrev, attractNow);

  repTrend.deltaEl.textContent = repD.text;
  repTrend.deltaEl.dataset.dir = repD.dir;
  vibeTrend.deltaEl.textContent = vibeD.text;
  vibeTrend.deltaEl.dataset.dir = vibeD.dir;
  attractTrend.deltaEl.textContent = attractD.text;
  attractTrend.deltaEl.dataset.dir = attractD.dir;

  setSparkline(repTrend, repSeries);
  setSparkline(vibeTrend, vibeSeries);
  setSparkline(attractTrend, attractSeries);
}

function renderPanel(): void {
  panelBody.innerHTML = "";
  panelActions.innerHTML = "";
  panelBadges.innerHTML = "";

  const setBadges = (badges: Array<{ text: string; tone?: "accent" | "muted" }>) => {
    panelBadges.innerHTML = "";
    badges.forEach((b) => {
      const el = document.createElement("span");
      el.classList.add("badge");
      if (b.tone === "accent") el.classList.add("badgeAccent");
      if (b.tone === "muted") el.classList.add("badgeMuted");
      el.textContent = b.text;
      panelBadges.appendChild(el);
    });
  };

  if (state.selectedTileIdx === null) {
    panelTitle.textContent = "Patch Details";
    setBadges([]);
    panelReceiptEl.classList.remove("isVisible");
    panelReceiptEl.textContent = "";
    const hint = document.createElement("div");
    hint.classList.add("panelHint");
    hint.textContent = "Click a tile to view details and actions (click again to deselect).";
    panelBody.appendChild(hint);
    return;
  }

  const tileIdx = state.selectedTileIdx;
  const x = tileIdx % state.gridW;
  const y = Math.floor(tileIdx / state.gridW);
  const tile = state.tiles[tileIdx];

  panelTitle.textContent = `Patch (${x},${y})`;

  const addSection = (title: string) => {
    const section = document.createElement("div");
    section.classList.add("panelSection");
    const h = document.createElement("div");
    h.classList.add("panelSectionTitle");
    h.textContent = title;
    section.appendChild(h);
    panelBody.appendChild(section);
    return section;
  };

  const addRow = (section: HTMLElement, label: string, value: string) => {
    const row = document.createElement("div");
    row.classList.add("panelRow");
    const l = document.createElement("div");
    l.classList.add("panelLabel");
    l.textContent = label;
    const v = document.createElement("div");
    v.classList.add("panelValue");
    v.textContent = value;
    row.appendChild(l);
    row.appendChild(v);
    section.appendChild(row);
  };

  const makeActionBtn = (
    text: string,
    onClick: () => void,
    opts?: { disabled?: boolean; title?: string; receipt?: string },
  ) => {
    const btn = document.createElement("button");
    btn.classList.add("btn");
    btn.classList.add("panelBtn");
    btn.textContent = text;
    if (opts?.title) btn.title = opts.title;
    if (opts?.disabled) btn.setAttribute("disabled", "true");
    btn.onclick = () => {
      if (btn.hasAttribute("disabled")) return;
      onClick();
      if (opts?.receipt) showReceipt(opts.receipt);
      render();
    };
    return btn;
  };

  const whatSection = addSection("What’s here");

  const baseBadgeText =
    tile.base.kind === "tree"
      ? `Trees: ${SPECIES[tile.base.speciesId].label}`
      : tile.base.kind === "cocoa"
        ? "Hot cocoa stand"
        : "Empty lot";
  const decorBadgeText = tile.decorLevel > 0 ? `Décor L${tile.decorLevel}` : "Décor L0";
  setBadges([{ text: baseBadgeText }, { text: decorBadgeText, tone: tile.decorLevel > 0 ? "accent" : "muted" }]);

  if (tile.base.kind === "empty") {
    addRow(whatSection, "Base", "Empty");
    addRow(whatSection, "Patch size", `${PATCH_CAPACITY} trees (same age)`);
  } else if (tile.base.kind === "cocoa") {
    addRow(whatSection, "Base", "Cocoa stand");
    addRow(whatSection, "Capacity", `${COCOA_CAPACITY_PER_WEEK_PER_STAND} cups / week`);
  } else if (tile.base.kind === "tree") {
    const def = SPECIES[tile.base.speciesId];
    const maturityRatio = clamp(tile.base.ageWeeks / def.maturityWeeks, 0, 1);
    addRow(whatSection, "Base", `Tree patch (${def.label})`);
    addRow(whatSection, "Trees remaining", `${tile.base.treesRemaining} / ${PATCH_CAPACITY}`);
    addRow(whatSection, "Maturity", `${Math.round(maturityRatio * 100)}%`);
  }

  if (tile.base.kind === "tree") {
    const def = SPECIES[tile.base.speciesId];
    const maturityRatio = clamp(tile.base.ageWeeks / def.maturityWeeks, 0, 1);
    const growthSection = addSection("Growth");
    addRow(growthSection, "Age", `${Math.floor(tile.base.ageWeeks)}w (${formatYearsFromWeeks(tile.base.ageWeeks)})`);
    addRow(growthSection, "Maturity", `${Math.round(maturityRatio * 100)}%`);
    addRow(growthSection, "Sellable", tile.base.ageWeeks >= def.maturityWeeks ? "Yes (Nov–Dec market)" : "Not yet");
  }

  const econSection = addSection("Economy");
  if (tile.base.kind === "empty") {
    addRow(econSection, "Plant cost", `${SPECIES.douglasFir.label}: $${SPECIES.douglasFir.plantCost} · ${SPECIES.fraserFir.label}: $${SPECIES.fraserFir.plantCost}`);
    addRow(econSection, "Build cocoa", `$${COCOA_STAND_COST}`);
  } else if (tile.base.kind === "cocoa") {
    addRow(econSection, "Price", `$${COCOA_PRICE} / cup`);
    addRow(econSection, "Refund on clear", `$${Math.floor(COCOA_STAND_COST * 0.25)}`);
  } else if (tile.base.kind === "tree") {
    const def = SPECIES[tile.base.speciesId];
    const lastPrice = state.lastReport?.prices?.trees?.[tile.base.speciesId] ?? null;
    addRow(econSection, "Market price (last week)", lastPrice === null ? "—" : `$${lastPrice} / tree`);
    addRow(econSection, "Refund on clear", `$${Math.floor(def.plantCost * 0.25)}`);
  }

  // Base actions
  if (tile.base.kind === "empty") {
    const douglasCost = SPECIES.douglasFir.plantCost;
    const fraserCost = SPECIES.fraserFir.plantCost;
    const canDouglas = state.money >= douglasCost;
    const canFraser = state.money >= fraserCost;
    const canCocoa = state.money >= COCOA_STAND_COST;
    panelActions.appendChild(
      makeActionBtn(
        `Plant ${SPECIES.douglasFir.label} (${PATCH_CAPACITY}) ($${douglasCost})${canDouglas ? "" : ` — Need $${douglasCost - Math.floor(state.money)}`}`,
        () => plantAt(state, tileIdx, "douglasFir"),
        { disabled: !canDouglas, title: canDouglas ? "" : "Not enough money", receipt: `Planted ${PATCH_CAPACITY} ${SPECIES.douglasFir.label}` },
      ),
    );
    panelActions.appendChild(
      makeActionBtn(
        `Plant ${SPECIES.fraserFir.label} (${PATCH_CAPACITY}) ($${fraserCost})${canFraser ? "" : ` — Need $${fraserCost - Math.floor(state.money)}`}`,
        () => plantAt(state, tileIdx, "fraserFir"),
        { disabled: !canFraser, title: canFraser ? "" : "Not enough money", receipt: `Planted ${PATCH_CAPACITY} ${SPECIES.fraserFir.label}` },
      ),
    );
    panelActions.appendChild(
      makeActionBtn(
        `Build Cocoa ($${COCOA_STAND_COST})${canCocoa ? "" : ` — Need $${COCOA_STAND_COST - Math.floor(state.money)}`}`,
        () => buildCocoaAt(state, tileIdx),
        { disabled: !canCocoa, title: canCocoa ? "" : "Not enough money", receipt: "Built hot cocoa stand" },
      ),
    );
  } else {
    const refund =
      tile.base.kind === "cocoa"
        ? Math.floor(COCOA_STAND_COST * 0.25)
        : tile.base.kind === "tree"
          ? Math.floor(SPECIES[tile.base.speciesId].plantCost * 0.25)
          : 0;
    panelActions.appendChild(
      makeActionBtn(`Bulldoze base (+refund)`, () => bulldozeBaseAt(state, tileIdx), { receipt: `Cleared lot (refund $${refund})` }),
    );
  }

  // Decor section (overlay, always available)
  const decorSection = addSection("Décor");
  addRow(decorSection, "Level", `${tile.decorLevel} / 3`);
  const nextCost = getDecorUpgradeCost(tile.decorLevel);
  if (nextCost === null) {
    panelActions.appendChild(makeActionBtn("Décor: Maxed", () => {}, { disabled: true }));
  } else {
    const canUpgrade = state.money >= nextCost;
    panelActions.appendChild(
      makeActionBtn(
        `Upgrade Décor (+L1) ($${nextCost})${canUpgrade ? "" : ` — Need $${nextCost - Math.floor(state.money)}`}`,
        () => upgradeDecorAt(state, tileIdx),
        { disabled: !canUpgrade, title: canUpgrade ? "" : "Not enough money", receipt: `Upgraded décor to L${tile.decorLevel + 1}` },
      ),
    );
  }
}

function drawMaturityBadge(px: number, py: number, ratio01: number, selected: boolean): void {
  const theme = getCanvasTheme();
  const v = clamp(ratio01, 0, 1);
  const pct = Math.round(v * 100);

  const pad = 6;
  const boxW = 34;
  const boxH = 22;
  const bx = px + TILE_SIZE - pad - boxW;
  const by = py + pad;

  // Backplate
  ctx.fillStyle = "rgba(6, 19, 14, 0.55)";
  ctx.fillRect(bx, by, boxW, boxH);
  ctx.strokeStyle = selected ? theme.matureIndicator : "rgba(234, 243, 240, 0.20)";
  ctx.lineWidth = 1;
  ctx.strokeRect(bx + 0.5, by + 0.5, boxW - 1, boxH - 1);

  // Baseline (explicit zero)
  const baseY = by + boxH - 6;
  ctx.strokeStyle = "rgba(234, 243, 240, 0.35)";
  ctx.beginPath();
  ctx.moveTo(bx + 4, baseY + 0.5);
  ctx.lineTo(bx + boxW - 4, baseY + 0.5);
  ctx.stroke();

  // Fill bar anchored at baseline
  const barMaxH = boxH - 10;
  const barH = Math.round(barMaxH * v);
  ctx.fillStyle = theme.sparkline;
  ctx.fillRect(bx + boxW - 7, baseY - barH, 3, barH);

  // Text label
  ctx.fillStyle = "rgba(234, 243, 240, 0.92)";
  ctx.font = "9px 'Libre Baskerville'";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const label = pct >= 100 ? "100" : `${pct}`;
  ctx.fillText(label, bx + 4, by + 12);
  ctx.fillStyle = "rgba(234, 243, 240, 0.70)";
  ctx.fillText("%", bx + 4 + ctx.measureText(label).width + 1, by + 12);
}

function drawMinimalPine(
  ctx: CanvasRenderingContext2D,
  cx: number,
  groundY: number,
  canopyH: number,
  canopyW: number,
  fill: string,
  trunk: string,
  opts?: { leanPx?: number; glow?: boolean },
): void {
  const lean = opts?.leanPx ?? 0;
  const trunkH = Math.max(6, Math.round(canopyH * 0.22));
  const trunkW = Math.max(4, Math.round(canopyW * 0.14));
  const bottomY = groundY - trunkH;
  const topY = bottomY - canopyH;

  // Soft ground shadow
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(cx + lean * 0.25, groundY - 2, canopyW * 0.32, canopyW * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Trunk
  ctx.fillStyle = trunk;
  ctx.fillRect(Math.round(cx - trunkW / 2 + lean * 0.15), Math.round(groundY - trunkH), trunkW, trunkH);

  // Canopy silhouette (minimal pine / teardrop)
  const h = canopyH;
  const w = canopyW;
  const x = cx + lean;

  ctx.beginPath();
  ctx.moveTo(x, topY);
  ctx.bezierCurveTo(x + w * 0.62, topY + h * 0.20, x + w * 0.66, topY + h * 0.72, x, bottomY);
  ctx.bezierCurveTo(x - w * 0.66, topY + h * 0.72, x - w * 0.62, topY + h * 0.20, x, topY);
  ctx.closePath();

  ctx.fillStyle = fill;
  ctx.fill();

  // Subtle highlight + shading, clipped to canopy
  ctx.save();
  ctx.clip();
  const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  g.addColorStop(0, "rgba(255,255,255,0.16)");
  g.addColorStop(0.55, "rgba(255,255,255,0.00)");
  g.addColorStop(1, "rgba(0,0,0,0.12)");
  ctx.fillStyle = g;
  ctx.fillRect(x - w / 2 - 2, topY - 2, w + 4, h + trunkH + 4);
  ctx.restore();

  // Crisp edge
  ctx.strokeStyle = "rgba(234,243,240,0.10)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Optional mature glow
  if (opts?.glow) {
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
}

function pathRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawGlassCapsuleLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  leftText: string,
  rightText: string,
  opts?: { maxWidth?: number },
): void {
  const padX = 7;
  const gap = 6;
  const h = 18;
  const r = 7;

  ctx.save();
  ctx.font = "10px 'Libre Baskerville'";
  const leftW = Math.ceil(ctx.measureText(leftText).width);
  const rightW = Math.ceil(ctx.measureText(rightText).width);
  let w = padX * 2 + leftW + gap + rightW;

  const maxW = opts?.maxWidth ?? 52;
  if (w > maxW) w = maxW;

  // Background glass
  pathRoundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = "rgba(6, 19, 14, 0.55)";
  ctx.fill();

  // Inner highlight
  const hg = ctx.createLinearGradient(x, y, x + w, y + h);
  hg.addColorStop(0, "rgba(255,255,255,0.10)");
  hg.addColorStop(0.35, "rgba(255,255,255,0.04)");
  hg.addColorStop(1, "rgba(255,255,255,0.00)");
  pathRoundRect(ctx, x + 1, y + 1, w - 2, h - 2, r - 1);
  ctx.fillStyle = hg;
  ctx.fill();

  // Border (slightly brighter on top)
  pathRoundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r);
  ctx.strokeStyle = "rgba(234, 243, 240, 0.18)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 1, y + 1, w - 2, Math.floor(h / 2));
  ctx.clip();
  pathRoundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.10)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  // Text (two-tone)
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  const tx = x + padX;
  const ty = y + h / 2 + 0.5;

  ctx.fillStyle = "rgba(234, 243, 240, 0.92)";
  ctx.fillText(leftText, tx, ty);

  const maxRightX = x + w - padX;
  const rightX = Math.min(tx + leftW + gap, maxRightX);
  ctx.fillStyle = "rgba(234, 243, 240, 0.75)";
  ctx.fillText(rightText, rightX, ty);

  ctx.restore();
}

function drawCocoaStand(ctx: CanvasRenderingContext2D, px: number, py: number, tileSize: number): void {
  const theme = getCanvasTheme();

  // Layout tuned for TILE_SIZE=80, but scales if tileSize changes.
  const inset = Math.round(tileSize * 0.14); // ~11
  const x = px + inset;
  const w = tileSize - inset * 2;

  const awningY = py + Math.round(tileSize * 0.22); // ~18
  const awningH = Math.round(tileSize * 0.15); // ~12
  const bodyY = awningY + awningH + 3;
  const bottomMargin = Math.round(tileSize * 0.16); // ~13
  const bodyH = py + tileSize - bottomMargin - bodyY;

  const r = 8;

  // Soft shadow (keeps it grounded without extra detail)
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(px + tileSize / 2, py + tileSize - 16, w * 0.38, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Stand body
  pathRoundRect(ctx, x, bodyY, w, bodyH, r);
  ctx.fillStyle = theme.stand;
  ctx.fill();

  // Inner highlight/shade
  ctx.save();
  ctx.clip();
  const bodyG = ctx.createLinearGradient(x, bodyY, x, bodyY + bodyH);
  bodyG.addColorStop(0, "rgba(255,255,255,0.08)");
  bodyG.addColorStop(0.35, "rgba(255,255,255,0.02)");
  bodyG.addColorStop(1, "rgba(0,0,0,0.18)");
  ctx.fillStyle = bodyG;
  ctx.fillRect(x, bodyY, w, bodyH);
  ctx.restore();

  // Counter lip (thin accent)
  const lipY = bodyY + Math.round(bodyH * 0.34);
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = theme.standTrim;
  ctx.fillRect(x + 2, lipY, w - 4, 2);
  ctx.restore();

  // Awning base
  pathRoundRect(ctx, x, awningY, w, awningH, r);
  ctx.fillStyle = "rgba(6, 19, 14, 0.55)";
  ctx.fill();

  // Stripes (simple pattern read at small size)
  ctx.save();
  ctx.clip();
  const stripeW = Math.max(6, Math.round(w / 6));
  for (let i = 0; i < 12; i++) {
    const sx = x + i * stripeW;
    const isAccent = i % 2 === 0;
    ctx.save();
    ctx.globalAlpha = isAccent ? 0.85 : 1;
    ctx.fillStyle = isAccent ? theme.standTrim : "rgba(255,255,255,0.06)";
    ctx.fillRect(sx, awningY, stripeW * 0.62, awningH);
    ctx.restore();
  }
  ctx.restore();

  // Crisp outlines
  pathRoundRect(ctx, x + 0.5, awningY + 0.5, w - 1, awningH - 1, r);
  ctx.strokeStyle = "rgba(234, 243, 240, 0.18)";
  ctx.lineWidth = 1;
  ctx.stroke();

  pathRoundRect(ctx, x + 0.5, bodyY + 0.5, w - 1, bodyH - 1, r);
  ctx.strokeStyle = "rgba(234, 243, 240, 0.16)";
  ctx.stroke();

  // Small "COCOA" sign pill (top-left)
  const pillW = Math.min(46, w - 10);
  const pillH = 16;
  const pillX = x + 6;
  const pillY = bodyY - 9;

  pathRoundRect(ctx, pillX, pillY, pillW, pillH, 999);
  ctx.fillStyle = "rgba(6, 19, 14, 0.65)";
  ctx.fill();
  ctx.strokeStyle = "rgba(234, 243, 240, 0.18)";
  ctx.stroke();

  ctx.font = "9px 'Libre Baskerville'";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = theme.standText;
  ctx.fillText("COCOA", pillX + pillW / 2, pillY + pillH / 2 + 0.5);

  // Cup icon (bottom-right) + steam
  const cupX = x + w - 22;
  const cupY = bodyY + bodyH - 22;

  // Cup
  pathRoundRect(ctx, cupX, cupY, 12, 8, 2);
  ctx.fillStyle = "rgba(234, 243, 240, 0.16)";
  ctx.fill();
  ctx.strokeStyle = "rgba(234, 243, 240, 0.30)";
  ctx.stroke();

  // Handle
  ctx.beginPath();
  ctx.arc(cupX + 12.5, cupY + 4, 3, -Math.PI / 2, Math.PI / 2);
  ctx.strokeStyle = "rgba(234, 243, 240, 0.30)";
  ctx.stroke();

  // Steam (2 strokes)
  ctx.strokeStyle = "rgba(234, 243, 240, 0.42)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cupX + 3, cupY - 2);
  ctx.bezierCurveTo(cupX + 1, cupY - 6, cupX + 5, cupY - 8, cupX + 3, cupY - 12);
  ctx.moveTo(cupX + 8, cupY - 2);
  ctx.bezierCurveTo(cupX + 6, cupY - 6, cupX + 10, cupY - 8, cupX + 8, cupY - 12);
  ctx.stroke();
}

// ============================================================================
// Frost & Glow Decor System
// ============================================================================

/**
 * Simple deterministic pseudo-random based on seed.
 * Returns value in [0, 1) and updates seed for next call.
 */
function seededRandom(seed: number): { value: number; next: number } {
  const next = (seed * 1103515245 + 12345) & 0x7fffffff;
  return { value: (next >>> 16) / 32768, next };
}

/**
 * Draws a single frost crystal branch with recursive sub-branches.
 * Uses hexagonal crystal structure (60° angles).
 * @param seed - Deterministic seed for variation
 */
function drawFrostBranch(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  length: number,
  thickness: number,
  alpha: number,
  depth: number,
  seed: number,
  theme: CanvasTheme,
): void {
  if (depth <= 0 || length < 2 || alpha < 0.05) return;

  const endX = x + Math.cos(angle) * length;
  const endY = y + Math.sin(angle) * length;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = theme.frost;
  ctx.lineWidth = thickness;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(endX, endY);
  ctx.stroke();
  ctx.restore();

  // Recursive sub-branches at 60° intervals (hexagonal crystal)
  if (depth > 1) {
    const rand = seededRandom(seed);
    const branchPoint = 0.4 + rand.value * 0.2; // Deterministic variation
    const bx = x + Math.cos(angle) * length * branchPoint;
    const by = y + Math.sin(angle) * length * branchPoint;
    
    // Left branch
    drawFrostBranch(
      ctx, bx, by,
      angle - Math.PI / 3, // -60°
      length * 0.5,
      thickness * 0.7,
      alpha * 0.7,
      depth - 1,
      rand.next,
      theme,
    );
    
    // Right branch
    drawFrostBranch(
      ctx, bx, by,
      angle + Math.PI / 3, // +60°
      length * 0.5,
      thickness * 0.7,
      alpha * 0.7,
      depth - 1,
      rand.next + 1,
      theme,
    );
  }

  // Terminal sparkle for longer branches
  if (length > 8) {
    ctx.save();
    ctx.globalAlpha = alpha * 0.6;
    ctx.fillStyle = theme.frost;
    ctx.beginPath();
    ctx.arc(endX, endY, thickness * 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/**
 * Draws frost pattern emanating from a corner.
 * @param corner - 0=top-left, 1=top-right, 2=bottom-right, 3=bottom-left
 * @param tileSeed - Deterministic seed based on tile position
 */
function drawFrostCorner(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  corner: number,
  intensity: number,
  tileSeed: number,
  theme: CanvasTheme,
): void {
  const pad = 4;
  const corners = [
    { x: px + pad, y: py + pad, angles: [0, Math.PI / 2] },           // top-left
    { x: px + TILE_SIZE - pad, y: py + pad, angles: [Math.PI / 2, Math.PI] }, // top-right
    { x: px + TILE_SIZE - pad, y: py + TILE_SIZE - pad, angles: [Math.PI, Math.PI * 1.5] }, // bottom-right
    { x: px + pad, y: py + TILE_SIZE - pad, angles: [-Math.PI / 2, 0] }, // bottom-left
  ];

  const c = corners[corner];
  const baseLength = 12 + intensity * 8;
  const baseThickness = 1.2 + intensity * 0.4;
  const baseAlpha = 0.4 + intensity * 0.3;

  // Seed for this specific corner
  let seed = tileSeed + corner * 1000;

  // Main branches radiating from corner
  c.angles.forEach((baseAngle, i) => {
    const branchSeed = seed + i * 100;
    
    // Primary branch
    drawFrostBranch(ctx, c.x, c.y, baseAngle, baseLength, baseThickness, baseAlpha, 3, branchSeed, theme);
    
    // Secondary branch at slight offset (deterministic direction based on seed)
    const rand = seededRandom(branchSeed + 50);
    const offsetDir = rand.value > 0.5 ? 1 : -1;
    const offsetAngle = baseAngle + (Math.PI / 6) * offsetDir;
    drawFrostBranch(ctx, c.x, c.y, offsetAngle, baseLength * 0.7, baseThickness * 0.8, baseAlpha * 0.6, 2, rand.next, theme);
  });
}

/**
 * Draws frost pattern based on decor level.
 * Level 1: Single corner cluster
 * Level 2: Same as level 1 (glow added separately)
 * Level 3: All four corners (called from drawFrostBorder)
 * @param tileSeed - Deterministic seed based on tile position
 */
function drawFrostPattern(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  level: number,
  tileSeed: number,
  theme: CanvasTheme,
): void {
  // Level 1 & 2: Top-left corner frost
  if (level >= 1 && level < 3) {
    drawFrostCorner(ctx, px, py, 0, level === 1 ? 0.5 : 0.8, tileSeed, theme);
  }
}

/**
 * Draws frost border on all corners (Level 3).
 * @param tileSeed - Deterministic seed based on tile position
 */
function drawFrostBorder(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  tileSeed: number,
  theme: CanvasTheme,
): void {
  for (let corner = 0; corner < 4; corner++) {
    drawFrostCorner(ctx, px, py, corner, 1.0, tileSeed, theme);
  }
}

/**
 * Parses a color string and returns RGBA components.
 * Handles hex (#rrggbb, #rgb) and rgba() formats.
 */
function parseColor(color: string): { r: number; g: number; b: number; a: number } {
  // Default to lantern gold
  let r = 242, g = 195, b = 107, a = 1;

  if (color.startsWith("#")) {
    const hex = color.slice(1);
    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length >= 6) {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    }
  } else if (color.startsWith("rgba")) {
    const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (match) {
      r = parseInt(match[1]);
      g = parseInt(match[2]);
      b = parseInt(match[3]);
      a = match[4] ? parseFloat(match[4]) : 1;
    }
  }

  return { r, g, b, a };
}

/**
 * Draws a soft golden glow from the top-left corner (Level 2+).
 * Uses radial gradient with additive blending for warmth.
 */
function drawCornerGlow(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  phase: number,
  theme: CanvasTheme,
): void {
  const glowColor = parseColor(theme.glow);
  const pulseAlpha = 0.15 + phase * 0.1; // Subtle pulse 0.15-0.25

  const cx = px + 12;
  const cy = py + 12;
  const radius = TILE_SIZE * 0.55;

  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  gradient.addColorStop(0, `rgba(${glowColor.r}, ${glowColor.g}, ${glowColor.b}, ${pulseAlpha})`);
  gradient.addColorStop(0.4, `rgba(${glowColor.r}, ${glowColor.g}, ${glowColor.b}, ${pulseAlpha * 0.5})`);
  gradient.addColorStop(1, `rgba(${glowColor.r}, ${glowColor.g}, ${glowColor.b}, 0)`);

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = gradient;
  ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
  ctx.restore();
}

/**
 * Draws a warm center glow for the "snow globe" effect (Level 3).
 * Creates an inner warmth surrounded by frost.
 */
function drawCenterGlow(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  phase: number,
  theme: CanvasTheme,
): void {
  const glowColor = parseColor(theme.glow);
  const pulseAlpha = 0.12 + phase * 0.08; // Subtle pulse 0.12-0.20

  const cx = px + TILE_SIZE / 2;
  const cy = py + TILE_SIZE / 2;
  const radius = TILE_SIZE * 0.45;

  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  gradient.addColorStop(0, `rgba(${glowColor.r}, ${glowColor.g}, ${glowColor.b}, ${pulseAlpha})`);
  gradient.addColorStop(0.5, `rgba(${glowColor.r}, ${glowColor.g}, ${glowColor.b}, ${pulseAlpha * 0.4})`);
  gradient.addColorStop(1, `rgba(${glowColor.r}, ${glowColor.g}, ${glowColor.b}, 0)`);

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = gradient;
  ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
  ctx.restore();
}

/**
 * Returns animation phase (0-1) for decor glow effects.
 * Uses slow sine wave (~4 second cycle) for subtle pulsing.
 */
function getDecorAnimPhase(time: number): number {
  const cycleDuration = 4000; // 4 seconds per cycle
  const t = (time % cycleDuration) / cycleDuration;
  return (Math.sin(t * Math.PI * 2) + 1) / 2; // 0-1 oscillation
}

/**
 * Draws the Frost & Lantern Glow decor overlay.
 * - Level 1: Frost crystals in top-left corner
 * - Level 2: Frost + soft golden glow from corner
 * - Level 3: Full frost border + warm center glow ("snow globe" effect)
 */
function drawDecorOverlay(px: number, py: number, tile: Tile, time: number): void {
  if (tile.decorLevel <= 0) return;
  const theme = getCanvasTheme();
  const phase = getDecorAnimPhase(time);
  
  // Generate deterministic seed from tile position
  const tileSeed = (px * 97 + py * 131) | 0;

  // Level 1+: Frost crystals
  if (tile.decorLevel >= 1) {
    drawFrostPattern(ctx, px, py, tile.decorLevel, tileSeed, theme);
  }

  // Level 2+: Corner glow
  if (tile.decorLevel >= 2) {
    drawCornerGlow(ctx, px, py, phase, theme);
  }

  // Level 3: Full border frost + center glow
  if (tile.decorLevel >= 3) {
    drawFrostBorder(ctx, px, py, tileSeed, theme);
    drawCenterGlow(ctx, px, py, phase, theme);
  }
}

function drawTile(x: number, y: number, tile: Tile, animTime: number): void {
  const theme = getCanvasTheme();
  const px = x * TILE_SIZE;
  const py = y * TILE_SIZE;
  const tileIdx = idx(x, y, state.gridW);
  const isSelected = state.selectedTileIdx === tileIdx;
  const isHovered = hoveredTileIdx === tileIdx;

  // Ground
  ctx.fillStyle = theme.ground;
  ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

  // Grid lines
  ctx.strokeStyle = theme.grid;
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);

  // Selection outline
  if (isSelected) {
    ctx.strokeStyle = theme.matureIndicator;
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 2, py + 2, TILE_SIZE - 4, TILE_SIZE - 4);
  }

  // Hover outline (subtle, non-destructive)
  if (isHovered && !isSelected) {
    ctx.save();
    ctx.strokeStyle = theme.matureIndicator;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 2, py + 2, TILE_SIZE - 4, TILE_SIZE - 4);
    ctx.restore();
  }

  if (tile.base.kind === "tree") {
    const def = SPECIES[tile.base.speciesId];
    const ageRatio = clamp(tile.base.ageWeeks / def.maturityWeeks, 0, 1);
    const isMature = tile.base.ageWeeks >= def.maturityWeeks;
    const grow = Math.min(1, ageRatio * 1.6);
    const baseY = py + TILE_SIZE - 14;

    const canopyH = 16 + 30 * grow;
    const canopyW = 14 + 22 * grow;

    const fullness01 = PATCH_CAPACITY > 0 ? tile.base.treesRemaining / PATCH_CAPACITY : 0;
    const countVis = fullness01 >= 0.7 ? 3 : fullness01 >= 0.4 ? 2 : 1;
    const offsets = countVis === 3 ? [-14, 0, 14] : countVis === 2 ? [-9, 10] : [0];

    // Slight deterministic variation per-tile so it doesn't look stamped (no randomness)
    const salt = ((x * 97 + y * 131) % 100) / 100;
    const leanBase = (salt - 0.5) * 2.2;

    offsets.forEach((dx, i) => {
      const s = 0.92 + i * 0.06;
      drawMinimalPine(
        ctx,
        px + TILE_SIZE / 2 + dx,
        baseY,
        canopyH * s,
        canopyW * s,
        isMature ? theme.treeMature : theme.tree,
        theme.trunk,
        { leanPx: leanBase + dx * 0.03, glow: isMature },
      );
    });

    // Species + remaining as a tiny glass capsule (bottom-left)
    drawGlassCapsuleLabel(
      ctx,
      px + 6,
      py + TILE_SIZE - 6 - 18,
      def.shortLabel,
      `${tile.base.treesRemaining}`,
      { maxWidth: 54 },
    );

    // In-tile maturity indicator (top-right)
    drawMaturityBadge(px, py, ageRatio, isSelected);
  }

  if (tile.base.kind === "cocoa") {
    drawCocoaStand(ctx, px, py, TILE_SIZE);
  }

  drawDecorOverlay(px, py, tile, animTime);
}

function render(): void {
  applySeasonTheme();
  renderHud();
  renderPanel();

  // Clear in device pixels (identity transform), then re-apply logical transform.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  applyCanvasTransform();

  const animTime = performance.now();
  for (let y = 0; y < state.gridH; y++) {
    for (let x = 0; x < state.gridW; x++) {
      const tile = state.tiles[idx(x, y, state.gridW)];
      drawTile(x, y, tile, animTime);
    }
  }
}

// ============================================================================
// Input Handling
// ============================================================================

function selectTileAt(x: number, y: number): void {
  if (x < 0 || y < 0 || x >= state.gridW || y >= state.gridH) return;
  const nextIdx = idx(x, y, state.gridW);
  state.selectedTileIdx = state.selectedTileIdx === nextIdx ? null : nextIdx;
}

function getTileCoordFromMouseEvent(e: MouseEvent): { x: number; y: number; tileIdx: number } | null {
  const rect = canvas.getBoundingClientRect();
  const cssX = e.clientX - rect.left;
  const cssY = e.clientY - rect.top;

  const v = canvasViewport;
  const px = (cssX - v.offsetX) / v.scale;
  const py = (cssY - v.offsetY) / v.scale;

  const x = Math.floor(px / TILE_SIZE);
  const y = Math.floor(py / TILE_SIZE);
  if (x < 0 || y < 0 || x >= state.gridW || y >= state.gridH) return null;
  return { x, y, tileIdx: idx(x, y, state.gridW) };
}

function formatTileTooltip(tile: Tile): string {
  if (tile.base.kind === "empty") {
    return tile.decorLevel > 0 ? `Empty lot · Décor L${tile.decorLevel}` : "Empty lot";
  }
  if (tile.base.kind === "cocoa") {
    return tile.decorLevel > 0 ? `Cocoa stand · Décor L${tile.decorLevel}` : "Cocoa stand";
  }
  const def = SPECIES[tile.base.speciesId];
  const ratio = clamp(tile.base.ageWeeks / def.maturityWeeks, 0, 1);
  const maturity = Math.round(ratio * 100);
  const base = `${def.label} · ${maturity}% · ${tile.base.treesRemaining} trees`;
  return tile.decorLevel > 0 ? `${base} · Décor L${tile.decorLevel}` : base;
}

function hideCanvasTooltip(): void {
  canvasTooltipEl.style.display = "none";
  canvasTooltipEl.textContent = "";
}

function showCanvasTooltip(text: string, clientX: number, clientY: number): void {
  canvasTooltipEl.textContent = text;
  canvasTooltipEl.style.display = "block";
  const offsetX = 14;
  const offsetY = 16;
  canvasTooltipEl.style.left = `${clientX + offsetX}px`;
  canvasTooltipEl.style.top = `${clientY + offsetY}px`;
}

canvas.addEventListener("click", (e) => {
  const hit = getTileCoordFromMouseEvent(e);
  if (!hit) return;
  selectTileAt(hit.x, hit.y);
  render();
});

canvas.addEventListener("mousemove", (e) => {
  const hit = getTileCoordFromMouseEvent(e);
  if (!hit) {
    if (hoveredTileIdx !== null) {
      hoveredTileIdx = null;
      render();
    }
    hideCanvasTooltip();
    return;
  }

  const nextHover = hit.tileIdx;
  if (hoveredTileIdx !== nextHover) {
    hoveredTileIdx = nextHover;
    render();
  }

  const tile = state.tiles[nextHover];
  if (!tile) return;
  showCanvasTooltip(formatTileTooltip(tile), e.clientX, e.clientY);
});

canvas.addEventListener("mouseleave", () => {
  if (hoveredTileIdx !== null) {
    hoveredTileIdx = null;
    render();
  }
  hideCanvasTooltip();
});

// ============================================================================
// Game Loop (Tick System)
// ============================================================================

let lastTime = performance.now();

function updateWeekProgressUi(): void {
  const msPerWeek = MS_PER_WEEK_AT_1X / state.speed;
  const progress01 = clamp(accMs / msPerWeek, 0, 1);
  weekProgressFillEl.style.transform = `scaleX(${progress01})`;
  weekProgressBarEl.classList.toggle("isPaused", !state.running);
  weekProgressBarEl.setAttribute("aria-valuenow", `${Math.round(progress01 * 100)}`);
}

function gameLoop(now: number): void {
  const dt = now - lastTime;
  lastTime = now;

  if (state.running) {
    accMs += dt;
    const msPerWeek = MS_PER_WEEK_AT_1X / state.speed;

    let ticked = false;
    while (accMs >= msPerWeek) {
      accMs -= msPerWeek;
      const report = tickWeek(state);
      if ((report.rentPaid ?? 0) > 0) showReceipt(`Rent paid (-$${report.rentPaid})`);
      ticked = true;
    }

    if (ticked) render();
  }

  updateWeekProgressUi();
  requestAnimationFrame(gameLoop);
}

// #region agent log
fetch("http://127.0.0.1:7242/ingest/b9508947-ae5c-4f6f-82d7-7b0f031dd08b", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    sessionId: "debug-session",
    runId: "pre-fix",
    hypothesisId: "H3",
    location: "src/main.ts:startup",
    message: "startup before first render()",
    data: { hasApp: Boolean(document.querySelector("#app")), hasCanvas: Boolean(document.querySelector("canvas")) },
    timestamp: Date.now(),
  }),
}).catch(() => {});
// #endregion agent log

render();
requestAnimationFrame(gameLoop);


