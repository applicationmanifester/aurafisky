// src/ui/InsightsPanel.ts

export default class InsightsPanel {
  container: HTMLElement | null;
  contentEl: HTMLElement | null;

  constructor(containerId: string) {
    this.container = document.getElementById(containerId);
    this.contentEl = null;
  }

  init() {
    if (!this.container) return;
    this.contentEl = document.getElementById('insightsContent');
  }

  updateLocations() {
    // Update insights based on bookmarked locations
  }
}