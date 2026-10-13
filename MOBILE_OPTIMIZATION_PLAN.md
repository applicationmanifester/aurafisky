# Aurafisky Mobile Optimization Plan

## Current State Analysis
- ✅ PWA manifest with standalone display mode
- ✅ Service worker with offline caching
- ✅ Viewport height fix (--vh CSS variable)
- ✅ Basic responsive CSS (media queries at 639px, 768px)
- ✅ Weather panel slides from bottom on mobile
- ✅ Touch-action: none on map
- ✅ Glassmorphism UI with backdrop-filter

## Gaps to Address

### 1. Mobile Navigation & Layout
- [ ] **Bottom Navigation Bar** - Primary actions (Map, Search, Favorites, Settings, More)
- [ ] **Top Bar Optimization** - Hamburger menu, smaller logo, collapsed controls
- [ ] **Safe Area Handling** - env(safe-area-inset-*) for notches/home indicator
- [ ] **Landscape Mode** - Compact UI, horizontal panel option

### 2. Touch & Interaction
- [ ] **44x44px minimum touch targets** - All buttons, controls
- [ ] **Haptic Feedback** - navigator.vibrate for key actions
- [ ] **Pull-to-Refresh** - On weather panel and map
- [ ] **Swipe Gestures** - Swipe to open/close panels, dismiss modals
- [ ] **Momentum Scrolling** - -webkit-overflow-scrolling: touch
- [ ] **Better Slider/Timeline Touch** - Larger hit area, thumb styling

### 3. Panel & Modal UX
- [ ] **Bottom Sheet Pattern** - Settings, Share, Account as bottom sheets on mobile
- [ ] **Weather Panel** - Improved drag handle, snap points, backdrop tap to close
- [ ] **Search** - Full-screen modal on mobile, recent searches
- [ ] **Radar Controls** - Collapsible, bottom-positioned on mobile

### 4. iOS/Android Specific
- [ ] **iOS**: status bar styling, rubber-band scroll prevention, back gesture
- [ ] **Android**: Edge-to-edge, predictive back gesture, material motion
- [ ] **PWA Install Prompt** - Custom, well-timed
- [ ] **App Shortcuts** - Already in manifest, verify

### 5. Performance
- [ ] **Lazy Load Heavy Features** - Navigation, routes, canvas effects
- [ ] **Image Optimization** - WebP, responsive images
- [ ] **Code Splitting** - Dynamic imports for features
- [ ] **Reduce Bundle Size** - Tree shake unused OpenLayers modules

### 6. Accessibility
- [ ] **VoiceOver/TalkBack** - Proper ARIA labels, live regions
- [ ] **Dynamic Type** - Respect system font size
- [ ] **High Contrast** - Media query support
- [ ] **Reduced Motion** - Respect prefers-reduced-motion

## Implementation Priority

### Phase 1: Core Mobile UX (Week 1)
1. Bottom navigation bar
2. Safe area handling
3. Touch target sizing
4. Weather panel bottom sheet UX
5. Top bar mobile optimization

### Phase 2: Interactions & Polish (Week 2)
1. Haptic feedback
2. Swipe gestures
3. Pull-to-refresh
4. Bottom sheet modals
5. Landscape optimization

### Phase 3: Platform Specific & Performance (Week 3)
1. iOS/Android specific adaptations
2. Lazy loading
3. PWA install prompt
4. Accessibility audit

---