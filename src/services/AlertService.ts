// src/services/AlertService.ts
// Local-first alert service using IndexedDB via localforage

import localforage from 'localforage';
import { localAuthService } from './LocalAuthService.ts';
import { localSyncService } from './LocalSyncService.ts';
import { getForecast } from './WeatherService.ts';
import { log } from '../utils/logger.ts';
import { ALERT_TYPES, THRESHOLD_FIELDS } from '../config/constants.ts';

interface Alert {
  id: string;
  type: string;
  enabled: boolean;
  lat: number;
  lon: number;
  name?: string;
  condition?: { field: string; operator: string; value: number };
  createdAt: number;
  updatedAt: number;
}

export class AlertService {
  #alerts: Alert[] = [];
  #listeners = new Set<(alerts: Alert[]) => void>();
  #evaluationTimer: ReturnType<typeof setInterval> | null = null;
  #dailyBriefingTimer: ReturnType<typeof setTimeout> | null = null;
  #lastEvaluated = new Map<string, number>();
  #freeTierLimit = 3;
  #isInitialized = false;

  constructor() {
    this.#init();
  }

  async #init() {
    await localAuthService.ready();
    
    localAuthService.on('auth:changed', async (user) => {
      if (user) {
        await this.loadLocal();
      } else {
        this.#alerts = [];
        this.#notifyListeners();
      }
    });

