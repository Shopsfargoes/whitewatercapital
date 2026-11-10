(() => {
    'use strict';
  
    const FADE_MS = 1200;       // keep in sync with --fade in styles.css
    const MIN_INTRO_MS = 2400;  // shortest time the loader stays up
    const MAX_INTRO_MS = 6000;  // never keep a visitor waiting longer than this
  
    const body = document.body;
    const loader = document.getElementById('loader');
    const header = document.getElementById('header');
    const toggle = document.getElementById('navToggle');
    const menu = document.getElementById('navMenu');
    const video = document.querySelector('.hero__video');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  
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
  
    /* ---------- Header: scrolled state ---------- */
    const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  
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