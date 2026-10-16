/**
 * ============================================================
 * TV Navigation Feature — features/tvNavigation.js
 * ============================================================
 * D-pad (spatial) navigation for TV-class devices.
 *
 * TV browsers (Tizen, webOS, Android TV WebView) often expose a
 * remote control whose arrows scroll the page instead of moving
 * focus between controls. This feature converts arrow-key input
 * into geometric focus movement across all interactive elements,
 * so the whole app — including the weather card — is operable
 * with just a remote's D-pad, Enter and Back.
 *
 * Only activates when device-profile classifies the runtime as a
 * TV (data-device="tv" on <html>). Desktop keyboard users keep
 * normal Tab-order behavior untouched.
 * ============================================================
 */

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  'input:not([type="hidden"]):not([disabled])',
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
  '[role="button"]',
  '[role="tab"]',
  '[role="slider"]',
].join(", ");

/** Collect focusable, visible elements in the viewport. */
function getFocusables() {
  return Array.from(document.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
    (el) => {
      if (el.closest("[inert]")) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const style = getComputedStyle(el);
      return (
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        style.pointerEvents !== "none"
      );
    },
  );
}

function center(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, rect: r };
}

/**
 * Directional candidate scoring: prefer elements mostly along the
 * pressed direction and penalize lateral drift (classic 10-foot UI
 * heuristic tuned for weather-card grids).
 */
function pickCandidate(fromEl, dir, candidates) {
  const from = center(fromEl);
  let best = null;
  let bestScore = Infinity;

  for (const cand of candidates) {
    if (cand === fromEl) continue;
    const to = center(cand);
    const dx = to.x - from.x;
    const dy = to.y - from.y;

    let primary;
    let secondary;
    switch (dir) {
      case "left":
        primary = -dx;
        secondary = Math.abs(dy);
        break;
      case "right":
        primary = dx;
        secondary = Math.abs(dy);
        break;
      case "up":
        primary = -dy;
        secondary = Math.abs(dx);
        break;
      case "down":
        primary = dy;
        secondary = Math.abs(dx);
        break;
      default:
        return null;
    }

    // Must be in the pressed direction (with small overlap tolerance).
    if (primary <= 8) continue;

    // Score: distance travelled + 2.5x penalty for lateral drift.
    const score = primary + secondary * 2.5;
    if (score < bestScore) {
      bestScore = score;
      best = cand;
    }
  }
  return best;
}

function moveFocus(dir) {
  const active = document.activeElement;
  const focusables = getFocusables();
  if (!focusables.length) return false;

  // Nothing focused yet: enter the weather panel's first control.
  if (!active || active === document.body || active === document.documentElement) {
    const panel = document.getElementById("weatherPanel");
    const first =
      panel?.querySelector(FOCUSABLE_SELECTOR) || focusables[0];
    first?.focus();
    return true;
  }

  // If the active element is a slider (timeline), let left/right
  // adjust the slider natively instead of jumping focus away.
  if (
    (active.getAttribute("role") === "slider" ||
      active.tagName === "INPUT") &&
    (dir === "left" || dir === "right")
  ) {
    return false;
  }

  const next = pickCandidate(active, dir, focusables);
  if (next) {
    next.focus();
    next.scrollIntoView({ block: "nearest", inline: "nearest" });
    return true;
  }
  return false;
}

