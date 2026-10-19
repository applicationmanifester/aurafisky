// features/aura.js
// ── Aura ─ the Aurafisky assistant ──────────────────────────────────
//
// Aura turns a free-text question into a structured answer built entirely from
// the Open-Meteo data already loaded on `app`, and can trigger real app
// actions (radar layers, alert rules, timeline jumps, bookmarks, geocoding).
//
// Two deliberate constraints:
//   1. It makes no network calls of its own. Everything it says comes from app
//      state, so it can never invent a forecast, and it works offline once the
//      forecast is cached.
//   2. Every action maps onto a method the app already exposes. If a method is
//      missing at runtime the action is a no-op with a toast — never a crash.
//
// Answers are built as structured data ({ icon, title, bullets, note, actions,
// followups }) rather than HTML strings, so all text is escaped at render time.

export function init(app) {
  const assistant = new AuraAssistant(app);
  app.aura = assistant;
  return assistant;
}

// ── Escaping ────────────────────────────────────────────────────────
const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC_MAP[c]);

/** WeatherService is published on globalThis by weather.js; guard for tests/SSR. */
const ws = () => (typeof WeatherService !== 'undefined' ? WeatherService : globalThis.WeatherService || null);

// ── Intent vocabulary ───────────────────────────────────────────────
//
// `priority` only breaks ties between intents that score equally; higher wins.
// Multi-word phrases score 3, single words score 2 — so "best outdoor window"
// (3) beats a stray "outdoor" (2), and "show the radar" beats "radar".
const INTENT_DEFS = [
  { id: 'help', priority: 90, phrases: ['what can you do', 'what do you do', 'help', 'help me', 'capabilities', 'commands', 'who are you', 'how do you work', 'what do i ask'] },
  { id: 'place', priority: 88, phrases: ['weather in', 'weather at', 'weather for', 'forecast for', 'how is it in', "what's the weather in"] },
  { id: 'alert', priority: 86, phrases: ['notify me', 'alert me', 'remind me', 'tell me when', 'set an alert', 'warn me', 'let me know when'] },
  { id: 'compare', priority: 70, phrases: ['compare', 'versus', ' vs ', 'difference between', 'other city', 'another city'] },
  { id: 'astronomy', priority: 68, phrases: ['sunset', 'sunrise', 'sun set', 'sun rise', 'golden hour', 'blue hour', 'stargazing', 'stars', 'star gazing', 'moon', 'moonlight', 'night sky', 'photography', 'photo', 'photo shoot', 'aurora', 'meteor shower', 'twilight'] },
  { id: 'dailyBriefing', priority: 67, phrases: ['morning briefing', 'daily briefing', 'brief me', 'my briefing', "today's briefing", 'week ahead', 'day ahead'] },
  { id: 'thunderstorm', priority: 66, phrases: ['thunder', 'lightning', 'thunderstorm', 'squall', 'lightning storm'] },
  { id: 'solar', priority: 65, phrases: ['solar energy', 'solar panel', 'solar power', 'solar generation', 'photovoltaic', 'pv output', 'sun energy'] },
  { id: 'uv', priority: 64, phrases: ['uv', 'sunburn', 'burn risk', 'skin', 'sunscreen', 'wear sunscreen', 'spf', 'tan', 'shade', 'uv index'] },
  { id: 'dining', priority: 63, phrases: ['restaurant', 'restaurants', 'food', 'eat', 'eating', 'dining', 'dinner', 'lunch', 'breakfast', 'brunch', 'cafe', 'coffee', 'hungry', 'place to eat', 'eat out', 'outing', 'picnic'] },
  { id: 'clothing', priority: 62, phrases: ['what should i wear', 'what to wear', 'jacket', 'coat', 'sweater', 'hoodie', 'shorts', 't-shirt', 'wear', 'outfit', 'dress code', 'do i need a coat', 'need a jacket'] },
  { id: 'plan', priority: 61, phrases: ['plan my day', 'plan the day', 'my schedule', 'my agenda', 'itinerary', 'what should i do', 'what can i do', 'things to do', 'this weekend', 'free time', 'day plan', 'routine'] },
  { id: 'commute', priority: 60, phrases: ['commute', 'drive', 'driving', 'traffic', 'road', 'route', 'car', 'highway', 'journey', 'travel to work', 'grip', 'traction', 'braking', 'tyres', 'tires', 'motorcycle', 'scooter'] },
  { id: 'outdoor', priority: 58, phrases: ['run', 'running', 'jog', 'jogging', 'workout', 'exercise', 'fitness', 'cycle', 'cycling', 'bike', 'biking', 'hike', 'hiking', 'walk', 'walking', 'sport', 'cricket', 'football', 'yoga', 'marathon', 'outdoor window', 'park'] },
  { id: 'forecast', priority: 56, phrases: ['tomorrow', 'weekend', '7 day', 'seven day', 'weekly', 'this week', 'next week', 'outlook', 'the forecast', 'coming days', 'how many days'] },
  { id: 'layers', priority: 54, phrases: ['radar', 'overlay', 'layer', 'layers', 'isobar', 'pressure map', 'terminator', 'satellite', 'show me the map'] },
  { id: 'pollen', priority: 53, phrases: ['pollen', 'allergy', 'allergies', 'hay fever', 'sinus', 'sneezing', 'pollen count'] },
  { id: 'air', priority: 52, phrases: ['air quality', 'aqi', 'pollution', 'polluted', 'smog', 'smoke', 'breathe', 'breathing', 'lungs', 'asthma', 'air safe', 'safe to breathe', 'safe outside', 'is the air', 'air is bad'] },
  { id: 'hazard', priority: 49, phrases: ['flood', 'flooding', 'flash flood', 'cyclone', 'typhoon', 'hurricane', 'tornado', 'blizzard', 'heatwave', 'cold wave', 'extreme weather', 'hail', 'hailstorm'] },
  { id: 'visibility', priority: 48, phrases: ['visibility', 'fog', 'foggy', 'haze', 'hazy', 'mist', 'murky'] },
  { id: 'rain', priority: 46, phrases: ['rain', 'raining', 'rainy', 'shower', 'showers', 'wet', 'precipitation', 'umbrella', 'drizzle', 'monsoon', 'pour', 'pouring', 'barish', 'baarish', 'barsaat', 'paani gir'] },
  { id: 'wind', priority: 44, phrases: ['wind', 'windy', 'breeze', 'breezy', 'gale', 'storm', 'gust', 'gusts', 'hawa', 'tez hawa'] },
  { id: 'humidity', priority: 42, phrases: ['humidity', 'humid', 'sticky', 'muggy', 'damp', 'moisture', 'dew point', 'dewpoint', 'chipchipa'] },
  { id: 'temperature', priority: 40, phrases: ['temperature', 'how hot', 'how cold', 'hot', 'cold', 'warm', 'chilly', 'degrees', 'freezing', 'freeze', 'heat', 'weather like', 'feels hotter', 'feels colder', 'thand', 'garmi', 'sardi', 'kitni thand', 'kitni garmi'] },
  { id: 'packing', priority: 59, phrases: ['pack', 'packing', 'suitcase', 'travel bag', 'vacation', 'holiday', 'trip', 'weekend getaway', 'what to pack', 'packing list', 'pack for'] },
  { id: 'running', priority: 59, phrases: ['running', 'marathon', '5k', '10k', 'cardio run', 'jogging for exercise', 'running workout', 'long run', 'sprint training', 'tempo run', 'interval run', 'jog', 'jogging'] },
  { id: 'cycling', priority: 59, phrases: ['cycling', 'bike', 'biking', 'bicycle', 'road bike', 'mountain bike', 'commute by bike', 'cycle to work', 'spin class', 'ride a bike', 'cycle'] },
  { id: 'workfromhome', priority: 56, phrases: ['work from home', 'wfh', 'remote work', 'stay home from work', 'office closed', 'snow day', 'should i go to office', 'should i go into office', 'work remotely'] },
  { id: 'overview', priority: 20, phrases: ['weather now', 'right now', 'current conditions', 'conditions', 'how is the weather', "what's the weather", 'summary', 'nice out', 'is it nice', 'worth going out'] },
  { id: 'greeting', priority: 18, phrases: ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening', 'yo', 'sup', 'howdy'] },
];

import { shortPlaceName } from '../modules/geo.js';

// Pre-compile every phrase once. Single words get word boundaries so "rain"
// doesn't fire on "drain", and accept an -s/-ing suffix ("cafe" → "cafes",
// "wear" → "wearing") so plurals aren't a separate vocabulary entry. Short
// words are matched literally — inflecting "hi" into "his" causes more harm
// than it prevents.
const REGEX_SPECIAL = /[.*+?^${}()|[\]\\]/g;
const INTENTS = INTENT_DEFS.map((def) => ({
  ...def,
  matchers: def.phrases.map((phrase) => {
    const escaped = phrase.replace(REGEX_SPECIAL, '\\$&');
    if (phrase.includes(' ')) return new RegExp(escaped, 'i');
    const tail = phrase.length >= 4 ? '(s|ing)?' : '';
    return new RegExp(`\\b${escaped}${tail}\\b`, 'i');
  }),
}));

/** Scores every intent against a query and returns the winner. */
export function classify(query) {  let best = null;
  let bestScore = 0;
  for (const intent of INTENTS) {
    let score = 0;
    for (const re of intent.matchers) {
      if (re.test(query)) score += re.source.includes('\\b') ? 2 : 3;
    }
    if (score === 0) continue;
    if (score > bestScore || (score === bestScore && intent.priority > (best?.priority ?? -1))) {
      best = intent;
      bestScore = score;
    }
  }
  return best ? { id: best.id, score: bestScore } : null;
}

/** Pulls a place name out of "weather in Tokyo tomorrow". */
export function extractPlace(query) {
  const m =
    query.match(/\b(?:weather|forecast)\s+(?:in|at|for)\s+([a-zA-Z][a-zA-Z\s.'-]{1,40}?)(?=\s+(?:tomorrow|today|tonight|right\s+now|now|this\s+\w+)\b|[?!.]?$)/i) ||
    query.match(/\b(?:how(?:'s| is)|what(?:'s| is))\s+(?:it\s+)?(?:like\s+)?in\s+([a-zA-Z][a-zA-Z\s.'-]{1,40}?)(?=\s+(?:tomorrow|today|tonight|right\s+now|now)\b|[?!.]?$)/i) ||
    // Conversational follow-up: "what about Tokyo?", "how about Paris".
    // Time words are guarded below so "what about tomorrow" never becomes
    // a place called "tomorrow".
    query.match(/\b(?:what|how)\s+about\s+([a-zA-Z][a-zA-Z\s.'-]{1,40}?)[?!.]?$/i);
  if (!m) return null;
  const name = m[1].trim();
  // "what about tomorrow / tonight / the weekend" is a time follow-up,
  // not a place lookup.
  if (/^(tomorrow|today|tonight|tonite|morning|afternoon|evening|night|weekend|now|later|the\s+weekend|this\s+\w+)$/i.test(name)) return null;
  return name || null;
}

// ── Time scope ────────────────────────────────────────────────────
//
// Lets a question target part of the forecast: "will it rain tonight?",
// "how windy tomorrow?", and — combined with conversation memory — bare
// follow-ups like "and tomorrow?" that re-run the previous intent.
const TIME_WORDS = new Set([
  'tonight', 'tonite', 'tomorrow', 'morning', 'afternoon', 'evening',
  'night', 'weekend', 'today', 'saturday', 'sunday', 'sat', 'sun',
  'this', 'next',
]);
const FILLER_WORDS = new Set([
  'and', 'then', 'also', 'what', 'about', 'how', 'for', 'in', 'on',
  'at', 'the', 'a', 'is', 'it', 'will', 'be', 'do', 'does', 's',
  'there', 'here', 'that', 'this', '?',
]);

/**
 * Detects a time scope in a query. Order matters: weekend outranks
 * tomorrow, tonight outranks evening — the most specific window wins.
 * @returns {{kind:string,label:string}|null}
 */
export function detectTimeScope(query) {
  const q = ` ${(query || '').toLowerCase()} `;
  if (/\b(this\s+weekend|weekend|on\s+sat|saturday|on\s+sun|sunday)\b/.test(q)) {
    return { kind: 'weekend', label: 'this weekend' };
  }
  if (/\btomorrow\b|\b2morrow\b|\btmrw\b/.test(q)) {
    return { kind: 'tomorrow', label: 'tomorrow' };
  }
  if (/\btonight\b|\btonite\b|\bthis\s+evening\b|\bthis\s+night\b/.test(q)) {
    return { kind: 'tonight', label: 'tonight' };
  }
  if (/\bthis\s+morning\b|\bmorning\b/.test(q)) {
    return { kind: 'morning', label: 'this morning' };
  }
  if (/\bthis\s+afternoon\b|\bafternoon\b/.test(q)) {
    return { kind: 'afternoon', label: 'this afternoon' };
  }
  if (/\bevening\b/.test(q)) {
    return { kind: 'evening', label: 'this evening' };
  }
  return null;
}

/**
 * True when a query carries nothing but a time scope plus conversational
 * filler — "and tomorrow?", "what about tonight", "tomorrow?".
 * These re-run the previous intent instead of classifying fresh.
 */
export function isBareTimeQuery(query) {
  const tokens = (query || '')
    .toLowerCase()
    .replace(/[?!.…,]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (!tokens.length) return false;
  let timeWords = 0;
  for (const t of tokens) {
    if (TIME_WORDS.has(t)) timeWords++;
    else if (!FILLER_WORDS.has(t)) return false;
  }
  return timeWords > 0;
}

// ── Precipitation type ────────────────────────────────────────────
//
// WMO codes tell rain from snow; near-freezing temperatures turn rain
// codes into a mix. Used so answers say "snow" instead of "rain" when
// the model actually shows frozen precipitation.

/**
 * @param {number|null} code - WMO weather code
 * @param {number|null} tempC - air temperature in °C
 * @returns {'snow'|'mix'|'rain'|'storm'|'none'}
 */
export function precipTypeFor(code, tempC) {
  if (code == null) return 'none';
  if (code >= 95 && code <= 99) return 'storm';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
    return tempC != null && tempC <= 1.5 ? 'mix' : 'rain';
  }
  return 'none';
}

// ── Two-city comparison ───────────────────────────────────────────
//
// "delhi vs mumbai", "compare delhi and mumbai", "difference between
// delhi and mumbai". Returns the pair in the order asked; null when the
// query doesn't name exactly two places.

const VS_SPLIT = /\s+(?:vs\.?|versus)\s+/i;
const COMPARE_PATTERNS = [
  /\bcompare\s+([a-zA-Z][a-zA-Z\s.'-]{1,40}?)\s+(?:and|with|to|&)\s+([a-zA-Z][a-zA-Z\s.'-]{1,40})$/i,
  /\b(?:difference|differences)\s+between\s+([a-zA-Z][a-zA-Z\s.'-]{1,40}?)\s+and\s+([a-zA-Z][a-zA-Z\s.'-]{1,40})$/i,
];

/**
 * @returns {{a:string,b:string}|null} two place names, or null.
 */
export function extractTwoPlaces(query) {
  const q = (query || '').trim().replace(/[?!.]+$/, '');
  if (!q) return null;

  // "X vs Y" — split on the first delimiter, keep it simple.
  const vsParts = q.split(VS_SPLIT);
  if (vsParts.length === 2) {
    const a = vsParts[0].replace(/^(?:compare|weather(?:\s+(?:in|for|at))?)\s+/i, '').trim();
    const b = vsParts[1].trim();
    if (a && b) return { a, b };
  }

  for (const re of COMPARE_PATTERNS) {
    const m = q.match(re);
    if (m) {
      const a = m[1].trim();
      const b = m[2].trim();
      if (a && b) return { a, b };
    }
  }
  return null;
}

/**
 * Builds the comparison bullets + verdict from two forecast snapshots.
 * Pure: no network, no DOM. Each snapshot is what _citySnapshot() gathers.
 *
 * @param {object} A - {name, temperature, feelsLike, description, icon, humidity, windSpeed, windGusts, windDirection, prob6h, prob24h, todayMax, todayMin, todayDesc}
 * @param {object} B - same shape
 * @returns {{bullets:Array, verdict:string, tone:string}}
 */
export function buildCompareSummary(A, B) {
  const dTemp = A.temperature - B.temperature;
  const dRain = A.prob6h - B.prob6h;
  const dWind = A.windSpeed - B.windSpeed;
  const warmer = dTemp >= 0 ? A : B;
  const cooler = dTemp >= 0 ? B : A;
  const wetter = dRain >= 0 ? A : B;
  const drier = dRain >= 0 ? B : A;
  const windier = dWind >= 0 ? A : B;

  const bullets = [
    {
      k: 'Now',
      v: `${A.icon} ${Math.round(A.temperature)}° vs ${B.icon} ${Math.round(B.temperature)}° (feels ${Math.round(A.feelsLike)}° / ${Math.round(B.feelsLike)}°)`,
    },
    {
      k: 'Conditions',
      v: `${A.description} · ${B.description}`,
    },
    {
      k: 'Rain risk (6h)',
      v: `${A.prob6h}% vs ${B.prob6h}%`,
      tone: Math.max(A.prob6h, B.prob6h) >= 50 ? 'warn' : 'good',
    },
    {
      k: 'Next 24h',
      v: `${A.prob24h}% vs ${B.prob24h}% rain · ${Math.round(A.todayMin)}–${Math.round(A.todayMax)}° vs ${Math.round(B.todayMin)}–${Math.round(B.todayMax)}°`,
    },
    {
      k: 'Wind',
      v: `${Math.round(A.windSpeed)} vs ${Math.round(B.windSpeed)} km/h`,
      tone: Math.max(A.windSpeed, B.windSpeed) >= 35 ? 'warn' : undefined,
    },
  ];

  const parts = [];
  if (Math.abs(dTemp) >= 1) {
    parts.push(`${warmer.name} is ${Math.abs(Math.round(dTemp))}° warmer`);
  }
  if (Math.abs(dRain) >= 10) {
    parts.push(`${wetter.name} is ${Math.abs(Math.round(dRain))}% wetter over the next 6h`);
  }
  if (Math.abs(dWind) >= 10) {
    parts.push(`${windier.name} is windier (${Math.abs(Math.round(dWind))} km/h more)`);
  }

  // Head-to-head recommendation: favour the drier, milder city.
  const aScore = Math.abs(A.temperature - 22) + A.prob6h * 0.5 + A.windSpeed * 0.3;
  const bScore = Math.abs(B.temperature - 22) + B.prob6h * 0.5 + B.windSpeed * 0.3;
  const pick = aScore <= bScore ? A : B;
  parts.push(`For being outside, ${pick.name} looks the better call right now`);

  const verdict = parts.join('. ') + '.';
  const tone = Math.max(A.prob6h, B.prob6h) >= 60 || Math.abs(dTemp) >= 12 ? 'warn' : 'info';

  return { bullets, verdict, tone };
}

// Intents that a bare time follow-up ("and tomorrow?") may re-run.
// Place/alert/help/greeting answers don't benefit from a time shift.
const RERUNNABLE = new Set([
  'rain', 'temperature', 'wind', 'outdoor', 'forecast', 'humidity',
  'uv', 'overview', 'commute', 'astronomy', 'thunderstorm',
]);

// ── Action registry ─────────────────────────────────────────────────
//
// Each entry is a real, already-implemented app capability. `silent` actions
// skip the confirmation toast (used when the answer already says what happened).
export const ACTIONS = {
  radar: { label: 'Show rain radar', icon: '🌧️', run: (app) => app.toggleRadar?.() },
  isobars: { label: 'Pressure map', icon: '📈', run: (app) => app.toggleIsobars?.() },
  terminator: { label: 'Day/night line', icon: '🌗', run: (app) => app.toggleDayNightTerminator?.() },
  extremes: { label: 'Climate extremes', icon: '📊', run: (app) => app.openExtremesPanel?.() },
  timeMachine: { label: 'Time machine', icon: '⏳', run: (app) => app.toggleClimateTimeMachine?.() },
  nextRain: { label: 'Jump to rain hour', icon: '⏭️', run: (app) => app.jumpToNextRain?.() },
  alertsPanel: { label: 'Manage alerts', icon: '🔔', run: (app) => app.toggleAlertsPanel?.() },
  briefing: { label: 'Generate briefing', icon: '📝', run: (app) => app.generateBriefing?.() },
  panel: { label: 'Open panel', icon: '📋', run: (app, _p, self) => { app.showWeatherPanel?.(); self?._wakeSheet?.(); } },
  compareHome: { label: 'Compare with home', icon: '🏠', run: (app) => app.compareWeatherWithActive?.(app.defaultLocation) },
  alert: {
    label: 'Create alert',
    icon: '🔔',
    run: (app, p) => {
      if (typeof app.addAlertRule !== 'function') {
        app.showToast?.('Alerts are not ready yet.', 'error');
        return;
      }
      app.addAlertRule(p.type, p.condition, p.value);
    },
  },
  save: {
    label: 'Save this place',
    icon: '⭐',
    run: (app, _p, self) => self?._saveCurrentPlace?.(),
  },
  rainPush: {
    label: 'Notify me before rain',
    icon: '☔',
    run: (app) => app?.enableRainPush?.(),
  },
  goPlace: {
    label: 'Open place',
    icon: '📍',
    silent: true,
    run: (app, p) => {
      if (p?.lat != null && p?.lng != null) {
        app.selectLocation?.(p.lat, p.lng, p.name || `${p.lat}, ${p.lng}`);
      } else if (p?.q) {
        app.performSearch?.(p.q);
      }
    },
  },
  search: { label: 'Search the map', icon: '🔎', run: (app, p) => app.performSearch?.(p.q) },
  tab: { label: 'Open tab', icon: '📑', silent: true, run: (app, p, self) => { app.switchWeatherTab?.(p.tab); self?._wakeSheet?.(); } },
  shareWeather: {
    label: 'Share this weather',
    icon: '📤',
    silent: true,
    run: (app) => {
      const loc = app?.selectedName || 'this location';
      const temp = app?.currentWeather?.temperature ?? 0;
      const desc = app?.currentWeather?.description || '';
      const text = `Weather in ${loc}: ${desc}, ${Math.round(temp)}°C via Aurafisky`;
      if (typeof navigator?.share === 'function') {
        navigator.share({ title: `Weather in ${loc}`, text, url: window.location.href }).catch(() => {});
      } else {
        app.showToast?.('Share not supported on this device.', 'info');
      }
    },
  },
  exportBriefing: {
    label: 'Export briefing',
    icon: '💾',
    silent: true,
    run: (app) => {
      if (typeof URL?.createObjectURL !== 'function' || typeof document?.createElement !== 'function') {
        app.showToast?.('Export not supported on this device.', 'info');
        return;
      }
      const loc = app?.selectedName || 'this location';
      const weather = app?.currentWeather;
      const aqi = app?.currentAqi;
      const briefing = [
        `Aurafisky Weather Briefing — ${loc}`,
        `Generated: ${new Date().toLocaleString()}`,
        ``,
        `Current: ${weather?.description ?? 'N/A'}, ${Math.round(weather?.temperature ?? 0)}°C (feels like ${Math.round(weather?.feelsLike ?? weather?.temperature ?? 0)}°C)`,
        `Humidity: ${weather?.humidity ?? '--'}%`,
        `Wind: ${app?.WeatherService?.formatWind?.(weather?.windSpeed ?? 0) ?? 'N/A'}`,
        `Pressure: ${weather?.pressure ?? '--'} hPa`,
        `UV Index: ${weather?.uvIndex ?? '--'}`,
        `Air Quality: ${aqi != null ? `US AQI ${aqi}` : 'Not available'}`,
        ``,
        `Rain chance (6h): ${app?.currentWeather?.precipitation_probability ?? '--'}%`,
        ``,
        `Shared from Aurafisky — ${window.location.href}`,
      ].join('\n');
      const blob = new Blob([briefing], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `aurafisky-briefing-${loc.replace(/\s+/g, '_')}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      app.showToast?.('Briefing exported as text file.', 'success');
    },
  },
};

export class AuraAssistant {
  constructor(app) {
    this.app = app;
    this.isOpen = false;
    this._streamToken = 0;
    this._lastLocation = '';
    // Conversation memory: the last answerable intent, so bare follow-ups
    // like "and tomorrow?" re-run it instead of classifying fresh.
    this._lastIntent = null;

    if (typeof document !== 'undefined') {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this.setup());
      } else {
        this.setup();
      }
    }
  }

  setup() {
    this._els = {
      modal: document.getElementById('auraModal'),
      chat: document.getElementById('auraChat'),
      input: document.getElementById('auraInput'),
      send: document.getElementById('auraSendBtn'),
      mic: document.getElementById('auraMicBtn'),
      close: document.getElementById('auraCloseBtn'),
      reset: document.getElementById('auraResetBtn'),
      presets: document.getElementById('auraPresets'),
    };

    if (!this._els.modal || !this._els.chat) return;

    // ── Launch points ──────────────────────────────────────────────
    [document.getElementById('auraBannerCard'), document.getElementById('auraPromptChip')]
      .forEach((el) => el?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.open();
      }));

    // The toolbar chip is handled by the quick-chip delegate in
    // googleMapsMobile.js so it keeps its active-state styling.
    this._els.close?.addEventListener('click', () => this.close());
    this._els.reset?.addEventListener('click', () => this.reset());

    // Clicking the dimmed backdrop (but not the panel) dismisses.
    this._els.modal.addEventListener('click', (e) => {
      if (e.target === this._els.modal) this.close();
    });

    // Escape closes even while the input has focus — the global shortcut
    // handler bails out for INPUT targets, so it can't cover this case.
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        e.stopPropagation();
        this.close();
        return;
      }
      this._trapFocus(e);
    });

    // Preset chips are delegated: they are re-rendered as context changes.
    this._els.presets?.addEventListener('click', (e) => {
      const chip = e.target.closest('.aura-preset-chip');
      if (!chip) return;
      this.ask(chip.textContent.trim());
    });

    this._els.send?.addEventListener('click', () => this._submit());
    this._els.input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this._submit();
      }
    });
    this._setupVoice();

    // Chat history is a live region so screen readers announce new answers.
    this._els.chat?.setAttribute('aria-live', 'polite');

    this._watchLocation();
    // Restore the previous conversation for this location, if any. Falls
    // back to a fresh greeting when there is no memory or it is stale.
    if (!this._restoreMemory()) {
      if (this._chatIsEmpty()) this._greeting();
    }
    this._renderPresets();
  }

  /**
   * Starts a fresh transcript when the map target changes. Answers about
   * the previous city stay technically true but practically misleading —
   * "rain in 2h" for a place you're no longer looking at — so the old
   * conversation is dropped rather than left sitting above the new location.
   */
  _watchLocation() {
    const nameEl = document.getElementById('panelLocationName');
    if (!nameEl) return;
    const observer = new MutationObserver(() => {
      const name = nameEl.textContent?.replace(/🏠\s*Home/g, '')?.trim();
      if (!name || name === this._lastLocation || name === 'Select location') return;
      this._lastLocation = name;
      if (this._chatIsEmpty()) {
        this._renderPresets();
        return;
      }
      this._streamToken++; // abandon any answer still streaming
      const { chat } = this._els;
      chat.innerHTML = '';
      this._lastIntent = null; // new place, new thread
      this._greeting();
      this._systemNote(`Switched to ${name} — cleared the answers for the previous location.`);
      this._renderPresets();
    });
    observer.observe(nameEl, { childList: true, characterData: true, subtree: true });
    this._lastLocation = nameEl.textContent?.trim() || '';
  }

  // ── Modal lifecycle ───────────────────────────────────────────────

  open() {
    const { modal, input } = this._els;
    if (!modal) return;
    this.isOpen = true;
    modal.classList.remove('hidden');
    // Restart the entry animation on every open.
    const panel = modal.firstElementChild;
    if (panel) {
      panel.classList.remove('animate-in');
      void panel.offsetWidth;
      panel.classList.add('animate-in');
    }
    // Restore a saved conversation when the chat is empty — this is the
    // path that runs on a fresh page load, after construction has already
    // rendered the greeting (or nothing) and the user has actual memory.
    if (this._chatIsEmpty()) {
      if (!this._restoreMemory()) {
        if (this._chatIsEmpty()) this._greeting();
      }
    }
    this._renderPresets();
    // Focus trap: move focus into the modal and remember where it was so
    // close() can restore it. This is the single most important a11y
    // improvement for keyboard and TV-remote users.
    this._previousFocus = document.activeElement;
    if (window.matchMedia?.('(pointer: fine)')?.matches) input?.focus();
    else {
      // On touch devices, focus the first focusable inside the modal so
      // screen readers announce the dialog.
      const first = modal.querySelector('button, input, [tabindex]:not([tabindex="-1"])');
      first?.focus();
    }
  }

  _trapFocus(e) {
    const modal = this._els.modal;
    if (!modal || !this.isOpen) return;
    if (e.key !== 'Tab') return;
    const focusable = modal.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  close() {
    if (!this._els.modal) return;
    this.isOpen = false;
    this._streamToken++; // cancel any in-flight answer
    this._saveMemory();
    this._els.modal.classList.add('hidden');
    // Restore focus to wherever the user was before opening.
    if (this._previousFocus && typeof this._previousFocus.focus === 'function') {
      try { this._previousFocus.focus(); } catch { /* ignore */ }
    }
    this._previousFocus = null;
  }

  reset() {
    this._streamToken++;
    this._lastIntent = null; // fresh transcript, no thread to continue
    const { chat } = this._els;
    if (!chat) return;
    chat.innerHTML = '';
    try {
      localStorage.removeItem(this._memoryKey());
    } catch {
      /* ignore */
    }
    this._greeting();
    this._renderPresets();
    this._haptic('medium');
  }

  _chatIsEmpty() {
    return (this._els.chat?.querySelectorAll('.aura-msg').length ?? 0) <= 1;
  }

  _haptic(type = 'light') {
    if (typeof navigator === 'undefined' || !navigator.vibrate) return;
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    try {
      if (type === 'selection') navigator.vibrate(8);
      else if (type === 'medium') navigator.vibrate([15]);
      else navigator.vibrate(12);
    } catch (_) {}
  }

  _wakeSheet() {
    this.app?.auraMobile?.restoreSheet?.('full');
  }

  _submit() {
    const input = this._els.input;
    const q = input?.value.trim();
    if (!q) return;
    input.value = '';
    this.ask(q);
  }

  /**
   * Voice input via the Web Speech API. The mic button stays hidden unless
   * the browser implements recognition (Chrome/Edge desktop + Android).
   * Everything is guarded: no support, no permission, or no speech all
   * degrade to the keyboard with no toast spam.
   */
  _setupVoice() {
    const btn = this._els.mic;
    const input = this._els.input;
    if (!btn || !input) return;
    let SR = null;
    try {
      SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
    } catch { SR = null; }
    if (!SR) return; // unsupported — button stays hidden
    // `hidden` + `items-center` conflict: drop hidden, keep flex layout.
    btn.classList.remove('hidden');
    btn.classList.add('flex');

    let rec = null;
    let listening = false;
    const setLive = (on) => {
      listening = on;
      btn.classList.toggle('animate-pulse', on);
      btn.classList.toggle('text-teal-600', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.setAttribute('aria-label', on ? 'Stop listening' : 'Ask Aura by voice');
    };

    btn.addEventListener('click', () => {
      if (listening) {
        try { rec?.stop(); } catch { /* already stopped */ }
        return;
      }
      try {
        rec = new SR();
      } catch { return; }
      rec.lang = (navigator.language || 'en-US');
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      rec.onresult = (e) => {
        let interim = '';
        let final = '';
        for (const r of e.results) {
          if (r.isFinal) final += r[0]?.transcript ?? '';
          else interim += r[0]?.transcript ?? '';
        }
        input.value = (final || interim).trim();
        if (final.trim()) {
          try { rec?.stop(); } catch { /* noop */ }
          this._submit();
        }
      };
      rec.onend = () => { setLive(false); rec = null; };
      rec.onerror = () => { setLive(false); rec = null; };
      try {
        rec.start();
        setLive(true);
      } catch { setLive(false); rec = null; }
    });
  }

  _scrollToEnd() {
    const { chat } = this._els;
    if (chat) chat.scrollTop = chat.scrollHeight;
  }

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ── Message rendering ────────────────────────────────────────────

  _greeting() {
    const loc = this._locName();
    const row = document.createElement('div');
    row.className = 'aura-msg';
    row.innerHTML = `
      <div class="aura-avatar" aria-hidden="true">✨</div>
      <div class="aura-col">
        <div class="aura-bubble">
          <p>Hi, I'm <strong>Aura</strong>${loc ? `, reading live data for <strong>${esc(loc)}</strong>` : ''}.</p>
          <p class="mt-1">Ask me about rain timing, your commute, outdoor windows, air quality, UV, sunset and stargazing — or tell me to <em>"notify me when it rains"</em> and I'll set the alert.</p>
          <p class="mt-1">I remember the thread, so follow up with <em>"and tomorrow?"</em> or <em>"what about tonight?"</em> — in English or Hinglish (<em>barish, thand, hawa</em> all work).</p>
        </div>
      </div>`;
    this._els.chat.appendChild(row);
    this._scrollToEnd();
  }

  // ── Conversation memory ─────────────────────────────────────────
  //
  // Aura remembers the conversation across page reloads, so a user who
  // closes the tab and reopens it doesn't lose context. The memory is:
  //   * stored in localStorage only — never synced, never sent anywhere
  //   * keyed by the current location, so switching cities starts fresh
  //   * capped at 40 messages so it can't grow unbounded
  //   * cleared by the user via the reset button
  //
  // This is the "local-first, privacy-first" promise applied to the
  // assistant: your conversation stays on your device.

  _memoryKey() {
    return "aurafisky_aura_memory";
  }

  _saveMemory() {
    const { chat } = this._els;
    if (!chat) return;
    const messages = [];
    for (const row of chat.querySelectorAll(".aura-msg")) {
      const userBubble = row.querySelector(".aura-bubble-user");
      if (userBubble) {
        messages.push({ role: "user", text: userBubble.textContent || "" });
        continue;
      }
      const title = row.querySelector(".aura-title")?.textContent;
      const bullets = [...row.querySelectorAll(".aura-li")].map((li) => ({
        k: li.querySelector(".aura-k")?.textContent || "",
        v: li.querySelector(".aura-v")?.textContent || "",
        tone: li.querySelector(".aura-v")?.className?.match(/aura-v-(good|warn)/)?.[1] || "",
      }));
      const note = row.querySelector(".aura-note")?.textContent;
      const actions = [...row.querySelectorAll(".aura-action")].map((b) => ({
        id: b.dataset.auraAction,
        label: b.textContent?.trim() || "",
      }));
      const followups = [...row.querySelectorAll(".aura-followup")].map(
        (b) => b.textContent?.trim() || "",
      );
      if (title || bullets.length || note) {
        messages.push({ role: "assistant", title, bullets, note, actions, followups });
      }
    }
    try {
      localStorage.setItem(
        this._memoryKey(),
        JSON.stringify({
          location: this._locName(),
          ts: Date.now(),
          messages: messages.slice(-40),
        }),
      );
    } catch {
      /* quota exceeded — memory is best-effort */
    }
  }

  _restoreMemory() {
    const { chat } = this._els;
    if (!chat) return false;
    let data;
    try {
      data = JSON.parse(localStorage.getItem(this._memoryKey()) || "null");
    } catch {
      return false;
    }
    if (!data || !Array.isArray(data.messages) || !data.messages.length) return false;
    // Only restore if the user is still looking at the same place.
    if (data.location && data.location !== this._locName()) return false;
    // Discard stale memory (older than 24h).
    if (data.ts && Date.now() - data.ts > 24 * 3600 * 1000) {
      localStorage.removeItem(this._memoryKey());
      return false;
    }

    chat.innerHTML = "";
    for (const m of data.messages) {
      if (m.role === "user") {
        this._appendUser(m.text);
      } else {
        const reply = {
          icon: "✨",
          title: m.title,
          bullets: m.bullets || [],
          note: m.note,
          actions: (m.actions || []).map((a) => ({
            id: a.id,
            label: a.label,
            icon: "⚡",
          })),
          followups: m.followups || [],
        };
        // Render without the streaming animation — it's a restore, not a reveal.
        this._renderReplyInstant(reply);
      }
    }
    this._scrollToEnd();
    return true;
  }

  /** Synchronous, non-animated render used by memory restore. */
  _renderReplyInstant(reply) {
    const { chat } = this._els;
    if (!chat) return;
    const row = document.createElement("div");
    row.className = "aura-msg";
    row.innerHTML = `
      <div class="aura-avatar" aria-hidden="true">✨</div>
      <div class="aura-col">
        <div class="aura-bubble">
          <div class="aura-head">
            <span class="aura-emoji" aria-hidden="true">${esc(reply.icon || "✨")}</span>
            <span class="aura-title aura-tone-${esc(reply.tone || "info")}">${esc(reply.title || "Aura")}</span>
          </div>
          <div class="aura-body"></div>
        </div>
      </div>`;
    const body = row.querySelector(".aura-body");
    const list = document.createElement("ul");
    list.className = "aura-list";
    for (const bullet of reply.bullets || []) {
      const li = document.createElement("li");
      li.className = "aura-li";
      const k = document.createElement("span");
      k.className = "aura-k";
      k.textContent = bullet.k;
      const v = document.createElement("span");
      v.className = "aura-v";
      if (bullet.tone) v.classList.add(`aura-v-${bullet.tone}`);
      v.textContent = bullet.v;
      li.append(k, v);
      list.appendChild(li);
    }
    body.appendChild(list);
    if (reply.note) {
      const note = document.createElement("p");
      note.className = "aura-note";
      note.textContent = reply.note;
      body.appendChild(note);
    }
    const bubble = row.querySelector(".aura-bubble");
    if (reply.actions?.length) {
      const bar = document.createElement("div");
      bar.className = "aura-actions";
      for (const action of reply.actions) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "aura-action";
        btn.dataset.auraAction = action.id;
        btn.innerHTML = `<span aria-hidden="true">${esc(action.icon || "⚡")}</span><span>${esc(action.label)}</span>`;
        bar.appendChild(btn);
      }
      bubble.appendChild(bar);
    }
    if (reply.followups?.length) {
      const chips = document.createElement("div");
      chips.className = "aura-followups";
      for (const text of reply.followups.slice(0, 3)) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "aura-followup";
        btn.textContent = text;
        chips.appendChild(btn);
      }
      row.querySelector(".aura-col").appendChild(chips);
    }
    chat.appendChild(row);
  }

  _systemNote(text) {
    const { chat } = this._els;
    if (!chat) return;
    const row = document.createElement('div');
    row.className = 'aura-msg';
    row.innerHTML = `<div class="aura-col"><div class="aura-sysnote">${esc(text)}</div></div>`;
    chat.appendChild(row);
    this._scrollToEnd();
  }

  _appendUser(text) {
    const { chat } = this._els;
    if (!chat) return;
    const row = document.createElement('div');
    row.className = 'aura-msg aura-msg-user';
    const bubble = document.createElement('div');
    bubble.className = 'aura-bubble aura-bubble-user';
    // User text is escaped, never interpolated as HTML.
    bubble.textContent = text;
    row.appendChild(bubble);
    chat.appendChild(row);
    this._scrollToEnd();
  }

  _appendTyping(label) {
    const { chat } = this._els;
    if (!chat) return null;
    const row = document.createElement('div');
    row.className = 'aura-msg';
    row.innerHTML = `
      <div class="aura-avatar" aria-hidden="true">✨</div>
      <div class="aura-col">
        <div class="aura-bubble aura-bubble-thinking">
          <span class="aura-dot"></span><span class="aura-dot"></span><span class="aura-dot"></span>
          <span class="aura-thinking-label">${esc(label)}</span>
        </div>
      </div>`;
    chat.appendChild(row);
    this._scrollToEnd();
    return row;
  }

  /**
   * Reveals a structured answer progressively — heading, then each bullet,
   * then the note, then actions and follow-ups. HTML content can't be
   * typewritten character-by-character without shredding tags, so this
   * animates at the granularity that actually reads well.
   */
  async _streamReply(reply) {
    const { chat } = this._els;
    if (!chat) return;
    const token = ++this._streamToken;

    const row = document.createElement('div');
    row.className = 'aura-msg';
    row.innerHTML = `
      <div class="aura-avatar" aria-hidden="true">✨</div>
      <div class="aura-col">
        <div class="aura-bubble">
          <div class="aura-head">
            <span class="aura-emoji" aria-hidden="true">${esc(reply.icon || '✨')}</span>
            <span class="aura-title aura-tone-${esc(reply.tone || 'info')}">${esc(reply.title || 'Aura')}</span>
          </div>
          <div class="aura-body"></div>
        </div>
      </div>`;
    chat.appendChild(row);

    const body = row.querySelector('.aura-body');
    const list = document.createElement('ul');
    list.className = 'aura-list';
    body.appendChild(list);
    const cursor = document.createElement('span');
    cursor.className = 'aura-cursor';
    body.appendChild(cursor);
    this._scrollToEnd();

    const alive = () => token === this._streamToken;
    const pace = reply.bullets?.length > 6 ? 55 : 85;

    for (const bullet of reply.bullets || []) {
      if (!alive()) return;
      const li = document.createElement('li');
      li.className = 'aura-li';
      const k = document.createElement('span');
      k.className = 'aura-k';
      k.textContent = bullet.k;
      const v = document.createElement('span');
      v.className = 'aura-v';
      if (bullet.tone) v.classList.add(`aura-v-${bullet.tone}`);
      v.textContent = bullet.v;
      li.append(k, v);
      list.appendChild(li);
      this._scrollToEnd();
      await this._sleep(pace);
    }

    if (reply.note) {
      if (!alive()) return;
      const note = document.createElement('p');
      note.className = 'aura-note';
      note.textContent = reply.note;
      body.appendChild(note);
      this._scrollToEnd();
      await this._sleep(140);
    }

    cursor.remove();
    if (!alive()) return;

    const bubble = row.querySelector('.aura-bubble');
    if (reply.actions?.length) {
      const bar = document.createElement('div');
      bar.className = 'aura-actions';
      for (const action of reply.actions) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'aura-action';
        btn.dataset.auraAction = action.id;
        if (action.payload) btn.dataset.auraPayload = JSON.stringify(action.payload);
        btn.innerHTML = `<span aria-hidden="true">${esc(action.icon || '⚡')}</span><span>${esc(action.label)}</span>`;
        bar.appendChild(btn);
      }
      bubble.appendChild(bar);
    }

    if (reply.followups?.length) {
      const chips = document.createElement('div');
      chips.className = 'aura-followups';
      for (const text of reply.followups.slice(0, 3)) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'aura-followup';
        btn.textContent = text;
        chips.appendChild(btn);
      }
      row.querySelector('.aura-col').appendChild(chips);
    }

    const stamp = document.createElement('time');
    stamp.className = 'aura-time';
    stamp.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    row.querySelector('.aura-col').appendChild(stamp);

    this._scrollToEnd();
    this._haptic('light');
  }

  /** Follow-up chips and action buttons share one delegated handler. */
  _bindDelegates() {
    const { chat } = this._els;
    if (!chat || chat.dataset.auraBound === '1') return;
    chat.dataset.auraBound = '1';

    chat.addEventListener('click', (e) => {
      const followup = e.target.closest('.aura-followup');
      if (followup) {
        this.ask(followup.textContent.trim());
        return;
      }
      const actionBtn = e.target.closest('.aura-action');
      if (!actionBtn) return;
      let payload = null;
      try {
        payload = actionBtn.dataset.auraPayload ? JSON.parse(actionBtn.dataset.auraPayload) : null;
      } catch { payload = null; }
      this._runAction(actionBtn.dataset.auraAction, payload);
    });
  }

  _runAction(id, payload) {
    const def = ACTIONS[id];
    if (!def) return;
    try {
      def.run(this.app, payload || {}, this);
      if (!def.silent) {
        this._haptic('selection');
        this.app?.showToast?.(`${def.icon} ${def.label}`, 'success', 1800);
      }
    } catch (err) {
      console.warn('Aura action failed:', id, err);
      this.app?.showToast?.(`Could not run "${def.label}".`, 'error');
    }
  }

  _saveCurrentPlace() {
    const app = this.app;
    const lat = app?.selectedLat;
    const lng = app?.selectedLng;
    const name = app?.selectedName;
    if (lat == null || lng == null) {
      app?.showToast?.('Pick a location on the map first.', 'error');
      return;
    }
    const list = Array.isArray(app.bookmarks) ? app.bookmarks : [];
    if (list.some((b) => b.name === name && b.lat === lat && b.lng === lng)) {
      app.showToast?.(`${name} is already saved.`, 'info');
      return;
    }
    list.push({ name: name || 'Pinned place', lat, lng });
    app.bookmarks = list;
    app.saveBookmarks?.();
    app.showToast?.(`⭐ Saved ${name || 'this place'}`, 'success');
  }

  // ── Contextual suggestion chips ──────────────────────────────────

  _renderPresets() {
    const { presets } = this._els;
    if (!presets) return;
    presets.innerHTML = '';
    for (const label of this._suggestions()) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'aura-preset-chip';
      btn.textContent = label;
      presets.appendChild(btn);
    }
  }

  /** Re-renders the suggestion chips against freshly loaded data. */
  refreshPresets() {
    this._activeCtx = undefined;
    this._renderPresets();
  }

  /**
   * The one-line teaser on the banner card. Picks the most time-sensitive
   * thing worth asking right now, so the entry point never shows a stale
   * or irrelevant question.
   */
  bannerPrompt(locationName) {
    const loc = locationName || this._locName();
    const ctx = this._context();
    if (!ctx.ready) return `Will it rain in ${loc}?`;

    if (ctx.nextRainIdx != null && ctx.nextRainIdx - ctx.idx <= 4) {
      const away = ctx.nextRainIdx - ctx.idx;
      return away <= 0
        ? `Is it raining in ${loc} right now?`
        : away === 1
          ? `Is rain hitting ${loc} within the hour?`
          : `Will it rain in ${loc} in ${away}h?`;
    }
    if ((ctx.curr?.uvIndex ?? 0) >= 8) return `How hot is it in ${loc}?`;
    if ((ctx.curr?.windGusts ?? 0) >= 45) return `Is it too windy in ${loc}?`;
    if (ctx.aqi != null && ctx.aqi > 120) return `Is the air safe in ${loc}?`;

    const hour = new Date().getHours();
    if (hour >= 17 && hour < 21) return `Sunset & stargazing in ${loc}?`;
    if (hour >= 21 || hour < 5) return `Stargazing tonight in ${loc}?`;
    if (hour >= 11 && hour < 16) return `Best outdoor window in ${loc}?`;
    return `Plan my day in ${loc}`;
  }

  /** Time-of-day and data driven suggestions — always relevant to right now. */
  _suggestions(ctx = this._activeCtx || this._context()) {
    if (!ctx?.ready) return ['What can you do?', 'Enable rain radar', 'Plan my day'];

    const hour = new Date().getHours();
    const out = [];

    if (ctx.rainSoon) out.push('When does the rain start?');
    else if (ctx.prob6h >= 25) out.push('Should I carry an umbrella?');

    if (hour >= 5 && hour < 11) {
      out.push('Plan my day', 'Best outdoor window today?', ctx.windBad ? 'How bad is the wind?' : 'Sunset time tonight?');
    } else if (hour < 16) {
      out.push('Best outdoor window today?', 'Outdoor dining tonight?');
      if (ctx.uvHigh) out.push('UV advisory');
    } else if (hour < 21) {
      out.push('Outdoor dining tonight?', 'Sunset time tonight?', 'Stargazing tonight?');
    } else {
      out.push('Stargazing tonight?', "Tomorrow's forecast", 'Notify me if it rains');
    }

    if (ctx.aqi != null && ctx.aqi > 100) out.push('Is the air safe?');
    if (ctx.gusty) out.push('How strong are the wind gusts?');

    // Severe weather suggestions
    if (ctx.severe) out.push('Is severe weather expected?');
    if (ctx.heatIndex >= 30) out.push('Is it too hot to be outside?');
    if (ctx.freezingRisk) out.push('Is there a risk of ice?');

    // De-duplicate, keep order, cap at 4.
    return [...new Set(out)].slice(0, 4);
  }

  // ── Context gathering ────────────────────────────────────────────

  _locName() {
    // Shared with the header, wallpaper tabs and bookmarks so a place is
    // labelled identically everywhere — and so a name like "Singapore,
    // Singapore" isn't repeated back at the user.
    return shortPlaceName(
      this.app?.auraMobile?.currentLocationName || this.app?.selectedName || '',
    );
  }

  _fmtHour(iso) {
    if (!iso) return '--';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '--';
    try {
      return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    } catch {
      return '--';
    }
  }

  _todayIndex(daily) {
    if (!daily?.length) return -1;
    const now = new Date();
    const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const i = daily.findIndex((d) => d.date >= key);
    return i === -1 ? 0 : i;
  }

  /** Everything Aura needs, computed once per question. */
  _context() {
    const app = this.app;
    const S = ws();
    const curr = app?.currentWeather || null;
    const wd = app?.weatherData || null;
    const h = wd?.hourly || null;
    const idx = Number.isFinite(app?.currentHourIndex) ? app.currentHourIndex : 0;
    const aqi = typeof app?.currentAqi === 'number' ? app.currentAqi : null;
    const loc = this._locName();

    const ctx = {
      app, S, curr, wd, h, idx, aqi, loc,
      ready: !!(curr && h?.time?.length),
    };
    if (!ctx.ready) return ctx;

    const prob = h.precipitation_probability || [];
    const precip = h.precipitation || [];
    const temps = h.temperature_2m || [];

    const slice = (arr, start, len) => arr.slice(start, start + len).filter((n) => typeof n === 'number');

    ctx.prob3h = slice(prob, idx, 3);
    ctx.prob6h = slice(prob, idx, 6);
    ctx.prob24h = slice(prob, idx, 24);
    ctx.maxProb3h = ctx.prob3h.length ? Math.max(...ctx.prob3h) : 0;
    ctx.maxProb6h = ctx.prob6h.length ? Math.max(...ctx.prob6h) : 0;
    ctx.maxProb24h = ctx.prob24h.length ? Math.max(...ctx.prob24h) : 0;
    ctx.precip24h = slice(precip, idx, 24).reduce((a, b) => a + b, 0);

    // Next hour that actually gets wet.
    const limit = Math.min(idx + 48, precip.length);
    ctx.nextRainIdx = null;
    ctx.nextRainTime = null;
    for (let i = idx; i < limit; i++) {
      if ((precip[i] ?? 0) > 0.1 || (prob[i] ?? 0) > 60) {
        ctx.nextRainIdx = i;
        ctx.nextRainTime = h.time[i];
        break;
      }
    }
    ctx.rainSoon = ctx.nextRainIdx != null && ctx.nextRainIdx - idx <= 3;
    ctx.rainSoon = ctx.rainSoon || ctx.maxProb3h >= 60;

    ctx.gusty = (curr.windGusts ?? 0) >= 40 || (curr.windSpeed ?? 0) >= 30;
    ctx.uvHigh = (curr.uvIndex ?? 0) >= 6;
    ctx.windBad = ctx.gusty;
    ctx.severe = curr.weatherCode >= 95 || (curr.windGusts ?? 0) >= 65 || (curr.precipitation ?? 0) >= 10 || (curr.temperature ?? 20) <= -10 || (curr.temperature ?? 20) >= 40;
    const heatIdx = (curr.temperature ?? 20) + 0.33 * ((curr.humidity ?? 50) - 50) - 0.7 * (curr.windSpeed ?? 0) - 4;
    ctx.heatIndex = Math.round(heatIdx);
    ctx.freezingRisk = (curr.temperature ?? 20) <= 2 && ((curr.precipitation ?? 0) > 0.05 || ctx.maxProb6h >= 40);

    // Analysis helpers — all optional, all sync.
    ctx.daily = S?.getDailyForecast ? S.getDailyForecast(wd) : [];
    ctx.todayIdx = this._todayIndex(ctx.daily);
    ctx.today = ctx.daily[ctx.todayIdx] || null;

    ctx.comfort = S?.getComfortIndex ? S.getComfortIndex(curr, aqi) : null;
    ctx.comfortLabel = ctx.comfort != null && S?.getComfortLabel ? S.getComfortLabel(ctx.comfort, curr) : null;

    ctx.bestWindow = S?.findBestOutdoorWindow ? S.findBestOutdoorWindow(wd, idx) : null;
    ctx.advisories = S?.getAdvisories ? S.getAdvisories(curr, aqi) : [];
    ctx.pressure = S?.getPressureTendency ? S.getPressureTendency(wd, idx) : null;
    ctx.windShift = S?.getWindShift ? S.getWindShift(wd, idx) : null;
    ctx.momentum = S?.getWeatherMomentum ? S.getWeatherMomentum(wd, idx) : null;
    ctx.cumProb = S?.getCumulativePrecipProb ? S.getCumulativePrecipProb(wd, idx, 12) : null;
    ctx.decisions = S?.getDecisions ? S.getDecisions(curr, aqi, ctx.today) : [];

    if (S?.getMoonPhase && ctx.today) {
      ctx.moon = S.getMoonPhase(new Date());
      const cloudNow = curr.cloudCover ?? h.cloud_cover?.[idx] ?? 0;
      ctx.stargazing = S.getStargazingScore
        ? S.getStargazingScore(cloudNow, ctx.moon.phase)
        : null;
      ctx.golden = S.getGoldenBlueHourWindows
        ? S.getGoldenBlueHourWindows(ctx.today.sunrise, ctx.today.sunset, new Date())
        : null;
    }

    ctx.dewPoint = S?.calculateDewPoint
      ? S.calculateDewPoint(curr.temperature, curr.humidity)
      : null;

    return ctx;
  }

  /**
   * Unit-aware formatters, tolerant of a missing WeatherService.
   * Reads the context captured for the in-flight question rather than
   * recomputing it — _context() is far too heavy to call per label.
   */
  _fmt() {
    const S = this._activeCtx?.S || ws();
    return {
      temp: (v) => (S?.formatTemp ? S.formatTemp(v) : v == null ? '--°' : `${Math.round(v)}°C`),
      wind: (v) => (S?.formatWind ? S.formatWind(v) : v == null ? '--' : `${Math.round(v)} km/h`),
      vis: (v) => (S?.formatVisibility ? S.formatVisibility(v) : v == null ? '--' : `${(v / 1000).toFixed(1)} km`),
      precip: (v) => (S?.formatPrecip ? S.formatPrecip(v) : v == null ? '--' : `${v.toFixed(1)} mm`),
      dir: (v) => (S?.getWindDirection ? S.getWindDirection(v) : '--'),
      aqi: (v) => (S?.getAQIInfo ? S.getAQIInfo(v).label : 'Unknown'),
    };
  }

  // ── The engine ───────────────────────────────────────────────────

  async ask(query) {
    const text = (query || '').trim();
    if (!text) return;

    this._bindDelegates();
    this._appendUser(text);

    const ctx = this._context();
    this._activeCtx = ctx;
    this._renderPresets();
    const loc = ctx.loc || 'this area';
    const thinking = this._appendTyping(`Reading live model data for ${loc}…`);

    // A short, honest beat. No fake network latency is implied.
    await this._sleep(320);
    thinking?.remove();

    let reply;
    try {
      reply = await this._answer(text, ctx);
    } catch (err) {
      console.warn('Aura failed to answer:', err);
      reply = {
        icon: '⚠️',
        tone: 'warn',
        title: 'Something went wrong',
        bullets: [{ k: 'Error', v: err?.message || 'Unknown error' }],
        note: 'Try rephrasing, or ask about the weather here.',
      };
    }

    await this._streamReply(reply);
    // Re-read: a place lookup may have switched the map target mid-answer.
    this._activeCtx = this._context();
    this._renderPresets();

    // Persist the conversation (memory is local-only, privacy-first).
    this._saveMemory();
  }

  /**
   * Resolves what to answer: a fresh classification, or — when the query
   * is just a time scope plus filler ("and tomorrow?") — the previous
   * intent re-run against that scope. Testable without a DOM.
   * @returns {{match: {id:string,score:number}|null, scope: {kind:string,label:string}|null}}
   */
  _resolveIntent(q) {
    const scope = detectTimeScope(q);
    if (isBareTimeQuery(q) && this._lastIntent && RERUNNABLE.has(this._lastIntent)) {
      return { match: { id: this._lastIntent, score: 1, viaMemory: true }, scope };
    }
    return { match: classify(q), scope };
  }

  async _answer(query, ctx) {
    const q = query.toLowerCase();
    const { match, scope } = this._resolveIntent(q);

    // Two-city comparison ("delhi vs mumbai") runs before anything else —
    // it's fully self-contained and needs both cities resolved.
    const twoPlaces = extractTwoPlaces(query);
    if (twoPlaces) return this._answerComparePlaces(twoPlaces.a, twoPlaces.b, ctx);

    // Remember the thread for bare follow-ups ("and tomorrow?").
    if (match && RERUNNABLE.has(match.id)) this._lastIntent = match.id;

    // Place lookups need the network and a location switch, so they run first
    // and short-circuit into a fresh overview of the new place.
    const place = extractPlace(query);
    if (place) {
      this._lastIntent = null; // new place, new thread
      return this._answerPlace(place, ctx);
    }

    if (!ctx.ready) {
      return {
        icon: '📍',
        tone: 'warn',
        title: 'No forecast loaded yet',
        bullets: [{ k: 'Status', v: 'Aura needs live data for a location before it can answer' }],
        note: 'Pick a place on the map or run a search, then ask again.',
        actions: [{ id: 'search', label: 'Search a place', icon: '🔎' }],
      };
    }

    switch (match?.id) {
      case 'help': return this._answerHelp(ctx);
      case 'greeting': return this._answerGreeting(ctx);
      case 'dailyBriefing': return this._answerDailyBriefing(ctx);
      case 'alert': return this._answerAlert(q, ctx);
      case 'place': return this._answerPlace(null, ctx);
      case 'compare': return this._answerCompare(ctx);
      case 'astronomy': return this._answerAstronomy(ctx);
      case 'thunderstorm': return this._answerThunderstorm(ctx);
      case 'solar': return this._answerSolar(ctx);
      case 'clothing': return this._answerClothing(ctx);
      case 'pollen': return this._answerPollen(ctx);
      case 'hazard': return this._answerHazard(ctx);
      case 'dining': return this._answerDining(ctx);
      case 'plan': return this._answerPlan(ctx);
      case 'commute': return this._answerCommute(ctx);
      case 'outdoor': return this._answerOutdoor(ctx);
      case 'forecast': return this._answerForecast(ctx);
      case 'layers': return this._answerLayers(ctx);
      case 'air': return this._answerAir(ctx);
      case 'uv': return this._answerUV(ctx);
      case 'visibility': return this._answerVisibility(ctx);
      case 'rain': return this._answerRain(ctx, scope);
      case 'wind': return this._answerWind(ctx);
      case 'humidity': return this._answerHumidity(ctx);
      case 'packing': return this._answerPacking(ctx);
      case 'running': return this._answerRunning(ctx);
      case 'cycling': return this._answerCycling(ctx);
      case 'workfromhome': return this._answerWorkFromHome(ctx);
      case 'temperature': return this._answerTemperature(ctx);
      case 'overview': return this._answerOverview(ctx);
      default: return this._answerUnknown(query, ctx);
    }
  }

  // ── Answer builders ──────────────────────────────────────────────

  _noData(what) {
    return { k: what, v: 'Not available for this location', tone: 'warn' };
  }

  _answerHelp(ctx) {
    return {
      icon: '🧭',
      tone: 'info',
      title: 'What Aura can do',
      bullets: [
        { k: 'Weather', v: 'Conditions, rain timing, temperature, humidity, wind and gusts' },
        { k: 'Decisions', v: 'Commute safety, outdoor workout windows, outdoor dining, visibility' },
        { k: 'Health', v: 'Air quality, pollen, UV exposure and heat stress' },
        { k: 'Sky', v: 'Sunset, golden hour, moon phase and stargazing score' },
        { k: 'Time scopes', v: 'Add "tonight", "tomorrow" or "this weekend" — or follow up with "and tomorrow?"' },
        { k: 'Actions', v: 'Rain radar, pressure map, jump to the rain hour, save places' },
        { k: 'Alerts', v: 'Try "notify me if the rain chance goes above 60%"' },
      ],
      note: ctx.loc ? `Everything above is computed from the live forecast for ${ctx.loc}.` : undefined,
      followups: ['Plan my day', 'When does the rain start?', 'Best outdoor window today?'],
    };
  }

  _answerGreeting(ctx) {
    const { S, curr } = ctx;
    const f = this._fmt();
    const hour = new Date().getHours();
    const part = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const headline = curr.description || 'current conditions';
    return {
      icon: curr.icon || '✨',
      tone: 'info',
      title: `${part}!`,
      bullets: [
        { k: 'Right now', v: `${f.temp(curr.temperature)} · ${headline} · feels like ${f.temp(curr.feelsLike)}` },
        { k: 'Wind', v: `${f.wind(curr.windSpeed)} ${f.dir(curr.windDirection)}` },
        { k: 'Air quality', v: ctx.aqi != null ? `US AQI ${ctx.aqi} (${f.aqi(ctx.aqi)})` : 'Not available' },
        { k: 'Rain', v: ctx.rainSoon ? `Likely soon — up to ${ctx.maxProb6h}% in 6h` : `Low risk in the next 6h (${ctx.maxProb6h}%)` },
      ],
      note: S ? 'Ask me anything about this place, or tap a suggestion below.' : undefined,
      followups: ['Plan my day', 'Outdoor dining tonight?', 'Sunset time tonight?'],
    };
  }

  _answerRain(ctx, scope = null) {
    const f = this._fmt();
    const { curr, h, idx } = ctx;
    const type = precipTypeFor(curr.weatherCode, curr.temperature);
    const frozen = type === 'snow' || type === 'mix';
    const precipNoun = type === 'snow' ? 'snow' : type === 'mix' ? 'wintry mix' : 'rain';
    const coverNoun = type === 'snow' ? '❄️ Take warm layers and allow extra travel time' : 'Take an umbrella';

    // ── Time-scoped variant ("will it rain tonight?") ──────────────
    const window = this._scopedIndices(ctx, scope);
    if (window && window.indices.length) {
      const ii = window.indices;
      const probs = ii.map((i) => h.precipitation_probability?.[i] ?? 0);
      const amounts = ii.map((i) => h.precipitation?.[i] ?? 0);
      const peak = Math.max(...probs);
      const total = amounts.reduce((a, b) => a + b, 0);
      const wetIdx = ii.find((i) => (h.precipitation?.[i] ?? 0) > 0.1 || (h.precipitation_probability?.[i] ?? 0) > 60);
      const label = window.label[0].toUpperCase() + window.label.slice(1);

      return {
        icon: type === 'snow' ? '❄️' : '🌧️',
        tone: peak >= 50 ? 'warn' : 'good',
        title: `${label} ${precipNoun} outlook · ${ctx.loc}`,
        bullets: [
          { k: label, v: `${this._fmtHour(h.time[ii[0]])} – ${this._fmtHour(h.time[ii[ii.length - 1]])}` },
          { k: `Peak ${precipNoun} chance`, v: `${Math.round(peak)}%`, tone: peak >= 50 ? 'warn' : 'good' },
          { k: `Expected total`, v: f.precip(total) },
          wetIdx != null
            ? { k: `First wet hour`, v: `${this._fmtHour(h.time[wetIdx])}`, tone: wetIdx - idx <= 3 ? 'warn' : undefined }
            : { k: 'First wet hour', v: `None ${window.label}`, tone: 'good' },
        ],
        note: wetIdx != null
          ? `${label} brings ${precipNoun} — ${coverNoun.toLowerCase()}${type === 'snow' ? '' : ' if you head out'}.`
          : `No ${precipNoun} expected ${window.label} — you're clear.`,
        actions: [
          { id: 'radar', label: 'Live rain radar', icon: '🌧️' },
          { id: 'alert', label: 'Alert me above 60%', icon: '🔔', payload: { type: 'precipProb', condition: 'above', value: 60 } },
          ...(typeof Notification !== 'undefined' &&
            Notification.permission === 'granted' &&
            this.app?.rainPushEnabled?.()
            ? []
            : [{ id: 'rainPush', label: 'Notify me before rain', icon: '☔' }]),
        ],
        followups: ['Driving conditions right now', 'Best outdoor window today?', 'Plan my day'],
      };
    }

  // A scope that resolves to an empty window (e.g. "tonight" asked at
    // 11pm) falls through to the standard outlook with a one-line note.
    const scopeNote = scope && scope.label
      ? ` ${scope.label[0].toUpperCase() + scope.label.slice(1)} is nearly over — showing the standard outlook.`
      : '';

    const soon = ctx.rainSoon;
    const nextIn = ctx.nextRainIdx != null ? ctx.nextRainIdx - idx : null;

    const bullets = [];
    bullets.push({
      k: 'Now',
      v: `${curr.icon} ${f.precip(curr.precipitation)} falling · ${f.temp(curr.temperature)}`,
    });
    if (frozen) {
      bullets.push({
        k: 'Precipitation type',
        v: type === 'snow' ? 'Snow — frozen precipitation on the radar' : 'Wintry mix — rain falling through freezing air',
        tone: 'warn',
      });
    }
    bullets.push({ k: 'Next 3 hours', v: `Peak chance ${ctx.maxProb3h}%`, tone: ctx.maxProb3h >= 60 ? 'warn' : ctx.maxProb3h >= 30 ? 'warn' : 'good' });
    bullets.push({ k: 'Next 6 hours', v: `Peak chance ${ctx.maxProb6h}%` });
    bullets.push({ k: 'Next 24 hours', v: `${ctx.maxProb24h}% peak · ${f.precip(ctx.precip24h)} total` });

    if (ctx.cumProb?.length) {
      const end = ctx.cumProb[ctx.cumProb.length - 1];
      bullets.push({ k: `Chance of any ${precipNoun} in 12h`, v: `${end.cumProb}%`, tone: end.cumProb >= 50 ? 'warn' : 'good' });
    }

    if (ctx.nextRainIdx != null) {
      bullets.push({
        k: 'First wet hour',
        v: `${this._fmtHour(ctx.nextRainTime)} (${nextIn <= 0 ? 'now' : nextIn === 1 ? 'in 1h' : `in ${nextIn}h`})`,
        tone: soon ? 'warn' : undefined,
      });
    } else {
      bullets.push({ k: 'First wet hour', v: 'None in the next 48 hours', tone: 'good' });
    }

    const gear = type === 'snow' ? 'Warm layers and waterproof boots' : 'an umbrella';
    const verb = type === 'snow' ? 'snow' : 'rain';
    const verdict = soon
      ? nextIn <= 0
        ? `It is ${verb === 'snow' ? 'snowing' : 'raining'} right now — ${type === 'snow' ? 'warm layers on, drive gently' : 'take an umbrella'}.`
        : `${type === 'snow' ? 'Snow' : 'Rain'} expected within ${nextIn}h — take ${gear}.`
      : ctx.maxProb6h >= 30
        ? `Keep ${gear} handy; ${ctx.maxProb6h}% is the peak risk in the next 6 hours.`
        : `You can probably leave the umbrella — peak risk is only ${ctx.maxProb6h}% over the next 6 hours.${scopeNote}`;

    // Offer the proactive rain heads-up until it's enabled + permitted.
    const pushLive =
      typeof Notification !== 'undefined' &&
      Notification.permission === 'granted' &&
      this.app?.rainPushEnabled?.();
    const actions = [
      { id: 'radar', label: 'Live rain radar', icon: '🌧️' },
      { id: 'alert', label: 'Alert me above 60%', icon: '🔔', payload: { type: 'precipProb', condition: 'above', value: 60 } },
    ];
    if (!pushLive) actions.push({ id: 'rainPush', label: 'Notify me before rain', icon: '☔' });

    return {
      icon: type === 'snow' ? '❄️' : '🌧️',
      tone: soon ? 'warn' : 'good',
      title: `${type === 'snow' ? 'Snow' : type === 'mix' ? 'Wintry mix' : 'Rain'} outlook · ${ctx.loc}`,
      bullets,
      note: verdict,
      actions,
      followups: ['Driving conditions right now', 'Best outdoor window today?', 'Plan my day'],
    };
  }

  _answerCommute(ctx) {
    const f = this._fmt();
    const { curr } = ctx;
    const type = precipTypeFor(curr.weatherCode, curr.temperature);
    const wet = (curr.precipitation ?? 0) > 0.1 || ctx.maxProb6h >= 50;
    const icy = (curr.temperature ?? 10) <= 1.5 && ((curr.precipitation ?? 0) > 0.05 || ctx.maxProb6h >= 40 || type === 'snow' || type === 'mix');
    const fog = (curr.visibility ?? 10000) < 2000;
    const crosswind = (curr.windGusts ?? 0) >= 40;

    const bullets = [
      { k: 'Live conditions', v: `${curr.icon} ${f.temp(curr.temperature)} (${curr.description}), feels like ${f.temp(curr.feelsLike)}` },
      { k: 'Rain risk', v: `${ctx.maxProb3h}% in 3h · ${ctx.maxProb6h}% in 6h`, tone: ctx.maxProb6h >= 50 ? 'warn' : 'good' },
      { k: 'Road surface', v: icy ? 'Snow/ice risk — bridges freeze first, expect black ice' : wet ? 'Wet — braking distance up ~30%, double your gap' : 'Dry — normal traction', tone: icy || wet ? 'warn' : 'good' },
      { k: 'Wind', v: `${f.wind(curr.windSpeed)} ${f.dir(curr.windDirection)}${curr.windGusts != null ? ` · gusting ${f.wind(curr.windGusts)}` : ''}`, tone: crosswind ? 'warn' : undefined },
      { k: 'Visibility', v: f.vis(curr.visibility), tone: fog ? 'warn' : undefined },
    ];
    if (ctx.pressure) bullets.push({ k: 'Pressure', v: ctx.pressure.desc, tone: ctx.pressure.direction === 'falling' ? 'warn' : undefined });
    if (ctx.windShift) bullets.push({ k: 'Wind shift', v: ctx.windShift.label, tone: 'warn' });

    let verdict;
    if (icy) verdict = 'Freezing temperatures with precipitation risk — expect ice on bridges and shaded stretches. Winter tyres, gentle inputs, triple your gap.';
    else if (wet && fog) verdict = 'Take it slow: wet roads plus low visibility. Lights on, extra following distance.';
    else if (wet && (curr.precipitation ?? 0) > 0.1) verdict = 'It is raining right now — wipers on, headlights on, double your following gap.';
    else if (wet) verdict = `Dry at the moment but ${ctx.maxProb6h}% rain risk within 6 hours — you will want the wipers before you leave.`;
    else if (crosswind) verdict = 'No rain, but gusts are strong. Watch crosswinds on exposed stretches.';
    else if (fog) verdict = 'Visibility is reduced by fog. Avoid high beams and leave extra space.';
    else verdict = 'Good driving conditions right now.';

    return {
      icon: '🚗',
      tone: icy || wet || fog || crosswind ? 'warn' : 'good',
      title: `Commute & road weather · ${ctx.loc}`,
      bullets,
      note: verdict,
      actions: [
        { id: 'radar', label: 'See rain cells', icon: '🌧️' },
        { id: 'nextRain', label: 'Jump to rain hour', icon: '⏭️' },
        { id: 'save', label: 'Save this place', icon: '⭐' },
      ],
      followups: ['How strong are the wind gusts?', 'Plan my commute', 'Is visibility okay?'],
    };
  }

  _answerOutdoor(ctx) {
    const f = this._fmt();
    const { curr } = ctx;
    const comfort = ctx.comfort;
    const label = ctx.comfortLabel;
    const w = ctx.bestWindow;

    const bullets = [];
    bullets.push({
      k: 'Comfort score',
      v: comfort != null ? `${comfort}/100 · ${label?.label ?? ''}` : 'Not available',
      tone: comfort >= 75 ? 'good' : comfort >= 50 ? 'warn' : 'warn',
    });
    bullets.push({ k: 'Temperature', v: `${f.temp(curr.temperature)} (feels like ${f.temp(curr.feelsLike)}) · humidity ${curr.humidity ?? '--'}%` });
    bullets.push({ k: 'Air quality', v: ctx.aqi != null ? `US AQI ${ctx.aqi} (${f.aqi(ctx.aqi)})` : 'Not available', tone: ctx.aqi > 100 ? 'warn' : 'good' });
    bullets.push({ k: 'UV index', v: curr.uvIndex != null ? String(Math.round(curr.uvIndex)) : '--', tone: ctx.uvHigh ? 'warn' : undefined });

    if (w) {
      bullets.push({
        k: 'Best window (24h)',
        v: `${this._fmtHour(w.startTime)} – ${this._fmtHour(w.endTime)} · ${w.hours}h · avg ${f.temp(w.avgTemp)}`,
        tone: 'good',
      });
    } else {
      bullets.push({ k: 'Best window (24h)', v: 'No comfortable window in the next 24h', tone: 'warn' });
    }

    const hydration = curr.temperature >= 28 ? 'High heat — carry water and add electrolytes.'
      : curr.temperature <= 5 ? 'Cold — warm up longer and cover extremities.'
        : 'Hydrate roughly every 20–30 minutes.';

    return {
      icon: '🏃',
      tone: comfort >= 75 ? 'good' : 'warn',
      title: `Outdoor & workout decision · ${ctx.loc}`,
      bullets,
      note: `${hydration}${ctx.advisories.length ? ` ⚠️ ${ctx.advisories[0].title}.` : ''}`,
      actions: [
        { id: 'tab', label: 'Hourly detail', icon: '📑', payload: { tab: 'hourly' } },
        { id: 'alert', label: 'Alert if AQI > 100', icon: '🔔', payload: { type: 'aqi', condition: 'above', value: 100 } },
      ],
      followups: ['Is the air safe to breathe?', 'UV advisory', 'Sunset time tonight?'],
    };
  }

  _answerDining(ctx) {
    const f = this._fmt();
    const { curr } = ctx;
    const diningTip = ctx.decisions.find((d) => d.icon.startsWith('🍽️'));
    const outdoorOk = curr.temperature >= 15 && curr.temperature <= 30 && ctx.maxProb6h < 30 && (curr.windSpeed ?? 0) < 25;

    const bullets = [
      { k: 'Outdoor dining', v: outdoorOk ? 'Good to go' : 'Conditions are against it', tone: outdoorOk ? 'good' : 'warn' },
      { k: 'Right now', v: `${curr.icon} ${f.temp(curr.temperature)} · rain risk ${ctx.maxProb6h}%` },
      { k: 'This evening', v: this._eveningSummary(ctx) },
    ];
    if (diningTip) bullets.push({ k: 'Aura read', v: diningTip.text });
    if (ctx.bestWindow) {
      bullets.push({ k: 'Best clear window', v: `${this._fmtHour(ctx.bestWindow.startTime)} – ${this._fmtHour(ctx.bestWindow.endTime)}`, tone: 'good' });
    }

    return {
      icon: '🍽️',
      tone: outdoorOk ? 'good' : 'warn',
      title: `Dining weather · ${ctx.loc}`,
      bullets,
      // Honest about scope: Aurafisky's search is city geocoding, not a POI
      // database, so Aura answers the weather half of the question and says
      // so rather than inventing restaurant names or wiring up a search that
      // would return nothing.
      note: 'Aurafisky has no live restaurant database — its search only resolves city names — so I can\'t name nearby spots. I can tell you exactly whether a table outside will work.',
      actions: [
        { id: 'tab', label: 'See hourly', icon: '📑', payload: { tab: 'hourly' } },
        { id: 'alert', label: 'Alert if it rains tonight', icon: '🔔', payload: { type: 'precipProb', condition: 'above', value: 40 } },
      ],
      followups: ['Outdoor workout window', 'Plan my day', 'Will it rain tonight?'],
    };
  }

  _answerPlan(ctx) {
    const f = this._fmt();
    const blocks = [];
    const w = ctx.bestWindow;

    if (ctx.today) {
      blocks.push({ k: 'Day range', v: `${f.temp(ctx.today.minTemp)} – ${f.temp(ctx.today.maxTemp)} · ${ctx.today.description}` });
    }

    // Labelled by their real clock range, not "morning/afternoon/evening" —
    // asking at 8pm would otherwise produce a "Morning" block for midnight.
    blocks.push({ k: `Now – ${this._fmtHour(this._timeAt(ctx, 6))}`, v: this._blockSummary(ctx, 0, 6) });
    blocks.push({ k: `${this._fmtHour(this._timeAt(ctx, 6))} – ${this._fmtHour(this._timeAt(ctx, 12))}`, v: this._blockSummary(ctx, 6, 6) });
    blocks.push({ k: `${this._fmtHour(this._timeAt(ctx, 12))} – ${this._fmtHour(this._timeAt(ctx, 18))}`, v: this._blockSummary(ctx, 12, 6) });

    const bullets = [];
    if (w) {
      bullets.push({
        k: 'Best outdoor window',
        v: `${this._fmtHour(w.startTime)} – ${this._fmtHour(w.endTime)} (${w.hours}h, avg ${f.temp(w.avgTemp)})`,
        tone: 'good',
      });
    }
    if (ctx.today) {
      bullets.push({
        k: 'Daylight',
        v: `${this._fmtHour(ctx.today.sunrise)}–${this._fmtHour(ctx.today.sunset)}`,
        tone: 'good',
      });
      if (ctx.golden) {
        bullets.push({
          k: ctx.golden.label,
          v: `${this._fmtHour(ctx.golden.start.toISOString())} – ${this._fmtHour(ctx.golden.end.toISOString())}`,
          tone: 'good',
        });
      }
    }
    if (ctx.nextRainIdx != null) {
      const away = ctx.nextRainIdx - ctx.idx;
      bullets.push({
        k: away <= 0 ? 'Rain right now' : 'Rain arrives',
        v: away <= 0 ? `Since ${this._fmtHour(ctx.nextRainTime)}` : `${this._fmtHour(ctx.nextRainTime)} (in ${away}h)`,
        tone: 'warn',
      });
    }
    if (ctx.advisories.length) {
      bullets.push({ k: 'Watch out', v: `${ctx.advisories[0].title} — ${ctx.advisories[0].desc}`, tone: 'warn' });
    }
    bullets.push(...blocks);

    const lead = w
      ? `Build your day around ${this._fmtHour(w.startTime)}–${this._fmtHour(w.endTime)} for anything outdoors.`
      : 'There is no comfortable outdoor window in the next 24 hours — plan indoors.';

    return {
      icon: '🗓️',
      tone: w ? 'good' : 'warn',
      title: `Your day · ${ctx.loc}`,
      bullets,
      note: lead,
      actions: [
        { id: 'briefing', label: 'Full briefing', icon: '📝' },
        { id: 'tab', label: 'Daily forecast', icon: '📑', payload: { tab: 'daily' } },
      ],
      followups: ['Best outdoor window today?', 'Sunset time tonight?', 'Outdoor dining tonight?'],
    };
  }

  _answerAstronomy(ctx) {
    const f = this._fmt();
    const { curr, today } = ctx;
    const bullets = [];

    if (today) {
      bullets.push({ k: 'Sunrise', v: this._fmtHour(today.sunrise), tone: 'good' });
      bullets.push({ k: 'Sunset', v: this._fmtHour(today.sunset), tone: 'good' });
      const daylight = (new Date(today.sunset) - new Date(today.sunrise)) / 3600000;
      bullets.push({ k: 'Daylight', v: `${Math.floor(daylight)}h ${Math.round((daylight % 1) * 60)}m` });
      if (ctx.golden) {
        bullets.push({
          k: ctx.golden.label,
          v: `${this._fmtHour(ctx.golden.start.toISOString())} – ${this._fmtHour(ctx.golden.end.toISOString())}`,
          tone: 'good',
        });
      }
    }

    if (ctx.moon) {
      bullets.push({ k: 'Moon', v: `${ctx.moon.icon} ${ctx.moon.label}` });
    }
    if (ctx.stargazing) {
      bullets.push({
        k: 'Stargazing now',
        v: `${ctx.stargazing.icon} ${ctx.stargazing.score}/100 · ${ctx.stargazing.label}`,
        tone: ctx.stargazing.score >= 65 ? 'good' : ctx.stargazing.score >= 40 ? undefined : 'warn',
      });
      bullets.push({ k: 'Cloud cover', v: `${Math.round(curr.cloudCover ?? 0)}%`, tone: (curr.cloudCover ?? 0) < 25 ? 'good' : undefined });
      bullets.push({ k: 'Moonlight', v: `${Math.round((ctx.stargazing.illumination ?? 0) * 100)}% illuminated` });
    }

    const bestNight = ctx.stargazing && ctx.stargazing.score >= 60;
    return {
      icon: '🌌',
      tone: bestNight ? 'good' : 'info',
      title: `Sky & light · ${ctx.loc}`,
      bullets: bullets.length ? bullets : [this._noData('Astronomy')],
      note: ctx.stargazing
        ? `Scoring uses cloud cover and moonlight only — light pollution isn't in Aurafisky's data, so treat this as an upper bound.`
        : undefined,
      actions: [{ id: 'tab', label: 'Astronomy tab', icon: '🌗', payload: { tab: 'astronomy' } }],
      followups: ['Stargazing tonight?', 'Outdoor workout window', 'Will it be clear this evening?'],
    };
  }

  _answerAir(ctx) {
    const f = this._fmt();
    const { curr, app } = ctx;
    const aq = app?.airQualityData?.hourly || {};
    const bullets = [];

    bullets.push({
      k: 'US AQI',
      v: ctx.aqi != null ? `${ctx.aqi} · ${f.aqi(ctx.aqi)}` : 'Not available',
      tone: ctx.aqi != null && ctx.aqi <= 50 ? 'good' : ctx.aqi != null && ctx.aqi <= 100 ? 'warn' : 'warn',
    });

    const idx = ctx.idx;
    const pm25 = aq.pm2_5?.[idx];
    const pm10 = aq.pm10?.[idx];
    bullets.push({ k: 'PM2.5', v: pm25 != null ? `${pm25} µg/m³` : 'Not available', tone: pm25 > 35 ? 'warn' : pm25 != null ? 'good' : undefined });
    bullets.push({ k: 'PM10', v: pm10 != null ? `${pm10} µg/m³` : 'Not available', tone: pm10 > 50 ? 'warn' : pm10 != null ? 'good' : undefined });

    const pollenVals = ['grass_pollen', 'birch_pollen', 'mugwort_pollen', 'alder_pollen']
      .map((k) => aq[k]?.[idx])
      .filter((v) => typeof v === 'number');
    if (pollenVals.length && ctx.S?.getPollenLevel) {
      const worst = ctx.S.getPollenLevel(Math.max(...pollenVals));
      bullets.push({ k: 'Pollen', v: `${worst.icon} ${worst.level}`, tone: worst.level === 'High' || worst.level === 'Very High' ? 'warn' : 'good' });
    }

    bullets.push({
      k: 'For exercise',
      v: ctx.aqi == null ? 'Unknown' : ctx.aqi <= 50 ? 'Fine for any outdoor effort' : ctx.aqi <= 100 ? 'Reduce long, hard sessions' : 'Move it indoors',
      tone: ctx.aqi != null && ctx.aqi <= 50 ? 'good' : 'warn',
    });
    bullets.push({ k: 'Cloud & rain', v: `${Math.round(curr.cloudCover ?? 0)}% cloud — ${ctx.maxProb6h}% rain risk` });

    return {
      icon: '🍃',
      tone: ctx.aqi != null && ctx.aqi <= 50 ? 'good' : 'warn',
      title: `Air quality · ${ctx.loc}`,
      bullets,
      note: ctx.aqi == null
        ? 'Aurafisky has no air-quality reading for this location right now.'
        : ctx.aqi <= 50
          ? 'Clean air — no respiratory precautions needed.'
          : ctx.aqi <= 100
            ? 'Moderate. Sensitive groups may want to shorten hard outdoor sessions.'
            : 'Unhealthy for sensitive groups. Consider a mask if you must be outside.',
      actions: [
        { id: 'alert', label: 'Alert if AQI > 100', icon: '🔔', payload: { type: 'aqi', condition: 'above', value: 100 } },
        { id: 'tab', label: 'Open metrics', icon: '📑', payload: { tab: 'metrics' } },
      ],
      followups: ['Best outdoor window today?', 'Plan my day', 'What\'s the pollen count?'],
    };
  }

  _answerUV(ctx) {
    const f = this._fmt();
    const { curr, today } = ctx;
    const uv = curr.uvIndex;
    const band = uv == null ? 'Unknown' : uv >= 8 ? 'Very high' : uv >= 6 ? 'High' : uv >= 3 ? 'Moderate' : 'Low';

    const bullets = [
      { k: 'UV index now', v: uv != null ? uv.toFixed(1) : '--', tone: uv >= 6 ? 'warn' : 'good' },
      { k: 'Band', v: band, tone: uv >= 6 ? 'warn' : 'good' },
      { k: 'Cloud cover', v: `${Math.round(curr.cloudCover ?? 0)}% — cloud cuts UV but doesn't eliminate it` },
    ];
    if (today) bullets.push({ k: "Today's peak UV", v: `${today.uvMax ?? '--'}`, tone: (today.uvMax ?? 0) >= 8 ? 'warn' : undefined });
    bullets.push({ k: 'Protection', v: uv >= 6 ? 'SPF 50+, hat, shade near midday' : uv >= 3 ? 'SPF 30 is enough for long exposure' : 'Normal clothing is fine' });
    if (ctx.dewPoint != null) bullets.push({ k: 'Dew point', v: `${f.temp(ctx.dewPoint)} — humidity stress rises sharply above 24°`, tone: ctx.dewPoint >= 24 ? 'warn' : undefined });

    return {
      icon: '☀️',
      tone: uv >= 6 ? 'warn' : 'good',
      title: `UV & sun exposure · ${ctx.loc}`,
      bullets,
      actions: [{ id: 'tab', label: 'UV chart', icon: '📈', payload: { tab: 'metrics' } }],
      followups: ['Is it too hot to walk?', 'Best outdoor window today?', 'Sunset time tonight?'],
    };
  }

  _answerTemperature(ctx) {
    const f = this._fmt();
    const { curr } = ctx;
    const m = ctx.momentum;
    const bullets = [
      { k: 'Now', v: `${f.temp(curr.temperature)} · feels like ${f.temp(curr.feelsLike)}` },
    ];
    if (m) {
      bullets.push({
        k: 'Trend (1h)',
        v: `${m.velocity > 0 ? '+' : ''}${m.velocity.toFixed(1)}°/h`,
        tone: m.velocity > 0.3 ? 'warn' : undefined,
      });
      bullets.push({
        k: 'Acceleration',
        v: m.acceleration > 0.15 ? 'Warming faster than before' : m.acceleration < -0.15 ? 'Cooling faster than before' : 'Steady',
      });
    }
    if (ctx.today) bullets.push({ k: 'Today', v: `${f.temp(ctx.today.minTemp)} – ${f.temp(ctx.today.maxTemp)}` });
    if (ctx.pressure) bullets.push({ k: 'Pressure', v: `${ctx.pressure.icon} ${ctx.pressure.label}`, tone: ctx.pressure.direction === 'falling' ? 'warn' : 'good' });
    if (ctx.advisories.length) bullets.push({ k: 'Advisory', v: `${ctx.advisories[0].title}`, tone: 'warn' });

    return {
      icon: '🌡️',
      tone: (curr.temperature ?? 20) >= 33 ? 'warn' : (curr.temperature ?? 20) <= 2 ? 'warn' : 'good',
      title: `Temperature · ${ctx.loc}`,
      bullets,
      actions: [{ id: 'tab', label: 'Hourly detail', icon: '📑', payload: { tab: 'hourly' } }],
      followups: ['Humidity', 'Is the air safe?', 'Plan my day'],
    };
  }

  _answerHumidity(ctx) {
    const f = this._fmt();
    const { curr } = ctx;
    const frizz = (curr.humidity ?? 0) >= 80 ? 'Hair frizz: high' : (curr.humidity ?? 0) >= 60 ? 'Hair frizz: moderate' : 'Hair frizz: low';
    const bullets = [
      { k: 'Relative humidity', v: `${curr.humidity ?? '--'}%`, tone: (curr.humidity ?? 0) >= 80 ? 'warn' : 'good' },
    ];
    if (ctx.dewPoint != null) bullets.push({ k: 'Dew point', v: f.temp(ctx.dewPoint), tone: ctx.dewPoint >= 24 ? 'warn' : undefined });
    bullets.push({ k: 'Cloud cover', v: `${Math.round(curr.cloudCover ?? 0)}%` });
    bullets.push({ k: 'Rain risk', v: `${ctx.maxProb6h}% in 6h` });
    bullets.push({ k: 'Comfort', v: frizz });
    if (ctx.decisions.length) {
      const laundry = ctx.decisions.find((d) => d.icon.startsWith('👕'));
      if (laundry) bullets.push({ k: 'Drying laundry outside', v: laundry.text, tone: laundry.type === 'great' ? 'good' : 'warn' });
    }

    return {
      icon: '💧',
      tone: (curr.humidity ?? 0) >= 80 ? 'warn' : 'good',
      title: `Humidity · ${ctx.loc}`,
      bullets,
      followups: ['Best outdoor window today?', 'Is it too hot to walk?', 'Plan my day'],
    };
  }

  _answerWind(ctx) {
    const f = this._fmt();
    const { curr } = ctx;
    const speed = curr.windSpeed ?? 0;
    const gusts = curr.windGusts ?? 0;
    const beaufort = speed < 1 ? 'Calm' : speed < 12 ? 'Light breeze' : speed < 29 ? 'Moderate' : speed < 50 ? 'Fresh' : speed < 75 ? 'Strong' : 'Gale';

    const bullets = [
      { k: 'Now', v: `${f.wind(speed)} ${f.dir(curr.windDirection)} · ${beaufort}` },
    ];
    if (gusts != null) bullets.push({ k: 'Gusts', v: f.wind(gusts), tone: gusts >= 50 ? 'warn' : undefined });
    bullets.push({ k: 'Next 6h peak', v: this._windPeak(ctx), tone: ctx.gusty ? 'warn' : 'good' });
    if (ctx.windShift) bullets.push({ k: 'Shift', v: `${ctx.windShift.label} — frontal passage possible`, tone: 'warn' });

    const kiteTip = ctx.decisions.find((d) => d.icon.startsWith('🪁'));
    if (kiteTip) bullets.push({ k: 'Flying a kite', v: kiteTip.text, tone: kiteTip.type === 'great' ? 'good' : 'warn' });

    return {
      icon: '💨',
      tone: ctx.gusty ? 'warn' : 'good',
      title: `Wind · ${ctx.loc}`,
      bullets,
      note: ctx.gusty
        ? 'Strong enough to affect driving and cycling — take extra care on exposed routes.'
        : 'Comfortable wind for most outdoor plans.',
      actions: [{ id: 'terminator', label: 'Weather overlays', icon: '🌗' }],
      followups: ['Driving conditions right now?', 'Stargazing tonight?', 'Plan my day'],
    };
  }

  _answerVisibility(ctx) {
    const f = this._fmt();
    const { curr } = ctx;
    const vis = curr.visibility;
    const km = vis != null ? vis / 1000 : null;
    const band = km == null ? 'Unknown' : km >= 10 ? 'Clear' : km >= 4 ? 'Moderate haze' : km >= 1 ? 'Poor' : 'Very poor';

    const bullets = [
      { k: 'Visibility', v: f.vis(vis), tone: km != null && km < 2 ? 'warn' : 'good' },
      { k: 'Assessment', v: band, tone: km != null && km < 2 ? 'warn' : 'good' },
      { k: 'Cloud cover', v: `${Math.round(curr.cloudCover ?? 0)}%` },
      { k: 'Rain', v: `${ctx.maxProb6h}% in 6h`, tone: ctx.maxProb6h >= 50 ? 'warn' : undefined },
    ];

    return {
      icon: '🌫️',
      tone: km != null && km < 2 ? 'warn' : 'good',
      title: `Visibility · ${ctx.loc}`,
      bullets,
      note: km != null && km < 2
        ? 'Visibility is low enough to matter for driving. Avoid high beams and leave a large gap.'
        : 'Visibility is fine for travel.',
      actions: [{ id: 'radar', label: 'Rain radar', icon: '🌧️' }],
      followups: ['Driving conditions right now?', 'Sunset time tonight?', 'Plan my day'],
    };
  }

  _answerThunderstorm(ctx) {
    const { curr } = ctx;
    const code = curr.weatherCode ?? 0;
    const storm = code >= 95 && code <= 99;
    const severe = code >= 95 || (curr.windGusts ?? 0) >= 60 || (curr.precipitation ?? 0) >= 5;

    const bullets = [
      { k: 'Right now', v: storm ? `${curr.icon} Active thunderstorm` : `${curr.icon} ${curr.description}`, tone: storm ? 'warn' : 'good' },
      { k: 'Rain risk', v: `${ctx.maxProb3h}% in 3h · ${ctx.maxProb6h}% in 6h`, tone: ctx.maxProb6h >= 60 ? 'warn' : undefined },
      { k: 'Wind', v: `${this._fmt().wind(curr.windSpeed)}${curr.windGusts != null ? ` · gusting ${this._fmt().wind(curr.windGusts)}` : ''}`, tone: severe ? 'warn' : undefined },
      { k: 'Pressure', v: ctx.pressure ? `${ctx.pressure.icon} ${ctx.pressure.label}` : 'Not available', tone: ctx.pressure?.direction === 'falling' ? 'warn' : undefined },
    ];
    if (ctx.windShift) bullets.push({ k: 'Wind shift', v: ctx.windShift.label, tone: 'warn' });

    return {
      icon: '⛈️',
      tone: severe ? 'warn' : 'info',
      title: `Storm watch · ${ctx.loc}`,
      bullets,
      note: severe
        ? 'Stormy conditions. Shelter away from open ground and avoid sheltering under isolated trees.'
        : `No active thunderstorm, but rain risk peaks at ${ctx.maxProb6h}% over the next 6 hours.`,
      actions: [
        { id: 'radar', label: 'Radar cells', icon: '🌧️' },
        { id: 'isobars', label: 'Pressure map', icon: '📈' },
      ],
      followups: ['When does the rain start?', 'How strong are the wind gusts?', 'Driving conditions right now?'],
    };
  }

  _answerSolar(ctx) {
    const f = this._fmt();
    const { curr, h, idx } = ctx;
    const uv = curr.uvIndex ?? 0;
    const cloud = curr.cloudCover ?? 0;
    const radiation = h?.direct_normal_irradiance?.[idx] ?? h?.shortwave_radiation?.[idx] ?? null;
    const peakUv = ctx.today?.uvIndexMax ?? uv;
    
    // Photovoltaic generation efficiency estimation
    const genIndex = cloud < 20 ? 95 : cloud < 50 ? 75 : cloud < 80 ? 40 : 15;
    const genTone = genIndex >= 70 ? 'good' : genIndex >= 40 ? 'info' : 'warn';
    const genLabel = genIndex >= 80 ? 'Peak generation' : genIndex >= 60 ? 'Favorable' : genIndex >= 35 ? 'Moderate' : 'Low output';

    const bullets = [
      { k: 'PV generation potential', v: `${genIndex}% · ${genLabel}`, tone: genTone },
      { k: 'Cloud attenuation', v: `${Math.round(cloud)}% sky cover`, tone: cloud > 70 ? 'warn' : 'good' },
      { k: 'Current UV index', v: `${uv.toFixed(1)} (Peak: ${peakUv.toFixed(1)})` },
    ];
    if (radiation != null) {
      bullets.push({ k: 'Solar irradiance', v: `${Math.round(radiation)} W/m²` });
    }
    if (ctx.today?.sunrise && ctx.today?.sunset) {
      bullets.push({ k: 'Effective daylight', v: `${ctx.today.sunrise} – ${ctx.today.sunset}` });
    }

    return {
      icon: '☀️',
      tone: genTone,
      title: `Solar & Photovoltaic Potential · ${ctx.loc}`,
      bullets,
      note: genIndex >= 70
        ? 'Excellent conditions for solar panels and battery storage charging today.'
        : 'Cloud cover is attenuating direct solar irradiance; generation will be predominantly diffuse.',
      actions: [{ id: 'tab', label: 'View metrics', icon: '📊', payload: { tab: 'metrics' } }],
      followups: ['When is golden hour?', 'What is the UV index today?', 'Plan my day'],
    };
  }

  _answerClothing(ctx) {
    const f = this._fmt();
    const { curr } = ctx;
    const t = curr.feelsLike ?? curr.temperature ?? 20;
    const rain = ctx.maxProb3h >= 40;
    const gusty = ctx.gusty;
    const uv = (curr.uvIndex ?? 0) >= 5;

    let layers, base, outer, accessories = [];

    if (t >= 28) {
      layers = 'Single light layer';
      base = 'Breathable cotton or linen t-shirt, shorts';
      outer = 'None needed';
    } else if (t >= 22) {
      layers = 'Comfortable light layer';
      base = 'T-shirt or light button-down with chinos or jeans';
      outer = 'Light overshirt optional for evening';
    } else if (t >= 16) {
      layers = '2 layers recommended';
      base = 'Long-sleeve shirt or t-shirt';
      outer = 'Light jacket, cardigan, or hoodie';
    } else if (t >= 9) {
      layers = 'Warm insulation layer';
      base = 'Thermal or long-sleeve tee with sweater';
      outer = 'Fleece, trench coat, or insulated autumn jacket';
    } else if (t >= 0) {
      layers = 'Full thermal layering';
      base = 'Thermal undergarment, thick knit sweater';
      outer = 'Heavy winter coat or parka with windproofing';
      accessories.push('gloves', 'beanie/toque');
    } else {
      layers = 'Extreme sub-zero insulation';
      base = 'Double thermals & fleece mid-layer';
      outer = 'Heavy down parka with fur/hood trim';
      accessories.push('insulated mittens', 'thermal neck gaiter', 'wool beanie');
    }

    if (rain) accessories.push('compact umbrella or rain shell');
    if (gusty) accessories.push('windbreaker jacket recommended');
    if (uv) accessories.push('sunglasses & UV hat');

    const bullets = [
      { k: 'Feels like', v: `${f.temp(t)} · ${layers}` },
      { k: 'Recommended base', v: base },
      { k: 'Outerwear', v: outer },
      { k: 'Essential accessories', v: accessories.length ? accessories.join(', ') : 'None required' },
    ];

    return {
      icon: '🧥',
      tone: 'info',
      title: `Outfit & Clothing Guidance · ${ctx.loc}`,
      bullets,
      note: `Tuned for real-time conditions: ${f.temp(curr.temperature)} temperature, ${Math.round(curr.humidity ?? 0)}% humidity, and ${f.wind(curr.windSpeed)} wind.`,
      actions: [{ id: 'briefing', label: 'Full weather briefing', icon: '📝' }],
      followups: ['Will it rain?', 'How windy is it?', 'Plan my day'],
    };
  }

  /** ── Packing advice ──────────────────────────────────────────── */
  _answerPacking(ctx) {
    const f = this._fmt();
    const { curr, today } = ctx;
    const t = curr.feelsLike ?? curr.temperature ?? 20;
    const rain = ctx.maxProb6h >= 40 || ctx.precip24h > 5;
    const uv = (curr.uvIndex ?? 0) >= 5;
    const windy = (curr.windGusts ?? 0) >= 30;
    const cold = t <= 10;
    const hot = t >= 28;

    const items = [];
    if (cold) items.push('warm coat or jacket', 'sweater or fleece', 'long pants');
    else if (hot) items.push('light breathable clothing', 'shorts or skirt', 't-shirt or tank top');
    else items.push('light jacket or cardigan', 'long-sleeve shirts', 'jeans or trousers');

    if (rain) items.push('umbrella or rain shell', 'waterproof shoes');
    if (uv) items.push('sunglasses', 'sun hat or cap');
    if (windy) items.push('windbreaker', 'hat with chin strap');
    if (today && today.minTemp != null && today.minTemp < t - 8) items.push('extra layer for evening');

    return {
      icon: '🧳',
      tone: 'info',
      title: `Packing List · ${ctx.loc}`,
      bullets: [
        { k: 'Conditions', v: `${f.temp(curr.temperature)} · ${curr.description} · ${Math.round(curr.humidity ?? 0)}% humidity` },
        { k: 'Pack', v: items.length ? items.join(', ') : 'Light clothes and basics' },
      ],
      note: items.length
        ? `Pack for ${Math.round(t)}°C with ${rain ? 'rain' : 'no significant rain'} expected. Layer up if temperatures drop overnight.`
        : 'Pack light — comfortable conditions.',
      actions: [{ id: 'tab', label: 'Daily forecast', icon: '📑', payload: { tab: 'daily' } }],
      followups: ['Will it rain?', 'What should I wear?', 'Plan my day'],
    };
  }

  /** ── Running advice ──────────────────────────────────────────── */
  _answerRunning(ctx) {
    const f = this._fmt();
    const { curr } = ctx;
    const t = curr.temperature ?? 20;
    const h = curr.humidity ?? 50;
    const heatIndex = t + 0.33 * (h - 50) - 0.7 * (curr.windSpeed ?? 0) - 4;
    const rain = ctx.maxProb6h >= 40;
    const aqi = ctx.aqi ?? 50;

    let advice = 'Great running weather.';
    let tone = 'good';
    if (heatIndex >= 30) {
      advice = 'Heat risk — run early or evening, hydrate well, shorten your run.';
      tone = 'warn';
    } else if (heatIndex >= 25) {
      advice = 'Warm — hydrate, wear light clothing, consider a shorter route.';
      tone = 'warn';
    } else if (t <= 5) {
      advice = 'Cold — warm up thoroughly, cover extremities, watch for ice.';
      tone = 'warn';
    } else if (rain) {
      advice = 'Wet — wear a rain shell, watch for slippery surfaces.';
      tone = 'warn';
    }
    if (aqi > 100) {
      advice = 'Poor air quality — consider indoor training instead.';
      tone = 'warn';
    }

    return {
      icon: '🏃',
      tone,
      title: `Running Conditions · ${ctx.loc}`,
      bullets: [
        { k: 'Feels like', v: `${f.temp(curr.feelsLike ?? t)} · heat index ≈ ${Math.round(heatIndex)}°C` },
        { k: 'Air quality', v: ctx.aqi != null ? `US AQI ${ctx.aqi} (${f.aqi(ctx.aqi)})` : 'Not available', tone: ctx.aqi > 100 ? 'warn' : 'good' },
        { k: 'Wind', v: `${f.wind(curr.windSpeed)} ${f.dir(curr.windDirection)}`, tone: (curr.windGusts ?? 0) > 30 ? 'warn' : undefined },
        { k: 'Rain (6h)', v: `${ctx.maxProb6h}%`, tone: ctx.maxProb6h >= 50 ? 'warn' : 'good' },
      ],
      note: advice,
      actions: [{ id: 'tab', label: 'Hourly detail', icon: '📑', payload: { tab: 'hourly' } }],
      followups: ['Is the air safe?', 'Will it rain?', 'Best outdoor window today?'],
    };
  }

  /** ── Cycling advice ──────────────────────────────────────────── */
  _answerCycling(ctx) {
    const f = this._fmt();
    const { curr } = ctx;
    const t = curr.temperature ?? 20;
    const wind = curr.windSpeed ?? 0;
    const gusts = curr.windGusts ?? 0;
    const vis = curr.visibility ?? 10000;
    const rain = ctx.maxProb6h >= 40;

    let advice = 'Great cycling weather.';
    let tone = 'good';
    if (gusts >= 35) {
      advice = 'Strong winds — expect headwinds on exposed roads, take extra care.';
      tone = 'warn';
    } else if (wind >= 20) {
      advice = 'Breezy — plan for headwinds on exposed sections.';
      tone = 'warn';
    } else if (rain) {
      advice = 'Wet roads — reduce speed, increase braking distance.';
      tone = 'warn';
    } else if (t <= 2) {
      advice = 'Freezing — watch for ice, especially on bridges and shaded roads.';
      tone = 'warn';
    } else if (t >= 30) {
      advice = 'Hot — carry water, ride early or evening.';
      tone = 'warn';
    }
    if (vis < 3000) {
      advice = 'Low visibility — use lights, wear high-visibility clothing.';
      tone = 'warn';
    }

    return {
      icon: '🚴',
      tone,
      title: `Cycling Conditions · ${ctx.loc}`,
      bullets: [
        { k: 'Wind', v: `${f.wind(wind)} ${f.dir(curr.windDirection)}${gusts > wind ? ` · gusting ${f.wind(gusts)}` : ''}`, tone: gusts >= 30 ? 'warn' : undefined },
        { k: 'Temperature', v: `${f.temp(t)} · feels like ${f.temp(curr.feelsLike ?? t)}` },
        { k: 'Visibility', v: `${Math.round(vis / 1000)} km`, tone: vis < 3000 ? 'warn' : 'good' },
        { k: 'Rain (6h)', v: `${ctx.maxProb6h}%`, tone: ctx.maxProb6h >= 50 ? 'warn' : 'good' },
      ],
      note: advice,
      actions: [{ id: 'tab', label: 'Hourly detail', icon: '📑', payload: { tab: 'hourly' } }],
      followups: ['How windy is it?', 'Will it rain?', 'Best outdoor window today?'],
    };
  }

  /** ── Work from home advice ───────────────────────────────────── */
  _answerWorkFromHome(ctx) {
    const f = this._fmt();
    const { curr } = ctx;
    const t = curr.temperature ?? 20;
    const gusts = curr.windGusts ?? 0;
    const rain = ctx.maxProb6h >= 50 || ctx.precip24h > 10;
    const severe = curr.weatherCode >= 95 || gusts >= 65 || t <= -10 || t >= 40;
    const flood = ctx.precip24h >= 40;

    let advice = 'Good day to go into the office — conditions are fine.';
    let tone = 'good';
    if (severe) {
      advice = 'Severe weather — work from home if possible. Stay safe.';
      tone = 'warn';
    } else if (flood) {
      advice = 'Heavy rain — flooding possible, consider working from home.';
      tone = 'warn';
    } else if (gusts >= 50 || (t <= -5 && curr.precipitation > 0)) {
      advice = 'Very windy or freezing with precipitation — WFH recommended.';
      tone = 'warn';
    } else if (rain) {
      advice = 'Rainy — commute will be slower, WFH is a comfortable option.';
      tone = 'info';
    }

    return {
      icon: '💻',
      tone,
      title: `Work From Home · ${ctx.loc}`,
      bullets: [
        { k: 'Conditions', v: `${curr.icon} ${curr.description} · ${f.temp(curr.temperature)}` },
        { k: 'Wind', v: `${f.wind(curr.windSpeed)} ${f.dir(curr.windDirection)}${curr.windGusts > curr.windSpeed ? ` · gusting ${f.wind(curr.windGusts)}` : ''}` },
        { k: 'Rain (6h)', v: `${ctx.maxProb6h}%`, tone: ctx.maxProb6h >= 50 ? 'warn' : 'good' },
        { k: 'Precipitation (24h)', v: f.precip(ctx.precip24h), tone: ctx.precip24h > 10 ? 'warn' : undefined },
      ],
      note: advice,
      actions: [{ id: 'tab', label: 'Hourly detail', icon: '📑', payload: { tab: 'hourly' } }],
      followups: ['Will it rain?', 'How strong are the wind gusts?', 'Commute conditions'],
    };
  }

  _answerPollen(ctx) {
    const f = this._fmt();
    const { curr } = ctx;
    const wind = curr.windSpeed ?? 0;
    const humidity = curr.humidity ?? 50;
    const rain = ctx.maxProb6h >= 50;

    // Aerobiological dispersion formula
    // High wind + dry humidity + warm temperature = extreme pollen dispersion
    // Rain washes airborne allergens out of the boundary layer
    let pollenLevel = 'Low';
    let tone = 'good';
    let advisory = 'Clean air. Favorable for allergy and asthma sufferers.';

    if (rain) {
      pollenLevel = 'Very Low (Rain-scrubbed)';
      tone = 'good';
      advisory = 'Active or imminent precipitation is washing airborne pollen particles from the troposphere.';
    } else if (wind >= 20 && humidity < 50 && (curr.temperature ?? 15) >= 18) {
      pollenLevel = 'High / Elevated';
      tone = 'warn';
      advisory = 'Dry, gusty winds are actively dispersing airborne tree and grass pollens. Keep windows closed.';
    } else if (wind >= 12 && humidity < 65) {
      pollenLevel = 'Moderate';
      tone = 'info';
      advisory = 'Mild allergen dispersion. Sensitive individuals should take normal allergy precautions.';
    }

    const bullets = [
      { k: 'Allergen dispersion risk', v: pollenLevel, tone },
      { k: 'Air quality (AQI)', v: ctx.aqi != null ? `US AQI ${ctx.aqi} (${f.aqi(ctx.aqi)})` : 'Good' },
      { k: 'Humidity & moisture', v: `${humidity}% · ${humidity < 45 ? 'Dry (high float)' : 'Moist (settles)'}` },
      { k: 'Atmospheric transport', v: `${f.wind(wind)} · ${wind >= 20 ? 'Active dispersal' : 'Calm air'}` },
    ];

    return {
      icon: '🌿',
      tone,
      title: `Pollen & Allergy Index · ${ctx.loc}`,
      bullets,
      note: advisory,
      actions: [{ id: 'tab', label: 'Air quality metrics', icon: '🍃', payload: { tab: 'metrics' } }],
      followups: ['Is the air quality bad?', 'Should I wear a mask?', 'Plan my day'],
    };
  }

  _answerHazard(ctx) {
    const f = this._fmt();
    const { curr } = ctx;
    const advisories = ctx.advisories || [];
    const precip24h = ctx.precip24h ?? 0;
    const gusts = curr.windGusts ?? curr.windSpeed ?? 0;

    const bullets = [];
    let severe = false;

    if (advisories.length) {
      severe = true;
      for (const adv of advisories.slice(0, 3)) {
        bullets.push({ k: 'Active Advisory', v: adv.title, tone: 'warn' });
      }
    }

    if (precip24h >= 40) {
      severe = true;
      bullets.push({ k: 'Hydrological hazard', v: `${f.precip(precip24h)} rain in 24h — water accumulation risk`, tone: 'warn' });
    } else {
      bullets.push({ k: 'Flood risk', v: 'Low — no excessive runoff accumulation projected', tone: 'good' });
    }

    if (gusts >= 65) {
      severe = true;
      bullets.push({ k: 'Severe Gale / Wind', v: `${f.wind(gusts)} gusts — potential branch & structural hazard`, tone: 'warn' });
    } else {
      bullets.push({ k: 'Wind danger', v: `${f.wind(gusts)} peak gusts — within standard thresholds`, tone: 'good' });
    }

    bullets.push({ k: 'Thunderstorm potential', v: curr.weatherCode === 95 || curr.weatherCode === 96 || curr.weatherCode === 99 ? 'Active electrical activity' : 'No severe convective storms detected' });

    return {
      icon: severe ? '⚠️' : '🛡️',
      tone: severe ? 'warn' : 'good',
      title: `Severe Weather & Hazard Assessment · ${ctx.loc}`,
      bullets,
      note: severe
        ? 'Hazardous meteorological conditions active. Stay informed and monitor local emergency advisories.'
        : 'All real-time atmospheric readings and barometric gradients remain within safe standard parameters.',
      actions: [
        { id: 'radar', label: 'Inspect radar', icon: '🌧️' },
        { id: 'isobars', label: 'Barometric isobars', icon: '📈' },
      ],
      followups: ['When does the rain start?', 'How strong are the wind gusts?', 'Driving conditions right now?'],
    };
  }

  _answerForecast(ctx) {
    const daily = (ctx.daily || []).slice(Math.max(0, ctx.todayIdx));
    if (!daily.length) return { icon: '📅', tone: 'warn', title: 'Forecast', bullets: [this._noData('Daily forecast')] };

    const bullets = daily.slice(0, 7).map((d, i) => {
      const date = new Date(`${d.date}T12:00:00`);
      const label = i === 0 ? 'Today' : date.toLocaleDateString(undefined, { weekday: 'short' });
      return {
        k: `${d.icon} ${label}`,
        v: `${this._fmt().temp(d.minTemp)}–${this._fmt().temp(d.maxTemp)} · ${d.description} · ${d.precipProb ?? 0}%`,
      };
    });

    const wetDays = daily.slice(0, 7).filter((d) => (d.precipProb ?? 0) >= 50).length;
    return {
      icon: '📅',
      tone: 'info',
      title: `${daily.length}-day outlook · ${ctx.loc}`,
      bullets,
      note: wetDays ? `${wetDays} of the next ${Math.min(7, daily.length)} days look wet (50%+ chance).` : 'No day in the next week exceeds a 50% rain chance.',
      actions: [{ id: 'tab', label: 'Daily tab', icon: '📑', payload: { tab: 'daily' } }],
      followups: ['Plan my day', 'When does the rain start?', 'Best outdoor window today?'],
    };
  }

  _answerOverview(ctx) {
    const f = this._fmt();
    const { curr } = ctx;
    const bullets = [
      { k: 'Conditions', v: `${curr.icon} ${curr.description}` },
      { k: 'Temperature', v: `${f.temp(curr.temperature)} · feels like ${f.temp(curr.feelsLike)}` },
      { k: 'Humidity', v: `${curr.humidity ?? '--'}%` },
      { k: 'Wind', v: `${f.wind(curr.windSpeed)} ${f.dir(curr.windDirection)}` },
      { k: 'Visibility', v: f.vis(curr.visibility) },
      { k: 'Rain (6h)', v: `${ctx.maxProb6h}% peak`, tone: ctx.maxProb6h >= 50 ? 'warn' : 'good' },
      { k: 'Air quality', v: ctx.aqi != null ? `US AQI ${ctx.aqi} (${f.aqi(ctx.aqi)})` : 'Not available' },
      { k: 'UV index', v: curr.uvIndex != null ? curr.uvIndex.toFixed(1) : '--' },
    ];
    if (ctx.comfort != null) bullets.push({ k: 'Comfort', v: `${ctx.comfort}/100 · ${ctx.comfortLabel?.label ?? ''}`, tone: ctx.comfort >= 70 ? 'good' : 'warn' });
    if (ctx.advisories.length) bullets.push({ k: 'Advisory', v: ctx.advisories[0].title, tone: 'warn' });

    return {
      icon: curr.icon || '🌤️',
      tone: 'info',
      title: `Current conditions · ${ctx.loc}`,
      bullets,
      actions: [{ id: 'briefing', label: 'Full briefing', icon: '📝' }],
      followups: ['Plan my day', 'When does the rain start?', "Tomorrow's forecast"],
    };
  }

  /** "Morning briefing" — day-ahead summary; also pins the Overview card. */
  _answerDailyBriefing(ctx) {
    const f = this._fmt();
    const { curr, today } = ctx;
    const w = ctx.bestWindow;
    const bullets = [];

    bullets.push({
      k: 'Now',
      v: `${curr.icon} ${f.temp(curr.temperature)} · ${curr.description} (feels ${f.temp(curr.feelsLike)})`,
    });
    if (today) {
      bullets.push({ k: 'Day range', v: `${f.temp(today.minTemp)} – ${f.temp(today.maxTemp)}` });
    }
    if (ctx.nextRainIdx != null) {
      const away = Math.max(0, ctx.nextRainIdx - ctx.idx);
      bullets.push({
        k: 'Rain arrives',
        v: `${this._fmtHour(ctx.nextRainTime)}${away > 0 ? ` (in ${away}h)` : ''}`,
        tone: away <= 3 ? 'warn' : undefined,
      });
    } else {
      bullets.push({ k: 'Rain', v: `Low — ${ctx.maxProb24h}% peak over 24h`, tone: 'good' });
    }
    if (w) {
      let sh = NaN;
      let eh = NaN;
      try {
        sh = new Date(w.startTime).getHours();
        eh = new Date(w.endTime).getHours();
      } catch { /* keep NaN → not overnight */ }
      const overnight = Number.isFinite(sh) && Number.isFinite(eh) && sh > eh;
      bullets.push({
        k: 'Best outdoor window',
        v: `${this._fmtHour(w.startTime)} – ${this._fmtHour(w.endTime)}${overnight ? ' (overnight)' : ''} (${w.hours}h)`,
        tone: 'good',
      });
    }
    if (ctx.advisories.length) {
      bullets.push({ k: 'Watch out', v: ctx.advisories[0].title, tone: 'warn' });
    }
    if (ctx.comfort != null) {
      bullets.push({
        k: 'Comfort',
        v: `${ctx.comfort}/100${ctx.comfortLabel ? ` · ${ctx.comfortLabel.label}` : ''}`,
        tone: ctx.comfort >= 70 ? 'good' : 'warn',
      });
    }

    // Make sure the pinned card exists too.
    try {
      this.app?.renderDailyBriefing?.(true);
    } catch {
      /* card is best-effort */
    }

    return {
      icon: '🌤️',
      tone: 'info',
      title: `Day ahead · ${ctx.loc}`,
      bullets,
      note: 'The full briefing card is pinned at the top of the Overview tab.',
      actions: [
        { id: 'briefing', label: 'Full briefing', icon: '📝' },
        { id: 'tab', label: 'Overview tab', icon: '📑', payload: { tab: 'overview' } },
      ],
      followups: ['Plan my day', 'Best outdoor window today?', 'Notify me before rain'],
    };
  }

  _answerCompare(ctx) {
    const home = this.app?.defaultLocation;
    if (!home) {
      return {
        icon: '🏠',
        tone: 'warn',
        title: 'No home location set',
        bullets: [{ k: 'Status', v: 'Aura has nothing to compare against yet' }],
        note: 'Set a home location in Aurafisky settings — or name both cities, like "Delhi vs Mumbai" — then ask again.',
        actions: [{ id: 'compareHome', label: 'Try anyway', icon: '🏠' }],
        followups: ['What is the weather like here?', 'Plan my day'],
      };
    }
    return {
      icon: '⚖️',
      tone: 'info',
      title: 'Compare with home',
      bullets: [
        { k: 'Here', v: ctx.loc },
        { k: 'Home', v: home.name },
      ],
      note: `Opening a side-by-side comparison of ${ctx.loc} and ${home.name}.`,
      actions: [{ id: 'compareHome', label: `Compare with ${home.name}`, icon: '⚖️' }],
      followups: ['What is the weather like here?', 'Plan my day'],
    };
  }

  /** Condense a fetched forecast + resolved place into compare-fodder. */
  _citySnapshot(name, data) {
    if (!data?.hourly?.time?.length) return null;
    const S = ws();
    const idx = S?.getCurrentHourIndex
      ? S.getCurrentHourIndex(data, data.utc_offset_seconds || 0)
      : 0;
    const curr = S?.getHourlyAtIndex ? S.getHourlyAtIndex(data, idx) : null;
    if (!curr) return null;

    const prob = data.hourly.precipitation_probability || [];
    const slice = (arr, start, len) =>
      arr.slice(start, start + len).filter((n) => typeof n === 'number');
    const prob6 = slice(prob, idx, 6);
    const prob24 = slice(prob, idx, 24);

    // Today's range: the first daily row matching the current hour's date.
    const dateKey = (data.hourly.time[idx] || '').slice(0, 10);
    const dIdx = data.daily?.time ? data.daily.time.indexOf(dateKey) : -1;
    const todayMax = dIdx >= 0 ? data.daily.temperature_2m_max?.[dIdx] : null;
    const todayMin = dIdx >= 0 ? data.daily.temperature_2m_min?.[dIdx] : null;

    return {
      name: shortPlaceName(name),
      temperature: curr.temperature ?? 0,
      feelsLike: curr.feelsLike ?? curr.temperature ?? 0,
      description: curr.description || '',
      icon: curr.icon || '🌤️',
      humidity: curr.humidity,
      windSpeed: curr.windSpeed ?? 0,
      windGusts: curr.windGusts ?? 0,
      windDirection: curr.windDirection,
      prob6h: prob6.length ? Math.max(...prob6) : 0,
      prob24h: prob24.length ? Math.max(...prob24) : 0,
      todayMax: todayMax ?? curr.temperature ?? 0,
      todayMin: todayMin ?? curr.temperature ?? 0,
    };
  }

  /** Resolve one place name → geocoded + fetched snapshot, tolerantly. */
  async _resolveCity(place) {
    const S = ws();
    if (!S?.searchLocations || !S?.fetchForecast) return { ok: false, place };
    let results = [];
    try {
      results = await S.searchLocations(place);
    } catch {
      results = [];
    }
    if (!results.length) return { ok: false, place };
    const best = results[0];
    let data = null;
    try {
      data = await S.fetchForecast(best.latitude, best.longitude);
    } catch {
      data = null;
    }
    const snap = data ? this._citySnapshot(best.displayName || best.name, data) : null;
    return snap ? { ok: true, place: best, snap } : { ok: false, place };
  }

  async _answerComparePlaces(aName, bName, ctx) {
    const S = ws();
    if (!S?.searchLocations) {
      return {
        icon: '⚠️',
        tone: 'warn',
        title: 'Comparison unavailable',
        bullets: [{ k: 'Reason', v: 'The geocoding service is not loaded' }],
      };
    }

    const norm = (s) => s.trim().toLowerCase();
    if (norm(aName) === norm(bName)) {
      return {
        icon: '🤔',
        tone: 'info',
        title: 'Same place twice',
        bullets: [{ k: 'Tip', v: 'Name two different cities, like "Delhi vs Mumbai"' }],
      };
    }

    const [A, B] = await Promise.all([this._resolveCity(aName), this._resolveCity(bName)]);

    if (!A.ok && !B.ok) {
      return {
        icon: '🔍',
        tone: 'warn',
        title: `Couldn't find "${aName}" or "${bName}"`,
        bullets: [{ k: 'Tried', v: 'Open-Meteo geocoding for both' }],
        note: 'Aurafisky geocodes towns and cities — try larger nearby names.',
      };
    }
    if (!A.ok || !B.ok) {
      const found = A.ok ? A : B;
      const missing = A.ok ? bName : aName;
      const f = found.snap;
      return {
        icon: '⚠️',
        tone: 'warn',
        title: `Found ${f.name}, but not "${missing}"`,
        bullets: [
          { k: f.name, v: `${f.icon} ${Math.round(f.temperature)}° · ${f.description}` },
          { k: 'Rain (6h)', v: `${f.prob6h}%` },
        ],
        note: 'I can only compare when both places resolve. Try a larger city near it.',
      };
    }

    const { bullets, verdict, tone } = buildCompareSummary(A.snap, B.snap);
    return {
      icon: '⚖️',
      tone,
      title: `${A.snap.name} vs ${B.snap.name}`,
      bullets,
      note: verdict,
      actions: [
        { id: 'goPlace', label: `Open ${A.snap.name}`, icon: '📍', payload: { lat: A.place.latitude, lng: A.place.longitude, name: A.place.displayName || A.place.name } },
        { id: 'goPlace', label: `Open ${B.snap.name}`, icon: '📍', payload: { lat: B.place.latitude, lng: B.place.longitude, name: B.place.displayName || B.place.name } },
      ],
      followups: ['Plan my day', 'When does the rain start?', 'Best outdoor window today?'],
    };
  }

  _answerLayers(ctx) {
    return {
      icon: '🗺️',
      tone: 'info',
      title: 'Map layers',
      bullets: [
        { k: 'Rain radar', v: 'RainViewer animation of live precipitation cells' },
        { k: 'Pressure map', v: 'Isobars contoured from live sea-level pressure' },
        { k: 'Day/night line', v: 'The terminator showing where it is dark right now' },
        { k: 'Climate extremes', v: 'Historic temperature records for this region' },
        { k: 'Time machine', v: 'Step back through past years for the same day' },
      ],
      note: `Tap a button to toggle it for ${ctx.loc || 'the current view'}.`,
      actions: [
        { id: 'radar', label: 'Rain radar', icon: '🌧️' },
        { id: 'isobars', label: 'Pressure map', icon: '📈' },
        { id: 'terminator', label: 'Day/night', icon: '🌗' },
        { id: 'extremes', label: 'Extremes', icon: '📊' },
      ],
      followups: ['Will it rain?', 'How strong are the wind gusts?', 'Plan my day'],
    };
  }

  _answerAlert(query, ctx) {
    // Pick the metric from the phrasing, defaulting to rain because that is
    // what people ask Aura to watch most.
    let type = 'precipProb';
    let condition = 'above';
    let value = 50;

    if (/\b(aqi|air|pollut|smog)\b/.test(query)) {
      type = 'aqi';
      value = 100;
    } else if (/\b(wind|gust)\b/.test(query)) {
      type = 'windSpeed';
      value = 40;
    } else if (/\b(temp|hot|cold|freez|heat)\b/.test(query)) {
      type = 'temperature';
      value = 35;
    }

    const num = query.match(/(\d{1,3})\s*(%|deg|c\b|f\b|km|aqi)?/i);
    if (num) {
      const parsed = Number(num[1]);
      if (Number.isFinite(parsed) && parsed > 0) {
        value = parsed;
        if (type === 'precipProb') value = Math.min(100, parsed);
        if (type === 'aqi') value = Math.min(500, parsed);
      }
    }
    if (/\b(below|under|less than|drop|dropping|fall|cold(er)?)\b/.test(query) && type === 'temperature') condition = 'below';

    const labels = {
      precipProb: `Rain chance above ${value}%`,
      aqi: `Air quality above ${value} AQI`,
      windSpeed: `Wind above ${value} km/h`,
      temperature: `Temperature ${condition === 'above' ? 'above' : 'below'} ${value}°`,
    };

    return {
      icon: '🔔',
      tone: 'info',
      title: 'Set an alert',
      bullets: [
        { k: 'Watching', v: labels[type] },
        { k: 'For', v: ctx.loc },
        { k: 'Delivery', v: 'Aurafisky alerts in-app and via notification if permitted' },
      ],
      note: `Tap the button to create it. You can edit or delete rules any time from Manage alerts.`,
      actions: [
        { id: 'alert', label: labels[type], icon: '🔔', payload: { type, condition, value } },
        { id: 'alertsPanel', label: 'Manage alerts', icon: '⚙️' },
      ],
      followups: ['When does the rain start?', 'Plan my day', 'Air quality'],
    };
  }

  async _answerPlace(place, ctx) {
    if (!place) {
      return {
        icon: '📍',
        tone: 'info',
        title: 'Ask about another place',
        bullets: [{ k: 'Try', v: '"weather in Tokyo tomorrow"' }],
        note: 'Aura will geocode the place, switch the map to it and answer from its forecast.',
      };
    }

    const S = this._activeCtx?.S || ws();
    if (!S?.searchLocations) {
      return {
        icon: '⚠️',
        tone: 'warn',
        title: 'Place search unavailable',
        bullets: [{ k: 'Reason', v: 'The geocoding service is not loaded' }],
      };
    }

    let results = [];
    try {
      results = await S.searchLocations(place);
    } catch {
      results = [];
    }

    if (!results.length) {
      return {
        icon: '🔍',
        tone: 'warn',
        title: `Couldn't find "${place}"`,
        bullets: [{ k: 'Tried', v: 'Open-Meteo geocoding' }],
        note: 'Try a larger nearby city name — Aurafisky geocodes towns and cities, not street addresses.',
        actions: [{ id: 'search', label: 'Open map search', icon: '🔎', payload: { q: place } }],
      };
    }

    const best = results[0];
    try {
      await this.app?.selectLocation?.(best.latitude, best.longitude, best.name);
    } catch {
      /* selecting is best-effort; the answer below still applies */
    }

    // Re-read context after the location switch so the answer reflects the new place.
    await this._sleep(260);
    const fresh = this._context();
    if (!fresh.ready) {
      return {
        icon: '📍',
        tone: 'warn',
        title: `Switched to ${best.name}`,
        bullets: [{ k: 'Status', v: 'Forecast still loading for the new location' }],
        note: 'Ask again in a moment and Aura will have the numbers.',
      };
    }

    const answer = this._answerOverview(fresh);
    answer.title = `${best.name} — current conditions`;
    answer.note = `Matched "${place}" to ${best.displayName || best.name}. The map has moved there.`;
    answer.followups = ['Plan my day', 'When does the rain start?', 'Sunset time tonight?'];
    return answer;
  }

  _answerUnknown(query, ctx) {
    const f = this._fmt();
    const { curr } = ctx;
    const ql = query.toLowerCase();
    // No intent matched — give the conditions plus smart nudges toward what
    // Aura actually understands, based on current conditions.
    const followups = ['What can you do?', 'Plan my day', 'When does the rain start?'];
    if (ctx.maxProb6h >= 50) followups.splice(1, 0, 'When will the rain stop?');
    if ((curr.uvIndex ?? 0) >= 6) followups.splice(1, 0, 'What is the UV index?');
    if (ctx.aqi != null && ctx.aqi > 100) followups.splice(1, 0, 'Is the air safe?');
    if (curr.windGusts >= 40) followups.splice(1, 0, 'How strong are the wind gusts?');

    return {
      icon: '🤔',
      tone: 'info',
      title: `Not sure about "${query.length > 42 ? `${query.slice(0, 42)}…` : query}"`,
      bullets: [
        { k: 'Here now', v: `${curr.icon} ${f.temp(curr.temperature)} · ${curr.description}` },
        { k: 'Rain', v: `${ctx.maxProb6h}% in 6h`, tone: ctx.maxProb6h >= 50 ? 'warn' : 'good' },
        { k: 'Wind', v: `${f.wind(curr.windSpeed)} ${f.dir(curr.windDirection)}` },
        { k: 'Air', v: ctx.aqi != null ? `US AQI ${ctx.aqi}` : 'Not available' },
      ],
      note: 'I match on keywords, so try asking about rain, your commute, a workout, air quality, UV, sunset, stargazing — with "tonight" or "tomorrow" to scope it — or say "notify me when…". You can also ask about packing, running, cycling, or whether to work from home.',
      actions: [
        { id: 'briefing', label: 'Give me a briefing', icon: '📝' },
        { id: 'shareWeather', label: 'Share this weather', icon: '📤' },
        { id: 'exportBriefing', label: 'Export briefing', icon: '💾' },
      ],
      followups: followups.slice(0, 4),
    };
  }

  // ── Small derivations used by several builders ───────────────────

  /** ISO timestamp of the hour `offset` hours from now, for block labelling. */
  _timeAt(ctx, offset) {
    return ctx.h?.time?.[Math.min(ctx.idx + offset, (ctx.h?.time?.length ?? 1) - 1)];
  }

  /**
   * Hourly indices covered by a time scope, using the location-local ISO
   * timestamps ("YYYY-MM-DDTHH:MM") so no timezone conversion is needed.
   * @returns {{indices:number[], label:string}|null} null when no scope.
   */
  _scopedIndices(ctx, scope) {
    if (!scope || !ctx.h?.time?.length) return null;
    const times = ctx.h.time;
    const baseDate = (times[ctx.idx] || '').slice(0, 10);
    if (!baseDate) return null;

    const weekdayOf = (dateStr) => {
      const d = new Date(`${dateStr}T12:00:00`);
      return Number.isNaN(d.getTime()) ? -1 : d.getDay();
    };
    const hourOf = (iso) => parseInt((iso || '').slice(11, 13), 10);

    // Tomorrow's date = the first date after the current one present in data.
    let tomorrowDate = null;
    for (let i = ctx.idx; i < times.length; i++) {
      const dt = (times[i] || '').slice(0, 10);
      if (dt && dt > baseDate) { tomorrowDate = dt; break; }
    }

    const indices = [];
    for (let i = ctx.idx; i < times.length; i++) {
      const t = times[i] || '';
      const dt = t.slice(0, 10);
      const hh = hourOf(t);
      if (!dt || Number.isNaN(hh)) continue;
      switch (scope.kind) {
        case 'morning':
          if (dt === baseDate && hh >= 5 && hh < 12) indices.push(i);
          break;
        case 'afternoon':
          if (dt === baseDate && hh >= 12 && hh < 17) indices.push(i);
          break;
        case 'evening':
          if (dt === baseDate && hh >= 17 && hh < 22) indices.push(i);
          break;
        case 'tonight':
          if (dt === baseDate && hh >= 18) indices.push(i);
          break;
        case 'tomorrow':
          if (tomorrowDate && dt === tomorrowDate) indices.push(i);
          break;
        case 'weekend': {
          const wd = weekdayOf(dt);
          if ((wd === 0 || wd === 6) && dt >= baseDate) indices.push(i);
          break;
        }
        default:
          break;
      }
      if (indices.length >= 48) break;
    }
    return { indices, label: scope.label };
  }

  _eveningSummary(ctx) {
    const { h, idx } = ctx;
    const temps = (h.temperature_2m || []).slice(idx + 4, idx + 12).filter((n) => typeof n === 'number');
    const probs = (h.precipitation_probability || []).slice(idx + 4, idx + 12).filter((n) => typeof n === 'number');
    const temp = temps.length ? `${Math.round(Math.min(...temps))}–${Math.round(Math.max(...temps))}°C` : '--';
    const prob = probs.length ? Math.max(...probs) : 0;
    return `${temp} · ${prob}% rain risk`;
  }

  _blockSummary(ctx, offset, len) {
    const f = this._fmt();
    const { h, idx } = ctx;
    const from = idx + offset;
    const temps = (h.temperature_2m || []).slice(from, from + len).filter((n) => typeof n === 'number');
    const probs = (h.precipitation_probability || []).slice(from, from + len).filter((n) => typeof n === 'number');
    if (!temps.length) return 'No data for this block';
    const prob = probs.length ? Math.max(...probs) : 0;
    return `${Math.round(Math.min(...temps))}–${Math.round(Math.max(...temps))}°C · ${prob}% rain`;
  }

  _windPeak(ctx) {
    const { h, idx } = ctx;
    const speeds = (h.wind_speed_10m || []).slice(idx, idx + 6).filter((n) => typeof n === 'number');
    return speeds.length ? `${this._fmt().wind(Math.max(...speeds))}` : 'No data';
  }
}