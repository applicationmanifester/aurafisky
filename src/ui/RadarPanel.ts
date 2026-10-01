// src/ui/RadarPanel.ts
// Radar Panel UI Component

import { createRadarService, RadarService } from '../services/RadarService.js';
import { showToast } from '../utils/ui/toast.js';
import Map from 'ol/Map.js';

let radarService: RadarService | null = null;
let mapInstance: Map | null = null;
let currentOverlayType: 'radar' | 'satellite' | 'temperature' | 'wind' = 'radar';
let isActive = false;

interface RadarPanelElements {
  radarDot: HTMLElement;
  radarPlayback: HTMLElement;
  radarExtras: HTMLElement;
  radarOpacitySlider: HTMLInputElement;
  layerTypeSelect: HTMLSelectElement;
  radarExpandedPanel: HTMLElement;
  radarCollapsedBtn: HTMLElement;
  legendPrecip: HTMLElement;
  legendTemp: HTMLElement;
}

let elements: RadarPanelElements | null = null;

function getElements(): RadarPanelElements {
  if (elements) return elements;

  elements = {
    radarDot: document.getElementById('radarDot')!,
    radarPlayback: document.getElementById('radarPlayback')!,
    radarExtras: document.getElementById('radarExtras')!,
    radarOpacitySlider: document.getElementById('radarOpacitySlider') as HTMLInputElement,
    layerTypeSelect: document.getElementById('layerTypeSelect') as HTMLSelectElement,
    radarExpandedPanel: document.getElementById('radarExpandedPanel')!,
    radarCollapsedBtn: document.getElementById('radarCollapsedBtn')!,
    legendPrecip: document.getElementById('legendPrecip')!,
    legendTemp: document.getElementById('legendTemp')!,
  };
  return elements;
}

export async function initRadarPanel(map: Map): Promise<void> {
  mapInstance = map;
  radarService = createRadarService({
    map,
    overlayType: currentOverlayType,
    opacity: 0.6,
    onFramesLoaded: (timestamps) => updatePlaybackUI(timestamps),
    onError: (error) => showToast('Could not load map overlays', 'error'),
  });

  const el = getElements();
  el.layerTypeSelect.addEventListener('change', async () => {
    currentOverlayType = el.layerTypeSelect.value as typeof currentOverlayType;
    radarService?.setOverlayType(currentOverlayType);
    if (isActive) {
      await radarService?.initialize();
    }
  });

  el.radarOpacitySlider.addEventListener('input', () => {
    const opacity = parseInt(el.radarOpacitySlider.value, 10) / 100;
    radarService?.setOpacity(opacity);
  });

  // Initialize collapsed button click
  el.radarCollapsedBtn?.addEventListener('click', () => toggleRadar());
}

export async function toggleRadar(): Promise<void> {
  if (!radarService || !mapInstance) return;

  isActive = !isActive;
  const el = getElements();

  el.radarDot.classList.toggle('active', isActive);

  if (currentOverlayType === 'temperature' || currentOverlayType === 'wind') {
    el.radarPlayback.classList.add('hidden');
  } else {
    el.radarPlayback.classList.toggle('hidden', !isActive);
  }
  el.radarExtras.classList.toggle('hidden', !isActive);

  if (isActive) {
    try {
      if (currentOverlayType === 'temperature') {
        showToast('Loading temperature overlay...', 'info');
        radarService.stopPlayback();
        await radarService.initialize();
        el.legendPrecip?.classList.add('hidden');
        el.legendTemp?.classList.remove('hidden');
      } else if (currentOverlayType === 'wind') {
        showToast('Wind flow overlay active', 'info');
        radarService.stopPlayback();
        await radarService.initialize();
        el.legendPrecip?.classList.add('hidden');
        el.legendTemp?.classList.add('hidden');
      } else {
        showToast(`Loading weather ${currentOverlayType === 'radar' ? 'radar' : 'satellite'} frames...`, 'info');
        await radarService.initialize();
        radarService.startPlayback();
        el.legendPrecip?.classList.remove('hidden');
        el.legendTemp?.classList.add('hidden');
      }
    } catch {
      isActive = false;
      el.radarDot.classList.remove('active');
      el.radarPlayback.classList.add('hidden');
      el.radarExtras.classList.add('hidden');
    }
  } else {
    radarService.stopPlayback();
    radarService.clearLayers();
    el.legendPrecip?.classList.remove('hidden');
    el.legendTemp?.classList.add('hidden');
  }

  // Expand/collapse panel
  if (el.radarExpandedPanel) {
    el.radarExpandedPanel.classList.toggle('hidden', !isActive);
  }
  if (el.radarCollapsedBtn) {
    el.radarCollapsedBtn.classList.toggle('hidden', isActive);
  }
}

function updatePlaybackUI(timestamps: number[]): void {
  const el = getElements();
  // Update timeline/slider if needed
  console.log('Radar frames loaded:', timestamps.length);
}

export function setOverlayType(type: 'radar' | 'satellite' | 'temperature' | 'wind'): void {
  currentOverlayType = type;
  radarService?.setOverlayType(type);
}

export function setFrame(index: number): void {
  radarService?.setFrame(index);
}

export function getCurrentFrameIndex(): number {
  return radarService?.getCurrentFrameIndex() ?? -1;
}

export function getFrameCount(): number {
  return radarService?.getFrameCount() ?? 0;
}

export function startPlayback(): void {
  radarService?.startPlayback();
}

export function stopPlayback(): void {
  radarService?.stopPlayback();
}

export function destroy(): void {
  radarService?.destroy();
  radarService = null;
  mapInstance = null;
  isActive = false;
  elements = null;
}
