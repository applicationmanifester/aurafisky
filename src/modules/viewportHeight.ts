// src/modules/viewportHeight.ts
// Ensures viewport height CSS variable is set for 100vh on mobile browsers

export function initViewportResizeListener() {
  const setVh = () => {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
  };
  setVh();
  window.addEventListener('resize', setVh);
  window.addEventListener('orientationchange', setVh);
}