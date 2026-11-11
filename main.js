(() => {
  'use strict';

  const FADE_MS = 1200;       // keep in sync with --fade in styles.css
  const MIN_INTRO_MS = 2400;  // shortest time the loader stays up
  const MAX_INTRO_MS = 6000;  // never keep a visitor waiting longer than this

  const body = document.body;
  const root = document.documentElement;
  const loader = document.getElementById('loader');
  const header = document.getElementById('header');
  const toggle = document.getElementById('navToggle');
  const menu = document.getElementById('navMenu');
  const hero = document.getElementById('top');
  const video = document.querySelector('.hero__video');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const clamp = (n) => Math.min(1, Math.max(0, n));

  /* ---------- Intro (plays once per session) ---------- */
  let seen = false;
  try { seen = sessionStorage.getItem('wwc-intro') === '1'; } catch (e) {}

  function reveal() {
    try { sessionStorage.setItem('wwc-intro', '1'); } catch (e) {}
    body.classList.remove('is-loading');
    body.classList.add('is-ready');
    if (loader) {
      loader.classList.add('is-done');
      setTimeout(() => loader.remove(), 1600);
    }
  }

  if (seen) {
    // Repeat visit: skip the loader
    if (loader) loader.remove();
    reveal();
  } else {
    const start = performance.now();

    const pageLoaded = new Promise((resolve) => {
      if (document.readyState === 'complete') resolve();
      else window.addEventListener('load', resolve, { once: true });
    });

    const videoReady = new Promise((resolve) => {
      if (!video || video.readyState >= 3) resolve();
      else {
        video.addEventListener('canplay', resolve, { once: true });
        video.addEventListener('error', resolve, { once: true });
      }
    });

    const timeout = new Promise((resolve) => setTimeout(resolve, MAX_INTRO_MS));

    Promise.race([Promise.all([pageLoaded, videoReady]), timeout]).then(() => {
      const wait = Math.max(0, MIN_INTRO_MS - (performance.now() - start));
      setTimeout(reveal, wait);
    });
  }

  /* ---------- Seamless video loop (crossfade between two copies) ---------- */
  if (video) {
    video.classList.add('is-active');

    if (reduceMotion) {
      video.removeAttribute('autoplay');
      video.pause();               // shows the poster instead of motion
    } else {
      const a = video;
      const b = a.cloneNode(true);
      a.removeAttribute('loop');
      b.removeAttribute('loop');
      b.removeAttribute('autoplay');
      b.classList.remove('is-active');
      b.muted = true;
      b.playsInline = true;
      b.setAttribute('aria-hidden', 'true');
      a.after(b);

      let front = a;
      let back = b;
      let swapping = false;

      function tick() {
        if (!swapping && front.duration && front.currentTime >= front.duration - FADE_MS / 1000) {
          swapping = true;
          back.currentTime = 0;
          back.play().catch(() => {});
          back.classList.add('is-active');
          front.classList.remove('is-active');

          const old = front;
          front = back;
          back = old;

          setTimeout(() => {
            back.pause();
            swapping = false;
          }, FADE_MS + 100);
        }
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);

      // Safety net (e.g. tab was in the background and the clip hit its end)
      [a, b].forEach((v) => {
        v.addEventListener('ended', () => {
          if (v === front && !swapping) {
            v.currentTime = 0;
            v.play().catch(() => {});
          }
        });
      });
    }
  }

  /* ---------- Heavier scroll (mouse wheel / trackpad) ---------- */
  const SCROLL_SPEED = 0.6;    // distance per wheel tick: 1 = normal, lower = heavier
  const SCROLL_EASE = 0.07;    // 0 to 1: lower = more drag before it settles

  function initHeavyScroll() {
    if (reduceMotion) return;
    if (window.matchMedia('(pointer: coarse)').matches) return;   // touch screens stay native

    let target = window.scrollY;
    let current = window.scrollY;
    let raf = null;
    let last = 0;

    const maxScroll = () => document.documentElement.scrollHeight - window.innerHeight;
    const jump = (y) => window.scrollTo({ top: y, behavior: 'instant' });

    function loop(now) {
      const dt = Math.min(48, now - (last || now));
      last = now;
      const k = 1 - Math.pow(1 - SCROLL_EASE, dt / 16.67);   // same feel on 60Hz and 120Hz screens
      current += (target - current) * k;

      if (Math.abs(target - current) < 0.5) {
        current = target;
        jump(current);
        raf = null;
        last = 0;
        return;
      }
      jump(current);
      raf = requestAnimationFrame(loop);
    }

    window.addEventListener('wheel', (e) => {
      if (e.ctrlKey) return;                                        // pinch-zoom
      if (body.classList.contains('is-loading') || body.classList.contains('menu-open')) return;
      if (e.target.closest && e.target.closest('textarea')) return; // let the message box scroll itself

      e.preventDefault();

      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 32;                              // lines to pixels
      else if (e.deltaMode === 2) dy *= window.innerHeight;         // pages to pixels

      target = Math.max(0, Math.min(maxScroll(), target + dy * SCROLL_SPEED));
      if (!raf) raf = requestAnimationFrame(loop);
    }, { passive: false });

    // Stay in sync when scrolling happens another way (anchor links, keyboard, scrollbar drag)
    window.addEventListener('scroll', () => {
      if (!raf) {
        target = window.scrollY;
        current = window.scrollY;
      }
    }, { passive: true });
  }
  initHeavyScroll();

  /* ---------- About: split text into words for the scroll highlight ---------- */
  const GREY = [195, 201, 210];   // matches --text-grey
  const NAVY = [0, 26, 64];       // matches --navy
  const SOFT = 5;                 // how many words are mid-transition at once (bigger = softer wave)

  const group = document.querySelector('[data-reveal-group]');
  const words = [];

  if (group) {
    group.querySelectorAll('[data-reveal]').forEach((el) => {
      const parts = el.textContent.trim().split(/\s+/);
      el.textContent = '';
      parts.forEach((w, i) => {
        const span = document.createElement('span');
        span.className = 'word';
        span.textContent = w;
        el.appendChild(span);
        if (i < parts.length - 1) el.appendChild(document.createTextNode(' '));
        words.push({ el: span, last: -1 });
      });
    });

    if (reduceMotion) group.classList.add('is-static');
  }

  function mix(t) {
    const c = GREY.map((g, i) => Math.round(g + (NAVY[i] - g) * t));
    return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
  }

  function updateReveal() {
    if (!group || reduceMotion) return;

    const rect = group.getBoundingClientRect();
    const vh = window.innerHeight;
    const startLine = vh * 0.85;   // highlight starts when the block's top reaches here
    const endLine = vh * 0.5;      // and finishes when the block's bottom reaches here
    const p = clamp((startLine - rect.top) / (startLine - endLine + rect.height));

    const n = words.length;
    for (let i = 0; i < n; i++) {
      const t = clamp((p * (n + SOFT) - i) / SOFT);
      const rounded = Math.round(t * 100) / 100;
      if (rounded !== words[i].last) {
        words[i].last = rounded;
        words[i].el.style.color = mix(rounded);
      }
    }
  }

  /* ---------- Hero transition (sets --p from 0 to 1 over the first 90% of the hero) ---------- */
  function updateHeroFade() {
    const range = hero.offsetHeight * 0.9;
    const p = clamp(window.scrollY / range);
    root.style.setProperty('--p', p.toFixed(3));
  }

  /* ---------- Scroll handling (one throttled handler) ---------- */
  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      header.classList.toggle('is-scrolled', window.scrollY > 40);
      updateHeroFade();
      updateReveal();
      ticking = false;
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  window.addEventListener('load', onScroll);
  onScroll();

  /* ---------- Contact pop-up + form (Formspree) ---------- */
  const modal = document.getElementById('contactModal');
  const openBtn = document.getElementById('contactOpen');
  const closeBtn = document.getElementById('contactClose');
  const form = document.getElementById('contactForm');

  if (modal && openBtn) {
    openBtn.addEventListener('click', () => {
      if (form) {
        const s = form.querySelector('.form__status');
        s.textContent = '';
        s.className = 'form__status';
      }
      modal.showModal();
      body.classList.add('modal-open');
    });

    closeBtn.addEventListener('click', () => modal.close());

    // Click on the dimmed area outside the box closes it
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.close(); });

    // Fires for every way of closing (button, Esc, backdrop, after sending)
    modal.addEventListener('close', () => body.classList.remove('modal-open'));
  }

  if (form) {
    const status = form.querySelector('.form__status');
    const btn = form.querySelector('.form__submit');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      status.textContent = '';
      status.className = 'form__status';
      btn.disabled = true;
      btn.textContent = 'Sending...';

      try {
        const res = await fetch(form.action, {
          method: 'POST',
          body: new FormData(form),
          headers: { Accept: 'application/json' }
        });
        if (!res.ok) throw new Error('Request failed');
        form.reset();
        status.textContent = 'Thank you. Your message has been sent.';
        status.classList.add('is-success');
        if (modal) setTimeout(() => { if (modal.open) modal.close(); }, 2800);
      } catch (err) {
        status.textContent = 'Something went wrong. Please try again or email us directly.';
        status.classList.add('is-error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Send message';
      }
    });
  }

  /* ---------- Mobile menu ---------- */
  function setMenu(open) {
    header.classList.toggle('is-open', open);
    body.classList.toggle('menu-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }

  toggle.addEventListener('click', () => setMenu(!header.classList.contains('is-open')));
  menu.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });
  window.addEventListener('resize', () => { if (window.innerWidth > 820) setMenu(false); });
})();