// src/services/LocalSyncService.ts
// Local-first sync service using IndexedDB — replaces Firebase SyncService.
// Provides the same API surface for bookmarks, alerts, preferences, etc.

import localforage from 'localforage';
import { localAuthService } from './LocalAuthService.ts';
import { log } from '../utils/logger.ts';
import { SYNC_STATUS } from '../config/constants.ts';

export type SyncStatus = typeof SYNC_STATUS[keyof typeof SYNC_STATUS];

interface QueuedWrite {
  op: 'set' | 'update' | 'delete';
  path: string;
  data?: any;
  merge?: boolean;
  timestamp: number;
  resolve: (value: any) => void;
  reject: (reason: any) => void;
}

export class LocalSyncService {
  #status: SyncStatus = SYNC_STATUS.OFFLINE;
  #statusListeners = new Set<(status: SyncStatus) => void>();
  #pendingWrites: QueuedWrite[] = [];
  #isOnline = navigator.onLine;
  #flushTimer: ReturnType<typeof setTimeout> | null = null;
  #subscriptions = new Map<string, Set<(items: any[]) => void>>();
  #docSubscriptions = new Map<string, Set<(item: any) => void>>();

  constructor() {
    this.#setupNetworkListeners();
    localAuthService.on('auth:changed', (user) => this.#onAuthChange(user));
    // Initialize with current auth state
    this.#onAuthChange(localAuthService.currentUser);
  }

  #setupNetworkListeners() {
    window.addEventListener('online', () => {
      this.#isOnline = true;
      this.#scheduleFlush();
      this.#updateStatus(SYNC_STATUS.SYNCING);
      // Re-fetch subscribed data when coming online
      this.#refreshAllSubscriptions();
    });
    window.addEventListener('offline', () => {
      this.#isOnline = false;
      this.#updateStatus(SYNC_STATUS.OFFLINE);
    });
  }

  #onAuthChange(user: any) {
    // Clear pending writes on auth change
    this.#pendingWrites.forEach(w => w.reject(new Error('Auth changed')));
    this.#pendingWrites = [];

    // Update status based on auth state
    if (user) {
      this.#updateStatus(this.#isOnline ? SYNC_STATUS.SYNCED : SYNC_STATUS.OFFLINE);
    } else {
      this.#updateStatus(SYNC_STATUS.OFFLINE);
    }

