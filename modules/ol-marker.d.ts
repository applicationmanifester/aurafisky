// TypeScript declarations for ol-marker.js
import type Map from 'ol/Map.js';

export interface HtmlMarkerOptions {
  lat: number;
  lng: number;
  html: string;
  className?: string;
  size?: [number, number];
  anchor?: [number, number];
  zIndex?: number;
  tooltip?: string;
  tooltipClassName?: string;
  onClick?: (e: MouseEvent) => void;
}

export class HtmlMarker {
  map: Map;
  element: HTMLElement;
  overlay: any;
  private _lat: number;
  private _lng: number;
  
  constructor(map: Map, opts: HtmlMarkerOptions);
  
  setHtml(html: string, tooltip?: string, tooltipClassName?: string): void;
  setPosition(lat: number, lng: number): void;
  getPosition(): { lat: number; lng: number };
  remove(): void;
}