// -- WEATHER RADAR & SATELLITE OVERLAYS (RainViewer API) --
import TileLayer from "ol/layer/Tile.js";
import XYZ from "ol/source/XYZ.js";

function _mapHasLayer(map, layer) {
  return map.getLayers().getArray().includes(layer);
}

async function toggleRadar() {
    this.radarActive = !this.radarActive;

    this.$.radarDot.classList.toggle("active", this.radarActive);

    if (this.overlayType === "temperature" || this.overlayType === "wind") {
      this.$.radarPlayback.classList.add("hidden");
    } else {
      this.$.radarPlayback.classList.toggle("hidden", !this.radarActive);
    }
    this.$.radarExtras.classList.toggle("hidden", !this.radarActive);

    if (this.radarActive) {
      if (this.overlayType === "temperature") {
        this.showToast("Loading temperature overlay...", "info");
        this.stopRadarPlayback();
        this.clearRadarLayers();
        this.clearTempOverlay();
        this.activeEffectType = "none";
        if (this.$.legendPrecip) this.$.legendPrecip.classList.add("hidden");
        if (this.$.legendTemp) this.$.legendTemp.classList.remove("hidden");
        await this.initTempOverlayLayers();
      } else if (this.overlayType === "wind") {
        this.showToast("Wind flow overlay active", "info");
        this.stopRadarPlayback();
        this.clearRadarLayers();
        this.clearTempOverlay();
        this.activeEffectType = "wind";
        this.initWindParticles();
        if (this.$.legendPrecip) this.$.legendPrecip.classList.add("hidden");
        if (this.$.legendTemp) this.$.legendTemp.classList.add("hidden");
        if (!this.animationFrameId) this.runWeatherCanvasLoop();
      } else {
        this.showToast(
          `Loading weather ${this.overlayType === "radar" ? "radar" : "satellite"} frames...`,
          "info",
        );
        this.clearTempOverlay();
        this.activeEffectType = "none";
        if (this.$.legendPrecip) this.$.legendPrecip.classList.remove("hidden");
        if (this.$.legendTemp) this.$.legendTemp.classList.add("hidden");
        await this.initRadarLayers();
        this.startRadarPlayback();
      }
    } else {
      this.stopRadarPlayback();
      this.clearRadarLayers();
      this.clearTempOverlay();
      this.activeEffectType = "none";
      if (this.$.legendPrecip) this.$.legendPrecip.classList.remove("hidden");
      if (this.$.legendTemp) this.$.legendTemp.classList.add("hidden");
    }

    // Expand/collapse the control panel to match radar state
    if (this.$.radarExpandedPanel) {
      this.$.radarExpandedPanel.classList.toggle("hidden", !this.radarActive);
    }
    if (this.$.radarCollapsedBtn) {
      this.$.radarCollapsedBtn.classList.toggle("hidden", this.radarActive);
    }
  }

async function initRadarLayers() {
    try {
      const response = await fetch(
        "https://api.rainviewer.com/public/weather-maps.json",
      );
      if (!response.ok) throw new Error("RainViewer API request failed");

      const data = await response.json();

      // Hide satellite option if no satellite data available
      const hasSatellite = data.satellite?.infrared?.length > 0;
      const satOption = this.$.layerTypeSelect.querySelector(
        'option[value="satellite"]',
      );
      if (satOption) satOption.hidden = !hasSatellite;
      if (this.overlayType === "satellite" && !hasSatellite) {
        this.overlayType = "radar";
        this.$.layerTypeSelect.value = "radar";
      }

      // Reset opacity from slider
      this.radarOpacity = parseInt(this.$.radarOpacitySlider.value, 10) / 100;

      let allFrames = [];
      if (this.overlayType === "radar") {
        const pastFrames = data.radar.past || [];
        const nowcastFrames = data.radar.nowcast || [];
        allFrames = [...pastFrames, ...nowcastFrames].slice(-6);
      } else {
        allFrames = (data.satellite.infrared || []).slice(-6);
      }

      this.clearRadarLayers();
      this.radarTimestamps = allFrames.map((f) => f.time);
      this._radarFrameData = allFrames;
      this.radarLayers = [];
      this.radarIndex = -1;
      this.setRadarFrame(0);

      this.$.radarOpacitySlider.oninput = () => {
        this.radarOpacity = parseInt(this.$.radarOpacitySlider.value, 10) / 100;
        if (this.radarLayers[this.radarIndex]) {
          this.radarLayers[this.radarIndex].setOpacity(this.radarOpacity);
        }
      };

      this._frameCache = new Map();
    } catch (error) {
      console.error("Radar init error:", error);
      this.showToast("Could not load map overlays.", "error");
      if (this.radarActive) this.toggleRadar();
    }
  }