    // Refresh all subscriptions with new user's data
    this.#refreshAllSubscriptions();
  }

  #updateStatus(status: SyncStatus) {
    if (this.#status !== status) {
      this.#status = status;
      for (const fn of this.#statusListeners) fn(status);
    }
  }

  onStatusChange(callback: (status: SyncStatus) => void) {
    this.#statusListeners.add(callback);
    callback(this.#status);
    return () => this.#statusListeners.delete(callback);
  }

  get status(): SyncStatus { return this.#status; }
  get isOnline(): boolean { return this.#isOnline; }
  get isAuthenticated(): boolean { return !!localAuthService.currentUser && !localAuthService.isAnonymous; }

  // ────────────────── Generic CRUD ──────────────────

  #getStoreKey(path: string): string {
    const user = localAuthService.currentUser;
    if (!user) throw new Error('Not authenticated');
    return `${path}_${user.uid}`;
  }

  async get(path: string): Promise<any> {
    if (!localAuthService.currentUser) return null;
    try {
      const data = await localforage.getItem(this.#getStoreKey(path));
      return data;
    } catch (err) { log(`LocalSync get error: ${path}`, err); return null; }
  }

  async getAll(path: string, _constraints: any[] = []): Promise<any[]> {
    if (!localAuthService.currentUser) return [];
    try {
      const data = await localforage.getItem(this.#getStoreKey(path));
      return Array.isArray(data) ? data : [];
    } catch (err) { log(`LocalSync getAll error: ${path}`, err); return []; }
  }

  async set(path: string, data: any, merge = true): Promise<void> {
    if (!localAuthService.currentUser) throw new Error('Not authenticated');
    const key = this.#getStoreKey(path);
    let payload: any;
    try {
      let existing: any = null;
      if (merge) {
        existing = await localforage.getItem(key);
      }
      payload = merge && existing && typeof existing === 'object' && typeof data === 'object'
        ? { ...existing, ...data, updatedAt: Date.now() }
        : { ...data, updatedAt: Date.now() };

      await localforage.setItem(key, payload);
      this.#notifySubscribers(path, Array.isArray(payload) ? payload : [payload]);
      this.#notifyDocSubscribers(path, payload);
      this.#updateStatus(SYNC_STATUS.SYNCED);
    } catch (err) {
      if (this.#isOnline) throw err;
      await this.#queueWrite('set', path, { data: payload ?? data, merge });
      this.#updateStatus(SYNC_STATUS.OFFLINE);
    }
  }

  async update(path: string, data: any): Promise<void> {
    await this.set(path, data, true);
  }

  async delete(path: string): Promise<void> {
    if (!localAuthService.currentUser) throw new Error('Not authenticated');
    const key = this.#getStoreKey(path);
    try {
      await localforage.removeItem(key);
      this.#notifySubscribers(path, []);
      this.#notifyDocSubscribers(path, null);
      this.#updateStatus(SYNC_STATUS.SYNCED);
    } catch (err) {
      if (this.#isOnline) throw err;
      await this.#queueWrite('delete', path, {});
      this.#updateStatus(SYNC_STATUS.OFFLINE);
    }
  }

  // ────────────────── Subscriptions ──────────────────

  subscribe(path: string, callback: (items: any[]) => void, _constraints: any[] = []) {
    if (!localAuthService.currentUser) { callback([]); return () => {}; }
    
    const key = this.#getStoreKey(path);
    if (!this.#subscriptions.has(key)) {
      this.#subscriptions.set(key, new Set());
    }
    this.#subscriptions.get(key)!.add(callback);

    // Initial load
    this.getAll(path).then(items => callback(items));

    return () => {
      this.#subscriptions.get(key)?.delete(callback);
      if (this.#subscriptions.get(key)?.size === 0) {
        this.#subscriptions.delete(key);
      }
    };
  }

  subscribeDoc(path: string, callback: (item: any) => void) {
    if (!localAuthService.currentUser) { callback(null); return () => {}; }
    
    const key = this.#getStoreKey(path);
    if (!this.#docSubscriptions.has(key)) {
      this.#docSubscriptions.set(key, new Set());
    }
    this.#docSubscriptions.get(key)!.add(callback);

    // Initial load
    this.get(path).then(item => callback(item));

    return () => {
      this.#docSubscriptions.get(key)?.delete(callback);
      if (this.#docSubscriptions.get(key)?.size === 0) {
        this.#docSubscriptions.delete(key);
      }
    };
  }

  #notifySubscribers(path: string, items: any[]) {
    const key = this.#getStoreKey(path);
    this.#subscriptions.get(key)?.forEach(cb => cb(items));
  }

  #notifyDocSubscribers(path: string, item: any) {
    const key = this.#getStoreKey(path);
    this.#docSubscriptions.get(key)?.forEach(cb => cb(item));
  }

  async #refreshAllSubscriptions() {
    for (const [key, callbacks] of this.#subscriptions.entries()) {
      const path = key.replace(`_${localAuthService.currentUser?.uid}`, '');
      const items = await this.getAll(path);
      callbacks.forEach(cb => cb(items));
    }
    for (const [key, callbacks] of this.#docSubscriptions.entries()) {
      const path = key.replace(`_${localAuthService.currentUser?.uid}`, '');
      const item = await this.get(path);
      callbacks.forEach(cb => cb(item));
    }
  }

  // ────────────────── Batch Operations ──────────────────

  async batch(operations: { op: string; path: string; data?: any; merge?: boolean }[]): Promise<void> {
    if (!localAuthService.currentUser) throw new Error('Not authenticated');
    
    // Execute sequentially for simplicity (IndexedDB is fast enough)
    for (const { op, path, data, merge } of operations) {
      if (op === 'set') await this.set(path, data, merge);
      else if (op === 'update') await this.update(path, data);
      else if (op === 'delete') await this.delete(path);
    }
    this.#updateStatus(SYNC_STATUS.SYNCED);
  }

  // ────────────────── Offline Queue ──────────────────

  #queueWrite(op: 'set' | 'update' | 'delete', path: string, meta: any): Promise<void> {
    return new Promise((resolve, reject) => {
      this.#pendingWrites.push({ op, path, ...meta, timestamp: Date.now(), resolve, reject });
      this.#scheduleFlush();
    });
  }

  #scheduleFlush() {
    if (this.#flushTimer) clearTimeout(this.#flushTimer);
    this.#flushTimer = setTimeout(() => this.#flushPendingWrites(), 1000);
  }

  async #flushPendingWrites() {
    if (!this.#isOnline || !localAuthService.currentUser || this.#pendingWrites.length === 0) return;
    this.#updateStatus(SYNC_STATUS.SYNCING);

    const writes = [...this.#pendingWrites];
    for (const w of writes) {
      try {
        await this.batch([{ op: w.op, path: w.path, data: w.data, merge: w.merge }]);
        w.resolve(true);
        const idx = this.#pendingWrites.indexOf(w);
        if (idx >= 0) this.#pendingWrites.splice(idx, 1);
      } catch (err) {
        log('Failed to flush pending write', err);
        w.reject(err);
        this.#updateStatus(SYNC_STATUS.OFFLINE);
        break;
      }
    }
  }

  // ────────────────── Convenience Accessors ──────────────────

  get bookmarks() {
    return {
      getAll: () => this.getAll('bookmarks'),
      subscribe: (cb: (items: any[]) => void) => this.subscribe('bookmarks', cb),
      add: (data: any) => this.set(`bookmarks/${data.id || crypto.randomUUID()}`, { ...data, createdAt: Date.now() }),
      update: (id: string, data: any) => this.update(`bookmarks/${id}`, data),
      remove: (id: string) => this.delete(`bookmarks/${id}`),
    };
  }

  get alerts() {
    return {
      getAll: () => this.getAll('alerts'),
      subscribe: (cb: (items: any[]) => void) => this.subscribe('alerts', cb),
      add: (data: any) => this.set(`alerts/${data.id || crypto.randomUUID()}`, { ...data, createdAt: Date.now() }),
      update: (id: string, data: any) => this.update(`alerts/${id}`, data),
      remove: (id: string) => this.delete(`alerts/${id}`),
    };
  }

  get preferences() {
    return {
      get: () => this.get('preferences'),
      subscribe: (cb: (item: any) => void) => this.subscribeDoc('preferences', cb),
      update: (data: any) => this.set('preferences', data),
    };
  }

  get entitlements() {
    return {
      get: () => this.get('entitlements'),
      subscribe: (cb: (item: any) => void) => this.subscribeDoc('entitlements', cb),
      update: (data: any) => this.set('entitlements', data),
    };
  }

  // Export/Import for backup
  async exportAllData(): Promise<string> {
    if (!localAuthService.currentUser) throw new Error('Not authenticated');
    const uid = localAuthService.currentUser.uid;
    const data: Record<string, any> = {};
    const keys = ['profile', 'places', 'alerts', 'alertEvents', 'preferences', 'entitlements', 'bookmarks'];
    for (const key of keys) {
      data[key] = await localforage.getItem(`${key}_${uid}`);
    }
    return JSON.stringify({ version: 1, exportedAt: Date.now(), uid, data }, null, 2);
  }

  async importAllData(jsonString: string): Promise<void> {
    if (!localAuthService.currentUser) throw new Error('Not authenticated');
    const parsed = JSON.parse(jsonString);
    const uid = localAuthService.currentUser.uid;
    for (const [key, value] of Object.entries(parsed.data || {})) {
      await localforage.setItem(`${key}_${uid}`, value);
    }
    this.#refreshAllSubscriptions();
  }
}

export const localSyncService = new LocalSyncService();
export default localSyncService;