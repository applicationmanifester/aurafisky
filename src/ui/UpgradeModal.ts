// src/ui/UpgradeModal.ts

export default class UpgradeModal {
  container: HTMLElement | null;
  contentEl: HTMLElement | null;
  closeBtn: HTMLButtonElement | null;
  confirmBtn: HTMLButtonElement | null;

  constructor() {
    this.container = document.getElementById('upgradeModal');
    this.contentEl = null;
    this.closeBtn = null;
    this.confirmBtn = null;
  }

  async init() {
    if (!this.container) return;
    this.contentEl = document.getElementById('upgradeModalContent');
    this.closeBtn = document.getElementById('upgradeModalClose') as HTMLButtonElement;
    this.confirmBtn = document.getElementById('upgradeModalConfirm') as HTMLButtonElement;

    this.closeBtn?.addEventListener('click', () => this.close());
    this.confirmBtn?.addEventListener('click', () => this.confirm());
    this.container.addEventListener('click', (e) => {
      if (e.target === this.container) this.close();
    });
  }

  open() {
    if (!this.container) return;
    this.container.classList.remove('hidden');
    this.container.classList.add('flex');
  }

  close() {
    if (!this.container) return;
    this.container.classList.add('hidden');
    this.container.classList.remove('flex');
  }

  confirm() {
    // Handle upgrade confirmation
    this.close();
  }

  destroy() {
    this.closeBtn?.removeEventListener('click', () => this.close());
    this.confirmBtn?.removeEventListener('click', () => this.confirm());
    this.container?.removeEventListener('click', () => {});
    this.container = null;
    this.contentEl = null;
    this.closeBtn = null;
    this.confirmBtn = null;
  }
}