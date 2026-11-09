// -- EXPLORE EXTREMES --
//
// A "teleport" panel that flies the map to whichever of a curated global network of
// extreme-weather-prone places is currently hottest, coldest, windiest, or rainiest —
// live conditions, not hardcoded records.
//
// By maintaining balanced stations across both Northern and Southern hemispheres,
// diurnal day/night cycles, and true climate poles (Pilbara, Afar, Antarctica, Siberia),
// the live winner reflects genuine extreme readings year-round.

export const SURF_EXTREME_STATIONS = [
  { name: "Nazaré, Portugal", lat: 39.60, lng: -9.07, note: "Big wave surfing capital · Underwater canyon swell amp" },
  { name: "Teahupo'o, French Polynesia", lat: -17.85, lng: -149.27, note: "Heaviest reef break in the world" },
  { name: "Banzai Pipeline, Hawaii", lat: 21.66, lng: -158.05, note: "Famous shallow reef tube swell" },
  { name: "Mavericks, California", lat: 37.49, lng: -122.50, note: "Cold water Pacific big-wave break" },
  { name: "Jaws (Peʻahi), Hawaii", lat: 20.93, lng: -156.30, note: "Deep ocean windward monster swells" },
];

export const EXTREME_STATIONS = [
  // Extreme Heat Poles (Global day/night and summer/winter balance across hemispheres)
  { name: "Marble Bar, Australia", lat: -21.17, lng: 119.75, note: "Pilbara heat pole · World record 160-day heatwave" },
  { name: "Oodnadatta, Australia", lat: -27.55, lng: 135.45, note: "Australia historic high record 50.7°C" },
  { name: "Dallol, Ethiopia", lat: 14.24, lng: 40.30, note: "Afar depression · World's hottest inhabited place year-round" },
  { name: "Death Valley, USA", lat: 36.5323, lng: -116.9325, note: "World surface air record 56.7°C" },
  { name: "Dasht-e Lut, Iran", lat: 30.7333, lng: 58.0, note: "Satellite surface temp record 70.7°C" },
  { name: "Jacobabad, Pakistan", lat: 28.2769, lng: 68.4514, note: "Extreme summer heat & humidity pole" },
  { name: "Kebili, Tunisia", lat: 33.7044, lng: 8.9694, note: "Sahara desert historic heat record" },
  { name: "Bilma, Niger", lat: 18.68, lng: 12.92, note: "Central Sahara oasis heat capital" },
  { name: "Upington, South Africa", lat: -28.45, lng: 21.25, note: "Kalahari desert heat pole" },
  { name: "Las Lomitas, Argentina", lat: -24.71, lng: -60.59, note: "Gran Chaco South American heat pole" },
  { name: "Lodwar, Kenya", lat: 3.12, lng: 35.60, note: "Turkana equatorial year-round heat" },
  { name: "Mecca, Saudi Arabia", lat: 21.42, lng: 39.83, note: "Arabian Peninsula tropical desert heat" },

  // Extreme Cold Poles
  { name: "Vostok Station, Antarctica", lat: -78.4645, lng: 106.8339, note: "Earth all-time record -89.2°C" },
  { name: "Dome C, Antarctica", lat: -75.10, lng: 123.35, note: "High Antarctic plateau continental ice cap" },
  { name: "Oymyakon, Russia", lat: 63.4608, lng: 142.7858, note: "Northern cold pole · Inhabited record -67.7°C" },
  { name: "Verkhoyansk, Russia", lat: 67.5447, lng: 133.3831, note: "Siberian extreme cold pole" },
  { name: "Summit Camp, Greenland", lat: 72.58, lng: -38.45, note: "Greenland ice sheet central summit" },
  { name: "Eureka, Canada", lat: 79.9908, lng: -85.9408, note: "High Arctic Ellesmere Island weather station" },
  { name: "Denali Summit, USA", lat: 63.0692, lng: -151.0069, note: "North American high altitude extreme cold" },

  // Extreme Wind Poles
  { name: "Mount Washington, USA", lat: 44.2705, lng: -71.30325, note: "Peak wind gust record 372 km/h" },
  { name: "Commonwealth Bay, Antarctica", lat: -67.0, lng: 142.6667, note: "Windiest sea-level coast on Earth" },
  { name: "Cape Denison, Antarctica", lat: -67.01, lng: 142.67, note: "Mawson's 'Home of the Blizzard' katabatic gales" },
  { name: "Wellington, New Zealand", lat: -41.2865, lng: 174.7762, note: "Windiest capital city on Earth (Cook Strait)" },
  { name: "Punta Arenas, Chile", lat: -53.16, lng: -70.91, note: "Patagonia Roaring Forties gale zone" },

  // Extreme Rainfall Poles
  { name: "Cherrapunji, India", lat: 25.3, lng: 91.7, note: "World record calendar year rainfall" },
  { name: "Mawsynram, India", lat: 25.30, lng: 91.58, note: "Wettest place on Earth (highest annual mean)" },
  { name: "Tutunendo, Colombia", lat: 5.75, lng: -76.53, note: "Chocó tropical pluvial rainforest" },
];

function _renderExtremesLoading() {
  if (!this.$.extremesList) return;
  this.$.extremesList.innerHTML =
    '<div class="text-center py-6 text-slate-400 text-xs">Checking live conditions across global extreme stations…</div>';
}

