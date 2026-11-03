// Render-blocking on purpose. Sets, before first paint:
//   .js  reveal-on-scroll may hide content until it is revealed
//   .fx  the pinned, scroll-linked scenes are on
// If home.js never clears the watchdog (blocked, 404, slow), both classes come
// off after 2.5s and the page falls back to the plain, fully visible layout.
(function () {
  var d = document.documentElement;
  var reduced =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (
    reduced ||
    !("IntersectionObserver" in window) ||
    !window.requestAnimationFrame
  )
    return;
  d.classList.add("js", "fx");
  window.__mdWatchdog = setTimeout(function () {
    d.classList.remove("js", "fx");
  }, 2500);
})();
