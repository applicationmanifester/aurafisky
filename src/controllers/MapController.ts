// src/controllers/MapController.ts
import L from 'leaflet';
import { MAP_DEFAULT_ZOOM, MAP_DEFAULT_COORDS } from '../config/constants.ts';
import { log } from '../utils/logger.ts';
import { cancelAllForecasts, getForecast, type WeatherData } from '../services/WeatherService.ts';

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let currentRequestId = 0;

export interface MapController {
  init(containerId: string): L.Map;
  setView(map: L.Map, lat: number, lon: number, zoom?: number): void;
  panTo(map: L.Map, lat: number, lon: number): void;
  addMarker(map: L.Map, lat: number, lon: number, options?: L.MarkerOptions): L.Marker;
  destroy(map: L.Map): void;
  onWeatherUpdate: ((data: WeatherData, center: { lat: number; lon: number }) => void) | null;
}

async function handleMoveEnd(map: L.Map) {
  const center = map.getCenter();
  const requestId = ++currentRequestId;
  cancelAllForecasts();

  try {
    const data = await getForecast(center.lat, center.lng);
    if (requestId !== currentRequestId) return;
    mapControllerInstance.onWeatherUpdate?.(data, { lat: center.lat, lon: center.lng });
  } catch (err) {
    if (requestId !== currentRequestId) return;
    log('Weather fetch error', err);
  }
}

const mapControllerInstance: MapController = {
  onWeatherUpdate: null,

  init(containerId: string): L.Map {
    const map = L.map(containerId, {
      center: [MAP_DEFAULT_COORDS.lat, MAP_DEFAULT_COORDS.lon],
      zoom: MAP_DEFAULT_ZOOM,
      zoomControl: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors',
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    map.on('moveend', () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => handleMoveEnd(map), 300);
    });

    log('Map initialized');
    return map;
  },

  setView(map: L.Map, lat: number, lon: number, zoom = MAP_DEFAULT_ZOOM) {
    cancelAllForecasts();
    map.setView([lat, lon], zoom);
  },

  panTo(map: L.Map, lat: number, lon: number) {
    cancelAllForecasts();
    map.panTo([lat, lon]);
  },

  addMarker(map: L.Map, lat: number, lon: number, options: L.MarkerOptions = {}) {
    return L.marker([lat, lon], options).addTo(map);
  },

  destroy(map: L.Map) {
    if (debounceTimer) clearTimeout(debounceTimer);
    cancelAllForecasts();
    map.remove();
  },
};

export const mapController = mapControllerInstance;
export default mapControllerInstance;