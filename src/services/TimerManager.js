export class TimerManager {
  constructor() { this._timers = new Map(); this._id = 0; }
  setInterval(id, cb, delay) {
    const timerId = `${id}_${this._id++}`;
    const handle = setInterval(cb, delay);
    this._timers.set(timerId, {type: 'interval', handle});
    return timerId;
  }
  setTimeout(id, cb, delay) {
    const timerId = `${id}_${this._id++}`;
    const handle = setTimeout(() => {
      this.clear(timerId);
      cb();
    }, delay);
    this._timers.set(timerId, {type: 'timeout', handle});
    return timerId;
  }
  clear(timerId) {
    const t = this._timers.get(timerId);
    if (!t) return;
    if (t.type === 'interval') clearInterval(t.handle);
    else clearTimeout(t.handle);
    this._timers.delete(timerId);
  }
  destroy() { this._timers.forEach(t => t.type === 'interval' ? clearInterval(t.handle) : clearTimeout(t.handle)); this._timers.clear(); }
}