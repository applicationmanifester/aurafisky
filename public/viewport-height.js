// public/viewport-height.js - Critical viewport height & initial theme setup (runs before paint)
// Ensures --vh CSS variable is set and dark theme class matches saved preference to avoid white flash

(function() {
  function setVh() {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', vh + 'px');
  }
  try {
    const savedMapStyle = localStorage.getItem('aurafisky_map_style');
    const isDark = savedMapStyle ? savedMapStyle === 'dark' : localStorage.getItem('aurafisky_theme') === 'dark';
    if (isDark) {
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  } catch (_) {}
  setVh();
  window.addEventListener('resize', setVh);
  window.addEventListener('orientationchange', setVh);
})();