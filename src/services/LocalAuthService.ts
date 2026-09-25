// src/services/LocalAuthService.ts
// Local-first authentication & user data management — no Firebase required.
// Uses IndexedDB via localforage for persistence.

import localforage from 'localforage';
import { log } from '../utils/logger.ts';

// ────────────────── Types ──────────────────

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  tier: 'free' | 'pro' | 'team';
  createdAt: number;
  updatedAt: number;
  preferences: UserPreferences;
}

export interface UserPreferences {
  units: 'celsius' | 'fahrenheit';
  theme: 'light' | 'dark' | 'auto';
  defaultLocation?: { lat: number; lon: number; name: string };
  notifications: {
    dailyBriefing: boolean;
    severeWeather: boolean;
    thresholdAlerts: boolean;
  };
  mapStyle: 'standard' | 'satellite' | 'dark';
  language: string;
}

export interface SavedPlace {
  id: string;
  userId: string;
  name: string;
  lat: number;
  lon: number;
  label?: string;
  order: number;
  createdAt: number;
}

export interface AlertRule {
  id: string;
  userId: string;
  placeId: string;
  type: 'temperature' | 'precipitation' | 'wind' | 'aqi' | 'weathercode';
  condition: 'above' | 'below' | 'equals';
  value: number;
  enabled: boolean;
  createdAt: number;
}

export interface AlertEvent {
  id: string;
  userId: string;
  ruleId: string;
  placeId: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  acknowledged: boolean;
  createdAt: number;
}

// ────────────────── Constants ──────────────────

const STORE_NAME = 'aurafisky_auth';
const PROFILE_KEY = 'profile';
const PLACES_KEY = 'places';
const ALERTS_KEY = 'alerts';
const ALERT_EVENTS_KEY = 'alertEvents';
const SESSION_KEY = 'session';
const ANONYMOUS_UID = 'anonymous';

const FREE_LIMITS = {
  places: 3,
  alerts: 3,
} as const;

// ────────────────── Event Emitter ──────────────────

type Listener = (...args: any[]) => void;

class EventEmitter {
  #events = new Map<string, Set<Listener>>();

  on(event: string, listener: Listener) {
    if (!this.#events.has(event)) this.#events.set(event, new Set());
    this.#events.get(event)!.add(listener);
    return this;
  }

  off(event: string, listener: Listener) {
    this.#events.get(event)?.delete(listener);
    return this;
  }

  emit(event: string, ...args: any[]) {
    this.#events.get(event)?.forEach(listener => listener(...args));
    return this;
  }

  once(event: string, listener: Listener) {
    const onceWrapper = (...args: any[]) => {
      listener(...args);
      this.off(event, onceWrapper);
    };
    this.on(event, onceWrapper);
    return this;
  }
}

// ────────────────── LocalAuthService ──────────────────

class LocalAuthService extends EventEmitter {
  #currentUser: UserProfile | null = null;
  #isInitialized = false;
  #initPromise: Promise<void> | null = null;

  constructor() {
    super();
    // Configure localforage
    localforage.config({
      name: STORE_NAME,
      storeName: STORE_NAME,
    });
    this.#initPromise = this.#initialize();
  }

