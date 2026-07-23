// src/icons.js - Standardized SVG icon system for Aurafisky
// Consolidated, reusable SVG icons with shared gradients/filters

// Shared gradient & filter definitions (must be defined before IconSystem)
const ICON_DEFS = `
  <defs>
    <!-- Gradients -->
    <linearGradient id="ic-sun" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#ff9f1c"/>
      <stop offset="100%" stop-color="#e84c3c"/>
    </linearGradient>
    <linearGradient id="ic-sun-ray" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#ffb347"/>
      <stop offset="100%" stop-color="#ff8a00"/>
    </linearGradient>
    <linearGradient id="ic-cloud-pink" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#e84c88"/>
      <stop offset="100%" stop-color="#c23365"/>
    </linearGradient>
    <linearGradient id="ic-cloud-purple" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2dd4bf"/>
      <stop offset="100%" stop-color="#0d9488"/>
    </linearGradient>
    <linearGradient id="ic-wind" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#0f766e"/>
      <stop offset="100%" stop-color="#2dd4bf"/>
    </linearGradient>
    <linearGradient id="ic-rain" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#64b5f6"/>
      <stop offset="100%" stop-color="#2196f3"/>
    </linearGradient>
    <linearGradient id="ic-snow" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#e0e0e0"/>
      <stop offset="100%" stop-color="#bdbdbd"/>
    </linearGradient>
    <linearGradient id="ic-fog" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#bbbbbb"/>
      <stop offset="100%" stop-color="#9e9e9e"/>
    </linearGradient>
    <linearGradient id="ic-thunder" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#ffd600"/>
      <stop offset="100%" stop-color="#ff6d00"/>
    </linearGradient>

    <!-- Filters -->
    <filter id="ic-glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="2" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="ic-shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="#000" flood-opacity="0.15"/>
    </filter>
  </defs>
`;

