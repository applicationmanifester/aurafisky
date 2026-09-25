// src/services/AuthService.ts
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  collection,
  query,
  where,
  orderBy,
  addDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { FIREBASE_CONFIG } from '../config/constants.ts';
import { log } from '../utils/logger.ts';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  tier: 'free' | 'pro' | 'team';
  createdAt: Timestamp;
  updatedAt: Timestamp;
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
}

export interface SavedPlace {
  id: string;
  userId: string;
  name: string;
  lat: number;
  lon: number;
  label?: string;
  order: number;
  createdAt: Timestamp;
}

export interface AlertRule {
  id: string;
  userId: string;
  placeId: string;
  type: 'temperature' | 'precipitation' | 'wind' | 'aqi' | 'weathercode';
  condition: 'above' | 'below' | 'equals';
  value: number;
  enabled: boolean;
  createdAt: Timestamp;
}

export interface AlertEvent {
  id: string;
  userId: string;
  ruleId: string;
  placeId: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  acknowledged: boolean;
  createdAt: Timestamp;
}

// Simple EventEmitter implementation for browser compatibility
class EventEmitter {
  #events = new Map<string, Set<Function>>();

  on(event: string, listener: Function) {
    if (!this.#events.has(event)) this.#events.set(event, new Set());
    this.#events.get(event)!.add(listener);
    return this;
  }

  off(event: string, listener: Function) {
    this.#events.get(event)?.delete(listener);
    return this;
  }

  emit(event: string, ...args: any[]) {
    this.#events.get(event)?.forEach(listener => listener(...args));
    return this;
  }

  once(event: string, listener: Function) {
    const onceWrapper = (...args: any[]) => {
      listener(...args);
      this.off(event, onceWrapper);
    };
    this.on(event, onceWrapper);
    return this;
  }
}

const app = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

class AuthService extends EventEmitter {
  #currentUser: User | null = null;
  #profile: UserProfile | null = null;
  #unsubscribeProfile: (() => void) | null = null;
  #unsubscribePlaces: (() => void) | null = null;
  #unsubscribeAlerts: (() => void) | null = null;
  #places: SavedPlace[] = [];
  #alerts: AlertRule[] = [];

  constructor() {
    super();
    this.#initAuthListener();
  }

  #initAuthListener() {
    onAuthStateChanged(auth, async (user) => {
      this.#currentUser = user;
      if (user) {
        await this.#loadProfile(user.uid);
        this.#subscribeToPlaces(user.uid);
        this.#subscribeToAlerts(user.uid);
        this.emit('auth:ready', user);
      } else {
        this.#cleanup();
        this.emit('auth:signed-out');
      }
      this.emit('auth:changed', user);
    });
  }

  async #loadProfile(uid: string) {
    const ref = doc(db, 'users', uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      this.#profile = snap.data() as UserProfile;
    } else {
      this.#profile = await this.#createDefaultProfile(uid);
    }
    this.emit('profile:loaded', this.#profile);
  }

