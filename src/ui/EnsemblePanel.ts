// src/ui/EnsemblePanel.ts
// Ensemble Panel UI Component

import { getEnsembleForecast, EnsembleResult, destroy as destroyEnsemble } from '../services/EnsembleService.js';
import { showToast } from '../utils/ui/toast.js';

let currentLat: number | null = null;
let currentLng: number | null = null;
let isRendered = false;

function ensureSection(): HTMLElement {
  let section = document.getElementById('ensembleSection');
  if (section) return section;

  const content = document.getElementById('weatherPanelContent');
  const anchor = document.getElementById('dailyForecast');
  section = document.createElement('div');
  section.id = 'ensembleSection';
  section.className = 'mb-5';
  section.innerHTML = `
    <h4 class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Model Ensemble</h4>
    <div id="ensembleBody" class="text-xs text-slate-500 dark:text-slate-400">Select a location to compare forecast models.</div>
  `;
  if (content && anchor && anchor.parentNode) {
    anchor.parentNode.insertBefore(section, anchor);
  } else if (content) {
    content.appendChild(section);
  }
  return section;
}

export async function renderEnsemblePanel(lat: number, lng: number): Promise<void> {
  currentLat = lat;
  currentLng = lng;
  
  const section = ensureSection();
  const body = document.getElementById('ensembleBody');
  if (!body) return;

  body.textContent = 'Comparing ECMWF · GFS · ICON…';

  try {
    const result = await getEnsembleForecast(lat, lng);
    renderEnsembleResult(result, body);
    isRendered = true;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return;
    console.error('Ensemble render error:', e);
    body.textContent = 'Ensemble data unavailable (rate limited or offline).';
    showToast('Could not load ensemble data', 'error');
  }
}

function renderEnsembleResult(result: EnsembleResult, body: HTMLElement): void {
  const { agreement, consensus, spread, snapshots, rainProbability } = result;

  // Weather info for consensus code
  let icon = '🌡️';
  let desc = 'Unknown';
  try {
    // Import dynamically to avoid circular deps
    const { getWeatherInfo } = await import('../services/WeatherService.js');
    const info = getWeatherInfo(consensus.code, true);
    if (info) { icon = info.dayIcon; desc = info.description; }
  } catch {}

  const agreementColor = agreement >= 70 ? 'text-emerald-500' : agreement >= 40 ? 'text-amber-500' : 'text-rose-500';

  body.innerHTML = `
    <div class="space-y-2 text-xs">
      <div class="flex items-center justify-between">
        <span class="font-medium text-slate-500 dark:text-slate-400">Model Agreement</span>
        <span class="font-semibold ${agreementColor}">${agreement}%</span>
      </div>
      <div class="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
        <div class="h-full bg-gradient-to-r from-emerald-500 via-amber-500 to-rose-500" style="width: ${agreement}%"></div>
      </div>

      <div class="grid grid-cols-2 gap-2 mt-2 text-[10px]">
        <div class="p-1.5 bg-slate-100/50 dark:bg-slate-800/30 rounded">
          <div class="text-slate-500 dark:text-slate-400">Consensus Temp</div>
          <div class="font-mono font-semibold">${consensus.temp.toFixed(1)}°C</div>
        </div>
        <div class="p-1.5 bg-slate-100/50 dark:bg-slate-800/30 rounded">
          <div class="text-slate-500 dark:text-slate-400">Temp Spread</div>
          <div class="font-mono font-semibold">±${spread.temp.toFixed(1)}°C</div>
        </div>
        <div class="p-1.5 bg-slate-100/50 dark:bg-slate-800/30 rounded">
          <div class="text-slate-500 dark:text:s-slate-400">Rain Probability</div>
          <div class="font-mono font-semibold text-sky-500">${rainProbability}%</div>
        </div>
        <div class="p-1.5 bg-slate-100/50 dark:bg-slate-800/30 rounded">
          <div class="text-slate-500 dark:text-slate-400">Precip Spread</div>
          <div class="font-mono font-semibold">±${spread.precip.toFixed(2)}mm</div>
        </div>
      </div>

      <div class="mt-2 pt-2 border-t border-slate-200/50 dark:border-slate-700/50">
        <div class="font-medium text-slate-500 dark:text-slate-400 mb-1">Individual Models</div>
        <div class="grid grid-cols-3 gap-1 text-[10px]">
          ${snapshots.map(s => {
            const modelInfo = ({ ecmwf_ifs04: 'ECMWF', gfs_seamless: 'GFS', icon_seamless: 'ICON' } as Record<string, string>)[s.model] || s.model;
            return `
              <div class="p-1.5 bg-slate-50 dark:bg-slate-900/50 rounded text-center">
                <div class="font-semibold text-slate-700 dark:text-slate-300">${modelInfo}</div>
                <div class="font-mono">${s.temp !== undefined ? s.temp.toFixed(1) + '°C' : '—'}</div>
                <div class="text-slate-500 dark:text-slate-400">${s.precip !== undefined ? s.precip.toFixed(1) + 'mm' : '—'}</div>
                <div class="text-sky-500">${s.precipProb.length ? Math.max(...s.precipProb) + '%' : '—'}</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>
  `;
}

export function hideEnsemblePanel(): void {
  const section = document.getElementById('ensembleSection');
  if (section) section.classList.add('hidden');
}

export function showEnsemblePanel(): void {
  const section = document.getElementById('ensembleSection');
  if (section) section.classList.remove('hidden');
}

export function destroy(): void {
  destroyEnsemble();
  const section = document.getElementById('ensembleSection');
  if (section) section.remove();
  isRendered = false;
  currentLat = null;
  currentLng = null;
}