function _renderExtremesError() {
  if (!this.$.extremesList) return;
  this.$.extremesList.innerHTML =
    '<div class="text-center py-6 text-slate-400 text-xs">Couldn\'t reach the weather service. Try again in a moment.</div>';
}

export function _extremeCardHtml(kind, icon, title, station, valueLabel, subLabel = "") {
  return `
    <button class="extreme-card w-full text-left flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer group" data-kind="${kind}" data-lat="${station.lat}" data-lng="${station.lng}" data-name="${station.name.replace(/"/g, "&quot;")}">
      <span class="text-2xl flex-shrink-0 group-hover:scale-110 transition-transform" aria-hidden="true">${icon}</span>
      <div class="min-w-0 flex-1">
        <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">${title}</div>
        <div class="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">${station.name}</div>
        ${subLabel ? `<div class="text-[10px] text-slate-500 dark:text-slate-400 truncate">${subLabel}</div>` : ""}
      </div>
      <div class="text-sm font-black text-slate-700 dark:text-slate-200 flex-shrink-0">${valueLabel}</div>
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
    const surfLat = SURF_EXTREME_STATIONS.map((s) => s.lat.toFixed(4)).join(",");
    const surfLng = SURF_EXTREME_STATIONS.map((s) => s.lng.toFixed(4)).join(",");
    const surfUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${surfLat}&longitude=${surfLng}&current=wave_height,swell_wave_period,swell_wave_height&timezone=auto`;

    const [res, surfRes] = await Promise.all([
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latParam}&longitude=${lngParam}&current=temperature_2m,wind_speed_10m,wind_gusts_10m,precipitation&timezone=auto`),
      fetch(surfUrl).catch(() => null),
    ]);
    if (!res.ok) throw new Error("Extremes fetch failed");
    let results = await res.json();
    if (!Array.isArray(results)) results = [results];

    let surfResults = [];
    if (surfRes && surfRes.ok) {
      const parsed = await surfRes.json();
      surfResults = Array.isArray(parsed) ? parsed : [parsed];
    }

    const readings = EXTREME_STATIONS.map((station, i) => ({
      station,
      temp: results[i]?.current?.temperature_2m ?? null,
      wind: results[i]?.current?.wind_gusts_10m ?? results[i]?.current?.wind_speed_10m ?? null,
      precip: results[i]?.current?.precipitation ?? 0,
    })).filter((r) => r.temp != null || r.wind != null);

    if (!readings.length) {
      this._renderExtremesError();
      return;
    }

    const byTemp = readings.filter((r) => r.temp != null);
    const byWind = readings.filter((r) => r.wind != null);
    const byRain = readings.filter((r) => r.precip > 0);

    const hottest = byTemp.length
      ? byTemp.reduce((a, b) => (b.temp > a.temp ? b : a))
      : null;
    const coldest = byTemp.length
      ? byTemp.reduce((a, b) => (b.temp < a.temp ? b : a))
      : null;
    const windiest = byWind.length
      ? byWind.reduce((a, b) => (b.wind > a.wind ? b : a))
      : null;
    const rainiest = byRain.length
      ? byRain.reduce((a, b) => (b.precip > a.precip ? b : a))
      : null;

    const cards = [];
    if (hottest) {
      const isTrueHeat = hottest.temp >= 32;
      const heatTitle = isTrueHeat ? "Hottest tracked" : "Peak Heat (Winter/Night cycle)";
      cards.push(
        _extremeCardHtml(
          "hottest",
          "🔥",
          heatTitle,
          hottest.station,
          `${Math.round(hottest.temp)}°C`,
          hottest.station.note || ""
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
          coldest.station.note || ""
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
          windiest.station.note || ""
        ),
      );
    }
    if (rainiest && rainiest.precip >= 0.5) {
      cards.push(
        _extremeCardHtml(
          "rainiest",
          "🌧️",
          "Rainiest tracked",
          rainiest.station,
          `${rainiest.precip.toFixed(1)} mm/h`,
          rainiest.station.note || ""
        ),
      );
    }

    let biggestSwell = null;
    if (surfResults.length) {
      const swells = SURF_EXTREME_STATIONS.map((station, i) => {
        const cur = surfResults[i]?.current;
        const waveHeight = cur?.wave_height ?? cur?.swell_wave_height ?? 0;
        const period = cur?.swell_wave_period ?? 0;
        return { station, waveHeight, period };
      }).filter((s) => s.waveHeight > 0);

      if (swells.length) {
        biggestSwell = swells.reduce((a, b) => (b.waveHeight > a.waveHeight ? b : a));
      }
    }

    if (biggestSwell) {
      cards.push(
        _extremeCardHtml(
          "swell",
          "🌊",
          "Top Ocean Swell",
          biggestSwell.station,
          `${biggestSwell.waveHeight.toFixed(1)}m @ ${Math.round(biggestSwell.period)}s`,
          biggestSwell.station.note || "Heavy surf swell"
        ),
      );
    }

    this.$.extremesList.innerHTML =
      cards.join("") +
      '<div class="text-center pt-2 pb-1 text-[9px] text-slate-400">Live readings across global weather-extreme stations worldwide · Tap to fly there.</div>';

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
