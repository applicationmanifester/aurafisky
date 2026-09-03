// src/utils/ui/viewportHeight.js
export function updateViewportHeight() {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty("--vh", `${vh}px`);
}
// Initial set
updateViewportHeight();
window.addEventListener("resize", updateViewportHeight);
