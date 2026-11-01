import { describe, it, expect } from 'vitest';
import { calculateCelestialSky, getCompassDirection, PROMINENT_STARS } from '../features/celestial.js';

describe('Celestial Astronomy Engine', () => {
  it('correctly maps azimuth degrees to 8-point compass directions', () => {
    expect(getCompassDirection(0)).toBe('N');
    expect(getCompassDirection(45)).toBe('NE');
    expect(getCompassDirection(90)).toBe('E');
    expect(getCompassDirection(180)).toBe('S');
    expect(getCompassDirection(270)).toBe('W');
    expect(getCompassDirection(359)).toBe('N');
  });

  it('calculates real planetary positions for any valid coordinate and date', () => {
    // Bengaluru / Kolar: ~13.13° N, 78.13° E
    const date = new Date('2026-10-21T18:00:00Z');
    const sky = calculateCelestialSky(13.13, 78.13, date);

    expect(sky).toBeDefined();
    expect(sky.planets).toHaveLength(5);
    
    // Check Venus, Mars, Jupiter, Saturn, Mercury
    const planetNames = sky.planets.map(p => p.name);
    expect(planetNames).toContain('Venus');
    expect(planetNames).toContain('Jupiter');
    expect(planetNames).toContain('Mars');
    expect(planetNames).toContain('Saturn');
    expect(planetNames).toContain('Mercury');

    sky.planets.forEach(p => {
      expect(typeof p.altitude).toBe('number');
      expect(typeof p.azimuth).toBe('number');
      expect(typeof p.magnitude).toBe('number');
      expect(typeof p.isAboveHorizon).toBe('boolean');
      expect(typeof p.isCurrentlyVisible).toBe('boolean');
      expect(p.direction).toMatch(/^[NSEW]+$/);
    });
  });

  it('calculates prominent star positions accurately', () => {
    const date = new Date('2026-10-21T21:00:00Z');
    const sky = calculateCelestialSky(51.5074, -0.1278, date); // London

    expect(sky.stars.length).toBe(PROMINENT_STARS.length);
    const sirius = sky.stars.find(s => s.name === 'Sirius');
    expect(sirius).toBeDefined();
    expect(sirius.constellation).toBe('Canis Major');
    expect(typeof sirius.altitude).toBe('number');
  });

  it('projects celestial coordinates into 2D sky dome correctly', async () => {
    const { projectToSkyDome } = await import('../features/celestial.js');
    // Zenith (90° Alt) should be at center (100, 100)
    const zenith = projectToSkyDome(90, 0, 80, 100, 100);
    expect(zenith.x).toBeCloseTo(100, 1);
    expect(zenith.y).toBeCloseTo(100, 1);
    expect(zenith.isVisible).toBe(true);

    // Below horizon should be marked not visible
    const below = projectToSkyDome(-10, 180, 80, 100, 100);
    expect(below.isVisible).toBe(false);
  });

  it('estimates Bortle light pollution scale and predicts meteor showers', () => {
    const sky = calculateCelestialSky(12.9716, 77.5946, new Date('2026-10-21')); // Bengaluru
    expect(sky.lightPollution).toBeDefined();
    expect(sky.lightPollution.bortleClass).toBeGreaterThanOrEqual(1);
    expect(sky.lightPollution.bortleClass).toBeLessThanOrEqual(9);

    expect(sky.meteorShowers).toBeDefined();
    expect(sky.meteorShowers.length).toBeGreaterThan(0);
    expect(sky.meteorShowers[0]).toHaveProperty('zhr');

    expect(sky.eclipses).toBeDefined();
  });

  it('calculates tracked satellites (ISS, Tiangong, Hubble) and prominent constellations', () => {
    const sky = calculateCelestialSky(12.9716, 77.5946, new Date('2026-10-21T18:30:00Z'));
    expect(sky.satellites).toBeDefined();
    expect(sky.satellites.length).toBeGreaterThanOrEqual(3);
    const iss = sky.satellites.find(s => s.id === 'iss');
    expect(iss).toBeDefined();
    expect(typeof iss.altitude).toBe('number');
    expect(typeof iss.distanceKm).toBe('number');
    expect(typeof iss.statusText).toBe('string');

    expect(sky.constellations).toBeDefined();
    expect(sky.constellations.length).toBeGreaterThan(0);
    const orion = sky.constellations.find(c => c.name === 'Orion');
    expect(orion).toBeDefined();
    expect(typeof orion.altitude).toBe('number');
    expect(typeof orion.season).toBe('string');
  });

  it('calculates real-time Sun and Moon positions and phase data', () => {
    // Noon UTC: Sun high above London / Greenwich
    const noonDate = new Date('2026-06-21T12:00:00Z');
    const noonSky = calculateCelestialSky(51.5, 0.0, noonDate);

    expect(noonSky.sun).toBeDefined();
    expect(noonSky.sun.name).toBe('Sun');
    expect(noonSky.sun.icon).toBe('☀️');
    expect(noonSky.sun.altitude).toBeGreaterThan(50);
    expect(noonSky.sun.isAboveHorizon).toBe(true);
    expect(noonSky.sun.isCurrentlyVisible).toBe(true);
    expect(noonSky.sun.magnitude).toBeLessThan(-20);

    // Midnight UTC: Sun well below horizon
    const nightDate = new Date('2026-06-21T00:00:00Z');
    const nightSky = calculateCelestialSky(51.5, 0.0, nightDate);
    expect(nightSky.sun.isAboveHorizon).toBe(false);
    expect(nightSky.sun.altitude).toBeLessThan(0);

    // Moon properties
    expect(noonSky.moon).toBeDefined();
    expect(noonSky.moon.name).toBe('Moon');
    expect(typeof noonSky.moon.phaseName).toBe('string');
    expect(typeof noonSky.moon.phasePercent).toBe('number');
    expect(typeof noonSky.moon.altitude).toBe('number');
    expect(noonSky.moon.direction).toMatch(/^[NSEW]+$/);
  });

  it('correctly maps moon phase angle degrees to lunar phases', async () => {
    const { getMoonPhaseDetails } = await import('../features/celestial.js');
    expect(getMoonPhaseDetails(0).name).toBe('New Moon');
    expect(getMoonPhaseDetails(90).name).toBe('First Quarter');
    expect(getMoonPhaseDetails(180).name).toBe('Full Moon');
    expect(getMoonPhaseDetails(270).name).toBe('Third Quarter');
  });

  it('returns null gracefully for invalid coordinates', () => {
    expect(calculateCelestialSky(null, 78.13)).toBeNull();
    expect(calculateCelestialSky(NaN, 78.13)).toBeNull();
  });

  it('renders moon SVG path correctly for all lunar phases without collapsing to dark', async () => {
    const { getMoonSvgPath } = await import('../features/astronomy.js');
    expect(getMoonSvgPath(0.01)).toBe(''); // New moon (dark)
    expect(getMoonSvgPath(0.99)).toBe(''); // New moon (dark)

    // Full moon (0.50)
    const full = getMoonSvgPath(0.50);
    expect(full).toContain('M 20 2 A 18 18 0 0 1 20 38 A 18 18 0 0 1 20 2');

    // Waning Gibbous right after full moon (p = 0.54)
    const waningGibbous = getMoonSvgPath(0.54);
    expect(waningGibbous).not.toBe('');
    // Terminator must sweep=0 (counter-clockwise across right side) to enclose the filled gibbous moon
    expect(waningGibbous).toContain('A 18 18 0 0 0 20 38');
    expect(waningGibbous).toMatch(/A \d+\.\d+ 18 0 0 0 20 2$/);

    // Third Quarter (p = 0.75)
    const thirdQuarter = getMoonSvgPath(0.75);
    expect(thirdQuarter).not.toBe('');
    expect(thirdQuarter).toContain('A 18 18 0 0 0 20 38');

    // Waning Crescent (p = 0.85)
    const waningCrescent = getMoonSvgPath(0.85);
    expect(waningCrescent).not.toBe('');
    expect(waningCrescent).toMatch(/A \d+\.\d+ 18 0 0 1 20 2$/);
  });

  it('supports full-screen sky radar overlay by teleporting to body and restoring to astronomy tab', async () => {
    // Setup mock DOM structure replicating weatherPanel & astronomy tab
    const weatherPanel = document.createElement('div');
    weatherPanel.id = 'weatherPanel';
    weatherPanel.className = 'weather-panel open';

    const astronomyTab = document.createElement('div');
    astronomyTab.id = 'weatherTabAstronomy';

    const celestialSection = document.createElement('div');
    celestialSection.id = 'celestialRadarSection';

    const btn = document.createElement('button');
    btn.id = 'expandSkyRadarBtn';
    celestialSection.appendChild(btn);

    const expandIcon = document.createElement('span');
    expandIcon.id = 'skyRadarExpandIcon';
    celestialSection.appendChild(expandIcon);

    const compressIcon = document.createElement('span');
    compressIcon.id = 'skyRadarCompressIcon';
    compressIcon.className = 'hidden';
    celestialSection.appendChild(compressIcon);

    const expandText = document.createElement('span');
    expandText.id = 'skyRadarExpandText';
    celestialSection.appendChild(expandText);

    const footer = document.createElement('div');
    footer.id = 'skyRadarFullscreenFooter';
    footer.className = 'hidden';
    celestialSection.appendChild(footer);

    const afterSection = document.createElement('div');
    afterSection.id = 'timeMachineSection';

    astronomyTab.appendChild(celestialSection);
    astronomyTab.appendChild(afterSection);
    weatherPanel.appendChild(astronomyTab);
    document.body.appendChild(weatherPanel);

    const { init } = await import('../features/astronomy.js');
    const pushedHistory = [];
    const poppedHistory = [];
    const mockApp = {
      updateCelestialBodies: () => {},
      pushHistoryOverlay: (id) => pushedHistory.push(id),
      popHistoryOverlay: (id) => poppedHistory.push(id),
    };
    init(mockApp);

    // Initial state: child of astronomy tab
    expect(celestialSection.parentNode).toBe(astronomyTab);
    expect(document.body.classList.contains('sky-radar-fullscreen-active')).toBe(false);

    // Click expand -> teleports to document.body
    btn.click();
    expect(celestialSection.parentNode).toBe(document.body);
    expect(celestialSection.classList.contains('sky-radar-fullscreen')).toBe(true);
    expect(document.body.classList.contains('sky-radar-fullscreen-active')).toBe(true);
    expect(pushedHistory).toContain('skyRadar');
    expect(expandText.textContent).toBe('Close');
    expect(footer.classList.contains('hidden')).toBe(false);

    // Press Escape -> restores back to astronomyTab right before timeMachineSection
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(celestialSection.parentNode).toBe(astronomyTab);
    expect(celestialSection.nextSibling).toBe(afterSection);
    expect(celestialSection.classList.contains('sky-radar-fullscreen')).toBe(false);
    expect(document.body.classList.contains('sky-radar-fullscreen-active')).toBe(false);
    expect(poppedHistory).toContain('skyRadar');
    expect(expandText.textContent).toBe('Expand');

    // Clean up mock DOM
    weatherPanel.remove();
    celestialSection.remove();
  });

  it('guarantees fullscreen sky radar z-index is above mobile weather card in styles.css', async () => {
    const fs = await import('fs');
    const css = fs.readFileSync('styles.css', 'utf8');

    // Radar fullscreen z-index must be at least 2500, strictly above mobile weather panel (1200)
    const radarMatch = css.match(/#celestialRadarSection\.sky-radar-fullscreen\s*\{[^}]*z-index:\s*(\d+)/s);
    expect(radarMatch).toBeTruthy();
    const radarZIndex = parseInt(radarMatch[1], 10);
    expect(radarZIndex).toBeGreaterThanOrEqual(2500);

    // Weather panel must be hidden when sky radar is fullscreen
    expect(css).toMatch(/body\.sky-radar-fullscreen-active\s+#weatherPanel[^{]*\{[^}]*visibility:\s*hidden/s);
  });

  it('guarantees timeline bar is visible and responsive in fullscreen sky radar mode', async () => {
    const fs = await import('fs');
    const styles = fs.readFileSync('styles.css', 'utf8');
    const polish = fs.readFileSync('css/aura-polish.css', 'utf8');

    // Both styles.css and aura-polish.css must keep timelineBar visible in sky-radar-fullscreen-active
    expect(styles).toMatch(/body\.sky-radar-fullscreen-active\s+#timelineBar[^{]*\{[^}]*opacity:\s*1\s*!important/s);
    expect(polish).toMatch(/body\.sky-radar-fullscreen-active\s+#timelineBar\s*\{[^}]*opacity:\s*1\s*!important/s);
  });

  it('updates sky dome objects even without celestialPlanetsList or starsList DOM nodes', async () => {
    const { init } = await import('../features/astronomy.js');
    const domeGroup = document.createElement('g');
    domeGroup.id = 'skyDomeObjectsGroup';
    document.body.appendChild(domeGroup);

    const mockApp = {
      selectedLat: 13.13,
      selectedLng: 78.13,
    };
    init(mockApp);

    mockApp.updateCelestialBodies(new Date('2026-11-01T12:00:00Z'));
    expect(domeGroup.innerHTML.length).toBeGreaterThan(0);
    expect(domeGroup.innerHTML).toContain('Sun');

    domeGroup.remove();
  });

  it('guarantees mobile sky panel dropdown displays over timeline bar and supports scroll in styles.css', async () => {
    const fs = await import('fs');
    const styles = fs.readFileSync('styles.css', 'utf8');
    const polish = fs.readFileSync('css/aura-polish.css', 'utf8');

    // Radar section elevated to 2600 when dropdown is open
    expect(styles).toMatch(/body\.sky-radar-fullscreen-active\.sky-panel-dropdown-open\s+#celestialRadarSection[^{]*\{[^}]*z-index:\s*2600\s*!important/s);
    expect(polish).toMatch(/body\.sky-radar-fullscreen-active\.sky-panel-dropdown-open\s+#celestialRadarSection[^{]*\{[^}]*z-index:\s*2600\s*!important/s);

    // Timeline bar lowered to 2400 when dropdown is open
    expect(styles).toMatch(/body\.sky-radar-fullscreen-active\.sky-panel-dropdown-open\s+#timelineBar[^{]*\{[^}]*z-index:\s*2400\s*!important/s);
    expect(polish).toMatch(/body\.sky-radar-fullscreen-active\.sky-panel-dropdown-open\s+#timelineBar[^{]*\{[^}]*z-index:\s*2400\s*!important/s);

    // Panel open mobile has z-index 2650 and internal scrolling enabled
    expect(styles).toMatch(/#celestialRadarSection\.sky-radar-fullscreen\s+\.sky-radar-side-panel\.panel-open-mobile\s*\{[^}]*z-index:\s*2650\s*!important/s);
    expect(styles).toMatch(/#celestialRadarSection\.sky-radar-fullscreen\s+\.sky-radar-side-panel\.panel-open-mobile\s+\.sky-tab-pane\.active\s*\{[^}]*overflow-y:\s*auto\s*!important/s);
  });

  it('manages mobile dropdown open state, click-outside dismissal, and keyboard escape', async () => {
    const celestialSection = document.createElement('div');
    celestialSection.id = 'celestialRadarSection';
    celestialSection.className = 'sky-radar-fullscreen';

    const expandBtn = document.createElement('button');
    expandBtn.id = 'expandSkyRadarBtn';
    celestialSection.appendChild(expandBtn);

    const leftToggle = document.createElement('button');
    leftToggle.id = 'toggleLeftSkyPanelBtn';
    celestialSection.appendChild(leftToggle);

    const rightToggle = document.createElement('button');
    rightToggle.id = 'toggleRightSkyPanelBtn';
    celestialSection.appendChild(rightToggle);

    const leftPanel = document.createElement('aside');
    leftPanel.id = 'skyRadarLeftPanel';
    celestialSection.appendChild(leftPanel);

    const rightPanel = document.createElement('aside');
    rightPanel.id = 'skyRadarRightPanel';

    const rightCloseBtn = document.createElement('button');
    rightCloseBtn.className = 'sky-panel-close-btn';
    rightCloseBtn.dataset.panel = 'right';
    rightPanel.appendChild(rightCloseBtn);

    celestialSection.appendChild(rightPanel);
    document.body.appendChild(celestialSection);

    const { init } = await import('../features/astronomy.js');
    init({});

    // 1. Click Right Toggle (Constellations) -> opens right panel, adds sky-panel-dropdown-open to body
    rightToggle.click();
    expect(rightPanel.classList.contains('panel-open-mobile')).toBe(true);
    expect(rightToggle.classList.contains('active')).toBe(true);
    expect(rightToggle.getAttribute('aria-expanded')).toBe('true');
    expect(document.body.classList.contains('sky-panel-dropdown-open')).toBe(true);

    // 2. Click Left Toggle (Planets) -> closes right panel, opens left panel
    leftToggle.click();
    expect(rightPanel.classList.contains('panel-open-mobile')).toBe(false);
    expect(rightToggle.classList.contains('active')).toBe(false);
    expect(leftPanel.classList.contains('panel-open-mobile')).toBe(true);
    expect(leftToggle.classList.contains('active')).toBe(true);
    expect(document.body.classList.contains('sky-panel-dropdown-open')).toBe(true);

    // 3. Escape key closes open mobile dropdown first without exiting fullscreen
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(leftPanel.classList.contains('panel-open-mobile')).toBe(false);
    expect(document.body.classList.contains('sky-panel-dropdown-open')).toBe(false);
    expect(celestialSection.classList.contains('sky-radar-fullscreen')).toBe(true);

    // 4. Tap outside dismissal
    rightToggle.click();
    expect(rightPanel.classList.contains('panel-open-mobile')).toBe(true);
    expect(document.body.classList.contains('sky-panel-dropdown-open')).toBe(true);

    // Click outside on section background
    celestialSection.click();
    expect(rightPanel.classList.contains('panel-open-mobile')).toBe(false);
    expect(document.body.classList.contains('sky-panel-dropdown-open')).toBe(false);

    // Clean up
    celestialSection.remove();
    document.body.classList.remove('sky-panel-dropdown-open');
  });
});
