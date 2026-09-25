// src/modules/bookmark.ts
// Re-export from the new local-first BookmarkService
import { bookmarkModule } from '../services/BookmarkService.ts';

// Backward compatibility exports
export const addBookmark = (item: any) => bookmarkModule.addBookmark(item);
export const removeBookmark = (id: string) => bookmarkModule.removeBookmark(id);
export const loadBookmarks = () => bookmarkModule.getAll();
export const getBookmarks = () => bookmarkModule.getAll();

// Export the module itself for direct access
export { bookmarkModule };
export default bookmarkModule;