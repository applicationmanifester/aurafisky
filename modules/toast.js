/**
 * Standalone toast notification system.
 * Deduplicates by type+message with a 3s cooldown.
 * Max 3 toasts visible at once.
 */
window.toastModule = (() => {
  const cache = new Map();
  let evictTimer = null;

  function startEvict() {
    if (evictTimer) return;
    evictTimer = setInterval(() => {
      const cutoff = Date.now();
      for (const [k, expiry] of cache) {
        if (expiry < cutoff) cache.delete(k);
      }
    }, 30000);
  }

  return {
    show(message, type = "info", duration) {
      const key = `${type}:${message}`;
      const now = Date.now();
      if (cache.get(key) > now) return;
      cache.set(key, now + 3000);
      startEvict();

      const container = document.getElementById("toastContainer");
      if (!container) return;

      const existing = container.children;
      while (existing.length >= 3) existing[0].remove();

      const colors = {
        info: "bg-white dark:bg-slate-800 border-primary/20",
        error: "bg-white dark:bg-slate-800 border-red-400/30",
        success: "bg-white dark:bg-slate-800 border-emerald-400/30",
        warning: "bg-white dark:bg-slate-800 border-amber-400/30",
      };
      const icons = {
        info: "ℹ️",
        error: "⚠️",
        success: "✅",
        warning: "⚠️",
      };

      const toast = document.createElement("div");
      toast.setAttribute("role", "alert");
      toast.className = `toast pointer-events-auto glass rounded-xl px-4 py-3 flex items-center gap-3 border ${colors[type] || colors.info} shadow-lg max-w-sm z-[9999]`;

      const iconSpan = document.createElement("span");
      iconSpan.className = "text-lg";
      iconSpan.setAttribute("aria-hidden", "true");
      iconSpan.textContent = icons[type] || "";

      const msgSpan = document.createElement("span");
      msgSpan.className = "text-sm text-slate-700 dark:text-slate-200";
      msgSpan.textContent = message;

      toast.appendChild(iconSpan);
      toast.appendChild(msgSpan);

      container.appendChild(toast);

      const lifetime = Number.isFinite(duration) ? duration : 4000;
      setTimeout(() => {
        toast.classList.add("hiding");
        setTimeout(() => toast.remove(), 500);
      }, lifetime);
      toast.addEventListener("animationend", () => toast.remove());
    },
  };
})();

export const toastModule = window.toastModule;
