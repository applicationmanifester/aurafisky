// features/wallpaper.js
// ── Wallpaper rendering for Aurafisky ───────────────────────────────
//
// Owns the live-wallpaper background and everything derived from it.
//
// Why procedural instead of stock photos:
// The previous implementation pulled 18 hardcoded Unsplash URLs. That cost us
// three things at once — the wallpaper broke offline (Unsplash was never added
// to the service-worker's runtime cache), every wallpaper load leaked the
// user's IP and referrer to a third party, and "Save as image" produced a
// flat purple gradient that looked nothing like the screen.
//
// Drawing the scene on a canvas fixes all three at the root: there is no
// network dependency, no third party, and the exact same renderer paints the
// on-screen background and the exported PNG — so the export is the screen by
// construction rather than by keeping two implementations in sync.

export function init(app) {
  const wallpaper = new WallpaperRenderer(app);
  app.wallpaper = wallpaper;
  const start = () => wallpaper.setup();
  if (typeof document === 'undefined') return wallpaper;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
  return wallpaper;
}

// ── Deterministic randomness ───────────────────────────────────────
// The scene must be identical between the live canvas and the exported PNG,
// so nothing may use Math.random(). Everything derives from a seed built out
// of the location, which also keeps a place's landscape recognisable.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFor(lat, lng) {
  const a = Math.round((Number(lat) || 0) * 1000);
  const b = Math.round((Number(lng) || 0) * 1000);
  return Math.abs(a * 31 + b);
}

// ── Palette ────────────────────────────────────────────────────────
const SCENES = {
  clear_day: { sky: ['#38bdf8', '#7dd3fc', '#bae6fd'], sun: '#fff7ae', terrain: ['#0f766e', '#134e4a', '#0b3b39'], accent: '#fbbf24' },
  clear_night: { sky: ['#020617', '#0f172a', '#1e293b'], sun: '#e2e8f0', terrain: ['#0b1220', '#111827', '#1f2937'], accent: '#c7d2fe' },
  cloudy_day: { sky: ['#94a3b8', '#cbd5e1', '#e2e8f0'], sun: '#f1f5f9', terrain: ['#334155', '#1e293b', '#0f172a'], accent: '#cbd5e1' },
  cloudy_night: { sky: ['#0b1220', '#1e293b', '#475569'], sun: '#cbd5e1', terrain: ['#020617', '#0b1220', '#111827'], accent: '#94a3b8' },
  rain: { sky: ['#111827', '#1f2937', '#374151'], sun: '#9ca3af', terrain: ['#0b1220', '#111827', '#1f2937'], accent: '#60a5fa' },
  storm: { sky: ['#030712', '#0f172a', '#1f2937'], sun: '#6b7280', terrain: ['#020617', '#080d18', '#0f172a'], accent: '#a78bfa' },
  snow: { sky: ['#64748b', '#94a3b8', '#cbd5e1'], sun: '#f8fafc', terrain: ['#1e293b', '#334155', '#475569'], accent: '#e0f2fe' },
  fog: { sky: ['#6b7280', '#9ca3af', '#d1d5db'], sun: '#e5e7eb', terrain: ['#374151', '#4b5563', '#6b7280'], accent: '#e5e7eb' },
};