  async #initialize(): Promise<void> {
    try {
      // Check for existing session
      const session = await localforage.getItem<{ uid: string; expires: number }>(SESSION_KEY);
      if (session && session.expires > Date.now()) {
        const profile = await localforage.getItem<UserProfile>(`${PROFILE_KEY}_${session.uid}`);
        if (profile) {
          this.#currentUser = profile;
          this.emit('auth:ready', this.#currentUser);
        }
      } else if (session) {
        // Expired session - clear it
        await localforage.removeItem(SESSION_KEY);
      }

      // If no valid session, create anonymous profile
      if (!this.#currentUser) {
        this.#currentUser = await this.#createAnonymousProfile();
      }

      this.emit('auth:changed', this.#currentUser);
      this.#isInitialized = true;
    } catch (err) {
      log('LocalAuthService init error', err);
      // Fallback to anonymous
      this.#currentUser = await this.#createAnonymousProfile();
      this.#isInitialized = true;
    }
  }

  async #createAnonymousProfile(): Promise<UserProfile> {
    const uid = ANONYMOUS_UID;
    const now = Date.now();

    // Check if anonymous profile exists
    let profile = await localforage.getItem<UserProfile>(`${PROFILE_KEY}_${uid}`);
    if (!profile) {
      profile = {
        uid,
        email: 'local@user',
        displayName: 'Local User',
        tier: 'free',
        createdAt: now,
        updatedAt: now,
        preferences: {
          units: 'celsius',
          theme: 'auto',
          notifications: {
            dailyBriefing: true,
            severeWeather: true,
            thresholdAlerts: true,
          },
          mapStyle: 'standard',
          language: 'en',
        },
      };
      await localforage.setItem(`${PROFILE_KEY}_${uid}`, profile);
      // Initialize empty collections
      await localforage.setItem(`${PLACES_KEY}_${uid}`, []);
      await localforage.setItem(`${ALERTS_KEY}_${uid}`, []);
      await localforage.setItem(`${ALERT_EVENTS_KEY}_${uid}`, []);
    }

    // Create session (30 days)
    await localforage.setItem(SESSION_KEY, { uid, expires: now + 30 * 24 * 60 * 60 * 1000 });
    return profile;
  }

  // ────────────────── Public API ──────────────────

