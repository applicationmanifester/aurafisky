export class BaseService {
  constructor() {
    this._timers = new TimerManager();
    this._observers = [];
    this._eventListeners = new Map();
    this._destroyed = false;
  }
  setInterval(id, cb, delay) {
    if (this._destroyed) return null;
    return this._timers.setInterval(id, cb, delay);
  }
  setTimeout(id, cb, delay) {
    if (this._destroyed) return null;
    return this._timers.setTimeout(id, cb, delay);
  }
  on(target, event, handler, options = false) {
    if (this._destroyed) return;
    if (!this._eventListeners.has(target)) this._eventListeners.set(target, new Map());
    const tMap = this._eventListeners.get(target);
    if (!tMap.has(event)) tMap.set(event, []);
    tMap.get(event).push({ handler, options });
    target.addEventListener(event, handler, options);
  }
  off(target, event) {
    if (!this._eventListeners.has(target)) return;
    const tMap = this._eventListeners.get(target);
    if (event) {
      if (tMap.has(event)) {
        tMap.get(event).forEach(({handler, opts}) => target.removeEventListener(event, handler, opts));
        tMap.delete(event);
      }
    } else {
      tMap.forEach((handlers, ev) => {
        handlers.forEach(({handler, opts}) => target.removeEventListener(ev, handler, opts));
      });
      tMap.clear();
    }
    if (tMap.size === 0) this._eventListeners.delete(target);
  }
  observe(target, opts, cb) {
    if (this._destroyed) return null;
    const obs = new MutationObserver(cb);
    obs.observe(target, opts);
    this._observers.push(obs);
    return obs;
  }
  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this._timers.destroy();
    this._observers.forEach(obs => obs.disconnect());
    this._observers = [];
    this._eventListeners.forEach((handlersMap, target) => {
      handlersMap.forEach((handlers, event) => {
        handlers.forEach(({handler, opts}) => target.removeEventListener(event, handler, opts));
      });
    });
    this._eventListeners.clear();
  }
}