// ── Preset palettes ──
// Named color overlays the user can apply over any weather scene.
// Each preset has tint colors layered over the scene, plus an optional
// vignette intensity. These are purely cosmetic on top of the weather-driven
// scene below.
const WALLPAPER_PRESETS = {
  none: { label: 'None', description: 'No overlay', tint: null },
  golden: { label: 'Golden Hour', description: 'Warm sunset glow', tint: ['rgba(251,191,36,0.35)', 'rgba(244,114,182,0.22)', 'rgba(56,189,248,0)'] },
  midnight: { label: 'Midnight', description: 'Deep navy nightscape', tint: ['rgba(2,6,23,0.5)', 'rgba(15,23,42,0.5)', 'rgba(15,23,42,0.5)'] },
  sunrise: { label: 'Sunrise Glow', description: 'Soft peach and pink morning', tint: ['rgba(255,204,153,0.4)', 'rgba(255,178,178,0.3)', 'rgba(255,224,178,0.2)'] },
  twilight: { label: 'Twilight', description: 'Deep purple and teal dusk', tint: ['rgba(76,29,149,0.4)', 'rgba(102,102,238,0.3)', 'rgba(63,132,247,0.2)'] },
  forest: { label: 'Forest Haze', description: 'Cool green forest mist', tint: ['rgba(74,122,74,0.35)', 'rgba(94,153,94,0.25)', 'rgba(126,184,126,0.15)'] },
  desert: { label: 'Desert Heat', description: 'Warm orange desert haze', tint: ['rgba(237,137,32,0.4)', 'rgba(234,88,12,0.3)', 'rgba(220,38,38,0.15)'] },
  aurora: { label: 'Aurora', description: 'Vivid green and purple aurora', tint: ['rgba(34,197,94,0.35)', 'rgba(139,92,246,0.25)', 'rgba(16,185,129,0.15)'] },
  monochrome: { label: 'Monochrome', description: 'Black and white classic', tint: ['rgba(255,255,255,0.3)', 'rgba(255,255,255,0.2)', 'rgba(255,255,255,0.1)'] },
};

// Export for use by UI/registry if needed.
export { WALLPAPER_PRESETS };

/** Maps a WMO code + day/night onto a scene key. */
function sceneKey(code, isDay) {
  if (typeof code !== 'number' || Number.isNaN(code)) {
    return isDay ? 'clear_day' : 'clear_night';
  }
  // WMO codes are small integers. Anything outside the published range is
  // not a thunderstorm, so bound the storm check rather than letting an
  // unknown code silently paint lightning across the sky.
  if (code >= 95 && code <= 99) return 'storm';
  if (code >= 71 && code <= 77) return 'snow';
  if (code >= 85 && code <= 86) return 'snow';
  if (code >= 51 && code <= 67) return 'rain';
  if (code >= 80 && code <= 82) return 'rain';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 1 && code <= 3) return isDay ? 'cloudy_day' : 'cloudy_night';
  return isDay ? 'clear_day' : 'clear_night';
}

/**
 * Where the sun is in its daily arc, which drives both the light palette and
 * the position of the sun/moon disc.
 * Returns { phase, progress } — progress is 0..1 across sunrise→sunset.
 */
function sunPhase(now, sunrise, sunset) {
  if (!sunrise || !sunset) {
    return { phase: now.getHours() >= 6 && now.getHours() < 18 ? 'day' : 'night', progress: 0.5 };
  }
  const rise = new Date(sunrise).getTime();
  const set = new Date(sunset).getTime();
  const t = now.getTime();
  if (!Number.isFinite(rise) || !Number.isFinite(set) || set === rise) {
    return { phase: 'day', progress: 0.5 };
  }
  const progress = Math.max(0, Math.min(1, (t - rise) / (set - rise)));
  const minsToRise = (rise - t) / 60000;
  const minsToSet = (t - set) / 60000;
  if (minsToRise > 0 && minsToRise <= 60) return { phase: 'dawn', progress: 0 };
  if (minsToSet >= 0 && minsToSet <= 60) return { phase: 'dusk', progress: 1 };
  if (t >= rise && t <= set) return { phase: 'day', progress };
  return { phase: 'night', progress };
}

