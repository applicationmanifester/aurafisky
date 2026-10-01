export class StateStore {
  constructor(initialState = {}) {
    this._state = { ...initialState };
    this._listeners = new Map();
  }
  getState() { return { ...this._state }; }
  get(path) {
    return path.split('.').reduce((obj, key) => obj && obj[key], this._state);
  }
  set(path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    let target = this._state;
    for (const k of keys) {
      if (!(k in target)) target[k] = {};
      target = target[k];
    }
    const old = target[last];
    target[last] = value;
    this._listeners.forEach((cb, p) => {
      if (p === path || path.startsWith(p + '.')) cb(path, value, old);
    });
    return value;
  }
  subscribe(path, callback) {
    if (!this._listeners.has(path)) this._listeners.set(path, new Set());
    this._listeners.get(path).add(callback);
    return () => {
      this._listeners.get(path).delete(callback);
      if (this._listeners.get(path).size === 0) this._listeners.delete(path);
    };
  }
  destroy() {
    this._listeners.clear();
    this._state = {};
  }
}