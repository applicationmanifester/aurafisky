// src/services/HistoryService.ts
// Local-first history service using IndexedDB via localforage

import localforage from 'localforage';
import { localAuthService } from './LocalAuthService.ts';
import { localSyncService } from './LocalSyncService.ts';
import { log } from '../utils/logger.ts';

interface HistoryEntry {
  id: string;
  date: string; // YYYY-MM-DD
  lat: number;
  lon: number;
  locationKey: string;
  data: any;
  createdAt: number;
}

let history: HistoryEntry[] = [];
let listeners = new Set<(history: HistoryEntry[]) => void>();

async function getStorageKey(): Promise<string> {
  const user = localAuthService.currentUser;
  if (!user) throw new Error('Not authenticated');
  return `history_${user.uid}`;
}

function notifyListeners() {
  for (const fn of listeners) fn([...history]);
}

export const historyService = {
  async initialize(): Promise<void> {
    await localAuthService.ready();
    await this.loadLocal();
    
    localAuthService.on('auth:changed', async () => {
      await this.loadLocal();
    });
  },

  async loadLocal(): Promise<void> {
    try {
      const key = await getStorageKey();
      const data = await localforage.getItem<HistoryEntry[]>(key);
      history = data || [];
      notifyListeners();
    } catch (err) {
      log('Failed to load history', err);
      history = [];
      notifyListeners();
    }
  },

  async saveLocal(): Promise<void> {
    try {
      const key = await getStorageKey();
      // Keep only last 100 entries
      const toSave = history.slice(0, 100);
      await localforage.setItem(key, toSave);
    } catch (err) {
      log('Failed to save history', err);
    }
  },

  subscribe(callback: (history: HistoryEntry[]) => void) {
    listeners.add(callback);
    callback([...history]);
    return () => listeners.delete(callback);
  },

  getAll(): HistoryEntry[] {
    return [...history];
  },

  async triggerSnapshot(lat: number, lon: number, locationKey: string, data: any = {}) {
    const date = new Date().toISOString().split('T')[0];
    const entry: HistoryEntry = {
      id: crypto.randomUUID(),
      date,
      lat,
      lon,
      locationKey,
      data,
      createdAt: Date.now(),
    };
    
    // Add to beginning of array
    history.unshift(entry);
    await this.saveLocal();
    notifyListeners();
  },

  async clearHistory(): Promise<void> {
    history = [];
    await this.saveLocal();
    notifyListeners();
  },

  destroy() {
    listeners.clear();
    history = [];
  },
};

export default historyService;