const IconSystem = {
  // Weather condition icons (24x24 viewBox for UI)
  weather: {
    // Shared cloud path fragments (consistent fill + depth across all variants)
    // Clear sky (day)
    sun: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">${ICON_DEFS}
      <circle cx="12" cy="12" r="10" fill="url(#ic-sun)"/>
      <path d="M12 2v2M12 20v2M4.93 4.93l1.42-1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42 1.42M17.65 6.35l1.42-1.42" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`,

    // Mainly clear (day)
    "sun-cloud": `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">${ICON_DEFS}
      <circle cx="12" cy="12" r="8" fill="url(#ic-sun)"/>
      <path d="M4 12h2M18 12h2M12 4v2M12 18v2M5.66 5.66l1.42-1.42M16.92 16.92l1.42 1.42M5.66 18.34l1.42 1.42M16.92 7.08l1.42-1.42" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M4 8a4 4 0 014-4h4a4 4 0 010 8h-4a4 4 0 01-4-4z" fill="url(#ic-cloud-purple)" opacity="0.85"/>
    </svg>`,

    // Partly cloudy (day)
    "cloud-sun": `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">${ICON_DEFS}
      <circle cx="18" cy="6" r="4" fill="url(#ic-sun)"/>
      <path d="M4 8a4 4 0 014-4h4a4 4 0 010 8h-4a4 4 0 01-4-4z" fill="url(#ic-cloud-purple)" opacity="0.85"/>
      <path d="M8 14a6 6 0 0112 0h1a2 2 0 012 2v2a2 2 0 01-2 2h-1a2 2 0 00-2 2H7a2 2 0 00-2-2v-2a2 2 0 00-2-2h1z" fill="url(#ic-cloud-purple)" opacity="0.85"/>
    </svg>`,

    // Overcast
    cloud: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">${ICON_DEFS}
      <path d="M4 8a4 4 0 014-4h4a4 4 0 010 8h-4a4 4 0 01-4-4z" fill="url(#ic-cloud-purple)" opacity="0.85"/>
      <path d="M8 14a6 6 0 0112 0h1a2 2 0 012 2v2a2 2 0 01-2 2h-1a2 2 0 00-2 2H7a2 2 0 00-2-2v-2a2 2 0 00-2-2h1z" fill="url(#ic-cloud-purple)" opacity="0.85"/>
    </svg>`,

    // Fog
    fog: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">${ICON_DEFS}
      <path d="M4 12h2M18 12h2M12 4v2M12 18v2M5.66 5.66l1.42-1.42M16.92 16.92l1.42 1.42M5.66 18.34l1.42 1.42M16.92 7.08l1.42-1.42" stroke="url(#ic-fog)" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M4 8a4 4 0 014-4h4a4 4 0 010 8h-4a4 4 0 01-4-4z" fill="url(#ic-cloud-purple)" opacity="0.6"/>
      <path d="M8 14a6 6 0 0112 0h1a2 2 0 012 2v2a2 2 0 01-2 2h-1a2 2 0 00-2 2H7a2 2 0 00-2-2v-2a2 2 0 00-2-2h1z" fill="url(#ic-cloud-purple)" opacity="0.6"/>
    </svg>`,

    // Light drizzle
    "cloud-drizzle": `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">${ICON_DEFS}
      <path d="M4 8a4 4 0 014-4h4a4 4 0 010 8h-4a4 4 0 01-4-4z" fill="url(#ic-cloud-purple)" opacity="0.85"/>
      <path d="M8 14a6 6 0 0112 0h1a2 2 0 012 2v2a2 2 0 01-2 2h-1a2 2 0 00-2 2H7a2 2 0 00-2-2v-2a2 2 0 00-2-2h1z" fill="url(#ic-cloud-purple)" opacity="0.85"/>
      <path d="M6 16h1M10 16h1M14 16h1M18 16h1M6 19h1M10 19h1M14 19h1M18 19h1" stroke="url(#ic-rain)" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`,

    // Rain
    "cloud-rain": `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">${ICON_DEFS}
      <path d="M4 8a4 4 0 014-4h4a4 4 0 010 8h-4a4 4 0 01-4-4z" fill="url(#ic-cloud-purple)" opacity="0.85"/>
      <path d="M8 14a6 6 0 0112 0h1a2 2 0 012 2v2a2 2 0 01-2 2h-1a2 2 0 00-2 2H7a2 2 0 00-2-2v-2a2 2 0 00-2-2h1z" fill="url(#ic-cloud-purple)" opacity="0.85"/>
      <path d="M7 16v4M11 16v4M15 16v4M19 16v4" stroke="url(#ic-rain)" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`,

    // Snow
    "cloud-snow": `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">${ICON_DEFS}
      <path d="M4 8a4 4 0 014-4h4a4 4 0 010 8h-4a4 4 0 01-4-4z" fill="url(#ic-cloud-purple)" opacity="0.85"/>
      <path d="M8 14a6 6 0 0112 0h1a2 2 0 012 2v2a2 2 0 01-2 2h-1a2 2 0 00-2 2H7a2 2 0 00-2-2v-2a2 2 0 00-2-2h1z" fill="url(#ic-cloud-purple)" opacity="0.85"/>
      <path d="M7 16v4M11 16v4M15 16v4M19 16v4" stroke="url(#ic-snow)" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M7 18h3M11 18h3M15 18h3" stroke="url(#ic-snow)" stroke-width="1" stroke-linecap="round"/>
    </svg>`,

    // Heavy snow
    snow: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">${ICON_DEFS}
      <path d="M7 12v8M12 12v8M17 12v8" stroke="url(#ic-snow)" stroke-width="2" stroke-linecap="round"/>
      <path d="M5 14h4M10 14h4M15 14h4M5 18h4M10 18h4M15 18h4" stroke="url(#ic-snow)" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`,

    // Thunderstorm
    "cloud-thunderstorm": `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">${ICON_DEFS}
      <path d="M4 8a4 4 0 014-4h4a4 4 0 010 8h-4a4 4 0 01-4-4z" fill="url(#ic-cloud-purple)" opacity="0.85"/>
      <path d="M8 14a6 6 0 0112 0h1a2 2 0 012 2v2a2 2 0 01-2 2h-1a2 2 0 00-2 2H7a2 2 0 00-2-2v-2a2 2 0 00-2-2h1z" fill="url(#ic-cloud-purple)" opacity="0.85"/>
      <path d="M10 16v4M14 16v4" stroke="url(#ic-rain)" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M12 20l-2 4h4l-2-4z" fill="url(#ic-thunder)"/>
    </svg>`,

    // Night variants
    moon: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">${ICON_DEFS}
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" fill="url(#ic-sun)" opacity="0.9"/>
      <circle cx="12" cy="12" r="4" fill="#fff" opacity="0.15"/>
    </svg>`,

    "cloud-moon": `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">${ICON_DEFS}
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" fill="url(#ic-sun)" opacity="0.9"/>
      <path d="M4 8a4 4 0 014-4h4a4 4 0 010 8h-4a4 4 0 01-4-4z" fill="url(#ic-cloud-purple)" opacity="0.85"/>
      <path d="M8 14a6 6 0 0112 0h1a2 2 0 012 2v2a2 2 0 01-2 2h-1a2 2 0 00-2 2H7a2 2 0 00-2-2v-2a2 2 0 00-2-2h1z" fill="url(#ic-cloud-purple)" opacity="0.85"/>
    </svg>`,

    // Wind (day/night same)
    wind: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">${ICON_DEFS}
      <path d="M9.59 4.59A2 2 0 1111 8H2m10.59 11.41A2 2 0 1014 16H2m15.73-8.27A2.5 2.5 0 1119.5 12H2" stroke="url(#ic-wind)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
  },

  // UI icons (24x24)
  ui: {
    search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>`,
    location: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
    layers: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>`,
    settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
    close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    menu: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`,
    "chevron-down": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`,
    "chevron-up": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>`,
    "chevron-left": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`,
    "chevron-right": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`,
    bookmark: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`,
    "bookmark-filled": `<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`,
    compare: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 16 12 12 6 16"/><polyline points="6 8 12 12 18 8"/></svg>`,
    chart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
    radar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
    sound: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`,
    "sound-off": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`,
    home: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
    refresh: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`,
    info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
    warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
    calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
    clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    "wind-compass": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="12 2 15 8 12 8"/><polygon points="12 22 15 16 12 16"/><polygon points="2 12 8 15 8 12"/><polygon points="22 12 16 15 16 12"/></svg>`,
    thermometer: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9a4 4 0 0 0-4 4v7a2 2 0 0 0 4 0v-5a2 2 0 0 1 4 0v5a2 2 0 0 0 4 0v-7a4 4 0 0 0-4-4z"/></svg>`,
  },

  // App-level icons (logo, favicon)
  app: {
    favicon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">${ICON_DEFS}
      <circle cx="50" cy="36" r="18" fill="url(#ic-sun)"/>
      <path d="M50 2v2M50 70v2M18 18l10-10M70 70l10 10M2 50h2M70 50h2M18 70l10 10M70 18l10-10" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
    </svg>`,
    logo: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">${ICON_DEFS}
      <!-- Sun rays -->
      <g fill="#ff9f1c">
        <polygon points="50,11 46.5,18 53.5,18" transform="rotate(-60, 50, 36)" />
        <polygon points="50,11 46.5,18 53.5,18" transform="rotate(-40, 50, 36)" />
        <polygon points="50,11 46.5,18 53.5,18" transform="rotate(-20, 50, 36)" />
        <polygon points="50,11 46.5,18 53.5,18" transform="rotate(0, 50, 36)" />
        <polygon points="50,11 46.5,18 53.5,18" transform="rotate(20, 50, 36)" />
        <polygon points="50,11 46.5,18 53.5,18" transform="rotate(40, 50, 36)" />
        <polygon points="50,11 46.5,18 53.5,18" transform="rotate(60, 50, 36)" />
      </g>

      <!-- Sun -->
      <circle cx="50" cy="36" r="18" fill="#e84c3c" stroke="#ffffff" stroke-width="3" stroke-linejoin="round" />

      <!-- Wind dashes left -->
      <line x1="20" y1="38" x2="26" y2="38" stroke="#593c7d" stroke-width="3" stroke-linecap="round" />
      <line x1="16" y1="44" x2="24" y2="44" stroke="#593c7d" stroke-width="3" stroke-linecap="round" />

      <!-- Wind dash top-right -->
      <line x1="68" y1="32" x2="76" y2="32" stroke="#593c7d" stroke-width="3" stroke-linecap="round" />

      <!-- Wind lines bottom -->
      <line x1="33" y1="70" x2="37" y2="70" stroke="#593c7d" stroke-width="3" stroke-linecap="round" />
      <path d="M 40,70 h 15 C 57,70 59,72 59,74 C 59,76 57,78 55,78 C 53,78 52,76 53,74" stroke="#593c7d" stroke-width="3" stroke-linecap="round" fill="none" />
      <line x1="62" y1="70" x2="67" y2="70" stroke="#593c7d" stroke-width="3" stroke-linecap="round" />
    </svg>`,
  },

  // Marker icon generator
  marker: {
    build: function (weatherCode, isDay, tempStr, description, icon) {
      return `<svg viewBox="0 0 90 60" xmlns="http://www.w3.org/2000/svg" width="90" height="60">
          <defs>
            <style>
              .marker-bg { filter: drop-shadow(0 4px 8px rgba(0,0,0,0.15)); }
            </style>
          </defs>
          <rect x="2" y="2" width="86" height="56" rx="12" fill="white" class="marker-bg" stroke="#e2e8f0" stroke-width="2"/>
          <div style="display: block; text-align: center; padding-top: 8px;">
            <div style="font-size: 28px; line-height: 1;">${icon}</div>
            <div style="font-size: 18px; font-weight: 700; color: #1e293b; line-height: 1.2; margin-top: 4px;">${tempStr}</div>
            <div style="font-size: 10px; color: #64748b; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 80px;">${description}</div>
          </div>
        </svg>`.trim();
    },
  },

  // ==========================================
  // PUBLIC API
  // ==========================================

  /**
   * Get weather icon SVG by WMO code
   * @param {number} code - WMO weather code
   * @param {boolean} isDay - Whether it's daytime
   * @returns {string} SVG string
   */
  getWeatherIcon: function (code, isDay = true) {
    const weatherMap = {
      0: { day: "sun", night: "moon" },
      1: { day: "sun-cloud", night: "cloud-moon" },
      2: { day: "cloud-sun", night: "cloud" },
      3: { day: "cloud", night: "cloud" },
      45: { day: "fog", night: "fog" },
      48: { day: "fog", night: "fog" },
      51: { day: "cloud-drizzle", night: "cloud-rain" },
      53: { day: "cloud-drizzle", night: "cloud-rain" },
      55: { day: "cloud-rain", night: "cloud-rain" },
      56: { day: "cloud-rain", night: "cloud-rain" },
      57: { day: "cloud-rain", night: "cloud-rain" },
      61: { day: "cloud-rain", night: "cloud-rain" },
      63: { day: "cloud-rain", night: "cloud-rain" },
      65: { day: "cloud-rain", night: "cloud-rain" },
      66: { day: "cloud-rain", night: "cloud-rain" },
      67: { day: "cloud-rain", night: "cloud-rain" },
      71: { day: "cloud-snow", night: "cloud-snow" },
      73: { day: "cloud-snow", night: "cloud-snow" },
      75: { day: "snow", night: "snow" },
      77: { day: "snow", night: "snow" },
      80: { day: "cloud-rain", night: "cloud-rain" },
      81: { day: "cloud-rain", night: "cloud-rain" },
      82: { day: "cloud-thunderstorm", night: "cloud-thunderstorm" },
      85: { day: "cloud-snow", night: "cloud-snow" },
      86: { day: "snow", night: "snow" },
      95: { day: "cloud-thunderstorm", night: "cloud-thunderstorm" },
      96: { day: "cloud-thunderstorm", night: "cloud-thunderstorm" },
      99: { day: "cloud-thunderstorm", night: "cloud-thunderstorm" },
    };

    const weather = weatherMap[code] || weatherMap[0];
    const iconKey = isDay ? weather.day : weather.night;
    return this.weather[iconKey] || this.weather["sun"];
  },

  /**
   * Get UI icon SVG by name
   * @param {string} name - Icon name
   * @returns {string} SVG string
   */
  getUI: function (name) {
    return this.ui[name] || "";
  },

  /**
   * Get favicon SVG
   * @returns {string} SVG string
   */
  getFavicon: function () {
    return this.app.favicon;
  },

  /**
   * Get logo SVG
   * @returns {string} SVG string
   */
  getLogo: function () {
    return this.app.logo;
  },

  /**
   * Get dynamic favicon SVG for current weather
   * @param {number} code - WMO weather code
   * @param {boolean} isDay - Whether it's daytime
   * @returns {string} Data URL for favicon
   */
  getDynamicFavicon: function (code, isDay = true) {
    const icon = this.getWeatherIcon(code, isDay);
    // Extract just the inner SVG content without wrapper
    const inner = icon.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
    const content = inner ? inner[1] : icon;
    return `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><g transform='scale(2) translate(26,26)'>${encodeURIComponent(content)}</g></svg>`;
  },

  /**
   * Inject all defs into document for reuse
   * Call once on app init
   */
  injectDefs: function () {
    if (document.getElementById("icon-system-defs")) return;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.style.display = "none";
    svg.id = "icon-system-defs";
    svg.innerHTML = ICON_DEFS;
    document.body.insertBefore(svg, document.body.firstChild);
  },
};

// Export for both module and global usage
if (typeof module !== "undefined" && module.exports) {
  module.exports = IconSystem;
} else if (typeof window !== "undefined") {
  window.IconSystem = IconSystem;
  // Backward compatibility
  window.WeatherIcons = {
    getIcon: (code, isDay) => IconSystem.getWeatherIcon(code, isDay),
    svgIcons: IconSystem.weather,
  };
}
