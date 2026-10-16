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
      if (
        e.key === "Escape" &&
        this.$.mapLayersFlyout &&
        !this.$.mapLayersFlyout.classList.contains("hidden")
      ) {
        this.toggleMapLayersFlyout(false);
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
          this.getMyLocation();
          break;
        case "/":
          e.preventDefault();
          this.$.searchInput?.focus();
          break;
        case "g":
          e.preventDefault();
          this.getMyLocation();
          break;
        case "l":
          e.preventDefault();
          this.toggleMapLayersFlyout?.();
          break;
        case "w":
          e.preventDefault();
          this.toggleWallpaper?.();
          break;
      }
    });
    if (this.$.shortcutsCloseBtn) {
      this.$.shortcutsCloseBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.toggleShortcutsModal(false);
      });
    }
    if (this.$.shortcutsModal) {
      this.$.shortcutsModal.addEventListener("click", (e) => {
        const dialog = this.$.shortcutsModal.firstElementChild;
        if (!dialog || !dialog.contains(e.target)) {
          this.toggleShortcutsModal(false);
        }
      });
    }
    // ── App Info Modal ──────────────────────────────────────
    if (this.$.appInfoCloseBtn) {
      this.$.appInfoCloseBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.toggleAppInfoModal(false);
      });
    }
    if (this.$.appInfoCloseBtn2) {
      this.$.appInfoCloseBtn2.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.toggleAppInfoModal(false);
      });
    }
    if (this.$.appInfoModal) {
      this.$.appInfoModal.addEventListener("click", (e) => {
        const dialog = this.$.appInfoModal.firstElementChild;
        if (!dialog || !dialog.contains(e.target)) {
          this.toggleAppInfoModal(false);
        }
      });
    }
    if (this.$.logoBtn) {
      this.$.logoBtn.addEventListener("click", () => this.toggleAppInfoModal());
    }
  }

function toggleShortcutsModal(force) {
    if (!this.$.shortcutsModal) return;
    const isCurrentlyHidden =
      this.$.shortcutsModal.style.display === "none" ||
      !this.$.shortcutsModal.style.display ||
      this.$.shortcutsModal.classList.contains("hidden");
    const open = typeof force === "boolean" ? force : isCurrentlyHidden;
    this.$.shortcutsModal.style.display = open ? "flex" : "none";
    this.$.shortcutsModal.classList.toggle("hidden", !open);
  }

function toggleAppInfoModal(force) {
    if (!this.$.appInfoModal) return;
    const isCurrentlyHidden =
      this.$.appInfoModal.style.display === "none" ||
      !this.$.appInfoModal.style.display ||
      this.$.appInfoModal.classList.contains("hidden");
    const open = typeof force === "boolean" ? force : isCurrentlyHidden;
    this.$.appInfoModal.style.display = open ? "flex" : "none";
    this.$.appInfoModal.classList.toggle("hidden", !open);
  }

export function init(app) {
  app.initKeyboardShortcuts = initKeyboardShortcuts;
  app.toggleShortcutsModal = toggleShortcutsModal;
  app.toggleAppInfoModal = toggleAppInfoModal;
}
