export class UIUpdater {
  constructor() { this._pending = new Map(); this._frame = null; this._scheduled = false; }
  update(elementId, props) {
    if (!this._pending.has(elementId)) this._pending.set(elementId, {});
    Object.assign(this._pending.get(elementId), props);
    this.schedule();
  }
  schedule() {
    if (this._scheduled) return;
    this._scheduled = true;
    this._frame = requestAnimationFrame(() => { this.flush(); this._scheduled = false; });
  }
  flush() {
    if (!this._frame) return;
    cancelAnimationFrame(this._frame);
    this._frame = null;
    for (const [id, props] of this._pending) {
      const el = document.getElementById(id);
      if (el) Object.assign(el, props);
    }
    this._pending.clear();
  }
  destroy() { if (this._frame) cancelAnimationFrame(this._frame); this._pending.clear(); }
}