  async ready(): Promise<void> {
    if (this.#initPromise) await this.#initPromise;
  }

  get currentUser(): UserProfile | null {
    return this.#currentUser;
  }

  get profile(): UserProfile | null {
    return this.#currentUser;
  }

  get isSignedIn(): boolean {
    return !!this.#currentUser;
  }

  get isPro(): boolean {
    return this.#currentUser?.tier === 'pro' || this.#currentUser?.tier === 'team';
  }

  get isAnonymous(): boolean {
    return this.#currentUser?.uid === ANONYMOUS_UID;
  }

  // Auth methods (local only - no real auth, just profile management)
  async signInWithEmail(email: string, password: string): Promise<{ user: UserProfile }> {
    // In local mode, email/password is just for profile identification
    // No real authentication - this is a local-first app
    const uid = `local_${btoa(email).replace(/[^a-zA-Z0-9]/g, '').slice(0, 16)}`;
    return this.#createOrLoadProfile(uid, email, 'Local User');
  }

  async signUpWithEmail(email: string, password: string, displayName: string): Promise<{ user: UserProfile }> {
    return this.signInWithEmail(email, password);
  }

  async signInWithGoogle(): Promise<{ user: UserProfile }> {
    // Google sign-in not available in local mode
    throw new Error('Google sign-in not available in local mode. Use email sign-in instead.');
  }

  async signOut(): Promise<void> {
    // Sign out = switch to anonymous
    await localforage.removeItem(SESSION_KEY);
    this.#currentUser = await this.#createAnonymousProfile();
    this.emit('auth:changed', this.#currentUser);
    this.emit('auth:signed-out');
  }

  async resetPassword(email: string): Promise<void> {
    // No-op in local mode
    log('Password reset requested for', email, '(no-op in local mode)');
  }

  async updatePreferences(prefs: Partial<UserPreferences>): Promise<void> {
    if (!this.#currentUser) throw new Error('Not signed in');
    const updated = { ...this.#currentUser.preferences, ...prefs };
    this.#currentUser.preferences = updated;
    this.#currentUser.updatedAt = Date.now();
    await this.#saveProfile();
    this.emit('preferences:changed', updated);
  }

  async updateDisplayName(name: string): Promise<void> {
    if (!this.#currentUser) throw new Error('Not signed in');
    this.#currentUser.displayName = name;
    this.#currentUser.updatedAt = Date.now();
    await this.#saveProfile();
  }

  async upgradeTier(tier: 'pro' | 'team'): Promise<void> {
    if (!this.#currentUser) throw new Error('Not signed in');
    this.#currentUser.tier = tier;
    this.#currentUser.updatedAt = Date.now();
    await this.#saveProfile();
  }

  // ────────────────── Places (Bookmarks) ──────────────────

  get places(): SavedPlace[] {
    return this.#currentUser ? [...this.#getPlacesSync()] : [];
  }

  async getPlaces(): Promise<SavedPlace[]> {
    if (!this.#currentUser) return [];
    return this.#getPlacesSync();
  }

  #getPlacesSync(): SavedPlace[] {
    if (!this.#currentUser) return [];
    // This is a synchronous getter for compatibility
    // In practice, use getPlaces() which is async
    return [];
  }

  async addPlace(place: Omit<SavedPlace, 'id' | 'userId' | 'createdAt'>): Promise<string> {
    if (!this.#currentUser) throw new Error('Not signed in');
    if (!this.isPro && (await this.getPlaces()).length >= FREE_LIMITS.places) {
      throw new Error(`Free tier limited to ${FREE_LIMITS.places} places`);
    }

    const places = await this.getPlaces();
    const newPlace: SavedPlace = {
      ...place,
      id: crypto.randomUUID(),
      userId: this.#currentUser.uid,
      createdAt: Date.now(),
    };
    places.push(newPlace);
    places.sort((a, b) => a.order - b.order);
    await localforage.setItem(`${PLACES_KEY}_${this.#currentUser.uid}`, places);
    this.emit('places:changed', [...places]);
    return newPlace.id;
  }

  async updatePlace(id: string, updates: Partial<SavedPlace>): Promise<void> {
    if (!this.#currentUser) throw new Error('Not signed in');
    const places = await this.getPlaces();
    const idx = places.findIndex(p => p.id === id);
    if (idx >= 0) {
      places[idx] = { ...places[idx], ...updates };
      await localforage.setItem(`${PLACES_KEY}_${this.#currentUser.uid}`, places);
      this.emit('places:changed', [...places]);
    }
  }

  async deletePlace(id: string): Promise<void> {
    if (!this.#currentUser) throw new Error('Not signed in');
    const places = await this.getPlaces();
    const filtered = places.filter(p => p.id !== id);
    await localforage.setItem(`${PLACES_KEY}_${this.#currentUser.uid}`, filtered);
    this.emit('places:changed', [...filtered]);
  }

  async reorderPlaces(placeIds: string[]): Promise<void> {
    if (!this.#currentUser) throw new Error('Not signed in');
    const places = await this.getPlaces();
    const placeMap = new Map(places.map(p => [p.id, p]));
    const reordered = placeIds.map((id, i) => {
      const place = placeMap.get(id);
      if (place) return { ...place, order: i };
      return null;
    }).filter(Boolean) as SavedPlace[];
    // Add any places not in the list (shouldn't happen)
    for (const place of places) {
      if (!placeIds.includes(place.id)) {
        reordered.push({ ...place, order: reordered.length });
      }
    }
    await localforage.setItem(`${PLACES_KEY}_${this.#currentUser.uid}`, reordered);
    this.emit('places:changed', [...reordered]);
  }

  // ────────────────── Alert Rules ──────────────────

  get alerts(): AlertRule[] {
    return this.#currentUser ? [...this.#getAlertsSync()] : [];
  }

  async getAlerts(): Promise<AlertRule[]> {
    if (!this.#currentUser) return [];
    const data = await localforage.getItem<AlertRule[]>(`${ALERTS_KEY}_${this.#currentUser.uid}`);
    return data || [];
  }

  #getAlertsSync(): AlertRule[] {
    return [];
  }

  async addAlertRule(rule: Omit<AlertRule, 'id' | 'userId' | 'createdAt'>): Promise<string> {
    if (!this.#currentUser) throw new Error('Not signed in');
    if (!this.isPro && (await this.getAlerts()).length >= FREE_LIMITS.alerts) {
      throw new Error(`Free tier limited to ${FREE_LIMITS.alerts} alerts`);
    }

    const alerts = await this.getAlerts();
    const newRule: AlertRule = {
      ...rule,
      id: crypto.randomUUID(),
      userId: this.#currentUser.uid,
      createdAt: Date.now(),
    };
    alerts.push(newRule);
    await localforage.setItem(`${ALERTS_KEY}_${this.#currentUser.uid}`, alerts);
    this.emit('alerts:changed', [...alerts]);
    return newRule.id;
  }

  async updateAlertRule(id: string, updates: Partial<AlertRule>): Promise<void> {
    if (!this.#currentUser) throw new Error('Not signed in');
    const alerts = await this.getAlerts();
    const idx = alerts.findIndex(a => a.id === id);
    if (idx >= 0) {
      alerts[idx] = { ...alerts[idx], ...updates };
      await localforage.setItem(`${ALERTS_KEY}_${this.#currentUser.uid}`, alerts);
      this.emit('alerts:changed', [...alerts]);
    }
  }

  async deleteAlertRule(id: string): Promise<void> {
    if (!this.#currentUser) throw new Error('Not signed in');
    const alerts = await this.getAlerts();
    const filtered = alerts.filter(a => a.id !== id);
    await localforage.setItem(`${ALERTS_KEY}_${this.#currentUser.uid}`, filtered);
    this.emit('alerts:changed', [...filtered]);
  }

  // ────────────────── Alert Events ──────────────────

  async logAlertEvent(event: Omit<AlertEvent, 'id' | 'createdAt'>): Promise<void> {
    if (!this.#currentUser) throw new Error('Not signed in');
    const events = await this.getAlertEvents();
    const newEvent: AlertEvent = {
      ...event,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    };
    events.unshift(newEvent);
    // Keep only last 100 events
    if (events.length > 100) events.length = 100;
    await localforage.setItem(`${ALERT_EVENTS_KEY}_${this.#currentUser.uid}`, events);
  }

  async getRecentAlertEvents(limitCount = 20): Promise<AlertEvent[]> {
    if (!this.#currentUser) return [];
    const events = await localforage.getItem<AlertEvent[]>(`${ALERT_EVENTS_KEY}_${this.#currentUser.uid}`);
    return (events || []).slice(0, limitCount);
  }

  // ────────────────── Internal ──────────────────

  async #createOrLoadProfile(uid: string, email: string, displayName: string): Promise<{ user: UserProfile }> {
    const now = Date.now();
    let profile = await localforage.getItem<UserProfile>(`${PROFILE_KEY}_${uid}`);

    if (!profile) {
      profile = {
        uid,
        email,
        displayName,
        tier: 'free',
        createdAt: now,
        updatedAt: now,
        preferences: {
          units: 'celsius',
          theme: 'auto',
          notifications: {
            dailyBriefing: true,
            severeWeather: true,
            thresholdAlerts: true,
          },
          mapStyle: 'standard',
          language: 'en',
        },
      };
      await localforage.setItem(`${PROFILE_KEY}_${uid}`, profile);
      await localforage.setItem(`${PLACES_KEY}_${uid}`, []);
      await localforage.setItem(`${ALERTS_KEY}_${uid}`, []);
      await localforage.setItem(`${ALERT_EVENTS_KEY}_${uid}`, []);
    }

    await localforage.setItem(SESSION_KEY, { uid, expires: now + 30 * 24 * 60 * 60 * 1000 });
    this.#currentUser = profile;
    this.emit('auth:ready', profile);
    this.emit('auth:changed', profile);
    return { user: profile };
  }

  async #saveProfile(): Promise<void> {
    if (!this.#currentUser) return;
    await localforage.setItem(`${PROFILE_KEY}_${this.#currentUser.uid}`, this.#currentUser);
  }

  // Static compatibility methods
  static onAuthStateChanged(callback: (user: UserProfile | null) => void): () => void {
    // This is a simplified version - in practice, use the instance
    const instance = localAuthService;
    instance.on('auth:changed', callback);
    // Call immediately with current user
    callback(instance.currentUser);
    return () => instance.off('auth:changed', callback);
  }
}

export const localAuthService = new LocalAuthService();
export default localAuthService;