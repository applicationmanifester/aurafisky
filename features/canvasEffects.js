// -- MAP CANVAS WEATHER EFFECTS (Rain, Snow, Windy, Storm animations) --

function initWeatherCanvas() {
    this.canvas = document.getElementById("weatherCanvas");
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext("2d");

    // Resize canvas to cover map exactly
    this.resizeWeatherCanvas();

    // Connect resize triggers to the map's zoom/pan animation bounds — OL
    // fires movestart/moveend for both panning and zooming (no separate
    // zoomstart/zoomend events the way Leaflet had).
    this.map.on("movestart", () => {
      this.canvas.style.opacity = "0"; // Hide effects during transition
    });
    this.map.on("moveend", () => {
      this.resizeWeatherCanvas();
      this.canvas.style.opacity = "1";
    });

    // Start the animation loop
    this.runWeatherCanvasLoop();
  }

function resizeWeatherCanvas() {
    if (!this.canvas) return;
    const rect = this.$.map.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    // Backing store at device-pixel resolution (crisp on retina/high-DPI);
    // CSS size stays at rect.width/height via the w-full/h-full classes.
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    // Track CSS-pixel size separately — all draw/particle math below stays
    // in CSS-pixel space, the transform below maps it to device pixels.
    this.canvasCssWidth = rect.width;
    this.canvasCssHeight = rect.height;
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

function updateWeatherCanvasOverlayEffect(code, windSpeed, windDirection) {
    this.currentWindSpeed = windSpeed || 0;
    this.currentWindDirection = windDirection || 0;

    // Don't override the manual wind flow overlay
    if (this.overlayType === "wind" && this.radarActive) {
      this.initWindParticles();
      return;
    }

    let effect = "none";

    if (WeatherService.isRainCode(code)) {
      effect = "rain";
    } else if (WeatherService.isStormCode(code)) {
      effect = "storm";
    } else if (WeatherService.isSnowCode(code)) {
      effect = "snow";
    } else if (windSpeed > 25) {
      effect = "wind";
    }

    if (this.activeEffectType === effect) return;
    const wasIdle = this.activeEffectType === "none";
    this.activeEffectType = effect;
    this.particles = []; // Clear current particle arrays

    // Restart animation loop if it was paused (perf #7)
    if (wasIdle && effect !== "none" && !this.animationFrameId) {
      this.runWeatherCanvasLoop();
    }

    // Initialize particle arrays
    const w = this.canvasCssWidth ?? this.canvas.width;
    const h = this.canvasCssHeight ?? this.canvas.height;

    if (effect === "rain" || effect === "storm") {
      const count = effect === "storm" ? 120 : 70;
      for (let i = 0; i < count; i++) {
        this.particles.push({
          x: Math.random() * w,
          y: Math.random() * h - h,
          vyBase: 6 + Math.random() * 8,
          len: 12 + Math.random() * 16,
          opacity: 0.15 + Math.random() * 0.35,
        });
      }
    } else if (effect === "snow") {
      const count = 45;
      for (let i = 0; i < count; i++) {
        this.particles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: 1.5 + Math.random() * 3,
          vyBase: 0.6 + Math.random() * 1.2,
          opacity: 0.2 + Math.random() * 0.5,
          swingSpeed: 0.02 + Math.random() * 0.03,
          swingRange: 1 + Math.random() * 2,
          swingOffset: Math.random() * Math.PI,
        });
      }
    } else if (effect === "wind") {
      const count = 12;
      for (let i = 0; i < count; i++) {
        this.particles.push({
          x: Math.random() * w - 100,
          y: Math.random() * h,
          vBase: 3 + Math.random() * 4,
          len: 80 + Math.random() * 140,
          opacity: 0.08 + Math.random() * 0.15,
          curveOffset: Math.random() * Math.PI,
        });
      }
    }
  }

