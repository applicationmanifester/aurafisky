// -- EXPLORE EXTREMES --
//
// A "teleport" panel that flies the map to whichever of a curated list of
// extreme-weather-prone places is currently hottest, coldest, or windiest —
// live conditions, not hardcoded records. This app has no feed of the
// world's actual current extremes (that needs a global gridded analysis,
// not a point-forecast API), so the honest version of this feature is "the
// most extreme place among ones known for extremes", not "the most extreme
// place on Earth" — the panel's copy says so rather than overclaiming.

// Places chosen for a track record of extreme readings across categories —
// not an exhaustive or authoritative list, just enough spread that the
// live winner in each category is usually somewhere genuinely interesting.
const EXTREME_STATIONS = [
  { name: "Death Valley, USA", lat: 36.5323, lng: -116.9325 },
  { name: "Dasht-e Lut, Iran", lat: 30.7333, lng: 58.0 },
  { name: "Kebili, Tunisia", lat: 33.7044, lng: 8.9694 },
  { name: "Al Aziziyah, Libya", lat: 32.5333, lng: 13.0333 },
  { name: "Jacobabad, Pakistan", lat: 28.2769, lng: 68.4514 },
  { name: "Vostok Station, Antarctica", lat: -78.4645, lng: 106.8339 },
  { name: "Oymyakon, Russia", lat: 63.4608, lng: 142.7858 },
  { name: "Verkhoyansk, Russia", lat: 67.5447, lng: 133.3831 },
  { name: "Eureka, Canada", lat: 79.9908, lng: -85.9408 },
  { name: "Denali Summit, USA", lat: 63.0692, lng: -151.0069 },
  { name: "Mount Washington, USA", lat: 44.2705, lng: -71.30325 },
  { name: "Commonwealth Bay, Antarctica", lat: -67.0, lng: 142.6667 },
  { name: "Wellington, New Zealand", lat: -41.2865, lng: 174.7762 },
  { name: "Reykjavik, Iceland", lat: 64.1466, lng: -21.9426 },
  { name: "Cherrapunji, India", lat: 25.3, lng: 91.7 },
];

function _renderExtremesLoading() {
  if (!this.$.extremesList) return;
  this.$.extremesList.innerHTML =
    '<div class="text-center py-6 text-slate-400 text-xs">Checking live conditions worldwide…</div>';
}

function _renderExtremesError() {
  if (!this.$.extremesList) return;
  this.$.extremesList.innerHTML =
    '<div class="text-center py-6 text-slate-400 text-xs">Couldn\'t reach the weather service. Try again in a moment.</div>';
}

function _extremeCardHtml(kind, icon, title, station, valueLabel) {
  return `
    <button class="extreme-card w-full text-left flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" data-kind="${kind}" data-lat="${station.lat}" data-lng="${station.lng}" data-name="${station.name.replace(/"/g, "&quot;")}">
      <span class="text-2xl flex-shrink-0" aria-hidden="true">${icon}</span>
      <div class="min-w-0 flex-1">
        <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">${title}</div>
        <div class="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">${station.name}</div>
      </div>
      <div class="text-sm font-bold text-slate-700 dark:text-slate-200 flex-shrink-0">${valueLabel}</div>
    </button>`;
}

async function openExtremesPanel() {
  if (!this.$.extremesPanel) return;
  this.$.extremesPanel.classList.remove("hidden");
  this.$.extremesPanel.style.display = "flex";
  this._renderExtremesLoading();

  const latParam = EXTREME_STATIONS.map((s) => s.lat.toFixed(4)).join(",");
  const lngParam = EXTREME_STATIONS.map((s) => s.lng.toFixed(4)).join(",");

  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latParam}&longitude=${lngParam}&current=temperature_2m,wind_speed_10m,wind_gusts_10m&timezone=auto`,
    );
    if (!res.ok) throw new Error("Extremes fetch failed");
    let results = await res.json();
    if (!Array.isArray(results)) results = [results];

    const readings = EXTREME_STATIONS.map((station, i) => ({
      station,
      temp: results[i]?.current?.temperature_2m ?? null,
      wind: results[i]?.current?.wind_gusts_10m ?? results[i]?.current?.wind_speed_10m ?? null,
    })).filter((r) => r.temp != null || r.wind != null);

    if (!readings.length) {
      this._renderExtremesError();
      return;
    }

    const byTemp = readings.filter((r) => r.temp != null);
    const byWind = readings.filter((r) => r.wind != null);

    const hottest = byTemp.length
      ? byTemp.reduce((a, b) => (b.temp > a.temp ? b : a))
      : null;
    const coldest = byTemp.length
      ? byTemp.reduce((a, b) => (b.temp < a.temp ? b : a))
      : null;
    const windiest = byWind.length
      ? byWind.reduce((a, b) => (b.wind > a.wind ? b : a))
      : null;

    const cards = [];
    if (hottest) {
      cards.push(
        _extremeCardHtml(
          "hottest",
          "🔥",
          "Hottest tracked",
          hottest.station,
          `${Math.round(hottest.temp)}°C`,
        ),
      );
    }
    if (coldest) {
      cards.push(
        _extremeCardHtml(
          "coldest",
          "🥶",
          "Coldest tracked",
          coldest.station,
          `${Math.round(coldest.temp)}°C`,
        ),
      );
    }
    if (windiest) {
      cards.push(
        _extremeCardHtml(
          "windiest",
          "💨",
          "Windiest tracked",
          windiest.station,
          `${Math.round(windiest.wind)} km/h`,
        ),
      );
    }

    this.$.extremesList.innerHTML =
      cards.join("") +
      '<div class="text-center pt-2 pb-1 text-[9px] text-slate-400">Live readings from a curated list of extreme-prone places — not a global scan.</div>';

    this.$.extremesList.querySelectorAll(".extreme-card").forEach((btn) => {
      btn.addEventListener("click", () => {
        const lat = parseFloat(btn.dataset.lat);
        const lng = parseFloat(btn.dataset.lng);
        const name = btn.dataset.name;
        this.closeExtremesPanel();
        this.selectLocation(lat, lng, name);
      });
    });
  } catch (e) {
    console.warn("Explore Extremes fetch failed:", e);
    this._renderExtremesError();
  }
}

function closeExtremesPanel() {
  if (!this.$.extremesPanel) return;
  this.$.extremesPanel.classList.add("hidden");
  this.$.extremesPanel.style.display = "none";
}

export function init(app) {
  app._renderExtremesLoading = _renderExtremesLoading;
  app._renderExtremesError = _renderExtremesError;
  app.openExtremesPanel = openExtremesPanel;
  app.closeExtremesPanel = closeExtremesPanel;
}