    this.#startPeriodicEvaluation();
    this.#isInitialized = true;
  }

  private getStorageKey(): string {
    const user = localAuthService.currentUser;
    if (!user) throw new Error('Not authenticated');
    return `alerts_${user.uid}`;
  }

  async loadLocal(): Promise<void> {
    try {
      const key = this.getStorageKey();
      const data = await localforage.getItem<Alert[]>(key);
      this.#alerts = data || [];
      this.#notifyListeners();
      this.#scheduleEvaluations();
    } catch (err) {
      log('Failed to load alerts', err);
      this.#alerts = [];
      this.#notifyListeners();
    }
  }

  private async saveLocal(): Promise<void> {
    try {
      const key = this.getStorageKey();
      await localforage.setItem(key, this.#alerts);
    } catch (err) {
      log('Failed to save alerts', err);
    }
  }

  private async persist(alert: Alert | null, deleteId: string | null = null): Promise<void> {
    if (localSyncService.isAuthenticated) {
      if (deleteId) await localSyncService.alerts.remove(deleteId);
      else if (alert) await localSyncService.alerts.add(alert);
    } else {
      await this.saveLocal();
    }
  }

  private #notifyListeners(): void {
    for (const fn of this.#listeners) fn([...this.#alerts]);
  }

  subscribe(callback: (alerts: Alert[]) => void) {
    this.#listeners.add(callback);
    callback([...this.#alerts]);
    return () => this.#listeners.delete(callback);
  }

  getAll(): Alert[] { return [...this.#alerts]; }
  getEnabled(): Alert[] { return this.#alerts.filter(a => a.enabled !== false); }
  getById(id: string): Alert | undefined { return this.#alerts.find(a => a.id === id); }

  canCreateMore(): boolean {
    if (localSyncService.isAuthenticated) return true;
    return this.#alerts.filter(a => a.enabled !== false).length < this.#freeTierLimit;
  }

  async create(alert: Partial<Alert>): Promise<Alert> {
    if (!this.canCreateMore()) throw new Error('Free tier limit reached (3 alerts). Upgrade for unlimited.');
    const newAlert: Alert = {
      id: alert.id || crypto.randomUUID(),
      type: alert.type || ALERT_TYPES.THRESHOLD,
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...alert,
    } as Alert;
    this.#alerts.push(newAlert);
    await this.persist(newAlert);
    this.#notifyListeners();
    this.#scheduleEvaluations();
    return newAlert;
  }

  async update(id: string, data: Partial<Alert>): Promise<void> {
    const idx = this.#alerts.findIndex(a => a.id === id);
    if (idx === -1) throw new Error('Alert not found');
    this.#alerts[idx] = { ...this.#alerts[idx], ...data, updatedAt: Date.now() };
    await this.persist(this.#alerts[idx]);
    this.#notifyListeners();
    this.#scheduleEvaluations();
  }

  async delete(id: string): Promise<void> {
    this.#alerts = this.#alerts.filter(a => a.id !== id);
    await this.persist(null, id);
    this.#notifyListeners();
    this.#scheduleEvaluations();
  }

  async toggle(id: string): Promise<void> {
    const alert = this.getById(id);
    if (!alert) return;
    await this.update(id, { enabled: !alert.enabled });
  }

  #startPeriodicEvaluation() {
    if (this.#evaluationTimer) clearInterval(this.#evaluationTimer);
    this.#evaluationTimer = setInterval(() => this.evaluateAll(), 15 * 60 * 1000);
    if (typeof (this.#evaluationTimer as any).unref === 'function') {
      (this.#evaluationTimer as any).unref();
    }
    this.evaluateAll();
  }

  #scheduleEvaluations() {
    if (this.#evaluationTimer) {
      this.evaluateAll();
    }
  }

  #scheduleDailyBriefing() {
    if (this.#dailyBriefingTimer) clearTimeout(this.#dailyBriefingTimer);
    const now = new Date();
    const target = new Date(now);
    target.setHours(7, 0, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    const delay = target.getTime() - now.getTime();
    this.#dailyBriefingTimer = setTimeout(() => {
      this.#sendDailyBriefings();
      this.#scheduleDailyBriefing();
    }, delay);
  }

  async evaluateAll(): Promise<void> {
    const enabled = this.getEnabled();
    if (enabled.length === 0) return;

    const byLocation = new Map<string, Alert[]>();
    for (const alert of enabled) {
      const key = `${alert.lat.toFixed(4)},${alert.lon.toFixed(4)}`;
      if (!byLocation.has(key)) byLocation.set(key, []);
      byLocation.get(key)!.push(alert);
    }

    await Promise.all(
      Array.from(byLocation.entries()).map(async ([, alerts]) => {
        const [first] = alerts;
        try {
          const forecast = await getForecast(first.lat, first.lon, {
            hourly: ['temperature_2m', 'precipitation_probability', 'wind_speed_10m', 'uv_index']
          });
          await Promise.all(alerts.map(a => this.#evaluateAlert(a, forecast)));
        } catch (err) {
          log(`Alert evaluation error for ${first.lat},${first.lon}`, err);
        }
      })
    );
  }

  async #evaluateAlert(alert: Alert, forecast: any): Promise<void> {
    const now = Date.now();
    const lastEval = this.#lastEvaluated.get(alert.id) || 0;
    if (now - lastEval < 60 * 60 * 1000) return; // 1 hour cooldown

    let triggered = false;
    let message = '';

    if (alert.type === ALERT_TYPES.THRESHOLD && alert.condition) {
      const result = this.#checkThreshold(alert, forecast);
      triggered = result.triggered;
      message = result.message;
    }

    if (triggered) {
      this.#lastEvaluated.set(alert.id, now);
      await this.#sendNotification(alert, message);
    }
  }

  #checkThreshold(alert: Alert, forecast: any): { triggered: boolean; message: string } {
    const { field, operator, value } = alert.condition!;
    const fieldInfo = THRESHOLD_FIELDS[field as keyof typeof THRESHOLD_FIELDS];
    if (!fieldInfo) return { triggered: false, message: '' };

    let currentValue: number | null = null;
    const current = forecast.current_weather;
    const hourly = forecast.hourly;

    switch (field) {
      case 'temperature': currentValue = current?.temperature ?? null; break;
      case 'precipitation_probability': currentValue = hourly?.precipitation_probability?.[0] ?? null; break;
      case 'wind_speed': currentValue = current?.windspeed ? current.windspeed * 3.6 : null; break;
      case 'uv_index': currentValue = hourly?.uv_index?.[0] ?? null; break;
      case 'aqi': currentValue = null; break;
    }

    if (currentValue === null) return { triggered: false, message: '' };

    let triggered = false;
    switch (operator) {
      case '>': triggered = currentValue > value; break;
      case '>=': triggered = currentValue >= value; break;
      case '<': triggered = currentValue < value; break;
      case '<=': triggered = currentValue <= value; break;
      case '==': triggered = currentValue === value; break;
    }

    if (triggered) {
      const unit = fieldInfo.unit;
      const label = fieldInfo.label;
      message = `${label} is ${currentValue.toFixed(1)}${unit} (${operator} ${value}${unit}) at ${alert.name || 'your location'}`;
    }

    return { triggered, message };
  }

  async #sendNotification(alert: Alert, message: string): Promise<void> {
    log(`Alert triggered: ${message}`);
    // Show toast notification if app is open
    if (typeof window !== 'undefined' && (window as any).showToast) {
      (window as any).showToast(`🔔 ${message}`, 'warning', 10000);
    }
    // Trigger native notification if permission granted
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification('Aurafisky Alert', {
        body: message,
        tag: `aurafisky-alert-${alert.id}`,
        icon: '/icon-192.png',
      });
    }
  }

  #sendDailyBriefings(): void {
    // Implementation for daily briefings
  }

  destroy(): void {
    if (this.#evaluationTimer) clearInterval(this.#evaluationTimer);
    if (this.#dailyBriefingTimer) clearTimeout(this.#dailyBriefingTimer);
    this.#listeners.clear();
    this.#alerts = [];
    this.#lastEvaluated.clear();
  }
}

export const alertService = new AlertService();
export default alertService;