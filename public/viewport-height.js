// public/viewport-height.js - Critical viewport height fix (runs before paint)
// Ensures --vh CSS variable is set for 100vh on mobile browsers

(function() {
  function setVh() {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', vh + 'px');
  }
  setVh();
  window.addEventListener('resize', setVh);
  window.addEventListener('orientationchange', setVh);
})();