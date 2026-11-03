// Render-blocking on purpose: marks <html> so reveal styles can hide content
// before first paint. If portfolio.js never clears the watchdog (blocked,
// 404, slow), the mark comes off after 2.5s and every reveal shows.
(function () {
  var d = document.documentElement;
  if (!('IntersectionObserver' in window)) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  d.classList.add('js');
  window.__mdWatchdog = setTimeout(function () { d.classList.remove('js'); }, 2500);
})();
