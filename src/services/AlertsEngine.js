/**
 * Alerts Engine
 * Monitors weather conditions against user-defined rules and triggers notifications
 */
import { weatherService } from '../services/WeatherService.js';
import { authService } from '../services/AuthService.js';
import { showToast } from '../modules/toast.js';

// ────────────────── Types ──────────────────
export interface AlertRule {
  id: string;
  userId: string;
  placeId: string;
  type: 'temperature' | 'precipitation' | 'wind' | 'aqi' | 'weathercode';
  condition: 'above' | 'below' | 'equals';
  value: number;
  enabled: boolean;
}

export interface AlertEvent {
  id: string;
  ruleId: string;
  placeId: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  acknowledged: boolean;
  createdAt: Date;
}

// ────────────────── Condition Evaluators ──────────────────
const evaluators = {
  temperature: (data, rule) => {
    const temp = data.current_weather?.temperature;
    if (temp === undefined) return false;
    return rule.condition === 'above' ? temp > rule.value :
           rule.condition === 'below' ? temp < rule.value :
           temp === rule.value;
  },
  precipitation: (data, rule) => {
    const precip = data.hourly?.precipitation?.[0] ?? 0;
    return rule.condition === 'above' ? precip > rule.value :
           rule.condition === 'below' ? precip < rule.value :
           precip === rule.value;
  },
  wind: (data, rule) => {
    const wind = data.current_weather?.windspeed ?? 0;
    return rule.condition === 'above' ? wind > rule.value :
           rule.condition === 'below' ? wind < rule.value :
           wind === rule.value;
  },
  aqi: async (data, rule) => {
    // Would need air quality data - placeholder
    return false;
  },
  weathercode: (data, rule) => {
    const code = data.current_weather?.weathercode;
    if (code === undefined) return false;
    return rule.condition === 'equals' ? code === rule.value : false;
  },
};

// ────────────────── Alert Messages ──────────────────
const alertMessages = {
  temperature: {
    above: (v) => `Temperature rose above ${v}°`,
    below: (v) => `Temperature dropped below ${v}°`,
    equals: (v) => `Temperature is exactly ${v}°`,
  },
  precipitation: {
    above: (v) => `Precipitation exceeded ${v} mm/h`,
    below: (v) => `Precipitation below ${v} mm/h`,
    equals: (v) => `Precipitation at ${v} mm/h`,
  },
  wind: {
    above: (v) => `Wind speed exceeded ${v} km/h`,
    below: (v) => `Wind speed below ${v} km/h`,
    equals: (v) => `Wind speed at ${v} km/h`,
  },
  weathercode: {
    equals: (v) => `Weather condition: ${weatherService.getConditionText(v)}`,
  },
};

// ────────────────── Engine ──────────────────
class AlertsEngine {
  #intervalId = null;
  #checkInterval = 5 * 60 * 1000; // 5 minutes
  #lastTriggered = new Map<string, number>(); // ruleId -> timestamp
  #cooldown = 60 * 60 * 1000; // 1 hour cooldown per rule
  #running = false;

  start() {
    if (this.#running) return;
    this.#running = true;
    this.#intervalId = setInterval(() => this.checkAll(), this.#checkInterval);
    this.#intervalId.unref?.();
    // Initial check
    this.checkAll();
    console.log('[Alerts] Engine started');
  }

  stop() {
    if (this.#intervalId) clearInterval(this.#intervalId);
    this.#intervalId = null;
    this.#running = false;
    console.log('[Alerts] Engine stopped');
  }

  async checkAll() {
    if (!authService.isSignedIn) return;
    const rules = authService.alerts.filter(r => r.enabled);
    if (!rules.length) return;

    // Group rules by place to minimize API calls
    const placeRules = new Map<string, AlertRule[]>();
    for (const rule of rules) {
      const arr = placeRules.get(rule.placeId) || [];
      arr.push(rule);
      placeRules.set(rule.placeId, arr);
    }

    for (const [placeId, rulesForPlace] of placeRules) {
      const place = authService.places.find(p => p.id === placeId);
      if (!place) continue;

      try {
        const data = await weatherService.getForecast(place.lat, place.lon);
        for (const rule of rulesForPlace) {
          this.#evaluateRule(rule, place, data);
        }
      } catch (err) {
        console.error('[Alerts] Check failed for place', placeId, err);
      }
    }
  }

  async #evaluateRule(rule, place, data) {
    const evaluator = evaluators[rule.type];
    if (!evaluator) return;

    const triggered = await evaluator(data, rule);
    if (!triggered) return;

    // Cooldown check
    const last = this.#lastTriggered.get(rule.id) || 0;
    if (Date.now() - last < this.#cooldown) return;

    this.#lastTriggered.set(rule.id, Date.now());

    // Generate message
    const msgFn = alertMessages[rule.type]?.[rule.condition];
    const message = msgFn ? msgFn(rule.value) : `Alert triggered for ${place.name}`;
    const severity = this.#calculateSeverity(rule.type, rule.value, rule.condition);

    // Fire event
    const event = {
      ruleId: rule.id,
      placeId: place.id,
      message: `${place.name}: ${message}`,
      severity,
      acknowledged: false,
      createdAt: new Date(),
    };

    await authService.logAlertEvent(event);
    this.#notify(event);
  }

  #calculateSeverity(type, value, condition) {
    // Critical thresholds
    if (type === 'temperature' && condition === 'above' && value >= 40) return 'critical';
    if (type === 'temperature' && condition === 'below' && value <= -10) return 'critical';
    if (type === 'wind' && condition === 'above' && value >= 80) return 'critical';
    if (type === 'weathercode' && condition === 'equals' && [95, 96, 99].includes(value)) return 'critical'; // thunderstorm
    if (type === 'precipitation' && condition === 'above' && value >= 20) return 'warning';
    return 'info';
  }

  async #notify(event) {
    // Toast notification
    showToast(event.message, event.severity);

    // Browser notification (if permitted)
    if (Notification.permission === 'granted') {
      new Notification('Aurafisky Alert', {
        body: event.message,
        icon: '/icon-192.png',
        tag: `alert-${event.ruleId}`,
      });
    }

    // FCM push would be handled by backend/cloud function
  }

  // Public API
  async requestNotificationPermission() {
    if (!('Notification' in window)) return false;
    const perm = await Notification.requestPermission();
    return perm === 'granted';
  }

  getStatus() {
    return {
      running: this.#running,
      interval: this.#checkInterval,
      rulesCount: authService.alerts.length,
      activeRules: authService.alerts.filter(r => r.enabled).length,
    };
  }
}

export const alertsEngine = new AlertsEngine();