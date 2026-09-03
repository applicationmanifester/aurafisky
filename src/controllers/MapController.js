// src/controllers/MapController.js
import L from 'leaflet';
import { MAP_DEFAULT_ZOOM, MAP_DEFAULT_COORDS } from '../config/constants.js';
import { log } from '../utils/logger.js';

export const mapController = {
  init(containerId) {
    const map = L.map(containerId, {
      center: [MAP_DEFAULT_COORDS.lat, MAP_DEFAULT_COORDS.lon],
      zoom: MAP_DEFAULT_ZOOM,
      zoomControl: false,
    });

    // Base layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors',
    }).addTo(map);

    // Custom controls
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    log('Map initialized');
    return map;
  },

  setView(map, lat, lon, zoom = MAP_DEFAULT_ZOOM) {
    map.setView([lat, lon], zoom);
  },

  panTo(map, lat, lon) {
    map.panTo([lat, lon]);
  },

  addMarker(map, lat, lon, options = {}) {
    const marker = L.marker([lat, lon], options).addTo(map);
    return marker;
  },
};
