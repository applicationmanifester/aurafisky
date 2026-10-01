// src/controllers/MapController.ts
import { MapManager } from '../modules/MapManager.js';
import { HtmlMarker } from '../modules/ol-marker.js';
import { MAP_DEFAULT_ZOOM, MAP_DEFAULT_COORDS } from '../config/constants.ts';
import { log } from '../utils/logger.ts';
import { cancelAllForecasts, getForecast, type WeatherData } from '../services/WeatherService.ts';
import { fromLonLat } from 'ol/proj.js';

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let currentRequestId = 0;

let mapManagerInstance: MapManager | null = null;
let markerInstance: HtmlMarker | null = null;

function createMapManager(containerId: string): MapManager {
  if (mapManagerInstance) {
    mapManagerInstance.destroy();
  }
  mapManagerInstance = new MapManager(containerId, {
    viewOptions: {
      center: fromLonLat([MAP_DEFAULT_COORDS.lon, MAP_DEFAULT_COORDS.lat]),
      zoom: MAP_DEFAULT_ZOOM,
    },
  });
  return mapManagerInstance;
}

export interface MapController {
  init(containerId: string): MapManager;
  setView(lat: number, lon: number, zoom?: number): void;
  panTo(lat: number, lon: number): void;
  addMarker(lat: number, lon: number, htmlContent?: string): HtmlMarker | null;
  destroy(): void;
  onWeatherUpdate: ((data: WeatherData, center: { lat: number; lon: number }) => void) | null;
}

async function handleMoveEnd(mapManager: MapManager) {
  const map = mapManager.getMap();
  if (!map) return;
  const view = map.getView();
  const center = view.getCenter();
  if (!center) return;
  const [lon, lat] = center; // OpenLayers uses [lon, lat]
  const requestId = ++currentRequestId;
  cancelAllForecasts();

  try {
    const data = await getForecast(lat, lon);
    if (requestId !== currentRequestId) return;
    mapControllerInstance.onWeatherUpdate?.(data, { lat, lon });
  } catch (err) {
    if (requestId !== currentRequestId) return;
    log('Weather fetch error', err);
  }
}

const mapControllerInstance: MapController = {
  onWeatherUpdate: null,

  init(containerId: string): MapManager {
    const manager = createMapManager(containerId);
    const map = manager.getMap();
    
    if (map) {
      map.on('moveend', () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => handleMoveEnd(manager), 300);
      });
    }

    log('Map initialized (OpenLayers)');
    return manager;
  },

  setView(lat: number, lon: number, zoom = MAP_DEFAULT_ZOOM) {
    if (!mapManagerInstance) return;
    cancelAllForecasts();
    mapManagerInstance.setView({
      center: fromLonLat([lon, lat]),
      zoom,
    });
  },

  panTo(lat: number, lon: number) {
    if (!mapManagerInstance) return;
    cancelAllForecasts();
    mapManagerInstance.setView({
      center: fromLonLat([lon, lat]),
    });
  },

  addMarker(lat: number, lon: number, htmlContent = '<div class="marker">📍</div>') {
    if (!mapManagerInstance) return null;
    markerInstance = mapManagerInstance.createMarker(lon, lat, htmlContent);
    return markerInstance;
  },

  destroy() {
    if (debounceTimer) clearTimeout(debounceTimer);
    cancelAllForecasts();
    if (mapManagerInstance) {
      mapManagerInstance.destroy();
      mapManagerInstance = null;
    }
    markerInstance = null;
  },
};

export const mapController = mapControllerInstance;
export default mapControllerInstance;
