// src/ui/TimeMachinePanel.ts
// Time Machine Panel UI Component

import { loadTimeMachineData, TimeMachineResult, destroy as destroyTimeMachine } from '../services/TimeMachineService.js';
import { showToast } from '../utils/ui/toast.js';
import { getWeatherData } from '../services/WeatherService.js';

let isOpen = false;

function getElements() {
  return {
    drawer: document.getElementById('timeMachineDrawer')!,
    chevron: document.getElementById('timeMachineChevron')!,
    rows: document.getElementById('timeMachineRows')!,
    points: document.getElementById('timeMachinePoints')!,
    line: document.getElementById('timeMachineLine') as SVGPathElement,
    analogLabel: document.getElementById('analogLabel')!,
    timelineSlider: document.getElementById('timelineSlider') as HTMLInputElement,
  };
}

export function toggleTimeMachine(): void {
  const { drawer, chevron } = getElements();
  const isClosed = drawer.classList.contains('hidden');

  if (isClosed) {
    drawer.classList.remove('hidden');
    chevron.classList.add('rotate-180');
    loadTimeMachineData();
  } else {
    closeTimeMachine();
  }
}

export function closeTimeMachine(): void {
  const { drawer, chevron } = getElements();
  drawer.classList.add('hidden');
  chevron.classList.remove('rotate-180');
}

async function loadTimeMachineData(): Promise<void> {
  const { rows, points, line, analogLabel, timelineSlider } = getElements();
  const activeHourIdx = parseInt(timelineSlider.value, 10);
  
  // Get current weather data from WeatherService
  const weatherData = getWeatherData();
  const weather = weatherData ? getHourlyAtIndex(weatherData, activeHourIdx) : null;
  if (!weather) return;

  const parts = weather.time.split('T');
  if (parts.length < 2) return;
  const dateParts = parts[0].split('-');
  const month = dateParts[1];
  const day = dateParts[2];

  // Need selectedLat/selectedLng from app context
  const selectedLat = (window as any).selectedLat;
  const selectedLng = (window as any).selectedLng;
  if (!selectedLat || !selectedLng) return;

  rows.innerHTML = `
    <div class="flex items-center justify-center py-4">
      <div class="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin"></div>
    </div>
  `;
  points.innerHTML = '';
  line.setAttribute('d', '');
  analogLabel.classList.add('hidden');

  try {
    const result = await loadTimeMachineData(
      selectedLat,
      selectedLng,
      month,
      day,
      weather.temperature,
      weatherData
    );
    renderTimeMachine(result);
  } catch (e) {
    console.error('Time machine load error:', e);
    rows.innerHTML = '<div class="text-[10px] text-red-500 text-center py-2">Failed to load climate history.</div>';
    showToast('Failed to load climate history', 'error');
  }
}

function renderTimeMachine(result: TimeMachineResult): void {
  const { rows, points, line, analogLabel } = getElements();
  const { dataPoints, analogYear } = result;

  // Render list rows
  rows.innerHTML = dataPoints.map(d => {
    if (d.temp == null) {
      return `
        <div class="flex justify-between items-center text-[10px] text-slate-400 py-0.5">
          <span class="font-medium">${d.label}</span>
          <span>Data unavailable</span>
        </div>
      `;
    }
    return `
      <div class="flex justify-between items-center text-[10px] py-1 hover:bg-slate-100/50 dark:hover:bg-slate-800/30 px-1.5 rounded-md">
        <span class="font-semibold text-slate-500 dark:text-slate-400 w-20 flex-shrink-0">${d.label}</span>
        <span class="text-sm mr-2">${d.icon}</span>
        <span class="text-slate-600 dark:text-slate-300">${d.description}</span>
        <span class="font-mono text-slate-700 dark:text-slate-300 ml-2">${d.temp.toFixed(1)}°C</span>
      </div>
    `;
  }).join('');

  // Render sparkline points
  const validPoints = dataPoints.filter(d => d.temp !== null);
  if (validPoints.length >= 2) {
    const width = 280; // approximate container width
    const height = 60;
    const padding = 10;
    const temps = validPoints.map(d => d.temp!);
    const minTemp = Math.min(...temps);
    const maxTemp = Math.max(...temps);
    const range = maxTemp - minTemp || 1;

    const pathData = validPoints.map((d, i) => {
      const x = padding + (i / (validPoints.length - 1)) * (width - 2 * padding);
      const y = height - padding - ((d.temp! - minTemp) / range) * (height - 2 * padding);
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');

    line.setAttribute('d', pathData);
    line.setAttribute('stroke', '#22c55e');
    line.setAttribute('stroke-width', '2');
    line.setAttribute('fill', 'none');

    // Add point circles
    points.innerHTML = validPoints.map((d, i) => {
      const x = padding + (i / (validPoints.length - 1)) * (width - 2 * padding);
      const y = height - padding - ((d.temp! - minTemp) / range) * (height - 2 * padding);
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="#22c55e" />`;
    }).join('');
  }

  // Show analog year
  if (analogYear && analogLabel) {
    analogLabel.textContent = `📅 Most like ${analogYear.year} years ago: ${analogYear.icon} ${analogYear.description}, ${analogYear.temp}°C`;
    analogLabel.className = 'text-[10px] font-semibold text-emerald-500 dark:text-emerald-400 mt-1';
    analogLabel.classList.remove('hidden');
  }
}

export function destroy(): void {
  destroyTimeMachine();
  closeTimeMachine();
}
