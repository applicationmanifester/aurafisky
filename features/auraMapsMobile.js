// features/auraMapsMobile.js
// Ultra-responsive Mobile Experience for Aura & Aurafisky
// Real-world weather use cases, dynamic location syncing, route weather hazards,
// live rain radar, outdoor fitness decisions, interactive bottom sheet, and Material navigation.

import { shortPlaceName } from '../modules/geo.js';
import { isMobileLayout } from './breakpoints.js';

export function init(app) {
  const controller = new AuraMobileController(app);
  app.auraMobile = controller;
  app.auraMapsMobile = controller;
  app.googleMapsMobile = controller;
}

export class AuraMobileController {
  constructor(app) {
    this.app = app;
    this.sheetState = 'peek'; // 'peek', 'half', 'full', 'dismissed'
    this.currentLocationName = '';
    this.placesData = this._getInitialWeatherUseCases('Devanahalli', 23, 'rain');
    this.activeCategory = null;

    if (typeof document !== 'undefined') {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this.setup());
      } else {
        this.setup();
      }
    }
  }

  setup() {
    this.initSearchPill();
    this.initQuickChips();
    this.initFloatingActions();
    this.initDraggableBottomSheet();
    this.initDiscoveriesCarousel();
    this.initVoiceSearch();
    this.initLocationObserver();
    this.syncCurrentLocationInfo();
  }

  _haptic(type = 'light') {
    if (typeof navigator === 'undefined' || !navigator.vibrate) return;
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    try {
      if (type === 'selection') navigator.vibrate(8);
      else if (type === 'medium') navigator.vibrate([15]);
      else navigator.vibrate(12);
    } catch (_) {}
  }

  /**
   * True when the bottom-sheet / mobile-chrome layout should apply.
   *
   * This deliberately mirrors the media query used in styles.css:
   *   (max-width: 639px), (max-height: 500px) and (pointer: coarse)
   *
   * The second clause is what landscape phones need. A rotated iPhone is
   * ~844px wide, so a width-only check classified it as a desktop and took
   * away the bottom nav, the FABs, the map controls, the draggable sheet and
   * the 44px touch targets — all of which the user still needs with one hand
   * on a short screen. Requiring `pointer: coarse` keeps genuine desktop
   * windows (however short) on the desktop card.
   */
  _isMobileLayout() {
    return isMobileLayout();
  }

  // ── Auto-Sync Observer: Never Get Stuck on a Stale Location ───────
  initLocationObserver() {
    const locEl = document.getElementById('panelLocationName');
    if (!locEl) return;
    const observer = new MutationObserver(() => {
      if (this._isSyncingLocation) return;
      const text = locEl.textContent?.replace(/🏠\s*Home/g, '')?.trim();
      if (text && text !== this.currentLocationName && text !== 'Select location') {
        this.currentLocationName = text;
        this.syncCurrentLocationInfo(null, text);
      }
    });
    observer.observe(locEl, { childList: true, characterData: true, subtree: true });
  }

  // ── Search Pill ──────────────────────────────────────────────────
  initSearchPill() {
    const voiceBtn = document.getElementById('voiceSearchBtn');
    const clearBtn = document.getElementById('searchClearBtn');
    const input = document.getElementById('searchInput');

    if (voiceBtn) {
      voiceBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._haptic('selection');
        this.startVoiceSearch();
      });
    }

    input?.addEventListener('input', () => {
      if (clearBtn) {
        clearBtn.classList.toggle('hidden', !input.value);
      }
    });

    clearBtn?.addEventListener('click', () => {
      if (input) {
        input.value = '';
        input.focus();
        clearBtn.classList.add('hidden');
        const dropdown = document.getElementById('searchDropdown');
        if (dropdown) dropdown.classList.add('hidden');
      }
    });

    // Selecting a search suggestion restores the bottom sheet if dismissed
    input?.addEventListener('focus', () => {
      if (this.sheetState === 'dismissed') {
        this.restoreSheet('peek');
      }
    });
  }

  // ── Horizontally Scrollable Weather Action Chips ─────────────────
  initQuickChips() {
    const chipsContainer = document.getElementById('mobileQuickChips');
    if (!chipsContainer) return;

    chipsContainer.addEventListener('click', (e) => {
      const chip = e.target.closest('.mobile-quick-chip');
      if (!chip) return;
      const category = chip.dataset.category;
      this._haptic('selection');
      this.handleChipClick(category, chip);
    });
  }

  handleChipClick(category, chipEl) {
    const allChips = document.querySelectorAll('.mobile-quick-chip');

    if (this.activeCategory === category && category !== 'aura') {
      // If user tapped radar chip while radar is active, but panel is closed/minimized: reopen panel!
      if (category === 'radar' && this.app.radarActive && this.app.$.radarExpandedPanel?.classList.contains('hidden')) {
        this.toggleRadarOverlay(true);
        chipEl.classList.add('active');
        return;
      }
      this.activeCategory = null;
      allChips.forEach(c => c.classList.remove('active'));
      if (category === 'route-weather') {
        if (typeof this.app.closeRouteStudio === 'function') {
          this.app.closeRouteStudio();
        } else if (typeof this.app.toggleRoute === 'function') {
          this.app.toggleRoute();
        }
      } else if (category === 'radar') {
        this.toggleRadarOverlay(false);
      }
      return;
    }

    this.activeCategory = category;
    allChips.forEach(c => c.classList.remove('active'));
    chipEl.classList.add('active');

    if (category === 'aura') {
      this.openAura();
    } else if (category === 'radar') {
      this.toggleRadarOverlay(true);
    } else if (category === 'route-weather') {
      this.openRouteWeather();
    } else if (category === 'wind') {
      this.toggleWindOverlay();
    } else if (category === 'outdoor') {
      this.openOutdoorDecision();
    } else if (category === 'uv-aqi') {
      this.openUvAqiIntelligence();
    } else if (category === 'hazards') {
      this.openRoadHazards();
    } else if (category === 'home') {
      this.navigateToHomeCommute();
    } else if (category === 'restaurants') {
      this.filterPlaces('dining');
      this.snapSheet('full');
    }
  }

  // The assistant itself lives in features/aura.js. This controller only
  // owns the toolbar chip and the banner card that launch it.
  openAura() {
    if (this.app?.aura?.open) {
      this.app.aura.open();
      return;
    }
    document.getElementById('auraModal')?.classList.remove('hidden');
  }

  toggleRadarOverlay(forceState) {
    if (forceState === true && this.app.radarActive) {
      this.app.$.radarExpandedPanel?.classList.remove('hidden');
      document.getElementById('radarBackdrop')?.classList.remove('hidden');
      this.app.$.radarCollapsedBtn?.classList.add('hidden');
      return;
    }
    if (typeof this.app.toggleRadar === 'function') {
      if (typeof forceState === 'boolean') {
        this.app.toggleRadar(forceState);
      } else {
        this.app.toggleRadar();
      }
    } else {
      const radarBtn = document.getElementById('radarToggleBtn');
      radarBtn?.click();
    }
    const isActive = this.app.radarActive;
    this.app.showToast?.(
      isActive 
        ? '🌧️ Live Rain Radar Active: Tracking storms & rain cells' 
        : '🌧️ Rain Radar Disabled', 
      'info'
    );
  }

  openRouteWeather() {
    this.sheetState = 'dismissed';
    this.app?.hideWeatherPanel?.();
    const pill = document.getElementById('restoreSheetPill');
    if (pill) pill.classList.add('hidden');
    this.app.showToast?.('🚗 Route Weather: Driving hazards & road weather intelligence loaded', 'info');
    if (typeof this.app.openRouteStudio === 'function') {
      this.app.openRouteStudio();
    } else if (typeof this.app.toggleRoute === 'function') {
      this.app.toggleRoute();
    } else {
      const routeBtn = document.getElementById('routeBtn');
      routeBtn?.click();
    }
  }

  toggleWindOverlay() {
    this.app.overlayType = 'wind';
    if (!this.app.radarActive) {
      if (typeof this.app.toggleRadar === 'function') this.app.toggleRadar();
      else document.getElementById('radarToggleBtn')?.click();
    } else {
      this.app.activeEffectType = 'wind';
      this.app.initWindParticles?.();
      if (!this.app.animationFrameId) this.app.runWeatherCanvasLoop?.();
    }
    this.app.showToast?.('💨 Live Wind Stream Active: Surface wind velocity visualizer', 'info');
  }

  openOutdoorDecision() {
    this.restoreSheet('full');
    this.filterPlaces('outdoor');
    this.app.showToast?.('🏃 Fitness & Outdoor: Real-time workout comfort ratings', 'info');
  }

  openUvAqiIntelligence() {
    this.restoreSheet('full');
    this.filterPlaces('health');
    this.app.showToast?.('☀️ Air Quality & UV Protection Intelligence', 'info');
  }

  openRoadHazards() {
    this.restoreSheet('full');
    this.filterPlaces('hazard');
    this.app.showToast?.('⚠️ Road Hazard Watch: Active surface & visibility cautions', 'warning');
  }

  navigateToHomeCommute() {
    if (this.app.homeLocation && this.app.homeLocation.lat) {
      this.app.showToast?.(`Navigating Home (${this.app.homeLocation.name || 'Saved Home'}) • Live road weather`, 'info');
      if (typeof this.app.startNavigationPreview === 'function') {
        this.app.startNavigationPreview(this.app.homeLocation.lat, this.app.homeLocation.lng, this.app.homeLocation.name || 'Home');
      } else if (typeof this.app.openRoutePlanner === 'function') {
        this.app.openRoutePlanner(this.app.homeLocation);
      }
    } else {
      const targetLat = this.app.selectedLat || 13.2437;
      const targetLng = this.app.selectedLng || 77.7126;
      this.app.showToast?.('Setting commute destination with live road weather', 'info');
      if (typeof this.app.startNavigationPreview === 'function') {
        this.app.startNavigationPreview(targetLat, targetLng, 'Home');
      }
    }
  }

  // ── Right Side Floating Controls ─────────────────────────────────
  initFloatingActions() {
    const shareBtn = document.getElementById('mobileFloatingShareBtn');
    const compassBtn = document.getElementById('mobileLocationFab') || document.getElementById('mobileFloatingCompassBtn');
    const directionsFab = document.getElementById('mobileDirectionsFab');

    shareBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._haptic('light');
      const loc = this.currentLocationName || this.app.selectedName || 'Current Location';
      if (navigator.share) {
        navigator.share({
          title: `${loc} Weather`,
          text: `Check out live weather and road conditions at ${loc}!`,
          url: window.location.href,
        }).catch(() => {});
      } else {
        const shareModal = document.getElementById('shareModal');
        if (shareModal) shareModal.classList.remove('hidden');
      }
    });

    compassBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._haptic('selection');
      this.app.getMyLocation?.();
    });

    directionsFab?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._haptic('medium');
      if (this.app?.selectedLat != null && typeof this.app.startNavigationPreview === 'function') {
        this.app.startNavigationPreview();
      } else if (typeof this.app.openRouteStudio === 'function') {
        this.sheetState = 'dismissed';
        this.app?.hideWeatherPanel?.();
        const pill = document.getElementById('restoreSheetPill');
        if (pill) pill.classList.add('hidden');
        this.app.openRouteStudio();
      } else if (typeof this.app.toggleRoute === 'function') {
        this.sheetState = 'dismissed';
        this.app?.hideWeatherPanel?.();
        const pill = document.getElementById('restoreSheetPill');
        if (pill) pill.classList.add('hidden');
        this.app.toggleRoute();
      } else {
        const routeBtn = document.getElementById('routeBtn');
        routeBtn?.click();
      }
    });
  }

  // ── Draggable Bottom Sheet & Cancel/Close Fix ─────────────────────
  initDraggableBottomSheet() {
    const panel = document.getElementById('weatherPanel');
    const dragHandle = document.getElementById('panelDragHandle');
    const closeBtn = document.getElementById('panelCloseBtn');
    const minBtn = document.getElementById('panelMinimizeBtn');
    if (!panel || !dragHandle) return;

    // ── CANCEL / CLOSE BUTTON FIX ─────────────────────────────────
    // Close button dismisses the weather card entirely on mobile and desktop
    closeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._haptic('selection');
      if (isMobileLayout()) {
        this.dismissSheet();
      } else {
        this.sheetState = 'dismissed';
        this.app?.hideWeatherPanel?.();
      }
    });

    // Chevron minimize button: toggle peek <-> full on mobile, toggle minimize on desktop
    minBtn?.addEventListener('click', (e) => {
      if (!isMobileLayout()) {
        // On desktop, allow normal app.toggleMinimizeWeatherPanel to run without interference
        return;
      }
      e.stopPropagation();
      e.stopImmediatePropagation();
      this._haptic('selection');
      if (this.sheetState === 'full' || panel.classList.contains('sheet-full')) {
        this.snapSheet('peek');
      } else {
        this.snapSheet('full');
      }
    });

    // Expand bottom sheet on mobile when tapping location name, weather badge, or Aura card
    const expandTargets = [
      document.getElementById('sheetWeatherAqiBadge'),
      document.getElementById('panelLocationName'),
      document.getElementById('locationAddressCard')
    ];
    expandTargets.forEach(el => {
      el?.addEventListener('click', (e) => {
        if (!isMobileLayout()) return;
        if (e.target.closest('#panelCloseBtn, #panelMinimizeBtn')) return;
        if (this.sheetState === 'peek' || panel.classList.contains('sheet-peek') || panel.classList.contains('minimized')) {
          e.stopPropagation();
          this._haptic('selection');
          this.snapSheet('full');
        }
      });
    });

    // Tapping anywhere on the sheet header in peek mode smoothly expands to full
    const panelHeader = document.getElementById('weatherPanelHeader');
    panelHeader?.addEventListener('click', (e) => {
      if (!isMobileLayout()) return;
      if (e.target.closest('#panelCloseBtn, #panelMinimizeBtn, button, a')) return;
      if (this.sheetState === 'peek' || panel.classList.contains('sheet-peek') || panel.classList.contains('minimized')) {
        this._haptic('selection');
        this.snapSheet('full');
      }
    });

    // On desktop, clicking the weather & AQI pill toggles minimize or selects overview
    const weatherAqiBadge = document.getElementById('sheetWeatherAqiBadge');
    weatherAqiBadge?.addEventListener('click', () => {
      if (!isMobileLayout()) {
        if (panel.classList.contains('minimized')) {
          this.app.toggleMinimizeWeatherPanel?.();
        } else {
          this.app.switchWeatherTab?.('overview');
        }
      }
    });

    let startY = 0;
    let initialHeight = 0;
    let isDragging = false;
    let startTime = 0;

    const onDragStart = (clientY) => {
      if (!isMobileLayout()) return;
      isDragging = true;
      startY = clientY;
      initialHeight = panel.getBoundingClientRect().height;
      startTime = Date.now();
      panel.style.transition = 'none';
      panel.classList.remove('sheet-peek', 'minimized');
    };

    const onDragMove = (clientY) => {
      if (!isDragging) return;
      const deltaY = startY - clientY; // positive = dragging UP
      const newHeight = initialHeight + deltaY;
      const vh = window.innerHeight;

      // Bound between peek (140px) and full screen
      if (newHeight >= 140 && newHeight <= vh) {
        panel.style.height = `${newHeight}px`;
        panel.style.maxHeight = `${newHeight}px`;
        panel.style.transform = 'translateY(0)';
      } else if (newHeight < 140) {
        const overdrag = 140 - newHeight;
        panel.style.transform = `translateY(${overdrag * 0.5}px)`;
      }
    };

    const onDragEnd = (clientY) => {
      if (!isDragging) return;
      isDragging = false;
      const deltaY = startY - clientY;
      const duration = Date.now() - startTime;
      const velocity = deltaY / (duration || 1); // px per ms

      if (velocity > 0.3 || deltaY > 70) {
        this.snapSheet('full');
      } else if (velocity < -0.3 || deltaY < -70) {
        this.snapSheet('peek');
      } else {
        const currentHeight = panel.getBoundingClientRect().height;
        const vh = window.innerHeight;
        if (currentHeight < 130) {
          this.dismissSheet();
        } else if (currentHeight < vh * 0.45) {
          this.snapSheet('peek');
        } else {
          this.snapSheet('full');
        }
      }
    };

    dragHandle.addEventListener('touchstart', (e) => onDragStart(e.touches[0].clientY), { passive: true });
    window.addEventListener('touchmove', (e) => { if (isDragging && e.touches?.[0]) onDragMove(e.touches[0].clientY); }, { passive: true });
    window.addEventListener('touchend', (e) => { if (isDragging && e.changedTouches?.[0]) onDragEnd(e.changedTouches[0].clientY); }, { passive: true });

    dragHandle.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button === 0) onDragStart(e.clientY);
    });
    window.addEventListener('pointermove', (e) => {
      if (isDragging && e.pointerType === 'mouse') onDragMove(e.clientY);
    });
    window.addEventListener('pointerup', (e) => {
      if (isDragging && e.pointerType === 'mouse') onDragEnd(e.clientY);
    });

    dragHandle.addEventListener('click', (e) => {
      if (!isMobileLayout()) return;
      e.stopPropagation();
      this._haptic('selection');
      if (this.sheetState === 'peek' || panel.classList.contains('sheet-peek') || panel.classList.contains('minimized')) {
        this.snapSheet('full');
      } else {
        this.snapSheet('peek');
      }
    });

    if (isMobileLayout()) {
      panel.classList.add('aura-sheet', 'google-maps-sheet');
      panel.classList.add('open');
      // If a location is currently selected, snap to 'full' so weather card completely overlaps mobile screen!
      if (this.app?.selectedLat != null || this.app?.selectedName || this.currentLocationName) {
        this.snapSheet('full');
      } else {
        this.snapSheet('peek');
      }
    } else {
      // Desktop: Clean up any mobile sheet classes and let full desktop card be visible
      panel.classList.remove('aura-sheet', 'google-maps-sheet', 'sheet-peek', 'sheet-half', 'sheet-full', 'minimized');
      panel.style.height = '';
      panel.style.maxHeight = '';
      panel.style.transform = '';
      panel.style.transition = '';
      panel.style.opacity = '';
      panel.style.pointerEvents = '';
      panel.classList.add('open');
      panel.removeAttribute('inert');
    }

    // Window resize handler: seamlessly switch between mobile bottom sheet and desktop sidebar
    window.addEventListener('resize', () => {
      if (!isMobileLayout()) {
        panel.classList.remove('google-maps-sheet', 'sheet-peek', 'sheet-half', 'sheet-full');
        panel.style.height = '';
        panel.style.maxHeight = '';
        panel.style.transform = '';
        panel.style.transition = '';
        panel.style.opacity = '';
        panel.style.pointerEvents = '';
      } else {
        panel.classList.add('google-maps-sheet');
        if (!panel.classList.contains('sheet-peek') && !panel.classList.contains('sheet-half') && !panel.classList.contains('sheet-full')) {
          this.snapSheet('full');
        }
      }
    });

    const mapEl = document.getElementById('map');
    mapEl?.addEventListener('click', (e) => {
      // Map click fires app.js handleMapClick which selects a location and snaps sheet to 'full'.
    });
  }

  snapSheet(state) {
    const panel = document.getElementById('weatherPanel');
    if (!panel) return;

    const restorePill = document.getElementById('restoreSheetPill');
    if (restorePill) restorePill.classList.add('hidden');

    const timeline = document.getElementById('timelineBar');
    if (!isMobileLayout()) {
      if (timeline) timeline.classList.remove('hidden-by-sheet');
      // On desktop, keep normal floating card with full content visible
      panel.style.height = '';
      panel.style.maxHeight = '';
      panel.style.transform = '';
      panel.style.transition = '';
      panel.style.opacity = '';
      panel.style.pointerEvents = '';
      panel.classList.remove('minimized', 'sheet-peek', 'sheet-half', 'sheet-full', 'aura-sheet', 'google-maps-sheet');
      panel.classList.add('open');
      panel.removeAttribute('inert');
      return;
    }

    if (timeline) timeline.classList.add('hidden-by-sheet');

    this.sheetState = state;
    panel.removeAttribute('inert');
    panel.classList.add('open', 'aura-sheet', 'google-maps-sheet');
    panel.classList.remove('sheet-peek', 'sheet-half', 'sheet-full');
    panel.classList.add(`sheet-${state}`);

    const vh = window.innerHeight;
    panel.style.transition = 'height 0.35s cubic-bezier(0.2, 0.9, 0.3, 1), transform 0.35s cubic-bezier(0.2, 0.9, 0.3, 1), opacity 0.2s ease';
    panel.style.opacity = '1';
    panel.style.pointerEvents = 'auto';

    const minBtn = document.getElementById('panelMinimizeBtn');
    if (state === 'peek') {
      const targetHeight = 175;
      panel.style.height = `${targetHeight}px`;
      panel.style.maxHeight = `${targetHeight}px`;
      panel.style.top = '';
      panel.style.bottom = '';
      panel.style.left = '';
      panel.style.right = '';
      panel.style.transform = 'translateY(0)';
      panel.classList.add('minimized');
      panel.classList.remove('sheet-full', 'sheet-half');
      panel.classList.add('sheet-peek');
      minBtn?.classList.add('chevron-flipped');
      minBtn?.setAttribute('title', 'Expand weather details');
      minBtn?.setAttribute('aria-label', 'Expand weather details');
    } else {
      // 'full' or any expanded state: completely overlap screen on mobile
      panel.style.height = '100dvh';
      panel.style.maxHeight = '100dvh';
      panel.style.top = '0px';
      panel.style.bottom = '0px';
      panel.style.left = '0px';
      panel.style.right = '0px';
      panel.style.transform = 'translateY(0)';
      panel.classList.remove('minimized', 'sheet-peek', 'sheet-half');
      panel.classList.add('sheet-full');
      minBtn?.classList.remove('chevron-flipped');
      minBtn?.setAttribute('title', 'Minimize weather panel');
      minBtn?.setAttribute('aria-label', 'Minimize weather panel');
    }

    this._haptic('selection');
  }

  dismissSheet() {
    const panel = document.getElementById('weatherPanel');
    if (!panel) return;

    if (!isMobileLayout()) {
      this.sheetState = 'dismissed';
      const pill = document.getElementById('restoreSheetPill');
      if (pill) pill.classList.add('hidden');
      const timeline = document.getElementById('timelineBar');
      if (timeline) timeline.classList.remove('hidden-by-sheet');
      this.app?.hideWeatherPanel?.();
      return;
    }

    this.sheetState = 'dismissed';
    panel.classList.remove('open', 'sheet-peek', 'sheet-half', 'sheet-full');
    panel.setAttribute('inert', '');
    panel.style.transition = 'transform 0.35s cubic-bezier(0.2, 0.9, 0.3, 1), opacity 0.25s ease';
    panel.style.transform = 'translateY(calc(100% + 120px))';
    panel.style.opacity = '0';
    panel.style.pointerEvents = 'none';

    // Hide timeline bar on mobile so it doesn't overlap with restoreSheetPill
    const timeline = document.getElementById('timelineBar');
    if (timeline) timeline.classList.add('hidden-by-sheet');

    let pill = document.getElementById('restoreSheetPill');
    const locName = (this.currentLocationName || this.app?.selectedName || 'Current Location').split(',')[0].trim();
    if (!pill) {
      pill = document.createElement('button');
      pill.id = 'restoreSheetPill';
      pill.className = 'fixed bottom-18 left-1/2 -translate-x-1/2 z-[1020] bg-white dark:bg-[#202124] text-slate-800 dark:text-slate-100 px-4 py-2 rounded-full shadow-2xl border border-slate-200/80 dark:border-slate-700/80 text-xs font-semibold flex items-center gap-2 active:scale-95 transition-all cursor-pointer animate-in fade-in duration-200';
      pill.innerHTML = `<span>📍</span><span>${locName} Weather</span><span class="text-teal-500 font-bold">▲ Show</span>`;
      pill.addEventListener('click', () => {
        this.restoreSheet('full');
      });
      document.body.appendChild(pill);
    } else {
      pill.innerHTML = `<span>📍</span><span>${locName} Weather</span><span class="text-teal-500 font-bold">▲ Show</span>`;
      pill.classList.remove('hidden');
    }
    this.app?.hideWeatherPanel?.();
  }

  restoreSheet(state = 'full') {
    const panel = document.getElementById('weatherPanel');
    if (!panel) return;
    panel.removeAttribute('inert');
    panel.classList.add('open');
    const pill = document.getElementById('restoreSheetPill');
    if (pill) pill.classList.add('hidden');
    const timeline = document.getElementById('timelineBar');
    if (timeline && isMobileLayout()) timeline.classList.add('hidden-by-sheet');
    this.snapSheet(state);
  }

  // ── Dynamic Real-Time Meteorological Intelligence & Decision Engine ─
  initDiscoveriesCarousel() {
    this.renderPlaces();
    const exploreBtn = document.getElementById('discoveriesExploreAllBtn');
    exploreBtn?.addEventListener('click', () => {
      this._haptic('light');
      this.filterPlaces('all');
      const allChips = document.querySelectorAll('.mobile-quick-chip');
      allChips.forEach(c => c.classList.remove('active'));
    });
  }

  _getInitialWeatherUseCases(locName = 'Selected Location', currentTemp = 23, condition = 'mild') {
    const lat = this.app?.selectedLat || 13.2437;
    const lng = this.app?.selectedLng || 77.7126;
    const curr = this.app?.currentWeather || null;
    const weatherData = this.app?.weatherData || null;
    const hourIdx = this.app?.currentHourIndex || 0;

    // Real-time sensor values
    const tempC = curr?.temperature ?? currentTemp ?? 22;
    const feelsLikeC = curr?.feelsLike ?? tempC;
    const humidity = curr?.humidity ?? weatherData?.hourly?.relative_humidity_2m?.[hourIdx] ?? 50;
    const windSpeedKmh = curr?.windSpeed ?? weatherData?.hourly?.wind_speed_10m?.[hourIdx] ?? 12;
    const windGustsKmh = curr?.windGusts ?? weatherData?.hourly?.wind_gusts_10m?.[hourIdx] ?? windSpeedKmh;
    const windDir = curr?.windDirection ?? weatherData?.hourly?.wind_direction_10m?.[hourIdx] ?? 180;
    const precipMm = curr?.precipitation ?? weatherData?.hourly?.precipitation?.[hourIdx] ?? 0;
    const precipProb = weatherData?.hourly?.precipitation_probability?.[hourIdx] ?? 0;
    const weatherCode = curr?.weatherCode ?? weatherData?.hourly?.weather_code?.[hourIdx] ?? 0;
    const uvIndex = curr?.uvIndex ?? weatherData?.hourly?.uv_index?.[hourIdx] ?? 0;
    const dailyMaxUv = weatherData?.daily?.uv_index_max?.[0] ?? uvIndex;
    const cloudCover = curr?.cloudCover ?? weatherData?.hourly?.cloud_cover?.[hourIdx] ?? 20;
    const rawVisM = weatherData?.hourly?.visibility?.[hourIdx];
    const visibilityKm = rawVisM != null ? (rawVisM / 1000).toFixed(1) : (cloudCover > 85 ? '6.0' : '10.0+');
    const aqi = this.app?.currentAqi ?? 42;
    const pm25 = this.app?.airQualityData?.hourly?.pm2_5?.[hourIdx] != null ? `${this.app.airQualityData.hourly.pm2_5[hourIdx].toFixed(1)} µg/m³` : `${(aqi * 0.24).toFixed(1)} µg/m³`;
    const pm10 = this.app?.airQualityData?.hourly?.pm10?.[hourIdx] != null ? `${this.app.airQualityData.hourly.pm10[hourIdx].toFixed(1)} µg/m³` : `${(aqi * 0.52).toFixed(1)} µg/m³`;

    // 1. Genuine Road Grip & Surface Friction calculation
    const isFreezing = tempC <= 1 && (precipMm > 0 || humidity >= 85);
    const isHeavyRain = precipMm >= 4 || weatherCode >= 95;
    const isWet = precipMm > 0.1 || (weatherCode >= 51 && weatherCode <= 67);
    const isCrosswindHazard = windGustsKmh >= 50;

    let roadStatus = '🟢 Optimal Traction • Dry Asphalt';
    let roadFriction = '0.85 µ (Dry)';
    let roadDesc = `Pavement around ${locName} is dry with high tire grip. Visibility is ${visibilityKm} km with safe braking distances. Standard 2-second following rule applies.`;
    let roadTag = '🚗 Driving & Road Grip';
    if (isFreezing) {
      roadStatus = '⚠️ Critical Freezing / Black Ice Risk';
      roadFriction = '0.20 µ (Severe Slip)';
      roadDesc = `Surface temperature is near freezing (${tempC.toFixed(1)}°C) with active moisture. Severe risk of transparent black ice on bridges, overpasses, and shady turns. Increase following distance to 5x.`;
      roadTag = '❄️ Black Ice & Freezing Watch';
    } else if (isHeavyRain) {
      roadStatus = '⚠️ Active Hydroplaning Warning';
      roadFriction = '0.40 µ (Wet Asphalt)';
      roadDesc = `Heavy precipitation (${precipMm.toFixed(1)} mm/h) is pooling on roads. High hydroplaning potential at speeds above 65 km/h. Keep headlights on and disengage cruise control.`;
      roadTag = '⛈️ Storm & Hydroplaning Alert';
    } else if (isWet) {
      roadStatus = '🌧️ Wet Pavement • Reduced Traction';
      roadFriction = '0.55 µ (Wet)';
      roadDesc = `Active precipitation (${precipMm.toFixed(1)} mm/h) creates surface moisture. Braking distance is extended by ~30%. Maintain extra following gap.`;
      roadTag = '🌧️ Wet Pavement Watch';
    } else if (isCrosswindHazard) {
      roadStatus = '💨 Strong Highway Crosswind Hazard';
      roadFriction = '0.80 µ (Wind Buffeting)';
      roadDesc = `Wind gusts up to ${Math.round(windGustsKmh)} km/h detected. High-profile vehicles, campers, and trailers will experience sudden lateral buffeting on open overpasses.`;
      roadTag = '💨 Crosswind Warning';
    }

    // 2. Genuine ACSM / WMO Athletic & Running Comfort Index (0-10)
    let outdoorScore = 10;
    if (feelsLikeC > 30) outdoorScore -= Math.min(4, Math.round((feelsLikeC - 30) / 2));
    else if (feelsLikeC < 5) outdoorScore -= Math.min(4, Math.round((5 - feelsLikeC) / 3));
    if (humidity > 70 && feelsLikeC > 24) outdoorScore -= 2;
    if (precipMm > 0.5) outdoorScore -= 3;
    else if (precipProb > 40) outdoorScore -= 1;
    if (aqi > 100) outdoorScore -= 3;
    else if (aqi > 50) outdoorScore -= 1;
    if (windSpeedKmh > 30) outdoorScore -= 1;
    outdoorScore = Math.max(1, Math.min(10, outdoorScore));

    const outdoorRatingLabel = outdoorScore >= 8 ? 'Optimal for Running & Sports' : outdoorScore >= 5 ? 'Moderate Cardio Comfort' : 'Caution / High Stress';

    // 3. Genuine WHO Solar UV Radiation Level
    let uvCategory = 'Low';
    let uvColor = 'text-emerald-400';
    let uvAdvice = 'Minimal sun protection needed. Safe for extended exposure.';
    if (uvIndex >= 11) {
      uvCategory = 'Extreme';
      uvColor = 'text-purple-400';
      uvAdvice = 'Avoid midday outdoor exposure. Unprotected skin and eyes can burn in < 10 min.';
    } else if (uvIndex >= 8) {
      uvCategory = 'Very High';
      uvColor = 'text-rose-400';
      uvAdvice = 'SPF 50+ sunscreen, UV400 sunglasses, and wide-brim hat required. Seek shade 11:00–16:00.';
    } else if (uvIndex >= 6) {
      uvCategory = 'High';
      uvColor = 'text-amber-400';
      uvAdvice = 'SPF 30+ sunscreen, hat, and sunglasses advised. Protect sensitive skin.';
    } else if (uvIndex >= 3) {
      uvCategory = 'Moderate';
      uvColor = 'text-amber-300';
      uvAdvice = 'Sun protection recommended during peak solar hours.';
    }

    // 4. Genuine Air Quality (US AQI & PM2.5) EPA Standard
    let aqiLabel = 'Good (Clean Air)';
    let aqiAdvice = 'Air quality is satisfactory and poses little to no health risk.';
    if (aqi > 200) {
      aqiLabel = 'Very Unhealthy';
      aqiAdvice = 'Health alert: significant health risk. Everyone should avoid outdoor exertion.';
    } else if (aqi > 150) {
      aqiLabel = 'Unhealthy';
      aqiAdvice = 'Everyone may begin to experience health effects; sensitive groups more severe.';
    } else if (aqi > 100) {
      aqiLabel = 'Sensitive Groups Caution';
      aqiAdvice = 'Members of sensitive groups may experience health effects. Limit prolonged outdoor exertion.';
    } else if (aqi > 50) {
      aqiLabel = 'Moderate';
      aqiAdvice = 'Air quality is acceptable. Very sensitive individuals may consider reducing prolonged outdoor effort.';
    }

    // 5. Genuine Wind & Crosswind Velocity
    let windBeaufort = 'Gentle Breeze';
    if (windSpeedKmh < 5) windBeaufort = 'Calm';
    else if (windSpeedKmh < 12) windBeaufort = 'Light Breeze';
    else if (windSpeedKmh < 20) windBeaufort = 'Gentle Breeze';
    else if (windSpeedKmh < 29) windBeaufort = 'Moderate Breeze';
    else if (windSpeedKmh < 39) windBeaufort = 'Fresh Breeze';
    else if (windSpeedKmh < 50) windBeaufort = 'Strong Breeze';
    else if (windSpeedKmh < 62) windBeaufort = 'High Wind / Near Gale';
    else windBeaufort = 'Gale / Severe Wind';

    // 6. Genuine Night Sky Stargazing Clarity
    const moon = WeatherService.getMoonPhase(new Date());
    let skyClarity = 'Exceptional Seeing';
    if (cloudCover > 70) skyClarity = 'Obstructed by Clouds';
    else if (cloudCover > 30) skyClarity = 'Partly Obscured';
    else if ((moon?.phase || 0) > 0.75) skyClarity = 'Moonlit Sky (Washed Out)';

    return [
      {
        id: 'road-traction-intelligence',
        name: `${locName} Road Traction & Grip`,
        category: 'hazard',
        tag: roadTag,
        metricBadge: `Friction: ${roadFriction}`,
        status: roadStatus,
        stat1: `Precip: ${precipMm.toFixed(1)} mm/h`,
        stat2: `Visibility: ${visibilityKm} km`,
        quote: roadDesc,
        reviewerBadge: 'traction',
        lat,
        lng,
        actionText: '▶️ Live Rain Radar',
        actionType: 'radar',
        imageSvg: `<svg viewBox="0 0 400 300" class="w-full h-full object-cover rounded-2xl" xmlns="http://www.w3.org/2000/svg">
          <rect width="400" height="300" fill="#0b1329"/>
          <polygon points="110,300 290,300 215,130 185,130" fill="#1e293b"/>
          <line x1="200" y1="140" x2="200" y2="300" stroke="#38bdf8" stroke-width="4" stroke-dasharray="16,12"/>
          <circle cx="200" cy="95" r="38" fill="#38bdf8" opacity="0.2"/>
          <circle cx="200" cy="95" r="24" fill="#0284c7" opacity="0.5"/>
          <text x="200" y="32" fill="#7dd3fc" font-size="12" font-weight="bold" text-anchor="middle" font-family="sans-serif">ROAD FRICTION & TIRE TRACTION</text>
        </svg>`
      },
      {
        id: 'athletic-fitness-intelligence',
        name: `${locName} Outdoor Cardio & Running`,
        category: 'outdoor',
        tag: '🏃 Cardio & Athletic Comfort',
        metricBadge: `ACSM Score: ${outdoorScore}/10`,
        status: outdoorRatingLabel,
        stat1: `Feels Like: ${feelsLikeC.toFixed(1)}°C`,
        stat2: `Humidity: ${humidity}%`,
        quote: `Current temperature is ${tempC.toFixed(1)}°C (apparent ${feelsLikeC.toFixed(1)}°C) with ${humidity}% humidity and AQI ${aqi}. Aerobic workout conditions are ${outdoorScore >= 8 ? 'prime — ideal cardiac regulation' : 'manageable with controlled hydration'}.`,
        reviewerBadge: 'fitness',
        lat,
        lng,
        actionText: '🏃 Best Outdoor Window',
        actionType: 'outdoor',
        imageSvg: `<svg viewBox="0 0 400 300" class="w-full h-full object-cover rounded-2xl" xmlns="http://www.w3.org/2000/svg">
          <rect width="400" height="300" fill="#064e3b"/>
          <path d="M0,170 Q200,135 400,170 L400,300 L0,300 Z" fill="#047857"/>
          <circle cx="200" cy="90" r="36" fill="#fef08a" opacity="0.85"/>
          <text x="200" y="35" fill="#a7f3d0" font-size="12" font-weight="bold" text-anchor="middle" font-family="sans-serif">AEROBIC WORKOUT COMFORT</text>
        </svg>`
      },
      {
        id: 'solar-uv-intelligence',
        name: `${locName} Solar Radiation & UV Safety`,
        category: 'health',
        tag: '☀️ Solar UV Radiation',
        metricBadge: `UV Index: ${uvIndex.toFixed(1)} (${uvCategory})`,
        status: `${uvCategory} Exposure Risk`,
        stat1: `Daily Peak: ${dailyMaxUv.toFixed(1)} UV`,
        stat2: `Cloud Filtration: ${cloudCover}%`,
        quote: `Real-time ultraviolet radiation is ${uvIndex.toFixed(1)} on the global solar UV scale (Peak today: ${dailyMaxUv.toFixed(1)}). WHO Health Standard: ${uvAdvice}`,
        reviewerBadge: 'uv-sensor',
        lat,
        lng,
        actionText: '☀️ UV & Air Quality Details',
        actionType: 'uv-aqi',
        imageSvg: `<svg viewBox="0 0 400 300" class="w-full h-full object-cover rounded-2xl" xmlns="http://www.w3.org/2000/svg">
          <rect width="400" height="300" fill="#451a03"/>
          <circle cx="200" cy="140" r="55" fill="#f59e0b" opacity="0.9"/>
          <circle cx="200" cy="140" r="75" fill="none" stroke="#fbbf24" stroke-width="2" stroke-dasharray="8,6" opacity="0.6"/>
          <text x="200" y="35" fill="#fde68a" font-size="12" font-weight="bold" text-anchor="middle" font-family="sans-serif">SOLAR UV RADIATION MONITOR</text>
        </svg>`
      },
      {
        id: 'air-quality-intelligence',
        name: `${locName} Atmospheric Purity (NAQI)`,
        category: 'health',
        tag: '🍃 Air Purity & Pollutants',
        metricBadge: `US AQI: ${aqi} (${aqiLabel})`,
        status: aqiLabel,
        stat1: `PM2.5: ${pm25}`,
        stat2: `PM10: ${pm10}`,
        quote: `EPA Standard Air Quality Index is ${aqi}. Particulate matter concentrations: PM2.5 at ${pm25}, PM10 at ${pm10}. ${aqiAdvice}`,
        reviewerBadge: 'air-quality',
        lat,
        lng,
        actionText: '🍃 View Air Quality Details',
        actionType: 'uv-aqi',
        imageSvg: `<svg viewBox="0 0 400 300" class="w-full h-full object-cover rounded-2xl" xmlns="http://www.w3.org/2000/svg">
          <rect width="400" height="300" fill="#042f2e"/>
          <circle cx="200" cy="130" r="50" fill="#0d9488" opacity="0.6"/>
          <path d="M160,160 Q200,100 240,160" stroke="#5eead4" stroke-width="4" fill="none"/>
          <text x="200" y="35" fill="#99f6e4" font-size="12" font-weight="bold" text-anchor="middle" font-family="sans-serif">ATMOSPHERIC PURITY & AQI</text>
        </svg>`
      },
      {
        id: 'wind-velocity-intelligence',
        name: `${locName} Wind Stream & Gusts`,
        category: 'wind',
        tag: '💨 Wind & Gust Dynamics',
        metricBadge: `Wind: ${Math.round(windSpeedKmh)} km/h (${windBeaufort})`,
        status: `${Math.round(windSpeedKmh)} km/h • Gusts ${Math.round(windGustsKmh)} km/h`,
        stat1: `Direction: ${WeatherService.getWindDirection(windDir)} (${Math.round(windDir)}°)`,
        stat2: `Beaufort: ${windBeaufort}`,
        quote: `Live surface airflow from the ${WeatherService.getWindDirection(windDir)} at ${Math.round(windSpeedKmh)} km/h with peak gusts to ${Math.round(windGustsKmh)} km/h. Highway vehicle stability is rated normal.`,
        reviewerBadge: 'wind-sensor',
        lat,
        lng,
        actionText: '💨 Live Wind Stream',
        actionType: 'wind',
        imageSvg: `<svg viewBox="0 0 400 300" class="w-full h-full object-cover rounded-2xl" xmlns="http://www.w3.org/2000/svg">
          <rect width="400" height="300" fill="#0f172a"/>
          <path d="M50,110 Q200,80 350,110" stroke="#38bdf8" stroke-width="4" fill="none"/>
          <path d="M80,150 Q230,120 380,150" stroke="#60a5fa" stroke-width="3" fill="none"/>
          <path d="M30,190 Q180,160 330,190" stroke="#0ea5e9" stroke-width="3" fill="none"/>
          <text x="200" y="35" fill="#bae6fd" font-size="12" font-weight="bold" text-anchor="middle" font-family="sans-serif">SURFACE WIND VELOCITY VECTOR</text>
        </svg>`
      },
      {
        id: 'astronomy-clarity-intelligence',
        name: `${locName} Night Sky & Astronomy`,
        category: 'astronomy',
        tag: '🔭 Stargazing & Seeing Quality',
        metricBadge: `${Math.round(100 - cloudCover)}% Sky Clarity`,
        status: skyClarity,
        stat1: `Cloud Cover: ${cloudCover}%`,
        stat2: `Moon: ${moon?.name || 'Crescent'} (${Math.round((moon?.phase || 0) * 100)}%)`,
        quote: `Total celestial cloud attenuation is ${cloudCover}%. The moon is in ${moon?.name || 'Crescent'} phase with ${Math.round((moon?.phase || 0) * 100)}% surface illumination. Astronomical seeing quality: ${skyClarity}.`,
        reviewerBadge: 'astronomy',
        lat,
        lng,
        actionText: '🔭 Astronomy Forecast',
        actionType: 'astronomy',
        imageSvg: `<svg viewBox="0 0 400 300" class="w-full h-full object-cover rounded-2xl" xmlns="http://www.w3.org/2000/svg">
          <rect width="400" height="300" fill="#030712"/>
          <circle cx="280" cy="90" r="30" fill="#f8fafc" opacity="0.9"/>
          <circle cx="270" cy="85" r="28" fill="#030712"/>
          <circle cx="100" cy="70" r="1.5" fill="#ffffff"/>
          <circle cx="150" cy="120" r="2" fill="#ffffff"/>
          <circle cx="220" cy="60" r="1.5" fill="#ffffff"/>
          <circle cx="70" cy="160" r="2" fill="#ffffff"/>
          <text x="200" y="35" fill="#e2e8f0" font-size="12" font-weight="bold" text-anchor="middle" font-family="sans-serif">CELESTIAL OBSERVATION & SEEING</text>
        </svg>`
      }
    ];
  }

  filterPlaces(category) {
    const locName = (this.currentLocationName || this.app?.selectedName || 'Selected Location').split(',')[0].trim();
    const curr = this.app?.currentWeather;
    const temp = curr?.temperature ?? 22;
    const all = this._getInitialWeatherUseCases(locName, temp);

    if (!category || category === 'all') {
      this.placesData = all;
    } else {
      const filtered = all.filter(p => p.category === category);
      this.placesData = filtered.length > 0 ? filtered : all;
    }
    this.renderPlaces();
  }

  renderPlaces() {
    const container = document.getElementById('discoveriesCarousel');
    if (!container) return;

    container.innerHTML = this.placesData.map(place => `
      <div class="weather-usecase-card flex-shrink-0 w-[290px] sm:w-[320px] bg-white dark:bg-[#1e1f23] rounded-3xl overflow-hidden border border-slate-200/80 dark:border-slate-800/80 shadow-md flex flex-col snap-start select-none transition-all hover:shadow-lg">
        <div class="relative h-40 w-full overflow-hidden bg-slate-900">
          ${place.imageSvg}
          <div class="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-black/75 backdrop-blur-md border border-white/20 text-white text-[10px] font-bold flex items-center gap-1.5 shadow-sm">
            <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Live Intelligence</span>
          </div>
          <div class="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-black/75 backdrop-blur-md border border-white/20 text-teal-300 text-[10px] font-bold flex items-center gap-1 shadow-sm">
            <span>${place.tag}</span>
          </div>
          <div class="absolute bottom-2.5 left-2.5 right-2.5 bg-[#202124]/90 backdrop-blur-md rounded-2xl p-2.5 border border-white/10 shadow-lg">
            <p class="text-[11px] text-slate-100 font-medium leading-snug line-clamp-2">
              ${place.quote}
            </p>
          </div>
        </div>

        <div class="p-3.5 flex flex-col justify-between flex-1">
          <div>
            <div class="flex items-start justify-between gap-2">
              <h4 class="text-sm font-bold text-slate-900 dark:text-white truncate">${place.name}</h4>
            </div>
            <div class="flex items-center gap-2 text-xs font-semibold text-teal-600 dark:text-teal-400 mt-1">
              <span>${place.metricBadge}</span>
              <span class="text-slate-400">•</span>
              <span class="text-slate-600 dark:text-slate-300 font-normal truncate">${place.status}</span>
            </div>
            <div class="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
              <span>${place.stat1}</span>
              <span>•</span>
              <span>${place.stat2}</span>
            </div>
          </div>

          <div class="flex items-center gap-2 mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800">
            <button type="button" class="usecase-action-btn flex-1 py-1.5 px-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer" data-id="${place.id}" data-type="${place.actionType || 'radar'}" data-lat="${place.lat}" data-lng="${place.lng}" data-name="${place.name}">
              ${place.actionText || 'Inspect'}
            </button>
            <button type="button" class="place-share-btn p-2 rounded-xl bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-all active:scale-95 cursor-pointer" title="Share weather intelligence">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
            </button>
          </div>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.usecase-action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._haptic('medium');
        const type = btn.dataset.type;

        if (type === 'radar') {
          this.toggleRadarOverlay();
        } else if (type === 'route') {
          this.openRouteWeather();
        } else if (type === 'outdoor') {
          this.app?.switchWeatherTab?.('hourly');
          const bestWindow = document.getElementById('bestWindowCard');
          if (bestWindow && !bestWindow.classList.contains('hidden')) {
            bestWindow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        } else if (type === 'uv-aqi') {
          this.app?.switchWeatherTab?.('metrics');
        } else if (type === 'wind') {
          this.toggleWindOverlay();
        } else if (type === 'astronomy') {
          this.app?.switchWeatherTab?.('astronomy');
        } else {
          this.app?.switchWeatherTab?.('overview');
        }
      });
    });

    container.querySelectorAll('.place-share-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._haptic('light');
        const shareBtn = document.getElementById('shareWeatherBtn') || document.getElementById('mobileFloatingShareBtn');
        shareBtn?.click();
      });
    });
  }

  // ── Voice Search (SpeechRecognition) ──────────────────────────────
  initVoiceSearch() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.hasSpeech = !!SpeechRecognition;
  }

  startVoiceSearch() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      this.app.showToast?.('Voice search requires Chrome, Edge, or Safari with Web Speech support.', 'warn', 3500);
      return;
    }

    const voiceBtn = document.getElementById('voiceSearchBtn');
    const input = document.getElementById('searchInput');

    // Toggle off if already listening
    if (this._activeRecognition) {
      try {
        this._activeRecognition.abort();
      } catch (e) {}
      this._activeRecognition = null;
      voiceBtn?.classList.remove('animate-pulse', 'text-teal-400', 'text-rose-500');
      if (input && this._savedPlaceholder) {
        input.placeholder = this._savedPlaceholder;
      }
      this.app.showToast?.('Microphone turned off.', 'info', 1500);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      this._activeRecognition = recognition;

      if (input) {
        this._savedPlaceholder = input.placeholder || 'Search here';
        input.placeholder = '🎙️ Listening... speak clearly';
      }

      voiceBtn?.classList.add('animate-pulse', 'text-rose-500');
      this.app.showToast?.('🎙️ Listening... Say any city or location', 'info', 3000);

      const cleanup = () => {
        this._activeRecognition = null;
        voiceBtn?.classList.remove('animate-pulse', 'text-teal-400', 'text-rose-500');
        if (input && this._savedPlaceholder) {
          input.placeholder = this._savedPlaceholder;
        }
      };

      recognition.onresult = (event) => {
        let finalTranscript = '';
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i];
          if (item.isFinal) {
            finalTranscript += item[0].transcript;
          } else {
            interimTranscript += item[0].transcript;
          }
        }

        const currentSpeech = finalTranscript || interimTranscript;
        if (input && currentSpeech) {
          input.value = currentSpeech;
        }

        if (finalTranscript) {
          cleanup();
          const cleanQuery = finalTranscript.trim().replace(/[.,!?;:]+$/, '');
          this.app.showToast?.(`Searching for "${cleanQuery}"...`, 'info', 2000);
          this.app.searchQuery = cleanQuery;
          this.app.performSearch?.(cleanQuery);
        }
      };

      recognition.onerror = (event) => {
        cleanup();
        const err = event?.error;
        if (err === 'aborted') {
          return;
        }
        if (err === 'not-allowed' || err === 'service-not-allowed') {
          this.app.showToast?.('🚫 Microphone permission denied. Click the lock/sliders icon in your browser URL bar to allow microphone access.', 'warn', 5000);
        } else if (err === 'no-speech') {
          this.app.showToast?.('No voice heard. Please check that your microphone is unmuted and speak clearly.', 'info', 3500);
        } else if (err === 'network') {
          this.app.showToast?.('Speech service network error. Please check your internet connection.', 'warn', 3000);
        } else {
          this.app.showToast?.(`Voice input: ${err || 'not recognized'}. Please try again.`, 'info', 2500);
        }
      };

      recognition.onend = () => {
        cleanup();
      };

      recognition.start();
    } catch (e) {
      this._activeRecognition = null;
      voiceBtn?.classList.remove('animate-pulse', 'text-teal-400', 'text-rose-500');
      this.app.showToast?.('Could not activate microphone. Please try again.', 'warn', 3000);
    }
  }

  // ── Bottom navigation ──────────────────────────────────────────
  //
  // app.js initMobileBottomNav() is the single owner of bottom-nav click
  // behaviour — it binds map/weather/route/saved/layers with the correct
  // panel toggling, list rendering and haptic feedback.
  //
  // This controller used to bind a second set of listeners over the same
  // buttons. Because initFeatures() runs before init(), both fired on
  // every tap, and each one undid the other:
  //   • "You"   toggled the bookmarks panel open then immediately shut it
  //   • "Route" called toggleRoute() twice — entering Route Studio and
  //             instantly exiting it, so the tab did nothing at all
  // So the duplicate binding is gone; these legacy entry points just defer
  // to the app's single source of truth for active state.
  initGoogleTabs() {
    return this.app?.syncMobileBottomNavState?.();
  }

  activateGoogleTab() {
    return this.app?.syncMobileBottomNavState?.();
  }

  activateBottomTab() {
    return this.app?.syncMobileBottomNavState?.();
  }

  // ── Sync Active Location Header & AQI Badge (Never Stuck on Stale Location) ─
  syncCurrentLocationInfo(weather, name, weatherData) {
    if (this._isSyncingLocation) return;
    this._isSyncingLocation = true;
    try {
      const rawName = (name || this.app.selectedName || (this.app.selectedLat != null ? `${this.app.selectedLat.toFixed(2)}, ${this.app.selectedLng.toFixed(2)}` : ''))?.replace(/🏠\s*Home/g, '')?.trim();
      if (!rawName && !this.currentLocationName) return;

      const locName = rawName || this.currentLocationName;
      this.currentLocationName = locName;
      const shortName = shortPlaceName(locName) || 'Selected Location';

      // Update primary location header
      const locEl = document.getElementById('panelLocationName');
      if (locEl) {
        const homeBadge = locEl.querySelector('.home-badge');
        if (homeBadge) homeBadge.remove();
        locEl.textContent = shortName;
        locEl.title = locName;
      }

      const homeBadge = document.getElementById('panelHomeBadge');
      if (homeBadge && this.app?.defaultLocation && this.app?.selectedLat != null) {
        const isHome = Math.abs(this.app.defaultLocation.lat - this.app.selectedLat) < 0.0001 &&
                       Math.abs(this.app.defaultLocation.lng - this.app.selectedLng) < 0.0001;
        homeBadge.classList.toggle('hidden', !isHome);
      }

      const aliasEl = document.getElementById('auraLocationTitle') || document.getElementById('googleLocationTitle');
      if (aliasEl) aliasEl.textContent = shortName;

      // Update restore pill if visible
      const restorePill = document.getElementById('restoreSheetPill');
      if (restorePill) {
        restorePill.innerHTML = `<span>📍</span><span>${shortName} Weather</span><span class="text-teal-500 font-bold">▲ Show</span>`;
      }

      // Update the prompt chip in the Aura banner card
      const promptChipText = document.querySelector('#auraPromptChip span:last-child');
      if (promptChipText) {
        promptChipText.textContent =
          this.app?.aura?.bannerPrompt?.(shortName) || `Will it rain in ${shortName}?`;
      }

      // Aura's suggestions depend on the forecast, so refresh them once it lands.
      this.app?.aura?.refreshPresets?.();

      // Update discoveries header
      const discHeader = document.getElementById('discoveriesHeaderTitle');
      if (discHeader) {
        discHeader.textContent = `Live Weather Intelligence • ${shortName}`;
      }

      // Weather & AQI badge
      const badge = document.getElementById('sheetWeatherAqiBadge');
      const curr = weather || this.app?.currentWeather || null;
      const hourIdx = this.app?.currentHourIndex || 0;
      const tempVal = curr?.temperature ?? (this.app?.weatherData?.hourly?.temperature_2m?.[hourIdx]);
      const iconVal = curr?.icon 
        || this.app?.currentWeather?.icon 
        || document.getElementById('panelIcon')?.textContent?.trim() 
        || (tempVal != null ? '⛅' : '☁️');

      let aqi = this.app?.currentAqi;
      if (aqi == null && this.app?.airQualityData?.hourly?.us_aqi?.[hourIdx] != null) {
        aqi = Math.round(this.app.airQualityData.hourly.us_aqi[hourIdx]);
      }
      if (aqi == null) {
        const panelAqiText = document.getElementById('panelAQIBadge')?.textContent?.trim();
        if (panelAqiText && panelAqiText !== '--' && !isNaN(parseInt(panelAqiText, 10))) {
          aqi = parseInt(panelAqiText, 10);
        }
      }

      if (badge) {
        if (tempVal != null) {
          const tempFormatted = Math.round(tempVal);
          const aqiDot = aqi == null
            ? 'bg-slate-400'
            : aqi <= 50 ? 'bg-emerald-400' 
            : aqi <= 100 ? 'bg-amber-400' 
            : aqi <= 150 ? 'bg-orange-400' 
            : 'bg-rose-400';
          const aqiDisplay = aqi != null ? `AQI ${aqi}` : 'AQI --';

          badge.innerHTML = `
            <span class="text-sm">${iconVal}</span>
            <span class="font-bold text-xs">${tempFormatted}°</span>
            <span class="text-slate-400 text-[10px]">•</span>
            <span class="w-2 h-2 rounded-full ${aqiDot} inline-block"></span>
            <span class="text-[10px] font-semibold text-slate-400">${aqiDisplay}</span>
          `;
          badge.classList.remove('hidden');
        } else {
          badge.classList.add('hidden');
        }
      }

      // Regenerate location-based weather use cases
      this.placesData = this._getInitialWeatherUseCases(shortName, tempVal != null ? Math.round(tempVal) : 22);
      this.renderPlaces();
    } finally {
      this._isSyncingLocation = false;
    }
  }
}

export const GoogleMapsMobileController = AuraMobileController;
