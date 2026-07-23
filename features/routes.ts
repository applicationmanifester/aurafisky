// Feature: Route / Travel Weather — draw a polyline on the map and sample the
// forecast at each stop (drive / run / bike / road-trip). Uses the existing
// Leaflet map and Open-Meteo along-point requests. No backend required.

import L from 'leaflet';

interface AppRef {
  map: L.Map | null;
  showToast: (msg: string, type: 'info' | 'success' | 'error') => void;
}

interface LatLng {
  lat: number;
  lng: number;
}

let appRef: AppRef | null = null;
let routeMode = false;
let pts: LatLng[] = [];
let poly: L.Polyline | null = null;
let routeBtn: HTMLButtonElement | null = null;

interface OpenMeteoResponse {
  current: {
    temperature_2m: number;
    precipitation: number;
    weather_code: number;
    wind_speed_10m: number;
  };
}

export function init(app: any): void {
  appRef = app as AppRef;
  routeBtn = document.getElementById('routeBtn') as HTMLButtonElement | null;
  if (routeBtn) routeBtn.addEventListener('click', toggleRoute);
}

function toggleRoute(): void {
  if (!appRef || !appRef.map) return;
  routeMode = !routeMode;

  if (routeMode) {
    pts = [];
    if (poly) {
      appRef.map.removeLayer(poly);
      poly = null;
    }
    if (routeBtn) {
      routeBtn.classList.add('bg-primary', 'text-white');
      routeBtn.title = 'Tap map to add stops, click again to finish';
    }
    appRef.showToast('Route mode: tap the map to add stops', 'info');
    appRef.map.on('click', onMapClick);
  } else {
    if (appRef.map) appRef.map.off('click', onMapClick);
    if (routeBtn) {
      routeBtn.classList.remove('bg-primary', 'text-white');
      routeBtn.title = 'Draw a route';
    }
    finishRoute();
  }
}

function onMapClick(e: L.LeafletMouseEvent): void {
  if (!routeMode) return;
  pts.push([e.latlng.lat, e.latlng.lng]);
  drawPoly();
}

function drawPoly(): void {
  if (!appRef.map) return;
  if (poly) appRef.map.removeLayer(poly);
  poly = L.polyline(pts, {
    color: '#6366f1',
    weight: 4,
    opacity: 0.85,
    dashArray: '6 6',
  }).addTo(appRef.map);
}

async function finishRoute(): Promise<void> {
  if (pts.length < 2) {
    appRef?.showToast('Add at least two stops', 'info');
    return;
  }
  appRef?.showToast('Fetching weather along route…', 'info');

  try {
    const results = await Promise.all(
      pts.map(async ([la, ln]) => {
        try {
          const resp = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${ln}&current=temperature_2m,precipitation,weather_code,wind_speed_10m&timezone=auto`,
          );
          if (!resp.ok) return null;
          return (await resp.json()) as OpenMeteoResponse;
        } catch {
          return null;
        }
      }),
    );

    const valid = results.filter(Boolean) as OpenMeteoResponse[];
    const rainy = valid.filter((j) => j.current && j.current.precipitation > 0).length;
    const last = valid[valid.length - 1];

    let dest: string | null = null;
    if (typeof WeatherService !== 'undefined' && WeatherService.getWeatherInfo && last) {
      dest = WeatherService.getWeatherInfo(last.current.weather_code, true)?.dayIcon || null;
    }

    appRef?.showToast(
      `Route: ${valid.length} stops` +
        (rainy ? `, 🌧️ rain at ${rainy}` : ', dry') +
        (dest ? ` · dest ${dest} ${last.current.temperature_2m.toFixed(0)}°C` : ''),
      'success',
    );
  } catch (e) {
    appRef?.showToast('Route weather failed', 'error');
  }
}

export function init(app: any): void {
  appRef = app;
  routeBtn = document.getElementById('routeBtn') as HTMLButtonElement | null;
  if (routeBtn) routeBtn.addEventListener('click', toggleRoute);
}