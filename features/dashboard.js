// -- CUSTOMIZABLE DASHBOARD (Drag-to-Reorder Metric Cards) --

function initDashboardDrag() {
    const grid = document.querySelector(".grid-cols-2.gap-2\\.5");
    if (!grid) return;
    let dragEl = null;
    const onStart = (e) => {
      const card = e.target.closest(".metric-card");
      if (
        !card ||
        card.closest("#aqiCard") ||
        card.closest("#pollenCard") ||
        (card.closest(".col-span-2") && !card.classList.contains("metric-card"))
      )
        return;
      dragEl = card;
      dragEl.style.opacity = "0.5";
      dragEl.style.transform = "scale(1.02)";
    };
    const onEnd = (e) => {
      if (!dragEl) return;
      dragEl.style.opacity = "";
      dragEl.style.transform = "";
      const target = e.target.closest(".metric-card");
      if (target && target !== dragEl) {
        grid.insertBefore(dragEl, target.nextSibling);
      }
      dragEl = null;
    };
    grid.querySelectorAll(".metric-card").forEach((card) => {
      card.draggable = true;
      card.addEventListener("dragstart", onStart);
      card.addEventListener("dragend", onEnd);
    });
  }

export function init(app) {
  app.initDashboardDrag = initDashboardDrag;
}