  async #createDefaultProfile(uid: string): Promise<UserProfile> {
    const user = auth.currentUser;
    const profile: UserProfile = {
      uid,
      email: user?.email || '',
      displayName: user?.displayName || 'User',
      photoURL: user?.photoURL || undefined,
      tier: 'free',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      preferences: {
        units: 'celsius',
        theme: 'auto',
        notifications: {
          dailyBriefing: true,
          severeWeather: true,
          thresholdAlerts: true,
        },
        mapStyle: 'standard',
      },
    };
    await setDoc(doc(db, 'users', uid), profile);
    return profile;
  }

  #subscribeToPlaces(uid: string) {
    const q = query(
      collection(db, 'places'),
      where('userId', '==', uid),
      orderBy('order', 'asc')
    );
    this.#unsubscribePlaces = onSnapshot(q, (snap) => {
      this.#places = snap.docs.map(d => ({ id: d.id, ...d.data() } as SavedPlace));
      this.emit('places:changed', this.#places);
    });
  }

  #subscribeToAlerts(uid: string) {
    const q = query(
      collection(db, 'alerts'),
      where('userId', '==', uid),
      where('enabled', '==', true)
    );
    this.#unsubscribeAlerts = onSnapshot(q, (snap) => {
      this.#alerts = snap.docs.map(d => ({ id: d.id, ...d.data() } as AlertRule));
      this.emit('alerts:changed', this.#alerts);
    });
  }

  #cleanup() {
    this.#unsubscribeProfile?.();
    this.#unsubscribePlaces?.();
    this.#unsubscribeAlerts?.();
    this.#profile = null;
    this.#places = [];
    this.#alerts = [];
  }

  async signInWithEmail(email: string, password: string) {
    return signInWithEmailAndPassword(auth, email, password);
  }

  async signUpWithEmail(email: string, password: string, displayName: string) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName });
    return cred;
  }

  async signInWithGoogle() {
    return signInWithPopup(auth, googleProvider);
  }

  async signOut() {
    return signOut(auth);
  }

  async resetPassword(email: string) {
    return sendPasswordResetEmail(auth, email);
  }

  get currentUser() { return this.#currentUser; }
  get profile() { return this.#profile; }
  get isSignedIn() { return !!this.#currentUser; }
  get isPro() { return this.#profile?.tier === 'pro' || this.#profile?.tier === 'team'; }

  async updatePreferences(prefs: Partial<UserPreferences>) {
    if (!this.#currentUser) throw new Error('Not signed in');
    const ref = doc(db, 'users', this.#currentUser.uid);
    const updated = { ...this.#profile!.preferences, ...prefs };
    await updateDoc(ref, { preferences: updated, updatedAt: serverTimestamp() });
    this.#profile!.preferences = updated;
    this.emit('preferences:changed', updated);
  }

  async updateDisplayName(name: string) {
    if (!this.#currentUser) throw new Error('Not signed in');
    await updateProfile(this.#currentUser, { displayName: name });
    await updateDoc(doc(db, 'users', this.#currentUser.uid), { displayName: name, updatedAt: serverTimestamp() });
    this.#profile!.displayName = name;
  }

  get places() { return [...this.#places]; }

  async addPlace(place: Omit<SavedPlace, 'id' | 'userId' | 'createdAt'>) {
    if (!this.#currentUser) throw new Error('Not signed in');
    if (!this.isPro && this.#places.length >= 3) throw new Error('Free tier limited to 3 places');
    const ref = await addDoc(collection(db, 'places'), {
      ...place,
      userId: this.#currentUser.uid,
      createdAt: serverTimestamp(),
    });
    return ref.id;
  }

  async updatePlace(id: string, updates: Partial<SavedPlace>) {
    if (!this.#currentUser) throw new Error('Not signed in');
    await updateDoc(doc(db, 'places', id), updates);
  }

  async deletePlace(id: string) {
    if (!this.#currentUser) throw new Error('Not signed in');
    await updateDoc(doc(db, 'places', id), { deleted: true });
  }

  async reorderPlaces(placeIds: string[]) {
    if (!this.#currentUser) throw new Error('Not signed in');
    const batch = placeIds.map((id, i) => updateDoc(doc(db, 'places', id), { order: i }));
    await Promise.all(batch);
  }

  get alerts() { return [...this.#alerts]; }

  async addAlertRule(rule: Omit<AlertRule, 'id' | 'userId' | 'createdAt'>) {
    if (!this.#currentUser) throw new Error('Not signed in');
    if (!this.isPro && this.#alerts.length >= 3) throw new Error('Free tier limited to 3 alerts');
    const ref = await addDoc(collection(db, 'alerts'), {
      ...rule,
      userId: this.#currentUser.uid,
      createdAt: serverTimestamp(),
    });
    return ref.id;
  }

  async updateAlertRule(id: string, updates: Partial<AlertRule>) {
    if (!this.#currentUser) throw new Error('Not signed in');
    await updateDoc(doc(db, 'alerts', id), updates);
  }

  async deleteAlertRule(id: string) {
    if (!this.#currentUser) throw new Error('Not signed in');
    await updateDoc(doc(db, 'alerts', id), { enabled: false });
  }

  async logAlertEvent(event: Omit<AlertEvent, 'id' | 'createdAt'>) {
    if (!this.#currentUser) throw new Error('Not signed in');
    await addDoc(collection(db, 'alertEvents'), {
      ...event,
      userId: this.#currentUser.uid,
      createdAt: serverTimestamp(),
    });
  }

  async getRecentAlertEvents(limitCount = 20): Promise<AlertEvent[]> {
    if (!this.#currentUser) return [];
    const q = query(
      collection(db, 'alertEvents'),
      where('userId', '==', this.#currentUser.uid),
      orderBy('createdAt', 'desc'),
    );
    const snap = await getDoc(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as AlertEvent));
  }

  static onAuthStateChanged(callback: (user: User | null) => void) {
    return onAuthStateChanged(auth, callback);
  }

  static isAnonymous(): boolean {
    return auth.currentUser?.isAnonymous ?? false;
  }
}

export const authService = new AuthService();
export default authService;