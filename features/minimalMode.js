// Minimal / Compact mode has been deprecated and removed.
// Safe no-op shims preserved for backward compatibility.

export function init(app) {
  document.documentElement.classList.remove("compact");
  app.minimalMode = false;
  app.toggleMinimalMode = () => {
    document.documentElement.classList.remove("compact");
  };
  app.rebindPanelEvents = () => {};
}
