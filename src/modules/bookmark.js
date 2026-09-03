// src/modules/bookmark.js
const STORAGE_KEY = 'mapBookmarks';

export function addBookmark(item) {
  const bookmarks = loadBookmarks();
  // Ensure every bookmark has a unique id
  if (!item.id) {
    item.id = Date.now() + Math.random().toString(36).slice(2);
  }
  bookmarks.push(item);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
}

export function removeBookmark(id) {
  const bookmarks = loadBookmarks();
  const filtered = bookmarks.filter(b => b.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}

export function loadBookmarks() {
  const json = localStorage.getItem(STORAGE_KEY);
  return json ? JSON.parse(json) : [];
}

// Alias for UI modules
export const getBookmarks = loadBookmarks;