// -- WEATHER ALERTS (threshold notifications) --
//
// A small, self-contained rules engine on top of the forecast that is already
// loaded for the selected location — so it costs zero extra API calls.
//
//   "tell me when temperature drops below 5°"
//   "tell me when rain chance tops 70%"
//   "tell me when wind speed rises above 50 km/h"
//   "tell me when air quality goes above 100 AQI"
//
// Rules are persisted in localStorage and (when the user is signed in) pushed
// through the app's existing saveUserDataToCloud() path so they follow the
// account across devices. Both halves of that are real as of this change:
// app.js now writes `alertRules` into the Firestore document and hydrates them
// back on sign-in.
//
// Design notes:
//   * Evaluation is *pull* based: it runs whenever a fresh forecast lands
//     (see evaluateWeatherAlerts, wired into updateWeatherDisplay in init()),
//     never on a timer, so an idle tab does no work.
//   * A per-rule cooldown stops a persistently-true condition from spamming
//     the user every time they pan the map.
//   * The pure helpers (evaluateRule / describeRule / severityFor /
//     alertMessage / normalizeRules) are exported so they can be unit-tested
//     without a DOM or the WeatherService global.

const STORAGE_KEY = "aurafisky_alert_rules";
const FIRED_KEY = "aurafisky_alert_fired";
const COOLDOWN_MS = 60 * 60 * 1000; // at most one notification per rule per hour

/** Metadata driving both the UI form and message formatting. */
export const ALERT_TYPES = {
  temperature: { label: "Temperature", unit: "°", min: -60, max: 60, step: 1, icon: "🌡️" },
  precipProb: { label: "Rain chance", unit: "%", min: 0, max: 100, step: 5, icon: "🌧️" },
  windSpeed: { label: "Wind speed", unit: " km/h", min: 0, max: 250, step: 5, icon: "💨" },
  aqi: { label: "Air quality", unit: " AQI", min: 0, max: 500, step: 5, icon: "🫁" },
};

export const ALERT_CONDITIONS = {
  above: "rises above",
  below: "drops below",
};

/**
 * Evaluate a single rule against a context of current metric values.
 * Missing / non-numeric metrics never fire (avoids false positives when e.g.
 * air-quality data is unavailable).
 *
 * @param {{type:string,condition:string,value:number,enabled?:boolean}} rule
 * @param {Record<string, number|null|undefined>} ctx
 * @returns {boolean}
 */
export function evaluateRule(rule, ctx) {
  if (!rule || rule.enabled === false) return false;
  if (!ALERT_TYPES[rule.type]) return false;
  const value = ctx ? ctx[rule.type] : null;
  if (value == null || typeof value !== "number" || Number.isNaN(value)) return false;
  if (rule.condition === "above") return value >= rule.value;
  if (rule.condition === "below") return value <= rule.value;
  return false;
}

/** Human-readable one-liner describing what a rule watches for. */
export function describeRule(rule) {
  const meta = ALERT_TYPES[rule?.type];
  if (!meta) return "Unknown alert";
  const dir = ALERT_CONDITIONS[rule.condition] || "changes to";
  return `${meta.label} ${dir} ${rule.value}${meta.unit}`;
}

/** Map a rule's threshold to a toast severity. */
export function severityFor(rule) {
  if (!rule) return "info";
  if (rule.type === "temperature") {
    if (rule.condition === "above" && rule.value >= 40) return "error";
    if (rule.condition === "below" && rule.value <= -10) return "error";
    if (rule.condition === "above" && rule.value >= 35) return "warning";
    if (rule.condition === "below" && rule.value <= 0) return "warning";
  }
  if (rule.type === "windSpeed" && rule.condition === "above") {
    if (rule.value >= 80) return "error";
    if (rule.value >= 50) return "warning";
  }
  if (rule.type === "aqi" && rule.condition === "above") {
    if (rule.value >= 200) return "error";
    if (rule.value >= 100) return "warning";
  }
  if (rule.type === "precipProb" && rule.condition === "above" && rule.value >= 80) {
    return "warning";
  }
  return "info";
}

