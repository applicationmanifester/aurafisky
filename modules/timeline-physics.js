/**
 * @fileoverview Spring Physics Timeline Scrubber & SVG Sparkline Preview
 * Aura of Sky Live (Aurafisky v19.0.0) — Sprint 3 Standards
 * 
 * Implements critically damped spring solver (k = 280, c = 26) inside RAF,
 * floating SVG sparkline preview pill with instantaneous temp, precip probability,
 * wind vector rotation, and View Transition API hooks.
 */

export class SpringScrubber {
  /**
   * @param {Object} options
   * @param {HTMLInputElement} options.sliderEl The range input or custom track
   * @param {HTMLElement} options.tooltipEl Floating tooltip/sparkline container
   * @param {number} [options.totalHours=240] Total hours in timeline
   * @param {Function} options.onHourChange Callback when hour changes
   * @param {Object} [options.hapticEngine] HapticEngine instance
   */
  constructor(options) {
    this.sliderEl = options.sliderEl;
    this.tooltipEl = options.tooltipEl;
    this.totalHours = options.totalHours || 240;
    this.onHourChange = options.onHourChange || (() => {});
    this.hapticEngine = options.hapticEngine || null;

    // Critically damped spring constants
    this.k = 280; // Stiffness
    this.c = 26;  // Damping

    this.currentX = 0; // Normalized [0, 1]
    this.targetX = 0;  // Normalized [0, 1]
    this.velocity = 0;
    this.lastTime = 0;
    this.rafId = null;
    this.isDragging = false;
    this.lastDispatchedHour = -1;

    this._boundOnPointerDown = this._onPointerDown.bind(this);
    this._boundOnPointerMove = this._onPointerMove.bind(this);
    this._boundOnPointerUp = this._onPointerUp.bind(this);
    this._boundTick = this._tick.bind(this);

    this._initEvents();
  }

  _initEvents() {
    if (!this.sliderEl) return;
    this.sliderEl.addEventListener('pointerdown', this._boundOnPointerDown);
  }

  /**
   * Set the current hour externally (e.g. on initial data load or reset to Now)
   */
  setHour(hourIndex) {
    const clamped = Math.max(0, Math.min(this.totalHours - 1, hourIndex));
    this.targetX = clamped / Math.max(1, this.totalHours - 1);
    this.currentX = this.targetX;
    this.velocity = 0;
    this.lastDispatchedHour = clamped;
  }

  _onPointerDown(e) {
    this.isDragging = true;
    window.addEventListener('pointermove', this._boundOnPointerMove);
    window.addEventListener('pointerup', this._boundOnPointerUp);
    window.addEventListener('pointercancel', this._boundOnPointerUp);

    this._updateTargetFromEvent(e);
    this._startSpring();
  }

  _onPointerMove(e) {
    if (!this.isDragging) return;
    this._updateTargetFromEvent(e);
  }

  _onPointerUp() {
    this.isDragging = false;
    window.removeEventListener('pointermove', this._boundOnPointerMove);
    window.removeEventListener('pointerup', this._boundOnPointerUp);
    window.removeEventListener('pointercancel', this._boundOnPointerUp);

    // Snap target to nearest integer hour
    const nearestHour = Math.round(this.targetX * (this.totalHours - 1));
    this.targetX = nearestHour / Math.max(1, this.totalHours - 1);
  }

  _updateTargetFromEvent(e) {
    const rect = this.sliderEl.getBoundingClientRect();
    if (rect.width <= 0) return;
    const clientX = e.clientX ?? (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
    const clampedX = Math.max(0, Math.min(rect.width, clientX - rect.left));
    this.targetX = clampedX / rect.width;
  }

  _startSpring() {
    if (this.rafId) return;
    this.lastTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    this.rafId = requestAnimationFrame(this._boundTick);
  }

  _tick(timestamp) {
    const now = timestamp || ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now());
    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;

    // Clamp dt to avoid instability on frame drops
    dt = Math.min(0.034, Math.max(0.001, dt));

    // Spring equation: F = -k*(x - target) - c*v
    const displacement = this.currentX - this.targetX;
    const force = -this.k * displacement - this.c * this.velocity;
    this.velocity += force * dt;
    this.currentX += this.velocity * dt;

    // Determine current hour integer
    const hour = Math.max(0, Math.min(this.totalHours - 1, Math.round(this.currentX * (this.totalHours - 1))));

    if (hour !== this.lastDispatchedHour) {
      this.lastDispatchedHour = hour;
      if (this.hapticEngine) {
        this.hapticEngine.trigger('hourlyTick', this.sliderEl);
      }
      this.onHourChange(hour, !this.isDragging);
    }

    // Keep ticking while dragging or while spring has remaining motion
    const isSettled = Math.abs(displacement) < 0.0005 && Math.abs(this.velocity) < 0.001;

    if (!isSettled || this.isDragging) {
      this.rafId = requestAnimationFrame(this._boundTick);
    } else {
      this.currentX = this.targetX;
      this.velocity = 0;
      this.rafId = null;
      // Final snap callback
      const finalHour = Math.round(this.currentX * (this.totalHours - 1));
      this.onHourChange(finalHour, true);
    }
  }

  destroy() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.sliderEl) {
      this.sliderEl.removeEventListener('pointerdown', this._boundOnPointerDown);
    }
    window.removeEventListener('pointermove', this._boundOnPointerMove);
    window.removeEventListener('pointerup', this._boundOnPointerUp);
    window.removeEventListener('pointercancel', this._boundOnPointerUp);
  }
}

/**
 * Builds an SVG Sparkline pill markup for instantaneous weather metrics
 * 
 * @param {Object} weatherData Open-Meteo hourly data object
 * @param {number} hourIndex Current timeline hour index
 * @param {string} [units='metric'] 'metric' | 'imperial'
 * @returns {string} HTML string containing formatted SVG sparkline pill
 */
