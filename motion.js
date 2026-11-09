// Scroll parallax for [data-parallax] elements (the home hero frames and the CTA photos).
// Decoration on top of a page that is complete without it: no JS or reduced motion leaves
// the static layout. data-parallax is the speed: 0.1 drifts 10% of the distance scrolled.
(function () {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reduceMotion.matches) return;

  const items = [...document.querySelectorAll('[data-parallax]')];
  if (!items.length) return;
  let queued = false;

  function render() {
    queued = false;
    const vh = window.innerHeight;
    items.forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.bottom < -200 || r.top > vh + 200) return; // off screen: nothing to do
      // distance of the element's middle from the middle of the screen, ignoring its own drift
      const drift = parseFloat(el.style.getPropertyValue('--y')) || 0;
      const fromCentre = (r.top - drift + r.height / 2) - vh / 2;
      el.style.setProperty('--y', (fromCentre * -parseFloat(el.dataset.parallax)).toFixed(1));
    });
  }
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(render); } };

  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', queue);
  queue();
})();