/** Build the notification body for a fired rule. */
export function alertMessage(rule, placeName) {
  const meta = ALERT_TYPES[rule?.type];
  if (!meta) return "Weather alert";
  const where = placeName ? `${placeName}: ` : "";
  const verb = rule.condition === "above" ? "is above" : "is below";
  return `${where}${meta.label} ${verb} ${rule.value}${meta.unit}`;
}

function makeId() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch (e) {
    /* fall through */
  }
  return `alert_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Sanitise an arbitrary parsed value into a list of well-formed rules.
 * Guards against corrupt localStorage payloads.
 */
export function normalizeRules(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const meta = ALERT_TYPES[r.type];
    if (!meta) continue;
    const value = Number(r.value);
    if (!Number.isFinite(value)) continue;
    const condition = r.condition === "below" ? "below" : "above";
    out.push({
      id: typeof r.id === "string" && r.id ? r.id : makeId(),
      type: r.type,
      condition,
      value,
      enabled: r.enabled !== false,
    });
  }
  return out;
}

// ────────────────── module state ──────────────────

/** Live reference to the app instance; set by init(). */
let appRef = null;

// ────────────────── persistence ──────────────────

function loadAlertRules() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return normalizeRules(raw ? JSON.parse(raw) : []);
  } catch (e) {
    console.warn("Failed to load alert rules:", e);
    return [];
  }
}

function loadFiredMap() {
  try {
    const raw = localStorage.getItem(FIRED_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (e) {
    return {};
  }
}

function persistAlertRules(app) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(app.alertRules || []));
    localStorage.setItem(FIRED_KEY, JSON.stringify(app._alertFired || {}));
  } catch (e) {
    /* storage full / unavailable — non-fatal */
  }
  // Best-effort cloud sync so rules follow the account.
  if (typeof app.saveUserDataToCloud === "function") {
    try {
      app.saveUserDataToCloud();
    } catch (e) {
      /* ignore */
    }
  }
}

// ────────────────── evaluation ──────────────────

/** Snapshot the current metric values from the already-loaded forecast. */
function buildAlertContext(app) {
  const data = app.weatherData;
  if (!data || !globalThis.WeatherService) return null;
  const idx =
    typeof app.currentHourIndex === "number"
      ? app.currentHourIndex
      : globalThis.WeatherService.getCurrentHourIndex(data, data?.utc_offset_seconds || 0);
  const w = globalThis.WeatherService.getHourlyAtIndex(data, idx);
  if (!w) return null;
  const aqiRaw = app.airQualityData?.hourly?.us_aqi?.[idx];
  return {
    temperature: typeof w.temperature === "number" ? w.temperature : null,
    precipProb: typeof w.precipProb === "number" ? w.precipProb : null,
    windSpeed: typeof w.windSpeed === "number" ? w.windSpeed : null,
    aqi: typeof aqiRaw === "number" ? aqiRaw : null,
  };
}

/**
 * Evaluate every enabled rule against the current forecast and fire any that
 * trip (respecting the per-rule cooldown). Returns the rules that fired.
 */
function evaluateWeatherAlerts() {
  const app = this;
  const rules = app.alertRules || [];
  if (!rules.length) return [];
  const ctx = buildAlertContext(app);
  if (!ctx) return [];

  const fired = [];
  const now = Date.now();
  app._alertFired = app._alertFired || {};

  for (const rule of rules) {
    if (!evaluateRule(rule, ctx)) continue;
    const last = app._alertFired[rule.id] || 0;
    if (now - last < COOLDOWN_MS) continue;

    app._alertFired[rule.id] = now;
    const message = alertMessage(rule, app.selectedName);
    const severity = severityFor(rule);

    app.showToast(`🔔 ${message}`, severity, 7000);
    sendAlertNotification(message, rule);
    fired.push(rule);
  }

  if (fired.length) persistAlertRules(app);
  return fired;
}

/** Fire a native OS notification when permission has been granted. */
function sendAlertNotification(message, rule) {
  try {
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;
    new Notification("Aurafisky Alert", {
      body: message,
      tag: `aurafisky-alert-${rule.id}`,
      icon: "/icon-192.png",
    });
  } catch (e) {
    /* notifications unsupported in this context */
  }
}

async function requestAlertPermission() {
  const app = this;
  try {
    if (typeof Notification === "undefined") {
      app.showToast("Notifications are not supported here.", "error");
      return false;
    }
    if (Notification.permission === "granted") return true;
    const perm = await Notification.requestPermission();
    if (perm === "granted") {
      app.showToast("Alerts enabled — you'll be notified when rules trip.", "success");
      return true;
    }
    app.showToast("Notification permission denied.", "error");
    return false;
  } catch (e) {
    return false;
  }
}

// ────────────────── CRUD ──────────────────

function addAlertRule(type, condition, value) {
  const app = this;
  const meta = ALERT_TYPES[type];
  if (!meta) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) {
    app.showToast("Enter a valid number for the alert threshold.", "error");
    return null;
  }
  const clamped = Math.min(meta.max, Math.max(meta.min, num));
  const rule = { id: makeId(), type, condition, value: clamped, enabled: true };
  app.alertRules = [...(app.alertRules || []), rule];
  persistAlertRules(app);
  renderAlertsPanel(app);
  app.showToast(`Alert added: ${describeRule(rule)}`, "success");
  // Evaluate immediately so an already-true condition notifies right away.
  evaluateWeatherAlerts.call(app);
  return rule;
}

function removeAlertRule(id) {
  const app = this;
  app.alertRules = (app.alertRules || []).filter((r) => r.id !== id);
  if (app._alertFired) delete app._alertFired[id];
  persistAlertRules(app);
  renderAlertsPanel(app);
}

function toggleAlertRule(id) {
  const app = this;
  const rule = (app.alertRules || []).find((r) => r.id === id);
  if (!rule) return;
  rule.enabled = !rule.enabled;
  persistAlertRules(app);
  renderAlertsPanel(app);
}

// ────────────────── UI ──────────────────

const PANEL_ID = "alertsPanel";

function styleEl(el, styles) {
  Object.assign(el.style, styles);
  return el;
}

function selectStyle() {
  return {
    width: "100%",
    padding: "9px 10px",
    borderRadius: "10px",
    border: "1px solid rgba(148,163,184,.5)",
    background: "#f8fafc",
    color: "#0f172a",
    fontSize: "14px",
    fontFamily: "inherit",
    boxSizing: "border-box",
  };
}

function primaryButtonStyle() {
  return {
    width: "100%",
    padding: "10px",
    borderRadius: "10px",
    border: "none",
    background: "#14b8a6",
    color: "#ffffff",
    fontWeight: "700",
    fontSize: "14px",
    cursor: "pointer",
    fontFamily: "inherit",
  };
}

function secondaryButtonStyle() {
  return {
    width: "100%",
    padding: "9px",
    borderRadius: "10px",
    border: "1px solid rgba(20,184,166,.4)",
    background: "#f0fdfa",
    color: "#0f766e",
    fontWeight: "600",
    fontSize: "13px",
    cursor: "pointer",
    fontFamily: "inherit",
  };
}

/** Lazily create the alerts modal shell (inline styles → no CSS/Tailwind dependency). */
function ensureAlertsUI() {
  if (document.getElementById(PANEL_ID)) return;

  const overlay = document.createElement("div");
  overlay.id = PANEL_ID;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "alertsPanelTitle");
  styleEl(overlay, {
    position: "fixed",
    inset: "0",
    zIndex: "1600",
    display: "none",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0,0,0,0.45)",
    backdropFilter: "blur(3px)",
    padding: "16px",
  });
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay && appRef) toggleAlertsPanel.call(appRef, false);
  });

  const card = document.createElement("div");
  styleEl(card, {
    width: "100%",
    maxWidth: "420px",
    maxHeight: "80vh",
    overflowY: "auto",
    borderRadius: "16px",
    background: "#ffffff",
    color: "#0f172a",
    boxShadow: "0 24px 48px rgba(0,0,0,.25)",
    border: "1px solid rgba(148,163,184,.25)",
    fontFamily: "inherit",
  });

  const header = document.createElement("div");
  styleEl(header, {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 16px",
    borderBottom: "1px solid rgba(148,163,184,.25)",
  });
  const title = document.createElement("h3");
  title.id = "alertsPanelTitle";
  title.textContent = "🔔 Weather Alerts";
  styleEl(title, { margin: "0", fontSize: "16px", fontWeight: "700" });
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "Close alerts panel");
  closeBtn.textContent = "✕";
  styleEl(closeBtn, {
    border: "none",
    background: "transparent",
    fontSize: "18px",
    cursor: "pointer",
    color: "#64748b",
    lineHeight: "1",
    padding: "4px",
    fontFamily: "inherit",
  });
  closeBtn.addEventListener("click", () => {
    if (appRef) toggleAlertsPanel.call(appRef, false);
  });
  header.append(title, closeBtn);

  const body = document.createElement("div");
  body.style.padding = "16px";

  // ── form ──
  const form = document.createElement("div");
  styleEl(form, { display: "grid", gap: "8px", marginBottom: "14px" });

  const typeSel = document.createElement("select");
  typeSel.id = "alertTypeSelect";
  for (const [key, meta] of Object.entries(ALERT_TYPES)) {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = `${meta.icon} ${meta.label}`;
    typeSel.appendChild(opt);
  }
  styleEl(typeSel, selectStyle());

  const condSel = document.createElement("select");
  condSel.id = "alertConditionSelect";
  for (const [key, label] of Object.entries(ALERT_CONDITIONS)) {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = label;
    condSel.appendChild(opt);
  }
  styleEl(condSel, selectStyle());

  const valueInput = document.createElement("input");
  valueInput.id = "alertValueInput";
  valueInput.type = "number";
  valueInput.value = "30";
  styleEl(valueInput, selectStyle());

  const syncValueInput = () => {
    const meta = ALERT_TYPES[typeSel.value];
    if (!meta) return;
    valueInput.min = String(meta.min);
    valueInput.max = String(meta.max);
    valueInput.step = String(meta.step);
    valueInput.setAttribute(
      "aria-label",
      `${meta.label} threshold in ${meta.unit.trim()}`,
    );
    valueInput.placeholder = `${meta.min} … ${meta.max}${meta.unit}`;
  };
  typeSel.addEventListener("change", syncValueInput);
  syncValueInput();

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.textContent = "+ Add alert";
  styleEl(addBtn, primaryButtonStyle());
  addBtn.addEventListener("click", () => {
    if (!appRef) return;
    addAlertRule.call(appRef, typeSel.value, condSel.value, valueInput.value);
  });

  form.append(typeSel, condSel, valueInput, addBtn);

  // ── permission row ──
  const permRow = document.createElement("div");
  styleEl(permRow, { marginBottom: "14px" });
  const permBtn = document.createElement("button");
  permBtn.type = "button";
  permBtn.textContent = "🔕 Enable device notifications";
  styleEl(permBtn, secondaryButtonStyle());
  permBtn.addEventListener("click", () => {
    if (appRef) requestAlertPermission.call(appRef);
  });
  permRow.appendChild(permBtn);

  // ── rule list ──
  const list = document.createElement("div");
  list.id = "alertsRuleList";

  body.append(form, permRow, list);
  card.append(header, body);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
}

function renderAlertsPanel(app) {
  ensureAlertsUI();
  const list = document.getElementById("alertsRuleList");
  if (!list) return;
  list.textContent = "";

  const rules = app.alertRules || [];
  if (!rules.length) {
    const empty = document.createElement("p");
    empty.textContent =
      'No alerts yet. Add one above — e.g. “Temperature drops below 5°” — and you’ll be notified when it trips for the location you’re viewing.';
    styleEl(empty, { fontSize: "13px", color: "#64748b", lineHeight: "1.5", margin: "0" });
    list.appendChild(empty);
    return;
  }

  for (const rule of rules) {
    const meta = ALERT_TYPES[rule.type] || { icon: "•", unit: "" };
    const row = document.createElement("div");
    styleEl(row, {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "8px",
      padding: "10px",
      borderRadius: "10px",
      background: "#f8fafc",
      border: "1px solid rgba(148,163,184,.3)",
      marginBottom: "8px",
      opacity: rule.enabled ? "1" : ".55",
    });

    const label = document.createElement("span");
    label.textContent = `${meta.icon} ${describeRule(rule)}`;
    styleEl(label, { fontSize: "13px", fontWeight: "600", flex: "1", minWidth: "0" });

    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.textContent = rule.enabled ? "On" : "Off";
    toggleBtn.title = rule.enabled ? "Disable alert" : "Enable alert";
    styleEl(toggleBtn, {
      border: "none",
      borderRadius: "8px",
      padding: "5px 9px",
      fontSize: "11px",
      fontWeight: "700",
      cursor: "pointer",
      background: rule.enabled ? "#ccfbf1" : "#e2e8f0",
      color: rule.enabled ? "#0f766e" : "#475569",
      fontFamily: "inherit",
    });
    toggleBtn.addEventListener("click", () => toggleAlertRule.call(appRef, rule.id));

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.textContent = "🗑";
    delBtn.title = "Delete alert";
    delBtn.setAttribute("aria-label", `Delete alert ${describeRule(rule)}`);
    styleEl(delBtn, {
      border: "none",
      background: "transparent",
      cursor: "pointer",
      fontSize: "14px",
      padding: "4px",
      color: "#ef4444",
      fontFamily: "inherit",
    });
    delBtn.addEventListener("click", () => removeAlertRule.call(appRef, rule.id));

    row.append(label, toggleBtn, delBtn);
    list.appendChild(row);
  }
}

function toggleAlertsPanel(force) {
  ensureAlertsUI();
  const overlay = document.getElementById(PANEL_ID);
  if (!overlay) return;
  const isOpen = overlay.style.display !== "none";
  const open = typeof force === "boolean" ? force : !isOpen;
  overlay.style.display = open ? "flex" : "none";
}

/** Inject the bell button into the weather panel header next to Share. */
function installAlertsButton(app) {
  if (!app.$ || !app.$.shareWeatherBtn) return;
  if (document.getElementById("alertsToggleBtn")) return;

  const btn = document.createElement("button");
  btn.id = "alertsToggleBtn";
  btn.type = "button";
  btn.title = "Weather alerts";
  btn.setAttribute("aria-label", "Open weather alerts");
  // Reuse the header-button styling so it sits flush with its siblings.
  btn.className = app.$.shareWeatherBtn.className;
  btn.innerHTML =
    '<svg class="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
    '<path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>';
  btn.addEventListener("click", () => toggleAlertsPanel.call(app));

  app.$.shareWeatherBtn.parentNode.insertBefore(btn, app.$.shareWeatherBtn);
}

export function init(app) {
  appRef = app;

  // Public API on the app instance.
  app.evaluateWeatherAlerts = evaluateWeatherAlerts;
  app.addAlertRule = addAlertRule;
  app.removeAlertRule = removeAlertRule;
  app.toggleAlertRule = toggleAlertRule;
  app.toggleAlertsPanel = toggleAlertsPanel;
  app.requestAlertPermission = requestAlertPermission;
  // Exposed so app.js can hydrate rules arriving from Firestore, and so the
  // same validation runs on the local and cloud paths.
  app.persistAlertRules = function () {
    persistAlertRules(this);
  };
  app.renderAlertsPanel = function () {
    renderAlertsPanel(this);
  };
  app.normalizeAlertRules = normalizeRules;

  // Load persisted rules + cooldown bookkeeping.
  app.alertRules = loadAlertRules();
  app._alertFired = loadFiredMap();

  installAlertsButton(app);

  // Re-evaluate whenever a fresh forecast is rendered. Wrapping rather than
  // editing updateWeatherDisplay keeps this feature fully additive.
  const originalUpdate =
    typeof app.updateWeatherDisplay === "function" ? app.updateWeatherDisplay : null;
  if (originalUpdate && !originalUpdate.__alertsWrapped) {
    const wrapped = function (...args) {
      const result = originalUpdate.apply(this, args);
      try {
        this.evaluateWeatherAlerts();
      } catch (e) {
        console.warn("Alert evaluation failed:", e);
      }
      return result;
    };
    wrapped.__alertsWrapped = true;
    app.updateWeatherDisplay = wrapped;
  }

  // If a forecast is already on screen (unlikely at construction time), check now.
  try {
    app.evaluateWeatherAlerts();
  } catch (e) {
    /* ignore */
  }
}