/** Warms the sky towards gold around dawn/dusk. */
function applyGoldenHour(ctx, w, h, phase) {
  if (phase !== 'dawn' && phase !== 'dusk') return;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  if (phase === 'dawn') {
    g.addColorStop(0, 'rgba(251,191,36,0.35)');
    g.addColorStop(0.45, 'rgba(244,114,182,0.22)');
    g.addColorStop(1, 'rgba(56,189,248,0)');
  } else {
    g.addColorStop(0, 'rgba(56,189,248,0.05)');
    g.addColorStop(0.5, 'rgba(249,115,22,0.30)');
    g.addColorStop(1, 'rgba(217,70,239,0.28)');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

export class WallpaperRenderer {
  constructor(app) {
    this.app = app;
    this.canvas = null;
    this.ctx = null;
    this.raf = null;
    this.startedAt = 0;
    this.userPhoto = null;      // HTMLImageElement, loaded from local storage
    this.userPhotoDataUrl = '';
    this.deviceWallpaperBusy = false;
    this._wakeLock = null;
    this._onVisibility = () => {
      if (document.visibilityState === 'visible') this.start();
      else this.stop();
    };
    this._reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
    // Preset overlay state
    this.presetName = 'none';
    this.presetOpacity = 0.4;
  }

  setup() {
    if (typeof document === 'undefined') return;
    const mount = document.getElementById('wallpaperSceneCanvas');
    if (!mount) return;
    this.canvas = mount;
    this.ctx = mount.getContext('2d');
    this._loadStoredPhoto();
    document.addEventListener('visibilitychange', this._onVisibility);
  }

  destroy() {
    this.stop();
    document.removeEventListener('visibilitychange', this._onVisibility);
  }

  // ── State for the active tab ─────────────────────────────────────
  _activeTab() {
    const app = this.app;
    return app.wallpaperLocations?.[app.activeWallpaperIndex] || {
      name: app.selectedName || 'Selected Location',
      lat: app.selectedLat ?? app.selectedLat ?? 13.2803,
      lng: app.selectedLng ?? 78.2909,
    };
  }

  _activeWeather() {
    const app = this.app;
    const data = app.wallpaperWeatherData || app.weatherData;
    if (!data?.hourly?.time) return null;
    const idx = app.wallpaperWeatherData ? app.wallpaperCurrentHourIndex : app.currentHourIndex;
    const WS = globalThis.WeatherService;
    if (WS?.getHourlyAtIndex) return WS.getHourlyAtIndex(data, idx);
    return null;
  }

  _activeToday() {
    const app = this.app;
    const data = app.wallpaperWeatherData || app.weatherData;
    const WS = globalThis.WeatherService;
    if (!WS?.getDailyForecast || !data?.daily) return null;
    const daily = WS.getDailyForecast(data);
    if (!daily.length) return null;
    const now = new Date();
    const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const i = daily.findIndex((d) => d.date >= key);
    return daily[i === -1 ? 0 : i] || daily[0];
  }

  /** Everything the renderer needs, in one object. */
  scene() {
    const tab = this._activeTab();
    const weather = this._activeWeather();
    const today = this._activeToday();
    const now = new Date();
    const isDay = weather?.isDay ?? (now.getHours() >= 6 && now.getHours() < 18);
    const code = weather?.weatherCode ?? 0;
    const phase = sunPhase(now, today?.sunrise, today?.sunset);
    return {
      tab,
      weather,
      today,
      now,
      code,
      isDay,
      phase,
      seed: seedFor(tab.lat, tab.lng),
      key: sceneKey(code, isDay),
      moon: globalThis.WeatherService?.getMoonPhase
        ? globalThis.WeatherService.getMoonPhase(now)
        : null,
    };
  }

  // ── Painting ─────────────────────────────────────────────────────

  /**
   * Paints the background scene. Safe to call repeatedly: everything is
   * derived from `seed`, so consecutive frames are stable.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} w @param {number} h
   * @param {object} s scene() result
   * @param {number} t elapsed seconds, drives animated precipitation
   */
  paintScene(ctx, w, h, s, t = 0) {
    const scene = SCENES[s.key] || SCENES.clear_day;
    const rnd = mulberry32(s.seed);

    // ── Sky ──
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, scene.sky[0]);
    sky.addColorStop(0.55, scene.sky[1]);
    sky.addColorStop(1, scene.sky[2]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // ── Stars (night only) ──
    if (s.phase === 'night' && s.key !== 'storm') {
      const sr = mulberry32(s.seed ^ 0x9e37);
      for (let i = 0; i < 140; i++) {
        const x = sr() * w;
        const y = sr() * h * 0.7;
        const r = sr() * 1.6 + 0.3;
        // Gentle twinkle, frozen when the user prefers reduced motion.
        const tw = this._reducedMotion ? 0.7 : 0.45 + 0.55 * Math.abs(Math.sin(t * 1.4 + i));
        ctx.globalAlpha = tw * (0.35 + (1 - y / (h * 0.7)) * 0.65);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // ── Sun / moon disc riding the daily arc ──
    const arcY = h * 0.52;
    const arcX0 = w * 0.08;
    const arcX1 = w * 0.92;
    const arcProgress = s.phase === 'night' ? (s.moon?.phase ?? 0.5) : s.phase.progress;
    const cx = arcX0 + (arcX1 - arcX0) * arcProgress;
    const lift = Math.sin(Math.PI * Math.min(1, Math.max(0, arcProgress)));
    const cy = arcY - lift * h * 0.34;
    const discR = Math.max(28, w * 0.035);
    const isMoon = s.phase === 'night';
    const discColor = isMoon ? '#f1f5f9' : scene.sun;

    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, discR * 6);
    glow.addColorStop(0, isMoon ? 'rgba(226,232,240,0.55)' : 'rgba(255,247,174,0.75)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = discColor;
    ctx.beginPath();
    ctx.arc(cx, cy, discR, 0, Math.PI * 2);
    ctx.fill();

    if (isMoon) {
      // Bite a crescent out of the disc using the phase fraction.
      const illum = (1 - Math.cos((s.moon?.phase ?? 0.5) * 2 * Math.PI)) / 2;
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(cx - discR * (1 - illum) * 1.1, cy - discR * 0.15, discR * 0.95, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }

    applyGoldenHour(ctx, w, h, s.phase);

    // ── Clouds ──
    const cloudiness =
      s.key === 'storm' ? 0.95 :
      s.key === 'rain' ? 0.8 :
      s.key === 'cloudy_day' || s.key === 'cloudy_night' ? 0.7 :
      s.key === 'fog' ? 0.5 :
      s.key === 'snow' ? 0.65 : 0.18;
    const cloudCount = Math.round(cloudiness * 14);
    const cr = mulberry32(s.seed ^ 0x5bf0);
    const cloudDark = s.key === 'storm' ? 'rgba(15,23,42,0.75)' : s.isDay ? 'rgba(255,255,255,0.82)' : 'rgba(71,85,105,0.6)';
    for (let i = 0; i < cloudCount; i++) {
      const baseX = cr() * w;
      const baseY = h * (0.08 + cr() * 0.42);
      const scale = (0.6 + cr() * 0.9) * (w / 1080);
      const drift = this._reducedMotion ? 0 : (t * (4 + cr() * 8)) % (w + 400);
      const x = (baseX + drift) % (w + 400) - 200;
      ctx.fillStyle = cloudDark;
      ctx.globalAlpha = 0.5 + cr() * 0.5;
      for (let p = 0; p < 5; p++) {
        const px = x + (p - 2) * 34 * scale;
        const py = baseY + Math.sin(p * 1.7 + i) * 12 * scale;
        const pr = (26 + cr() * 30) * scale;
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // ── Terrain: three seeded ridge layers ──
    const horizon = h * 0.62;
    const layers = scene.terrain;
    for (let L = 0; L < layers.length; L++) {
      const depth = L / (layers.length - 1 || 1);
      const amp = h * (0.10 - depth * 0.045);
      const baseY = horizon + depth * h * 0.13;
      const rr = mulberry32(s.seed ^ (L * 7919));
      const freq1 = 0.9 + rr() * 1.4;
      const freq2 = 2.7 + rr() * 2.2;
      const ph1 = rr() * Math.PI * 2;
      const ph2 = rr() * Math.PI * 2;
      ctx.fillStyle = layers[L];
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 6) {
        const u = x / w;
        const y =
          baseY -
          Math.sin(u * Math.PI * freq1 + ph1) * amp -
          Math.sin(u * Math.PI * freq2 + ph2) * amp * 0.35;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
    }

    // ── Water band with a reflected horizon ──
    const waterTop = horizon + h * 0.20;
    if (waterTop < h) {
      const wg = ctx.createLinearGradient(0, waterTop, 0, h);
      wg.addColorStop(0, `${layers[layers.length - 1]}dd`);
      wg.addColorStop(1, `${layers[0]}ff`);
      ctx.fillStyle = wg;
      ctx.fillRect(0, waterTop, w, h - waterTop);
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 16; i++) {
        const yy = waterTop + (i / 16) * (h - waterTop);
        const wobble = Math.sin(t * 1.6 + i * 0.8) * (w * 0.01);
        ctx.fillRect(w * 0.5 - w * 0.28 + wobble, yy, w * 0.56, Math.max(1, h * 0.0022));
      }
      ctx.globalAlpha = 1;
    }

    // ── Fog banks ──
    if (s.key === 'fog') {
      const fr = mulberry32(s.seed ^ 0x1234);
      for (let i = 0; i < 6; i++) {
        const y = h * (0.35 + fr() * 0.5);
        const drift = this._reducedMotion ? 0 : Math.sin(t * 0.3 + i) * w * 0.02;
        const g2 = ctx.createLinearGradient(0, y - h * 0.06, 0, y + h * 0.06);
        g2.addColorStop(0, 'rgba(226,232,240,0)');
        g2.addColorStop(0.5, 'rgba(226,232,240,0.5)');
        g2.addColorStop(1, 'rgba(226,232,240,0)');
        ctx.fillStyle = g2;
        ctx.fillRect(0, y - h * 0.06 + drift, w, h * 0.12);
      }
    }

    // ── Lightning ──
    if (s.key === 'storm' && !this._reducedMotion) {
      const cycle = t % 9;
      if (cycle < 0.16) {
        const f = 1 - cycle / 0.16;
        ctx.fillStyle = `rgba(226,232,240,${0.30 * f})`;
        ctx.fillRect(0, 0, w, h);
      }
    }

    // ── Precipitation ──
    const isSnow = s.key === 'snow';
    const isRain = s.key === 'rain' || s.key === 'storm';
    if (isRain || isSnow) {
      const count = isSnow ? 160 : 260;
      const pr = mulberry32(s.seed ^ 0xabc);
      const fallT = this._reducedMotion ? 0 : t;
      ctx.strokeStyle = 'rgba(191,219,254,0.55)';
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = Math.max(1, w / 900);
      for (let i = 0; i < count; i++) {
        const seedX = pr();
        const seedY = pr();
        const speed = 0.5 + pr() * 0.9;
        const driftX = (pr() - 0.5) * 0.25;
        if (isRain) {
          const x = ((seedX + driftX * (fallT * speed) * 0.3) % 1) * w;
          const y = ((seedY + fallT * speed * 1.15) % 1) * h;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - w * 0.006, y + h * 0.035);
          ctx.stroke();
        } else {
          const x = ((seedX + Math.sin(fallT * 0.6 + i) * 0.03 + 1) % 1) * w;
          const y = ((seedY + fallT * speed * 0.16) % 1) * h;
          ctx.beginPath();
          ctx.arc(x, y, Math.max(1, w / 1200) * (1 + seedX), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // ── Preset overlay tint ──
    if (this.presetName && this.presetName !== 'none') {
      const preset = WALLPAPER_PRESETS[this.presetName];
      if (preset && preset.tint) {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, preset.tint[0]);
        g.addColorStop(0.5, preset.tint[1]);
        g.addColorStop(1, preset.tint[2]);
        ctx.fillStyle = g;
        ctx.globalAlpha = this.presetOpacity;
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;
      }
    }

    // ── Vignette + scrim so the overlaid text always stays legible ──
    const vig = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.75);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
  }

  /** Draws a user-supplied photo over the scene (cover-fit), plus a scrim. */
  paintUserPhoto(ctx, w, h) {
    const img = this.userPhoto;
    if (!img || !img.complete || !img.naturalWidth) return;
    const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    const scrim = ctx.createLinearGradient(0, 0, 0, h);
    scrim.addColorStop(0, 'rgba(2,6,23,0.45)');
    scrim.addColorStop(0.5, 'rgba(2,6,23,0.25)');
    scrim.addColorStop(1, 'rgba(2,6,23,0.65)');
    ctx.fillStyle = scrim;
    ctx.fillRect(0, 0, w, h);
  }

  // ── Live loop ────────────────────────────────────────────────────

  _fitCanvas(canvas, w, h) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  _frame = () => {
    if (!this.canvas || !this.ctx) return;
    const w = this.canvas.width / (Math.min(window.devicePixelRatio || 1, 2));
    const h = this.canvas.height / (Math.min(window.devicePixelRatio || 1, 2));
    const t = (performance.now() - this.startedAt) / 1000;
    this.ctx.clearRect(0, 0, w, h);
    this.paintScene(this.ctx, w, h, this.scene(), t);
    this.paintUserPhoto(this.ctx, w, h);
    this.raf = requestAnimationFrame(this._frame);
  };

  start() {
    if (!this.canvas || this.raf) return;
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.ctx = this._fitCanvas(this.canvas, rect.width, rect.height);
    this.startedAt = performance.now();
    this._frame();
    if (!this._reducedMotion) this._acquireWakeLock();
  }

  stop() {
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = null;
    }
    this._releaseWakeLock();
  }

  show() {
    this.start();
  }

  hide() {
    this.stop();
  }

  /** Forces one synchronous repaint — used after the tab/conditions change. */
  refresh() {
    if (this.raf) return;
    this.start();
  }

  // ── Wake Lock (keeps the wallpaper screen on) ────────────────────

  async _acquireWakeLock() {
    try {
      if ('wakeLock' in navigator && !this._wakeLock) {
        this._wakeLock = await navigator.wakeLock.request('screen');
      }
    } catch {
      /* denied or unsupported — the wallpaper still renders, it just may dim */
    }
  }

  _releaseWakeLock() {
    this._wakeLock?.release?.().catch(() => {});
    this._wakeLock = null;
  }

  // ── User photo ───────────────────────────────────────────────────

  _photoKey() {
    return 'aurafisky_wallpaper_photo';
  }

  _loadStoredPhoto() {
    try {
      const data = localStorage.getItem(this._photoKey());
      if (!data) return;
      this.userPhotoDataUrl = data;
      const img = new Image();
      img.onload = () => {
        this.userPhoto = img;
        this.refresh();
      };
      img.src = data;
    } catch {
      /* storage unavailable — stay on the generated scene */
    }
  }

  /**
   * Opens the file picker and stores the chosen image locally. The photo
   * never leaves the device and never touches a third-party host.
   */
  pickPhoto() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        this.app.showToast?.('That file is not an image.', 'error');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || '');
        try {
          localStorage.setItem(this._photoKey(), dataUrl);
        } catch {
          this.app.showToast?.('Image is too large to store on this device.', 'error');
          return;
        }
        this.userPhotoDataUrl = dataUrl;
        const img = new Image();
        img.onload = () => {
          this.userPhoto = img;
          this.refresh();
          this.app.showToast?.('🖼️ Wallpaper photo set', 'success');
        };
        img.onerror = () => this.app.showToast?.('Could not read that image.', 'error');
        img.src = dataUrl;
      };
      reader.onerror = () => this.app.showToast?.('Could not read that file.', 'error');
      reader.readAsDataURL(file);
    };
    input.click();
  }

  clearPhoto() {
    try {
      localStorage.removeItem(this._photoKey());
    } catch {
      /* nothing to clean up */
    }
    this.userPhoto = null;
    this.userPhotoDataUrl = '';
    this.refresh();
    this.app.showToast?.('Using the generated scene again', 'info');
  }

  hasPhoto() {
    return !!this.userPhoto;
  }

  // ── Export ───────────────────────────────────────────────────────

  /**
   * Renders the wallpaper exactly as shown on screen into a PNG and offers
   * it as a download. Uses the same paintScene/paintUserPhoto pair the live
   * canvas uses, so the export cannot drift from the display.
   */
  async exportPng() {
    const app = this.app;
    if (!app.wallpaperWeatherData && !app.weatherData) {
      app.showToast?.('No wallpaper data to export', 'info');
      return null;
    }

    const s = this.scene();
    const W = 1080;
    const H = 1350; // 4:5, the aspect most phones crop a wallpaper to.
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      app.showToast?.('Could not render the image.', 'error');
      return null;
    }

    // Same scene, same seed, frozen at t=0 so it is deterministic.
    this.paintScene(ctx, W, H, s, 0);
    this.paintUserPhoto(ctx, W, H);

    drawWallpaperTypography(ctx, W, H, s, app);

    const slug = (s.tab.name || 'location').split(',')[0].trim().replace(/[^\w-]+/g, '-').toLowerCase();
    try {
      const blob = await new Promise((resolve) => {
        if (canvas.toBlob) canvas.toBlob(resolve, 'image/png');
        else resolve(null);
      });
      if (!blob) {
        const url = canvas.toDataURL('image/png');
        downloadBlob(url, `aurafisky-wallpaper-${slug}.png`);
      } else {
        downloadBlob(URL.createObjectURL(blob), `aurafisky-wallpaper-${slug}.png`, true);
      }
      app.showToast?.('Wallpaper image saved', 'success');
      this._haptic('medium');
      return canvas;
    } catch {
      app.showToast?.('Could not save the image.', 'error');
      return null;
    }
  }

  _haptic(type = 'light') {
    if (typeof navigator === 'undefined' || !navigator.vibrate) return;
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    try {
      if (type === 'medium') navigator.vibrate([15]);
      else navigator.vibrate(12);
    } catch (_) {}
  }

  /**
   * Sets the OS home-screen wallpaper (Android Chrome only). Renders the
   * wallpaper to a blob, hands it to the Wallpaper API, and takes a wake lock
   * for a few seconds so the system can capture it.
   *
   * Everywhere else this is a no-op with an explanation rather than a silent
   * failure.
   */
  async setDeviceWallpaper() {
    const app = this.app;
    if (typeof navigator === 'undefined' || !('wallpaper' in navigator)) {
      app.showToast?.('Device wallpaper needs Android Chrome.', 'info');
      return false;
    }
    if (this.deviceWallpaperBusy) return false;
    this.deviceWallpaperBusy = true;
    try {
      this._acquireWakeLock();
      const canvas = await this.exportPng();
      if (!canvas) return false;
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) {
        app.showToast?.('Could not build the wallpaper image.', 'error');
        return false;
      }
      await navigator.wallpaper.setWallpaper(
        new File([blob], 'aurafisky.png', { type: 'image/png' }),
      );
      app.showToast?.('📱 Home screen wallpaper set', 'success');
      this._haptic('medium');
      return true;
    } catch (err) {
      console.warn('Device wallpaper failed:', err);
      app.showToast?.('Could not set the device wallpaper.', 'error');
      return false;
    } finally {
      this.deviceWallpaperBusy = false;
      setTimeout(() => this._releaseWakeLock(), 4000);
    }
  }
}