function runWeatherCanvasLoop() {
    if (this.animationFrameId) return;
    const TWO_PI = Math.PI * 2;
    const draw = (now) => {
      if (this.activeEffectType === "none" && this.lightningFlash === 0) {
        this.animationFrameId = null;
        return;
      }

      // Throttle canvas particle animation during mobile map dragging for battery & GPU savings
      if (typeof window !== "undefined" && window.innerWidth < 640 && this._mapWasDragged) {
        this.animationFrameId = requestAnimationFrame(draw);
        return;
      }

      const ctx = this.ctx;
      const w = this.canvasCssWidth ?? this.canvas.width;
      const h = this.canvasCssHeight ?? this.canvas.height;
      ctx.clearRect(0, 0, w, h);

      // Lightning flash (rare, fast path)
      if (this.activeEffectType === "storm") {
        if (Math.random() < 0.004) this.lightningFlash = 0.8;
        if (this.lightningFlash > 0.01) {
          ctx.fillStyle = `rgba(255,255,255,${this.lightningFlash})`;
          ctx.fillRect(0, 0, w, h);
          this.lightningFlash *= 0.88;
        }
      }

      // Wind vectors (shared for all effects)
      const theta = (((this.currentWindDirection || 0) - 90) * Math.PI) / 180;
      const windIntensity = (this.currentWindSpeed || 0) / 10;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      const windDx = cosT * windIntensity;
      const windDy = sinT * windIntensity;

      const particles = this.particles;
      const len = particles.length;

      if (
        this.activeEffectType === "rain" ||
        this.activeEffectType === "storm"
      ) {
        ctx.strokeStyle = this.isDark
          ? "rgba(129,140,248,0.45)"
          : "rgba(59,130,246,0.35)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let i = 0; i < len; i++) {
          const p = particles[i];
          const vx = windDx * 1.5 - 0.5;
          const vy = p.vyBase + (windDy > 0 ? windDy * 0.2 : 0);
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + vx, p.y + p.len);
          p.x += vx;
          p.y += vy;
          if (p.y > h) {
            p.y = -p.len;
            p.x = Math.random() * w;
          }
          if (p.x < -20) p.x = w + 20;
          else if (p.x > w + 20) p.x = -20;
        }
        ctx.stroke();
      } else if (this.activeEffectType === "snow") {
        ctx.fillStyle = this.isDark
          ? "rgba(255,255,255,0.85)"
          : "rgba(156,163,175,0.7)";
        const t = now * 0.001;
        ctx.beginPath();
        for (let i = 0; i < len; i++) {
          const p = particles[i];
          const vx =
            windDx * 0.6 + Math.sin(t * p.swingSpeed + p.swingOffset) * 0.2;
          const vy = p.vyBase + (windDy > 0 ? windDy * 0.05 : 0);
          ctx.moveTo(p.x, p.y);
          ctx.arc(p.x, p.y, p.r, 0, TWO_PI);
          p.y += vy;
          p.x += vx;
          if (p.y > h) {
            p.y = -p.r * 2;
            p.x = Math.random() * w;
          }
          if (p.x < -20) p.x = w + 20;
          else if (p.x > w + 20) p.x = -20;
        }
        ctx.fill();
      } else if (this.activeEffectType === "wind") {
        ctx.strokeStyle = this.isDark
          ? "rgba(255,255,255,0.2)"
          : "rgba(148,163,184,0.35)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < len; i++) {
          const p = particles[i];
          const startX = p.x;
          const startY = p.y;
          const vx = cosT * p.vBase;
          const vy = sinT * p.vBase;
          ctx.moveTo(startX, startY);
          ctx.lineTo(
            startX - cosT * p.len,
            startY -
              sinT * p.len +
              Math.sin(startX * 0.008 + p.curveOffset) * 10,
          );
          p.x += vx;
          p.y += vy;
          if (p.x > w + 200 || p.x < -300 || p.y > h + 200 || p.y < -200) {
            p.x = Math.random() * w - 50;
            p.y = Math.random() * h;
          }
        }
        ctx.stroke();
      }

      this.animationFrameId = requestAnimationFrame(draw);
    };

    this.animationFrameId = requestAnimationFrame(draw);
  }

export function init(app) {
  app.initWeatherCanvas = initWeatherCanvas;
  app.resizeWeatherCanvas = resizeWeatherCanvas;
  app.updateWeatherCanvasOverlayEffect = updateWeatherCanvasOverlayEffect;
  app.runWeatherCanvasLoop = runWeatherCanvasLoop;
}
