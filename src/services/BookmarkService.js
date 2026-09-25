// src/services/BookmarkService.js
import DOMPurify from 'dompurify';
const STORAGE_KEY = 'aurafisky_bookmarks';

/**
 * Persisted bookmarks are stored in localStorage as an array of
 * { name, lat, lon } objects.
 */
export function loadBookmarks() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}

export function saveBookmarks(bookmarks) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
}

export function addBookmark(name, lat, lon) {
  const bookmarks = loadBookmarks();
  // Prevent duplicates by lat/lon.
  if (bookmarks.some((b) => Math.abs(b.lat - lat) < 1e-6 && Math.abs(b.lon - lon) < 1e-6)) {
    return bookmarks;
  }
  // Sanitize the bookmark name to prevent XSS when rendered in UI
  const cleanName = DOMPurify.sanitize(name);
  const newBookmark = { name: cleanName, lat, lon };
  const updated = [...bookmarks, newBookmark];
  saveBookmarks(updated);
  return updated;
}

export function removeBookmark(index) {
  const bookmarks = loadBookmarks();
  if (index < 0 || index >= bookmarks.length) return bookmarks;
  const updated = bookmarks.filter((_, i) => i !== index);
  saveBookmarks(updated);
  return updated;
}
