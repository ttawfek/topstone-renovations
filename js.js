// Shared behaviour for every page. Everything is progressive enhancement: each page is
// complete without this file (see the @media (scripting: none) rules in css/styles.css).

// mobile menu toggle (accessible: aria-expanded, Esc to close, resets on widen)
const header = document.querySelector('.site-header');
const burger = document.getElementById('navToggle');
if (header && burger) {
  const setOpen = (open) => {
    header.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', String(open));
    document.body.style.overflow = open ? 'hidden' : '';
  };
  burger.addEventListener('click', () => setOpen(burger.getAttribute('aria-expanded') !== 'true'));
  header.querySelectorAll('.nav-panel a').forEach(a => a.addEventListener('click', () => setOpen(false)));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && header.classList.contains('is-open')) { setOpen(false); burger.focus(); }
  });
  const wide = window.matchMedia('(min-width: 60em)');
  wide.addEventListener('change', (e) => { if (e.matches) setOpen(false); });
}

// header background and the mobile call bar both switch on once the page has moved.
// A sentinel + observer, not a scroll listener, so scrolling does no work here at all.
const sentinel = document.createElement('div');
sentinel.style.cssText = 'position:absolute;top:0;height:80px;width:1px;pointer-events:none';
document.body.prepend(sentinel);
new IntersectionObserver(([e]) => {
  document.documentElement.classList.toggle('is-scrolled', !e.isIntersecting);
}).observe(sentinel);

// scroll reveal (content is visible without JS).
// .reveal-stagger reveals its children one after another (--i drives the delay).
document.querySelectorAll('.reveal-stagger').forEach(el => {
  [...el.children].forEach((child, i) => child.style.setProperty('--i', i));
});
const revealIO = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('in'); revealIO.unobserve(e.target); }
  });
}, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
document.querySelectorAll('.reveal, .reveal-stagger, .reveal-wipe').forEach(el => revealIO.observe(el));

// hero background video: only plays when motion is welcome, and starts once the poster
// is in, so it never competes with it for bandwidth
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
document.querySelectorAll('[data-hero-video]').forEach(video => {
  video.addEventListener('playing', () => video.classList.add('is-playing'));
  const saveData = navigator.connection && navigator.connection.saveData;
  if (reduceMotion || saveData) return;
  const start = () => {
    const p = video.play();
    if (p && p.catch) p.catch(() => {});
  };
  const still = video.parentElement.querySelector('img.hero-media');
  if (!still || still.complete) start();
  else {
    still.addEventListener('load', start, { once: true });
    still.addEventListener('error', start, { once: true });
  }
});

// before / after sliders: drag anywhere on the photo, or Tab to it and use the arrow keys
// (the invisible range input is what the keyboard and screen readers talk to).
document.querySelectorAll('[data-ba]').forEach(box => {
  const range = box.querySelector('.ba-range');
  let dragging = false;
  let touched = false;
  const setPos = (pct) => {
    box.style.setProperty('--pos', pct + '%');
    range.value = pct;
  };
  const fromEvent = (e) => {
    const r = box.getBoundingClientRect();
    setPos(Math.round(Math.min(100, Math.max(0, (e.clientX - r.left) / r.width * 100))));
    touched = true;
  };
  box.addEventListener('pointerdown', (e) => {
    dragging = true;
    box.classList.add('is-dragging');
    // touch waits for movement: this might be the start of a vertical scroll
    if (e.pointerType === 'mouse') fromEvent(e);
  });
  box.addEventListener('pointermove', (e) => { if (dragging) fromEvent(e); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(type => box.addEventListener(type, () => {
    dragging = false;
    box.classList.remove('is-dragging');
  }));
  box.addEventListener('click', fromEvent);
  range.addEventListener('input', () => { touched = true; setPos(+range.value); });

  // a small sweep the first time it scrolls into view shows that it can be dragged
  if (reduceMotion) return;
  const hintIO = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return;
    hintIO.disconnect();
    const t0 = performance.now();
    const dur = 1100;
    const tick = (now) => {
      if (touched) return;
      const t = Math.min(1, (now - t0) / dur);
      setPos(Math.round(50 + Math.sin(t * Math.PI * 2) * 18 * (1 - t * 0.2)));
      if (t < 1) requestAnimationFrame(tick); else setPos(50);
    };
    requestAnimationFrame(tick);
  }, { threshold: 0.6 });
  hintIO.observe(box);
});

// tap-to-play videos: nothing downloads until the visitor asks for it, and starting one
// pauses any other so two never play over each other
const videoFrames = [...document.querySelectorAll('[data-video]')];
videoFrames.forEach(frame => {
  const video = frame.querySelector('video');
  const btn = frame.querySelector('.video-play');
  const label = btn.getAttribute('aria-label');
  const setPlaying = (on) => {
    frame.classList.toggle('is-playing', on);
    btn.setAttribute('aria-label', (on ? 'Pause: ' : 'Play: ') + label);
  };
  setPlaying(false);
  btn.addEventListener('click', () => {
    if (video.paused) {
      videoFrames.forEach(f => { if (f !== frame) f.querySelector('video').pause(); });
      const p = video.play();
      if (p && p.catch) p.catch(() => setPlaying(false));
    } else video.pause();
  });
  video.addEventListener('play', () => setPlaying(true));
  video.addEventListener('pause', () => setPlaying(false));
  video.addEventListener('ended', () => { video.currentTime = 0; setPlaying(false); });
});

