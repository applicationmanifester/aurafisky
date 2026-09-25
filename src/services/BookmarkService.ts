// src/services/BookmarkService.ts
// Local-first bookmark service using IndexedDB via localforage

import localforage from 'localforage';
import DOMPurify from 'dompurify';
import { localAuthService } from './LocalAuthService.ts';
import { log } from '../utils/logger.ts';

export interface Bookmark {
  id: string;
  name: string;
  lat: number;
  lon: number;
  createdAt: number;
  updatedAt: number;
  userId?: string;
  tags?: string[];
  color?: string;
}

export interface BookmarkInput {
  name: string;
  lat: number;
  lon: number;
  tags?: string[];
  color?: string;
}

const MAX_BOOKMARKS = 500;
const MAX_NAME_LENGTH = 100;

class BookmarkService {
  private localBookmarks: Bookmark[] = [];
  private listeners: Set<(bookmarks: Bookmark[]) => void> = new Set();
  private initialized = false;

  constructor() {
    // Listen for auth changes to reload bookmarks
    localAuthService.on('auth:changed', () => this.loadLocalBookmarks());
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await localAuthService.ready();
    this.loadLocalBookmarks();
    this.initialized = true;
  }

  private getStorageKey(): string {
    const user = localAuthService.currentUser;
    if (!user) throw new Error('Not authenticated');
    return `bookmarks_${user.uid}`;
  }

  private loadLocalBookmarks(): void {
    try {
      const key = this.getStorageKey();
      localforage.getItem<Bookmark[]>(key).then((data) => {
        if (data) {
          this.localBookmarks = data.map((b: Partial<Bookmark>, i: number) => ({
            id: b.id || `legacy-${i}-${Date.now()}`,
            name: b.name || 'Unnamed',
            lat: typeof b.lat === 'number' ? b.lat : 0,
            lon: typeof b.lon === 'number' ? b.lon : 0,
            createdAt: b.createdAt || Date.now(),
            updatedAt: b.updatedAt || Date.now(),
            tags: Array.isArray(b.tags) ? b.tags : [],
            color: b.color,
          })).filter(b => b.lat !== 0 || b.lon !== 0);
        } else {
          this.localBookmarks = [];
        }
        this.notifyListeners();
      }).catch((err) => {
        log('Failed to load bookmarks', err);
        this.localBookmarks = [];
        this.notifyListeners();
      });
    } catch (error) {
      log('Failed to load bookmarks', error);
      this.localBookmarks = [];
      this.notifyListeners();
    }
  }

