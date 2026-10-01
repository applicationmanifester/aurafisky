// src/services/RadarService.ts
// Weather Radar & Satellite Overlays (RainViewer API)
// Uses OpenLayers TileLayer + XYZ source

import TileLayer from 'ol/layer/Tile.js';
import XYZ from 'ol/source/XYZ.js';
import Map from 'ol/Map.js';

interface RadarFrame {
  time: number;
  path: string;
}

interface RadarLayerOptions {
  map: Map;
  overlayType: 'radar' | 'satellite' | 'temperature' | 'wind';
  opacity: number;
  onFramesLoaded?: (timestamps: number[]) => void;
  onError?: (error: Error) => void;
}

export class RadarService {
  private map: Map;
  private overlayType: 'radar' | 'satellite' | 'temperature' | 'wind' = 'radar';
  private opacity = 0.6;
  private radarLayers: TileLayer<XYZ>[] = [];
  private radarTimestamps: number[] = [];
  private radarFrameData: RadarFrame[] = [];
  private radarIndex = -1;
  private playbackTimer: ReturnType<typeof setInterval> | null = null;
  private frameCache = new Map<number, TileLayer<XYZ>>();
  private isActive = false;
  private onFramesLoaded?: (timestamps: number[]) => void;
  private onError?: (error: Error) => void;
  private temperatureLayer: TileLayer<XYZ> | null = null;
  private windLayer: TileLayer<XYZ> | null = null;

  constructor(options: RadarLayerOptions) {
    this.map = options.map;
    this.overlayType = options.overlayType;
    this.opacity = options.opacity;
    this.onFramesLoaded = options.onFramesLoaded;
    this.onError = options.onError;
  }

  setOverlayType(type: 'radar' | 'satellite' | 'temperature' | 'wind'): void {
    this.overlayType = type;
  }

  setOpacity(opacity: number): void {
    this.opacity = Math.max(0, Math.min(1, opacity));
    if (this.radarLayers[this.radarIndex]) {
      this.radarLayers[this.radarIndex].setOpacity(this.opacity);
    }
    if (this.temperatureLayer) this.temperatureLayer.setOpacity(this.opacity);
    if (this.windLayer) this.windLayer.setOpacity(this.opacity);
  }

  async initialize(): Promise<void> {
    try {
      const response = await fetch('https://api.rainviewer.com/public/weather-maps.json');
      if (!response.ok) throw new Error('RainViewer API request failed');

      const data = await response.json();

      const hasSatellite = data.satellite?.infrared?.length > 0;
      if (this.overlayType === 'satellite' && !hasSatellite) {
        this.overlayType = 'radar';
      }

      if (this.overlayType === 'temperature') {
        await this.initTemperatureOverlay();
      } else if (this.overlayType === 'wind') {
        await this.initWindOverlay();
      } else {
        await this.initRadarSatelliteLayers(data);
      }
    } catch (error) {
      console.error('Radar init error:', error);
      this.onError?.(error as Error);
      throw error;
    }
  }

  private async initRadarSatelliteLayers(data: any): Promise<void> {
    this.clearLayers();

    let allFrames: RadarFrame[] = [];
    if (this.overlayType === 'radar') {
      const pastFrames = data.radar?.past || [];
      const nowcastFrames = data.radar?.nowcast || [];
      allFrames = [...pastFrames, ...nowcastFrames].slice(-6);
    } else {
      allFrames = (data.satellite?.infrared || []).slice(-6);
    }

    this.radarFrameData = allFrames;
    this.radarTimestamps = allFrames.map(f => f.time);
    this.radarIndex = -1;
    this.setFrame(0);

    this.onFramesLoaded?.(this.radarTimestamps);
  }

  private async initTemperatureOverlay(): Promise<void> {
    this.clearLayers();
    // Open-Meteo temperature tiles (example - replace with actual tile source)
    this.temperatureLayer = new TileLayer({
      source: new XYZ({
        url: 'https://tile.openweathermap.org/map/temp_new/{z}/{x}/{y}.png?appid={API_KEY}',
        maxZoom: 10,
        transition: 0,
      }),
      opacity: this.opacity,
      zIndex: 500,
    });
    this.map.addLayer(this.temperatureLayer);
  }

  private async initWindOverlay(): Promise<void> {
    this.clearLayers();
    // Wind particles would be handled separately via canvas
    // This is a placeholder for wind tile layer if available
    this.windLayer = new TileLayer({
      source: new XYZ({
        url: 'https://tile.openweathermap.org/map/wind_new/{z}/{x}/{y}.png?appid={API_KEY}',
        maxZoom: 10,
        transition: 0,
      }),
      opacity: this.opacity,
      zIndex: 500,
    });
    this.map.addLayer(this.windLayer);
  }

  setFrame(index: number): void {
    if (index < 0 || index >= this.radarLayers.length) return;

    // Fade out current frame
    if (this.radarIndex >= 0 && this.radarLayers[this.radarIndex]) {
      this.radarLayers[this.radarIndex].setOpacity(0);
    }

    this.radarIndex = index;
    const layer = this.radarLayers[index];
    if (layer) {
      layer.setOpacity(this.opacity);
    }
  }

  startPlayback(intervalMs = 500): void {
    this.stopPlayback();
    this.playbackTimer = setInterval(() => {
      const next = (this.radarIndex + 1) % this.radarLayers.length;
      this.setFrame(next);
    }, intervalMs);
  }

  stopPlayback(): void {
    if (this.playbackTimer) {
      clearInterval(this.playbackTimer);
      this.playbackTimer = null;
    }
  }

  clearLayers(): void {
    this.stopPlayback();
    this.radarLayers.forEach(layer => this.map.removeLayer(layer));
    this.radarLayers = [];
    this.frameCache.clear();
    this.radarFrameData = [];
    this.radarTimestamps = [];
    this.radarIndex = -1;

    if (this.temperatureLayer) {
      this.map.removeLayer(this.temperatureLayer);
      this.temperatureLayer = null;
    }
    if (this.windLayer) {
      this.map.removeLayer(this.windLayer);
      this.windLayer = null;
    }
  }

  getTimestamps(): number[] {
    return [...this.radarTimestamps];
  }

  getCurrentFrameIndex(): number {
    return this.radarIndex;
  }

  getFrameCount(): number {
    return this.radarLayers.length;
  }

  isPlaying(): boolean {
    return this.playbackTimer !== null;
  }

  destroy(): void {
    this.clearLayers();
    this.onFramesLoaded = undefined;
    this.onError = undefined;
  }

  // Private helper to create radar layer
  private _getOrCreateRadarLayer(index: number): TileLayer<XYZ> | null {
    if (this.radarLayers[index]) return this.radarLayers[index];
    const frame = this.radarFrameData[index];
    if (!frame) return null;

    // RainViewer only publishes tiles up to zoom 7
    const layer = new TileLayer({
      source: new XYZ({
        url: `https://tilecache.rainviewer.com${frame.path}/256/{z}/{x}/{y}/2/1_1.png`,
        maxZoom: 7,
        transition: 0,
      }),
      opacity: 0.0,
      zIndex: 500,
    });

    this.map.addLayer(layer);
    this.radarLayers[index] = layer;
    return layer;
  }
}

export function createRadarService(options: RadarLayerOptions): RadarService {
  return new RadarService(options);
}