// lightbox for [data-lightbox] links: previous / next through every photo on the page,
// arrow keys, swipe, and Esc to close
const lbLinks = [...document.querySelectorAll('[data-lightbox]')];
if (lbLinks.length) {
  const lb = document.createElement('div');
  lb.className = 'lb';
  lb.setAttribute('role', 'dialog');
  lb.setAttribute('aria-modal', 'true');
  lb.setAttribute('aria-label', 'Enlarged photo');
  lb.innerHTML =
    '<p class="lb-count" aria-live="polite"></p>' +
    '<img alt="">' +
    '<button type="button" class="lb-btn lb-x" aria-label="Close enlarged photo">&#10005;</button>' +
    '<button type="button" class="lb-btn lb-prev" aria-label="Previous photo">&#8592;</button>' +
    '<button type="button" class="lb-btn lb-next" aria-label="Next photo">&#8594;</button>';
  document.body.appendChild(lb);
  const lbImg = lb.querySelector('img');
  const lbCount = lb.querySelector('.lb-count');
  const lbClose = lb.querySelector('.lb-x');
  const lbPrev = lb.querySelector('.lb-prev');
  const lbNext = lb.querySelector('.lb-next');
  let current = 0;

  const show = (i) => {
    current = (i + lbLinks.length) % lbLinks.length;
    const link = lbLinks[current];
    const img = link.querySelector('img');
    lbImg.src = link.getAttribute('href');
    lbImg.alt = img ? img.alt : '';
    lbCount.textContent = (current + 1) + ' / ' + lbLinks.length;
  };
  const closeLb = () => {
    if (!lb.classList.contains('on')) return;
    lb.classList.remove('on');
    document.body.style.overflow = '';
    lbImg.removeAttribute('src');
    lbLinks[current].focus();
  };

  lbLinks.forEach((link, i) => link.addEventListener('click', (e) => {
    e.preventDefault();
    show(i);
    lb.classList.add('on');
    document.body.style.overflow = 'hidden';
    lbClose.focus();
  }));
  lbPrev.addEventListener('click', () => show(current - 1));
  lbNext.addEventListener('click', () => show(current + 1));
  lb.addEventListener('click', (e) => { if (e.target === lb || e.target === lbClose) closeLb(); });
  document.addEventListener('keydown', (e) => {
    if (!lb.classList.contains('on')) return;
    if (e.key === 'Escape') closeLb();
    else if (e.key === 'ArrowLeft') show(current - 1);
    else if (e.key === 'ArrowRight') show(current + 1);
    else if (e.key === 'Tab') { // keep focus inside the dialog
      const items = [lbClose, lbPrev, lbNext];
      const at = items.indexOf(document.activeElement);
      e.preventDefault();
      items[(at + (e.shiftKey ? -1 : 1) + items.length) % items.length].focus();
    }
  });
  let swipeX = null;
  lb.addEventListener('touchstart', (e) => { swipeX = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', (e) => {
    if (swipeX === null) return;
    const dx = e.changedTouches[0].clientX - swipeX;
    swipeX = null;
    if (Math.abs(dx) > 50) show(current + (dx < 0 ? 1 : -1));
  });
}

// contact form: submitted in place to /api/send (Resend). Without JS the form posts there
// directly and the redirect lands on #form-sent / #form-error.
document.querySelectorAll('form[data-api-form]').forEach(form => {
  const card = form.parentElement;
  const sent = card.querySelector('#form-sent');
  const failed = card.querySelector('#form-error');
  const btn = form.querySelector('[type="submit"]');
  const openedAt = Date.now();
  // greyed out until every required field is valid. aria-disabled (not disabled) keeps it
  // clickable, so a click still runs the browser's check and points at the missing field
  const sync = () => btn.setAttribute('aria-disabled', String(!form.checkValidity()));
  form.addEventListener('input', sync);
  form.addEventListener('change', sync);
  sync();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Sending…';
    failed.classList.remove('on');
    try {
      const data = Object.fromEntries(new FormData(form));
      data.elapsed = Date.now() - openedAt;
      const res = await fetch(form.action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out.ok) throw new Error(out.error || 'HTTP ' + res.status);
      form.hidden = true;
      sent.classList.add('on');
      sent.focus();
    } catch (err) {
      // keep what they typed, so trying again (or calling instead) is easy
      failed.classList.add('on');
      failed.focus();
      btn.disabled = false;
      btn.textContent = label;
    }
  });
});

// contact-us.html?service=Flooring (from a service page's "Request a Quote"): pre-pick the project type
const serviceAsked = new URLSearchParams(location.search).get('service');
const serviceSelect = document.getElementById('c-service');
if (serviceAsked && serviceSelect) {
  const opt = [...serviceSelect.options].find(o => o.text.toLowerCase() === serviceAsked.trim().toLowerCase());
  if (opt) serviceSelect.value = opt.value;
}

// footer year
document.querySelectorAll('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });

// instant page loads: browsers that support it fetch a page as soon as a link is hovered or
// pressed, so the click has nothing left to wait for. The others ignore this.
if (HTMLScriptElement.supports && HTMLScriptElement.supports('speculationrules')) {
  const rules = document.createElement('script');
  rules.type = 'speculationrules';
  rules.textContent = JSON.stringify({ prefetch: [{ where: { href_matches: '/*' }, eagerness: 'moderate' }] });
  document.head.appendChild(rules);
}