export function buildSparklinePillSvg(weatherData, hourIndex, units = 'metric') {
  if (!weatherData?.hourly?.time || hourIndex == null) return '';

  const hourly = weatherData.hourly;
  const timeStr = hourly.time[hourIndex];
  if (!timeStr) return '';

  const tempUnit = units === 'imperial' ? '°F' : '°C';
  const speedUnit = units === 'imperial' ? 'mph' : 'km/h';

  const temp = hourly.temperature_2m?.[hourIndex] ?? 0;
  const precipProb = hourly.precipitation_probability?.[hourIndex] ?? 0;
  const precipMm = hourly.precipitation?.[hourIndex] ?? 0;
  const windSpeed = hourly.wind_speed_10m?.[hourIndex] ?? 0;
  const windDir = hourly.wind_direction_10m?.[hourIndex] ?? 0;
  const uv = hourly.uv_index?.[hourIndex] ?? 0;

  // Window of +/- 6 hours for sparkline curve
  const windowStart = Math.max(0, hourIndex - 6);
  const windowEnd = Math.min(hourly.time.length - 1, hourIndex + 6);
  const sampleTemps = [];

  for (let i = windowStart; i <= windowEnd; i++) {
    sampleTemps.push(hourly.temperature_2m?.[i] ?? temp);
  }

  const minTemp = Math.min(...sampleTemps);
  const maxTemp = Math.max(...sampleTemps);
  const tempRange = Math.max(1, maxTemp - minTemp);

  // SVG dimensions
  const svgWidth = 140;
  const svgHeight = 24;
  const paddingX = 4;
  const paddingY = 4;

  const points = sampleTemps.map((val, idx) => {
    const x = paddingX + (idx / Math.max(1, sampleTemps.length - 1)) * (svgWidth - paddingX * 2);
    const y = svgHeight - paddingY - ((val - minTemp) / tempRange) * (svgHeight - paddingY * 2);
    return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
  });

  // Build SVG path
  let pathD = '';
  if (points.length > 1) {
    pathD = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      pathD += ` L ${points[i].x} ${points[i].y}`;
    }
  }

  // Active point index within the sample window
  const activeSampleIdx = hourIndex - windowStart;
  const activePt = points[activeSampleIdx] || points[0] || { x: svgWidth / 2, y: svgHeight / 2 };

  // Parse formatted time
  const timePart = timeStr.split('T')[1] || '12:00';
  const hourNum = parseInt(timePart.split(':')[0], 10);
  const ampm = hourNum >= 12 ? 'PM' : 'AM';
  const displayH = hourNum % 12 === 0 ? 12 : hourNum % 12;
  const timeFormatted = `${displayH}:${timePart.split(':')[1] || '00'} ${ampm}`;

  // Check hazard
  const isHazardous = uv >= 8 || windSpeed > 50 || precipMm > 5;
  const hazardBadge = isHazardous
    ? `<span class="inline-flex items-center px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[9px] font-extrabold animate-pulse">⚠️ HAZARD</span>`
    : '';

  return `
    <div class="sparkline-pill select-none">
      <div class="flex items-center justify-between gap-2 border-b pb-1 border-slate-200/80 dark:border-slate-700/80">
        <span class="text-[10px] font-bold text-sky-600 dark:text-sky-400 flex items-center gap-1">
          <span>⏱️</span> ${timeFormatted}
        </span>
        <div class="flex items-center gap-1">
          ${hazardBadge}
          <span class="text-[11px] font-black text-slate-800 dark:text-white tracking-tight">${Math.round(temp)}${tempUnit}</span>
        </div>
      </div>
      <div class="flex items-center justify-between text-[9px] text-slate-600 dark:text-slate-300 gap-2 font-semibold">
        <span class="flex items-center gap-0.5">
          <span>💧</span> ${Math.round(precipProb)}%
        </span>
        <span class="flex items-center gap-1">
          <svg class="w-2.5 h-2.5 text-teal-600 dark:text-cyan-400 transform" style="transform: rotate(${windDir}deg)" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/>
          </svg>
          ${Math.round(windSpeed)} ${speedUnit}
        </span>
      </div>
      <div class="relative w-[140px] h-[24px] mt-0.5">
        <svg width="${svgWidth}" height="${svgHeight}" class="overflow-visible">
          <defs>
            <linearGradient id="sparklineGradLight" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stop-color="#0284c7" stop-opacity="0.8"/>
              <stop offset="50%" stop-color="#4f46e5" stop-opacity="0.95"/>
              <stop offset="100%" stop-color="#9333ea" stop-opacity="0.8"/>
            </linearGradient>
            <linearGradient id="sparklineGradDark" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.75"/>
              <stop offset="50%" stop-color="#818cf8" stop-opacity="0.95"/>
              <stop offset="100%" stop-color="#c084fc" stop-opacity="0.75"/>
            </linearGradient>
            <!-- Backward compatibility gradient ID -->
            <linearGradient id="sparklineGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.75"/>
              <stop offset="50%" stop-color="#818cf8" stop-opacity="0.95"/>
              <stop offset="100%" stop-color="#c084fc" stop-opacity="0.75"/>
            </linearGradient>
          </defs>
          <path d="${pathD}" fill="none" class="sparkline-path" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="${activePt.x}" cy="${activePt.y}" r="3.5" class="sparkline-active-ping animate-ping" style="animation-duration: 2s;"/>
          <circle cx="${activePt.x}" cy="${activePt.y}" r="2.5" class="sparkline-active-dot" stroke="#ffffff" stroke-width="1.5"/>
        </svg>
      </div>
    </div>
  `;
}

