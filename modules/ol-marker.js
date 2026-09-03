// Rich-HTML map marker built on ol/Overlay — the OpenLayers equivalent of
// Leaflet's L.marker + L.divIcon pattern that the weather marker, home
// marker, and bookmark pins all used to share. An ol.Overlay just pins an
// arbitrary DOM element to a map coordinate and repositions it as the map
// moves, which is exactly what a divIcon marker was doing, so the custom
// Tailwind-styled marker HTML itself needed no changes — only how it's
// attached to the map.
import Overlay from "ol/Overlay.js";
import { fromLonLat } from "ol/proj.js";

export class HtmlMarker {
  /**
   * @param {import("ol/Map.js").default} map
   * @param {Object} opts
   * @param {number} opts.lat
   * @param {number} opts.lng
   * @param {string} opts.html - marker body (already-sanitized/trusted template HTML)
   * @param {string} [opts.className] - class(es) on the marker's root element
   * @param {[number,number]} [opts.size] - [width, height] in px
   * @param {[number,number]} [opts.anchor] - px offset from top-left to the
   *   point that sits exactly on {lat,lng} (same semantics as Leaflet's iconAnchor)
   * @param {number} [opts.zIndex]
   * @param {string} [opts.tooltip] - plain-text hover tooltip, shown above the marker
   * @param {string} [opts.tooltipClassName] - extra class(es) for the tooltip skin
   * @param {(e: MouseEvent) => void} [opts.onClick]
   */
  constructor(map, opts) {
    this.map = map;
    this._lat = opts.lat;
    this._lng = opts.lng;

    this.element = document.createElement("div");
    this.element.className = ["ol-html-marker", opts.className].filter(Boolean).join(" ");
    if (opts.size) {
      this.element.style.width = `${opts.size[0]}px`;
      this.element.style.height = `${opts.size[1]}px`;
    }
    this._applyContent(opts.html, opts.tooltip, opts.tooltipClassName);

    if (opts.onClick) {
      this.element.style.cursor = "pointer";
      this.element.addEventListener("click", opts.onClick);
    }

    const anchor = opts.anchor || [0, 0];
    this.overlay = new Overlay({
      element: this.element,
      position: fromLonLat([opts.lng, opts.lat]),
      // top-left + a negative pixel offset of the anchor point reproduces
      // Leaflet's iconAnchor semantics exactly (anchor = the pixel that sits
      // on the geo position; everything else is placed relative to it).
      positioning: "top-left",
      offset: [-anchor[0], -anchor[1]],
      stopEvent: true,
    });
    if (opts.zIndex != null) this.element.style.zIndex = String(opts.zIndex);

    map.addOverlay(this.overlay);
  }

  _applyContent(html, tooltip, tooltipClassName) {
    this.element.innerHTML = html || "";
    this.element.classList.toggle("ol-marker-hoverable", !!tooltip);
    if (tooltip) {
      const tip = document.createElement("div");
      tip.className = ["ol-tooltip", tooltipClassName].filter(Boolean).join(" ");
      tip.textContent = tooltip;
      this.element.appendChild(tip);
    }
  }

  /** Swap the marker's inner HTML/tooltip in place (no DOM teardown). */
  setHtml(html, tooltip, tooltipClassName) {
    this._applyContent(html, tooltip, tooltipClassName);
  }

  setPosition(lat, lng) {
    this._lat = lat;
    this._lng = lng;
    this.overlay.setPosition(fromLonLat([lng, lat]));
  }

  getPosition() {
    return { lat: this._lat, lng: this._lng };
  }

  remove() {
    this.map.removeOverlay(this.overlay);
  }
}