export function init(app) {
  // Chromium TVs are often only identified by an async UA-Client-Hints lookup
  // that resolves *after* this module initialises. Reading dataset.device once
  // and returning meant those devices got the TV stylesheet but no way to
  // operate the app with a remote — the worst possible half-result. So the
  // handlers are always installed and gate themselves on the current tier,
  // and the devicechange event flips them live.
  let enabled = document.documentElement.dataset.device === "tv";

  const KEYMAP = {
    ArrowLeft: "left",
    ArrowRight: "right",
    ArrowUp: "up",
    ArrowDown: "down",
  };

  /**
   * A modal overlay is open. Focus must stay inside it — the D-pad otherwise
   * walks straight out of a dialog and into the weather card behind, which is
   * unreachable in practice because there is no way back.
   */
  function activeModal() {
    const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
    for (const d of dialogs) {
      if (d.classList.contains("hidden")) continue;
      if (d.offsetParent === null && getComputedStyle(d).position !== "fixed") continue;
      return d;
    }
    return null;
  }

  document.addEventListener(
    "keydown",
    (e) => {
      if (!enabled) return;

      // Remote "Back". Tizen, webOS and Android TV report it under different
      // keys and some report none at all, so the common ones are all handled.
      // Without this, Back exits or kills the app instead of closing a panel.
      const isBack =
        e.key === "BrowserBack" ||
        e.key === "GoBack" ||
        e.key === "Escape" ||
        e.key === "Backspace" ||
        e.keyCode === 4 ||
        e.keyCode === 10009; // Tizen remote BACK
      if (isBack) {
        if (closeTopmostLayer()) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }

      const dir = KEYMAP[e.key];
      if (dir) {
        // While a modal is open, let focus move inside it only.
        const modal = activeModal();
        if (modal && !modal.contains(document.activeElement)) {
          const inside = pickCandidate(
            document.activeElement && document.activeElement !== document.body
              ? document.activeElement
              : modal,
            dir,
            getFocusables().filter((el) => modal.contains(el)),
          );
          if (inside) {
            inside.focus();
            inside.scrollIntoView({ block: "nearest", inline: "nearest" });
            e.preventDefault();
            e.stopPropagation();
          } else if (!modal.contains(document.activeElement)) {
            (modal.querySelector(FOCUSABLE_SELECTOR) || modal).focus?.();
            e.preventDefault();
            e.stopPropagation();
          }
          return;
        }
        if (moveFocus(dir)) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }

      // Enter on non-natively-activatable elements (role=button).
      if (e.key === "Enter") {
        const active = document.activeElement;
        if (
          active &&
          active.getAttribute?.("role") === "button" &&
          active.tagName !== "BUTTON" &&
          active.tagName !== "A"
        ) {
          active.click();
        }
      }
    },
    true,
  ); // capture: beat page-level scroll handlers

  // Pick up a TV that is only identified after first paint.
  const onDeviceChange = (e) => {
    if (e?.detail?.device === "tv") enabled = true;
  };
  window.addEventListener("aura:devicechange", onDeviceChange);
  // And one more chance in case the event already fired.
  if (document.documentElement.dataset.device === "tv") enabled = true;

  // Convenience hook for other features (e.g. closing panels on Back).
  app.tvNavigation = {
    moveFocus,
    isEnabled: () => enabled,
    refresh: () => getFocusables().length,
  };
}

/**
 * Closes whatever is stacked on top, returning true if something was closed.
 * Ordered outermost-first is not needed here because Aura's modal and the
 * wallpaper overlay are the only true modals; the rest close by id.
 */
function closeTopmostLayer() {
  const openModal = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')]
    .filter((d) => !d.classList.contains("hidden"))
    .pop();
  if (openModal) {
    const close = openModal.querySelector(
      'button[aria-label^="Close"], button[aria-label*="close"], #auraCloseBtn, #wallpaperCloseBtn',
    );
    if (close) {
      close.click();
      return true;
    }
  }
  for (const [id, btn] of [
    ["shareModal", "shareCloseBtn"],
    ["bookmarksDropdown", "closeBookmarksBtn"],
    ["mapLayersFlyout", null],
    ["settingsPanel", null],
  ]) {
    const panel = document.getElementById(id);
    if (panel && !panel.classList.contains("hidden")) {
      const target = btn ? document.getElementById(btn) : panel;
      if (target) {
        if (btn) target.click();
        else {
          panel.classList.add("hidden");
          return true;
        }
        return true;
      }
    }
  }
  return false;
}
