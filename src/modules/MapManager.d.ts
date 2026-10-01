// TypeScript declarations for MapManager.js
export interface MapManagerOptions {
  viewOptions?: {
    center?: number[];
    zoom?: number;
    [key: string]: any;
  };
  layers?: any[];
  interactions?: boolean;
}

export class MapManager {
  private container: HTMLElement;
  private map: any;
  private marker: any;
  private _mapClickDebounce: boolean;
  private _timelineRAF: number | null;
  private biasMap: any;
  
  constructor(containerId: string, options?: MapManagerOptions);
  
  initMap(options?: MapManagerOptions): void;
  getMap(): any;
  setView(options: any): void;
  addLayer(layer: any): void;
  removeLayer(layer: any): void;
  addOverlay(overlay: any): void;
  removeOverlay(overlay: any): void;
  debounceMapClick(callback: Function, delay?: number): Function;
  requestTimelineFrame(callback: FrameRequestCallback): void;
  cancelTimelineFrame(): void;
  setMarkerPosition(lon: number, lat: number): void;
  createMarker(lon: number, lat: number, htmlContent: string): any;
  removeMarker(): void;
  destroy(): void;
}