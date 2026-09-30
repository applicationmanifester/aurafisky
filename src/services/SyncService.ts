// src/services/SyncService.ts
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  onSnapshot, query, where, orderBy, writeBatch, serverTimestamp, Timestamp,
  QueryConstraint
} from 'firebase/firestore';
import { db } from './FirebaseCore.ts';
import { authService as AuthService } from './AuthService.ts';
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

export class SyncService {
  #status: SyncStatus = SYNC_STATUS.OFFLINE;
  #statusListeners = new Set<(status: SyncStatus) => void>();
  #unsubscribes = new Map<string, () => void>();
  #pendingWrites: QueuedWrite[] = [];
  #isOnline = navigator.onLine;
  #userId: string | null = null;
  #flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.#setupNetworkListeners();
    AuthService.onAuthStateChanged((user: any) => this.#onAuthChange(user));
  }

  #setupNetworkListeners() {
    window.addEventListener('online', () => {
      this.#isOnline = true;
      this.#scheduleFlush();
      this.#updateStatus(SYNC_STATUS.SYNCING);
    });
    window.addEventListener('offline', () => {
      this.#isOnline = false;
      this.#updateStatus(SYNC_STATUS.OFFLINE);
    });
  }

  #onAuthChange(user: any) {
    for (const unsub of this.#unsubscribes.values()) unsub();
    this.#unsubscribes.clear();
    this.#pendingWrites = [];

    this.#userId = user?.uid ?? null;
    if (!this.#userId) {
      this.#updateStatus(SYNC_STATUS.OFFLINE);
      return;
    }
    this.#updateStatus(this.#isOnline ? SYNC_STATUS.SYNCING : SYNC_STATUS.OFFLINE);
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
  get userId(): string | null { return this.#userId; }
  get isAuthenticated(): boolean { return !!this.#userId && !AuthService.isAnonymous(); }

  #userDoc(path: string) {
    if (!this.#userId) throw new Error('Not authenticated');
    return doc(db, 'users', this.#userId, ...path.split('/'));
  }

  #userCollection(path: string) {
    if (!this.#userId) throw new Error('Not authenticated');
    return collection(db, 'users', this.#userId, ...path.split('/'));
  }

  async get(path: string) {
    if (!this.#userId) return null;
    try {
      const snap = await getDoc(this.#userDoc(path));
      return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    } catch (err) { log(`Sync get error: ${path}`, err); return null; }
  }

  async getAll(path: string, constraints: any[] = []) {
    if (!this.#userId) return [];
    try {
      const q = query(this.#userCollection(path), ...constraints);
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (err) { log(`Sync getAll error: ${path}`, err); return []; }
  }

  async set(path: string, data: any, merge = true) {
    if (!this.#userId) throw new Error('Not authenticated');
    const ref = this.#userDoc(path);
    const payload = { ...data, updatedAt: serverTimestamp() };
    try {
      await setDoc(ref, payload, { merge });
      this.#updateStatus(SYNC_STATUS.SYNCED);
    } catch (err) {
      if (this.#isOnline) throw err;
      await this.#queueWrite('set', path, { data: payload, merge });
      this.#updateStatus(SYNC_STATUS.OFFLINE);
    }
  }

  async update(path: string, data: any) {
    if (!this.#userId) throw new Error('Not authenticated');
    const ref = this.#userDoc(path);
    const payload = { ...data, updatedAt: serverTimestamp() };
    try {
      await updateDoc(ref, payload);
      this.#updateStatus(SYNC_STATUS.SYNCED);
    } catch (err) {
      if (this.#isOnline) throw err;
      await this.#queueWrite('update', path, { data: payload });
      this.#updateStatus(SYNC_STATUS.OFFLINE);
    }
  }

  async delete(path: string) {
    if (!this.#userId) throw new Error('Not authenticated');
    const ref = this.#userDoc(path);
    try {
      await deleteDoc(ref);
      this.#updateStatus(SYNC_STATUS.SYNCED);
    } catch (err) {
      if (this.#isOnline) throw err;
      await this.#queueWrite('delete', path, {});
      this.#updateStatus(SYNC_STATUS.OFFLINE);
    }
  }

  subscribe(path: string, callback: (items: any[]) => void, constraints: any[] = []) {
    if (!this.#userId) { callback([]); return () => {}; }
    const q = query(this.#userCollection(path), ...constraints);
    const unsub = onSnapshot(q,
      (snap) => { callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))); this.#updateStatus(SYNC_STATUS.SYNCED); },
      (err) => { log(`Sync subscribe error: ${path}`, err); this.#updateStatus(SYNC_STATUS.ERROR); }
    );
    this.#unsubscribes.set(path, unsub);
    return () => { unsub(); this.#unsubscribes.delete(path); };
  }

  subscribeDoc(path: string, callback: (item: any) => void) {
    if (!this.#userId) { callback(null); return () => {}; }
    const ref = this.#userDoc(path);
    const unsub = onSnapshot(ref,
      (snap) => callback(snap.exists() ? { id: snap.id, ...snap.data() } : null),
      (err) => { log(`Sync subscribeDoc error: ${path}`, err); this.#updateStatus(SYNC_STATUS.ERROR); }
    );
    this.#unsubscribes.set(path, unsub);
    return () => { unsub(); this.#unsubscribes.delete(path); };
  }

  async batch(operations: { op: string; path: string; data?: any; merge?: boolean }[]) {
    if (!this.#userId) throw new Error('Not authenticated');
    const batch = writeBatch(db);
    for (const { op, path, data, merge } of operations) {
      const ref = this.#userDoc(path);
      if (op === 'set') batch.set(ref, { ...data, updatedAt: serverTimestamp() }, { merge });
      else if (op === 'update') batch.update(ref, { ...data, updatedAt: serverTimestamp() });
      else if (op === 'delete') batch.delete(ref);
    }
    try {
      await batch.commit();
      this.#updateStatus(SYNC_STATUS.SYNCED);
    } catch (err) {
      if (this.#isOnline) throw err;
      for (const op of operations) await this.#queueWrite(op.op as 'set' | 'update' | 'delete', op.path, { data: op.data, merge: op.merge });
      this.#updateStatus(SYNC_STATUS.OFFLINE);
    }
  }

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
    if (!this.#isOnline || !this.#userId || this.#pendingWrites.length === 0) return;
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

  get bookmarks() {
    return {
      getAll: () => this.getAll('bookmarks', [orderBy('createdAt', 'desc')]),
      subscribe: (cb: (items: any[]) => void) => this.subscribe('bookmarks', cb, [orderBy('createdAt', 'desc')]),
      add: (data: any) => this.set(`bookmarks/${data.id || crypto.randomUUID()}`, { ...data, createdAt: serverTimestamp() }),
      update: (id: string, data: any) => this.update(`bookmarks/${id}`, data),
      remove: (id: string) => this.delete(`bookmarks/${id}`),
    };
  }

  get alerts() {
    return {
      getAll: () => this.getAll('alerts', [orderBy('createdAt', 'desc')]),
      subscribe: (cb: (items: any[]) => void) => this.subscribe('alerts', cb, [orderBy('createdAt', 'desc')]),
      add: (data: any) => this.set(`alerts/${data.id || crypto.randomUUID()}`, { ...data, createdAt: serverTimestamp() }),
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

  get history() {
    return {
      getAll: () => this.getAll('history', [orderBy('date', 'desc')]),
      subscribe: (cb: (items: any[]) => void, startDate?: Date, endDate?: Date) => {
        const constraints: QueryConstraint[] = [orderBy('date', 'desc')];
        if (startDate) constraints.unshift(where('date', '>=', startDate.toISOString().split('T')[0]));
        if (endDate) constraints.unshift(where('date', '<=', endDate.toISOString().split('T')[0]));
        return this.subscribe('history', cb, constraints);
      },
      add: (data: any) => this.set(`history/${data.date}-${data.locationKey}`, { ...data, createdAt: serverTimestamp() }),
    };
  }
}

export const syncService = new SyncService();
export default syncService;