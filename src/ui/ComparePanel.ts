// src/ui/ComparePanel.ts
// Compare Cities Panel UI Component

import { compareLocations, CompareResult, formatCompareTemp, formatCompareWind, formatCompareAQI, formatCompareHumidity, formatCompareDesc } from '../services/CompareService.js';
import { showToast } from '../utils/ui/toast.js';
import { getWeatherData, getAirQualityData } from '../services/WeatherService.js';

interface FavoriteLocation {
  name: string;
  lat: number;
  lng: number;
}

export async function compareWithActive(favLocation: FavoriteLocation): Promise<void> {
  const activeWeatherData = getWeatherData();
  const activeAirQualityData = getAirQualityData();
  
  // Get active location from app context
  const selectedLat = (window as any).selectedLat;
  const selectedLng = (window as any).selectedLng;
  const selectedName = (window as any).selectedName;
  
  if (!activeWeatherData || !selectedLat || !selectedLng || !selectedName) {
    showToast('Please select a main location on the map first.', 'error');
    return;
  }

  const activeLocation = { name: selectedName, lat: selectedLat, lng: selectedLng };
  const timelineSlider = document.getElementById('timelineSlider') as HTMLInputElement;
  const timelineSliderValue = timelineSlider ? parseInt(timelineSlider.value, 10) : 0;

  showToast(`Comparing with ${favLocation.name}...`, 'info');

  try {
    const result = await compareLocations(
      activeLocation,
      activeWeatherData,
      activeAirQualityData,
      timelineSliderValue,
      favLocation
    );
    renderComparePanel(result);
    showComparePanel();
  } catch (e) {
    console.error('Compare fetch failed:', e);
    if (e instanceof Error && e.message.includes('itself')) {
      showToast(e.message, 'warning');
    } else {
      showToast('Could not load comparison data.', 'error');
    }
  }
}

function renderComparePanel(result: CompareResult): void {
  const heading = document.getElementById('compareHeading');
  const tempA = document.getElementById('compareTempA');
  const tempB = document.getElementById('compareTempB');
  const windA = document.getElementById('compareWindA');
  const windB = document.getElementById('compareWindB');
  const aqiA = document.getElementById('compareAQIA');
  const aqiB = document.getElementById('compareAQIB');
  const humidityA = document.getElementById('compareHumidityA');
  const humidityB = document.getElementById('compareHumidityB');
  const descA = document.getElementById('compareDescA');
  const descB = document.getElementById('compareDescB');

  if (heading) heading.textContent = result.heading;
  if (tempA) tempA.textContent = formatCompareTemp(result.locationA.weather.temperature);
  if (tempB) tempB.textContent = formatCompareTemp(result.locationB.weather.temperature);
  if (windA) windA.textContent = formatCompareWind(result.locationA.weather.windSpeed);
  if (windB) windB.textContent = formatCompareWind(result.locationB.weather.windSpeed);
  if (aqiA) aqiA.textContent = formatCompareAQI(result.locationA.aqi);
  if (aqiB) aqiB.textContent = formatCompareAQI(result.locationB.aqi);
  if (humidityA) humidityA.textContent = formatCompareHumidity(result.locationA.weather.humidity);
  if (humidityB) humidityB.textContent = formatCompareHumidity(result.locationB.weather.humidity);
  if (descA) descA.textContent = formatCompareDesc(result.locationA.weather.icon, result.locationA.weather.description);
  if (descB) descB.textContent = formatCompareDesc(result.locationB.weather.icon, result.locationB.weather.description);
}

export function showComparePanel(): void {
  const panel = document.getElementById('comparePanel');
  if (!panel) return;
  panel.classList.remove('hidden');
  setTimeout(() => {
    panel.classList.add('open');
    // Hide radar panel on mobile if open
    if (window.innerWidth < 640) {
      const radarPanel = document.getElementById('radarExpandedPanel');
      const radarBtn = document.getElementById('radarCollapsedBtn');
      if (radarPanel && !radarPanel.classList.contains('hidden')) {
        radarPanel.classList.add('hidden');
        radarBtn?.classList.remove('hidden');
      }
    }
  }, 50);
}

export function hideComparePanel(): void {
  const panel = document.getElementById('comparePanel');
  if (!panel) return;
  panel.classList.remove('open');
  setTimeout(() => panel.classList.add('hidden'), 400);
}

export function destroy(): void {
  hideComparePanel();
}