  private async saveLocalBookmarks(): Promise<void> {
    try {
      const key = this.getStorageKey();
      await localforage.setItem(key, this.localBookmarks);
      this.notifyListeners();
    } catch (error) {
      log('Failed to save bookmarks', error);
    }
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  sanitizeName(name: string): string {
    const sanitized = DOMPurify.sanitize(name, { 
      ALLOWED_TAGS: [], 
      ALLOWED_ATTR: [] 
    }).trim();
    return sanitized.slice(0, MAX_NAME_LENGTH);
  }

  private validateInput(input: BookmarkInput): { valid: boolean; error?: string } {
    if (!input.name || !input.name.trim()) {
      return { valid: false, error: 'Name is required' };
    }
    if (typeof input.lat !== 'number' || typeof input.lon !== 'number') {
      return { valid: false, error: 'Invalid coordinates' };
    }
    if (input.lat < -90 || input.lat > 90 || input.lon < -180 || input.lon > 180) {
      return { valid: false, error: 'Coordinates out of range' };
    }
    if (input.tags && (!Array.isArray(input.tags) || input.tags.length > 10)) {
      return { valid: false, error: 'Too many tags (max 10)' };
    }
    if (input.color && !/^#[0-9A-Fa-f]{6}$/.test(input.color)) {
      return { valid: false, error: 'Invalid color format' };
    }
    return { valid: true };
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener([...this.localBookmarks]);
      } catch (error) {
        log('Bookmark listener error', error);
      }
    }
  }

  // ─── Public API ────────────────────────────────────────────────

  subscribe(listener: (bookmarks: Bookmark[]) => void): () => void {
    this.listeners.add(listener);
    listener([...this.localBookmarks]); // Immediate initial call
    return () => this.listeners.delete(listener);
  }

  getAll(): Bookmark[] {
    return [...this.localBookmarks];
  }

  getById(id: string): Bookmark | undefined {
    return this.localBookmarks.find(b => b.id === id);
  }

  getCount(): number {
    return this.localBookmarks.length;
  }

  async addBookmark(input: BookmarkInput): Promise<Bookmark> {
    const validation = this.validateInput(input);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const sanitizedName = this.sanitizeName(input.name);
    const now = Date.now();

    const bookmark: Bookmark = {
      id: this.generateId(),
      name: sanitizedName,
      lat: input.lat,
      lon: input.lon,
      createdAt: now,
      updatedAt: now,
      tags: input.tags || [],
      color: input.color,
      userId: localAuthService.currentUser?.uid,
    };

    // Check limit
    if (this.localBookmarks.length >= MAX_BOOKMARKS) {
      throw new Error(`Maximum ${MAX_BOOKMARKS} bookmarks reached`);
    }

    this.localBookmarks.unshift(bookmark);
    await this.saveLocalBookmarks();
    return bookmark;
  }

  async updateBookmark(id: string, updates: Partial<BookmarkInput>): Promise<Bookmark | null> {
    const idx = this.localBookmarks.findIndex(b => b.id === id);
    if (idx === -1) return null;

    if (updates.name !== undefined) {
      updates.name = this.sanitizeName(updates.name);
    }

    const validation = this.validateInput({
      name: updates.name ?? this.localBookmarks[idx].name,
      lat: updates.lat ?? this.localBookmarks[idx].lat,
      lon: updates.lon ?? this.localBookmarks[idx].lon,
      tags: updates.tags ?? this.localBookmarks[idx].tags,
      color: updates.color ?? this.localBookmarks[idx].color,
    });
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    this.localBookmarks[idx] = {
      ...this.localBookmarks[idx],
      ...updates,
      updatedAt: Date.now(),
    };

    await this.saveLocalBookmarks();
    return this.localBookmarks[idx];
  }

  async removeBookmark(id: string): Promise<boolean> {
    const initialLength = this.localBookmarks.length;
    this.localBookmarks = this.localBookmarks.filter(b => b.id !== id);
    if (this.localBookmarks.length !== initialLength) {
      await this.saveLocalBookmarks();
      return true;
    }
    return false;
  }

  async reorderBookmarks(bookmarkIds: string[]): Promise<void> {
    const bookmarkMap = new Map(this.localBookmarks.map(b => [b.id, b]));
    const reordered: Bookmark[] = [];
    
    for (const id of bookmarkIds) {
      const bm = bookmarkMap.get(id);
      if (bm) reordered.push(bm);
    }
    
    // Add any remaining bookmarks not in the list
    for (const bm of this.localBookmarks) {
      if (!bookmarkIds.includes(bm.id)) {
        reordered.push(bm);
      }
    }

    this.localBookmarks = reordered;
    await this.saveLocalBookmarks();
  }

  // Export/Import
  async exportBookmarks(): Promise<string> {
    return JSON.stringify({
      version: 1,
      exportedAt: Date.now(),
      bookmarks: this.localBookmarks,
    }, null, 2);
  }

  async importBookmarks(jsonString: string, merge = true): Promise<number> {
    const parsed = JSON.parse(jsonString);
    const imported = (parsed.bookmarks || []).map((b: Partial<Bookmark>) => ({
      id: b.id || this.generateId(),
      name: b.name || 'Imported',
      lat: typeof b.lat === 'number' ? b.lat : 0,
      lon: typeof b.lon === 'number' ? b.lon : 0,
      createdAt: b.createdAt || Date.now(),
      updatedAt: b.updatedAt || Date.now(),
      tags: Array.isArray(b.tags) ? b.tags : [],
      color: b.color,
    })).filter(b => b.lat !== 0 || b.lon !== 0);

    if (merge) {
      // Merge by ID, keeping newer
      const existingMap = new Map(this.localBookmarks.map(b => [b.id, b]));
      for (const bm of imported) {
        const existing = existingMap.get(bm.id);
        if (!existing || bm.updatedAt > existing.updatedAt) {
          existingMap.set(bm.id, bm);
        }
      }
      this.localBookmarks = Array.from(existingMap.values())
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, MAX_BOOKMARKS);
    } else {
      this.localBookmarks = imported.slice(0, MAX_BOOKMARKS);
    }

    await this.saveLocalBookmarks();
    return imported.length;
  }

  // Search
  searchBookmarks(query: string): Bookmark[] {
    const lower = query.toLowerCase();
    return this.localBookmarks.filter(b => 
      b.name.toLowerCase().includes(lower) ||
      b.tags?.some(t => t.toLowerCase().includes(lower))
    );
  }
}

export const bookmarkModule = new BookmarkService();
export default bookmarkModule;