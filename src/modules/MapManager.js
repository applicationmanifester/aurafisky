// MapManager.js - Encapsulates OpenLayers map logic
import OlMap from "ol/Map.js";
import View from "ol/View.js";
import LayerGroup from "ol/layer/Group.js";
import TileLayer from "ol/layer/Tile.js";
import XYZ from "ol/source/XYZ.js";
import { defaults as defaultInteractions } from "ol/interaction/defaults.js";
import { fromLonLat, toLonLat } from "ol/proj.js";
import { apply as applyMapboxStyle, applyStyle as applyMapboxLayerStyle, getLayers as getMapboxLayers } from "ol-mapbox-style";
import { HtmlMarker } from "../modules/ol-marker.js";
import { localizeGlStyle } from "../modules/map-language.js";

export class MapManager {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      throw new Error(`Container element with id '${containerId}' not found`);
    }
    
    this.map = null;
    this.marker = null;
    this._mapClickDebounce = false;
    this._timelineRAF = null;
    this.biasMap = null;
    
    // Initialize map with provided options
    this.initMap(options);
  }

  initMap(options = {}) {
    const { viewOptions, layers = [], interactions = true } = options;
    
    this.map = new OlMap({
      target: this.container,
      view: new View(viewOptions || {
        center: fromLonLat([0, 0]),
        zoom: 2
      }),
      layers: layers.length ? layers : [new TileLayer({ source: new XYZ() })],
      interactions: interactions ? defaultInteractions() : []
    });
  }

  getMap() {
    return this.map;
  }

  setView(options) {
    if (!this.map) return;
    this.map.getView().setOptions(options);
  }

  addLayer(layer) {
    if (!this.map) return;
    this.map.addLayer(layer);
  }

  removeLayer(layer) {
    if (!this.map) return;
    this.map.removeLayer(layer);
  }

  addOverlay(overlay) {
    if (!this.map) return;
    this.map.addOverlay(overlay);
  }

  removeOverlay(overlay) {
    if (!this.map) return;
    this.map.removeOverlay(overlay);
  }

  // Debounce wrapper for map click events
  debounceMapClick(callback, delay = 300) {
    if (this._mapClickDebounce) return;
    this._mapClickDebounce = true;
    setTimeout(() => {
      this._mapClickDebounce = false;
    }, delay);
    return callback;
  }

  // RAF management for timeline animations
  requestTimelineFrame(callback) {
    if (this._timelineRAF) cancelAnimationFrame(this._timelineRAF);
    this._timelineRAF = requestAnimationFrame(callback);
  }

  cancelTimelineFrame() {
    if (this._timelineRAF) {
      cancelAnimationFrame(this._timelineRAF);
      this._timelineRAF = null;
    }
  }

  // Marker management
  setMarkerPosition(lon, lat) {
    if (!this.marker) return;
    this.marker.setPosition(fromLonLat([lon, lat]));
  }

  createMarker(lon, lat, htmlContent) {
    if (!this.map) return null;
    this.marker = new HtmlMarker({
      position: fromLonLat([lon, lat]),
      html: htmlContent
    });
    this.addOverlay(this.marker);
    return this.marker;
  }

  removeMarker() {
    if (this.marker) {
      this.removeOverlay(this.marker);
      this.marker = null;
    }
  }

  // Cleanup
  destroy() {
    this.cancelTimelineFrame();
    if (this.map) {
      this.map.setTarget(null);
      this.map.dispose();
      this.map = null;
    }
  }
}