// ── Typography shared by the export ────────────────────────────────
//
// The live overlay renders this information as DOM. The export has to redraw
// it on canvas, so the wording and ordering are kept here in one place to stop
// the two drifting apart.

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.rect(x, y, w, h);
  }
}

function drawWallpaperTypography(ctx, W, H, s, app) {
  const WS = globalThis.WeatherService;
  const w = s.weather;
  const today = s.today;
  const temp = WS?.formatTemp ? WS.formatTemp(w?.temperature) : w?.temperature != null ? `${Math.round(w.temperature)}°C` : '--°';
  const feels = WS?.formatTemp ? WS.formatTemp(w?.feelsLike) : '--°';
  const wind = WS?.formatWind ? WS.formatWind(w?.windSpeed) : '--';
  const pressure = WS?.formatPressure ? WS.formatPressure(w?.pressure) : '--';
  const name = (s.tab.name || 'Selected Location').split(',')[0].trim();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  // Header
  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.font = '600 26px Inter, system-ui, sans-serif';
  ctx.fillText('✨ AURAFISKY  ·  LIVE WALLPAPER', 72, 96);

  ctx.fillStyle = '#ffffff';
  ctx.font = '800 76px Inter, system-ui, sans-serif';
  ctx.fillText(name, 72, 196);

  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '500 26px ui-monospace, monospace';
  ctx.fillText(
    `${Number(s.tab.lat).toFixed(4)}° ${s.tab.lat >= 0 ? 'N' : 'S'}, ${Number(s.tab.lng).toFixed(4)}° ${s.tab.lng >= 0 ? 'E' : 'W'}`,
    72, 240,
  );
  ctx.fillText(s.now.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }), 72, 278);

  // Weather icon + hero temperature
  ctx.font = '120px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
  ctx.fillText(w?.icon || '🌤️', 72, 430);

  ctx.font = '800 190px Inter, system-ui, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(temp, 220, 430);

  ctx.font = '600 40px Inter, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fillText((w?.description || '--').replace(/^./, (c) => c.toUpperCase()), 76, 492);
  ctx.font = '400 30px Inter, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText(`Feels like ${feels}`, 76, 536);

  // Metric cards
  const metrics = [
    { label: 'HUMIDITY', value: w?.humidity != null ? `${w.humidity}%` : '--' },
    { label: 'WIND', value: wind },
    { label: 'PRESSURE', value: pressure },
    { label: 'UV INDEX', value: w?.uvIndex != null ? w.uvIndex.toFixed(1) : '--' },
  ];
  const cardW = (W - 72 * 2 - 24 * 3) / 4;
  metrics.forEach((m, i) => {
    const x = 72 + i * (cardW + 24);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    roundRectPath(ctx, x, 580, cardW, 150, 22);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.font = '600 19px Inter, system-ui, sans-serif';
    ctx.fillText(m.label, x + 24, 626);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 38px Inter, system-ui, sans-serif';
    ctx.fillText(m.value, x + 24, 682);
  });

  // Hi / Lo + sunrise / sunset strip
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  roundRectPath(ctx, 72, 762, W - 144, 132, 22);
  ctx.fill();

  const dayParts = [
    { label: 'HIGH', value: WS?.formatTemp ? WS.formatTemp(today?.maxTemp) : '--', color: '#fbbf24' },
    { label: 'LOW', value: WS?.formatTemp ? WS.formatTemp(today?.minTemp) : '--', color: '#7dd3fc' },
    { label: 'SUNRISE', value: fmtClock(today?.sunrise), color: '#fcd34d' },
    { label: 'SUNSET', value: fmtClock(today?.sunset), color: '#fdba74' },
  ];
  const partW = (W - 144) / 4;
  dayParts.forEach((p, i) => {
    const x = 72 + partW * i;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '600 18px Inter, system-ui, sans-serif';
    ctx.fillText(p.label, x + 26, 808);
    ctx.fillStyle = p.color;
    ctx.font = '700 36px Inter, system-ui, sans-serif';
    ctx.fillText(p.value, x + 26, 858);
  });

  // 7-day strip
  const data = app.wallpaperWeatherData || app.weatherData;
  if (data?.daily?.time?.length) {
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.font = '600 21px Inter, system-ui, sans-serif';
    ctx.fillText('7-DAY OUTLOOK', 72, 952);
    const dayW = (W - 144 - 16 * 6) / 7;
    for (let i = 0; i < 7; i++) {
      const date = data.daily.time[i];
      const code = data.daily.weather_code?.[i] ?? 0;
      const info = WS?.getWeatherInfo ? WS.getWeatherInfo(code, true) : { icon: '🌡️' };
      const max = data.daily.temperature_2m_max?.[i];
      const min = data.daily.temperature_2m_min?.[i];
      const x = 72 + i * (dayW + 16);

      ctx.fillStyle = i === 0 ? 'rgba(20,184,166,0.28)' : 'rgba(255,255,255,0.12)';
      roundRectPath(ctx, x, 974, dayW, 214, 20);
      ctx.fill();

      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.font = '600 20px Inter, system-ui, sans-serif';
      ctx.fillText(fmtDay(date, i), x + dayW / 2, 1010);

      ctx.font = '44px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
      ctx.fillText(info.icon, x + dayW / 2, 1074);

      ctx.fillStyle = '#ffffff';
      ctx.font = '600 24px Inter, system-ui, sans-serif';
      ctx.fillText(`${max != null ? Math.round(max) : '--'}° ${min != null ? Math.round(min) : '--'}°`, x + dayW / 2, 1132);

      const pp = data.daily.precipitation_probability_max?.[i];
      if (pp != null) {
        ctx.fillStyle = 'rgba(147,197,253,0.9)';
        ctx.font = '600 18px Inter, system-ui, sans-serif';
        ctx.fillText(`${Math.round(pp)}%`, x + dayW / 2, 1166);
      }
      ctx.textAlign = 'left';
    }
  }

  // Footer
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '500 21px Inter, system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('Aurafisky · Open-Meteo', W - 72, H - 52);
  ctx.textAlign = 'left';
}

function fmtClock(iso) {
  if (!iso) return '--:--';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--';
  try {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '--:--';
  }
}

function fmtDay(iso, i) {
  if (i === 0) return 'Today';
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '--';
  try {
    return d.toLocaleDateString([], { weekday: 'short' });
  } catch {
    return '--';
  }
}

function downloadBlob(url, filename, revoke = false) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (revoke) setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// Exported for tests.
export { sceneKey, sunPhase, seedFor, SCENES };