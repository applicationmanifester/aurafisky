# Aurafisky Fix Plan

## Phase 1: Critical Security & Stability (Must Fix)

### 1.1 Remove Hardcoded Firebase API Key
- **File**: `app.js` line 37
- **Action**: Remove fallback, enforce `window.FIREBASE_API_KEY` at build time via Vite `define`

### 1.2 Fix CSP Violations
- **Files**: `index.html` line 15, `firebase.json` line 14
- **Action**: Remove `'unsafe-inline'`, use nonces/hashes or move inline scripts to external files

### 1.3 Fix Worker URL Resolution in Electron
- **File**: `features/ensemble.js` line 34
- **Action**: Use Vite's `?worker` import or copy worker to dist with known path

### 1.4 Fix Cache Key Collision
- **File**: `weather.js` line 58
- **Action**: Include all request-determining params in cache key

### 1.5 Fix Race Condition in `_cachedFetch`
- **File**: `weather.js` lines 68-84
- **Action**: Store promise immediately so concurrent callers share same promise

### 1.6 Add AbortController Support to All Fetches
- **Files**: `weather.js`, `features/ensemble.js`, `app.js`
- **Action**: Pass `AbortSignal` through all fetch calls, abort on new request

---

## Phase 2: Memory Leaks & Resource Management

### 2.1 Clean Up Event Listeners on Destroy
- **File**: `app.js` - multiple locations
- **Action**: Add `destroy()` method that removes all listeners, timers, workers

### 2.2 Fix Search Debounce Timer Leak
- **File**: `app.js` line 156
- **Action**: Clear timer in destroy/cleanup

### 2.3 Fix Worker Message Handler Cleanup
- **File**: `features/ensemble.js` line 107
- **Action**: Remove listener on error/timeout, not just success

### 2.4 Configure localforage Properly
- **File**: `app.js` line 18
- **Action**: Add `localforage.config({ name: 'aurafisky', ... })`

### 2.5 Fix Particle Canvas DPR Handling
- **File**: `app.js` - canvas resize logic
- **Action**: Account for `devicePixelRatio`, add resize listener

### 2.6 Fix AudioContext Resume Policy
- **File**: `app.js` - audio initialization
- **Action**: Defer AudioContext creation until first user gesture

---

## Phase 3: Reliability & Offline Support

### 3.1 Add Offline Queue for Failed API Calls
- **File**: `weather.js`
- **Action**: Queue failed requests when offline, replay when online

### 3.2 Surface IndexedDB/localStorage Errors
- **File**: `weather.js` line 128, `app.js`
- **Action**: Show toast on quota errors, fallback to in-memory

### 3.3 Fix Bookmark Markers Cleanup
- **File**: `app.js`
- **Action**: Clear markers on map reinit/destroy

### 3.4 Fix Firebase VAPID Key Empty Default
- **File**: `app.js` line 43
- **Action**: Validate VAPID key before FCM token request, show error if missing

---

## Phase 4: Architecture & Testing

### 4.1 Modularize app.js (7,563 lines)
- **File**: `app.js`
- **Action**: Split into feature modules using existing `features/registry.js` pattern

### 4.2 Fix Test Imports
- **Files**: `tests/unit.test.mjs`, `tests/weather.test.ts`
- **Action**: Fix import paths, ensure WeatherService exports properly

### 4.3 Fix TypeScript Config
- **File**: `tsconfig.json`
- **Action**: Remove `"jsx": "react-jsx"`, enable declaration emit

### 4.4 Add E2E Test Setup (Playwright)
- **New files**: `playwright.config.ts`, `tests/e2e/`

---

## Phase 5: Feature Enhancements

### 5.1 Keyboard Shortcuts
- **File**: `app.js`
- **Action**: Add global keydown handler for ?, /, ←/→, space

### 5.2 Command Palette (⌘K)
- **File**: `app.js` / new module
- **Action**: Implement searchable command palette

### 5.3 Vector Tiles / MapLibre GL (Future)
- **Note**: High effort, defer to v3

---

## Implementation Order

1. **Security fixes** (1.1, 1.2) - Immediate
2. **Stability fixes** (1.3, 1.4, 1.5, 1.6) - High priority
3. **Memory leaks** (2.1-2.6) - High priority
4. **Reliability** (3.1-3.4) - Medium priority
5. **Architecture** (4.1-4.4) - Medium priority
6. **Features** (5.1-5.2) - Low priority

---

## Files to Modify

| File | Changes |
|------|---------|
| `app.js` | Remove hardcoded key, add destroy(), fix timers, DPR, AudioContext, modularize |
| `weather.js` | Fix cache key, fix race condition, add AbortController, offline queue, error surfacing |
| `index.html` | Fix CSP, remove inline script or add nonce |
| `firebase.json` | Fix CSP header |
| `features/ensemble.js` | Fix worker URL, add AbortController, fix handler cleanup |
| `workers/compute.worker.js` | Ensure compatible with new worker loading |
| `vite.config.js` | Add define for Firebase key, worker plugin |
| `electron/main.cjs` | Pass Firebase config via preload |
| `electron/preload.cjs` | Expose Firebase config, IPC for native features |
| `tsconfig.json` | Fix JSX, enable declarations |
| `tests/unit.test.mjs` | Fix import path |
| `tests/weather.test.ts` | Fix WeatherService import |
| `.env.example` | Document required env vars |