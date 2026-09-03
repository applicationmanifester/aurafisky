// src/modules/viewportHeight.js
export function setViewportHeight() {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty('--vh', `${vh}px`);
}

export function initViewportResizeListener() {
  setViewportHeight();
  window.addEventListener('resize', setViewportHeight);
}
