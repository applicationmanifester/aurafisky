// -- KEYBOARD SHORTCUTS --

function initKeyboardShortcuts() {
    document.addEventListener("keydown", (e) => {
      // Don't trigger if typing in an input
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
        if (e.key === "Escape") {
          e.target.blur();
          this.$.searchDropdown.classList.remove("open");
        }
        return;
      }
      // Close app info modal on Escape
      if (
        e.key === "Escape" &&
        this.$.appInfoModal &&
        this.$.appInfoModal.style.display !== "none"
      ) {
        this.toggleAppInfoModal();
        return;
      }
      switch (e.key.toLowerCase()) {
        case "?":
          e.preventDefault();
          this.toggleAppInfoModal();
          break;
        case "d":
          e.preventDefault();
          this.toggleDarkMode();
          break;
        case "r":
          e.preventDefault();
          this.toggleRadar();
          break;
        case "m":
          e.preventDefault();
          this.toggleMinimalMode();
          break;
        case "/":
          e.preventDefault();
          this.$.searchInput?.focus();
          break;
        case "g":
          e.preventDefault();
          this.getMyLocation();
          break;
      }
    });
    if (this.$.shortcutsCloseBtn) {
      this.$.shortcutsCloseBtn.addEventListener("click", () =>
        this.toggleShortcutsModal(),
      );
    }
    if (this.$.shortcutsModal) {
      this.$.shortcutsModal.addEventListener("click", (e) => {
        if (e.target === this.$.shortcutsModal) this.toggleShortcutsModal();
      });
    }
    // ── App Info Modal ──────────────────────────────────────
    if (this.$.appInfoCloseBtn) {
      this.$.appInfoCloseBtn.addEventListener("click", () =>
        this.toggleAppInfoModal(),
      );
    }
    if (this.$.appInfoCloseBtn2) {
      this.$.appInfoCloseBtn2.addEventListener("click", () =>
        this.toggleAppInfoModal(),
      );
    }
    if (this.$.appInfoModal) {
      this.$.appInfoModal.addEventListener("click", (e) => {
        if (e.target === this.$.appInfoModal) this.toggleAppInfoModal();
      });
    }
    if (this.$.logoBtn) {
      this.$.logoBtn.addEventListener("click", () => this.toggleAppInfoModal());
    }
  }

function toggleShortcutsModal() {
    if (!this.$.shortcutsModal) return;
    const isHidden =
      this.$.shortcutsModal.style.display === "none" ||
      !this.$.shortcutsModal.style.display;
    this.$.shortcutsModal.style.display = isHidden ? "flex" : "none";
    this.$.shortcutsModal.classList.toggle("hidden", !isHidden);
  }

function toggleAppInfoModal() {
    if (!this.$.appInfoModal) return;
    const isHidden =
      this.$.appInfoModal.style.display === "none" ||
      !this.$.appInfoModal.style.display;
    this.$.appInfoModal.style.display = isHidden ? "flex" : "none";
    this.$.appInfoModal.classList.toggle("hidden", !isHidden);
  }

export function init(app) {
  app.initKeyboardShortcuts = initKeyboardShortcuts;
  app.toggleShortcutsModal = toggleShortcutsModal;
  app.toggleAppInfoModal = toggleAppInfoModal;
}