function _getOrCreateRadarLayer(index) {
    const layer = this.radarLayers[index];
    if (layer) return layer;
    const frame = this._radarFrameData?.[index];
    if (!frame) return null;
    // maxZoom:7 mirrors Leaflet's old maxNativeZoom:7 — RainViewer only
    // publishes tiles up to zoom 7; OL synthesizes higher zooms by
    // up-scaling those instead of requesting (nonexistent) deeper tiles.
    const newLayer = new TileLayer({
      source: new XYZ({
        url: `https://tilecache.rainviewer.com${frame.path}/256/{z}/{x}/{y}/2/1_1.png`,
        maxZoom: 7,
        // OL's default per-tile fade (250ms) stacks with the opacity
        // crossfade the radar player already does between frames, making a
        // freshly-fetched (uncached) frame look like it's fading in twice.
        // The layer's own opacity tween is the real animation; the tile
        // fade underneath it is redundant, so turn it off.
        transition: 0,
      }),
      opacity: 0.0,
      zIndex: 500,
    });
    newLayer.getSource().on("tileloaderror", () => {
      // Quietly swallow 429 / network errors for radar tiles without breaking app
    });
    this.radarLayers[index] = newLayer;
    return newLayer;
  }

function setRadarFrame(newIndex) {
    if (!this.radarLayers.length && this._radarFrameData?.length) {
      this.radarLayers = new Array(this._radarFrameData.length).fill(null);
    }
    if (this.radarLayers.length === 0) return;

    // Hide old active layer
    const oldActiveLayer = this._getLayerAt(this.radarIndex);
    if (oldActiveLayer && this.radarIndex !== newIndex) {
      oldActiveLayer.setOpacity(0.0);
      if (_mapHasLayer(this.map, oldActiveLayer)) this.map.removeLayer(oldActiveLayer);
    }

    this.radarIndex = newIndex;
    const newActiveLayer = this._getOrCreateRadarLayer(newIndex);
    if (newActiveLayer) {
      if (!_mapHasLayer(this.map, newActiveLayer)) this.map.addLayer(newActiveLayer);
      newActiveLayer.setOpacity(this.radarOpacity);
    }

    // Prune: remove all other layers (free tile requests & memory)
    this.radarLayers.forEach((layer, idx) => {
      if (layer && idx !== newIndex) {
        if (_mapHasLayer(this.map, layer)) this.map.removeLayer(layer);
      }
    });

    this.updateRadarTimeLabel();
  }

function _getLayerAt(index) {
    if (index < 0) return null;
    return this.radarLayers[index] ?? null;
  }

function toggleRadarPlayback() {
    if (this.radarPlaying) {
      this.pauseRadarPlayback();
    } else {
      this.startRadarPlayback();
    }
  }

function startRadarPlayback() {
    if (this.radarLayers.length === 0) return;
    if (this.radarTimer) clearInterval(this.radarTimer);

    this.setRadarFrame(this.radarIndex);
    this.radarPlaying = true;
    this.$.radarPlayIcon.classList.add("hidden");
    this.$.radarPauseIcon.classList.remove("hidden");

    this.radarTimer = setInterval(() => {
      const nextIdx = (this.radarIndex + 1) % this.radarLayers.length;
      this.setRadarFrame(nextIdx);
    }, 1000);
  }

function pauseRadarPlayback() {
    this.radarPlaying = false;
    this.$.radarPlayIcon.classList.remove("hidden");
    this.$.radarPauseIcon.classList.add("hidden");
    clearInterval(this.radarTimer);
  }

function stopRadarPlayback() {
    this.pauseRadarPlayback();
    this.setRadarFrame(this.radarLayers.length - 1);
  }

function clearRadarLayers() {
    // Clear radar timer to prevent memory leaks
    if (this.radarTimer) {
      clearInterval(this.radarTimer);
      this.radarTimer = null;
    }

    // Remove all radar layers from map
    this.radarLayers.forEach((layer) => {
      if (layer && _mapHasLayer(this.map, layer)) {
        this.map.removeLayer(layer);
      }
    });
    this.radarLayers = [];
    this.radarTimestamps = [];
  }

function updateRadarTimeLabel() {
    if (this.radarTimestamps[this.radarIndex]) {
      const timestamp = this.radarTimestamps[this.radarIndex];
      const date = new Date(timestamp * 1000);
      this.$.radarTimeLabel.textContent = date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } else {
      this.$.radarTimeLabel.textContent = "--:--";
    }
  }

export function init(app) {
  app.toggleRadar = toggleRadar;
  app.initRadarLayers = initRadarLayers;
  app._getOrCreateRadarLayer = _getOrCreateRadarLayer;
  app.setRadarFrame = setRadarFrame;
  app._getLayerAt = _getLayerAt;
  app.toggleRadarPlayback = toggleRadarPlayback;
  app.startRadarPlayback = startRadarPlayback;
  app.pauseRadarPlayback = pauseRadarPlayback;
  app.stopRadarPlayback = stopRadarPlayback;
  app.clearRadarLayers = clearRadarLayers;
  app.updateRadarTimeLabel = updateRadarTimeLabel;
}
