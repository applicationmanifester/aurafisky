// src/ui/AlertPanel.ts

export default class AlertPanel {
  container: HTMLElement | null;
  listEl: HTMLElement | null;

  constructor(containerId: string) {
    this.container = document.getElementById(containerId);
    this.listEl = null;
  }

  init() {
    if (!this.container) return;
    this.listEl = document.getElementById('alertList');
  }

  destroy() {
    this.listEl = null;
    this.container = null;
  }
}