/* ==========================================================================
   Texas Department of Public Safety — ER:LC Roleplay
   Site interactions: nav, scroll fx, starfield, parallax, card tilt
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------- Footer year ---------------- */
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------------- Header scroll state + progress bar ---------------- */
  const header = document.getElementById('siteHeader');
  const progress = document.getElementById('scrollProgress');
  const sections = document.querySelectorAll('main .section, main .hero');
  const navLinkEls = document.querySelectorAll('.nav-links a[data-nav]');

  function onScroll() {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    header.classList.toggle('scrolled', scrollTop > 40);

    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const pct = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
    progress.style.width = pct + '%';

    // scrollspy: highlight the nav link for the section currently in view
    let current = null;
    sections.forEach(sec => {
      const rect = sec.getBoundingClientRect();
      if (rect.top <= 140 && rect.bottom > 140) current = sec.id;
    });
    navLinkEls.forEach(a => a.classList.toggle('active', a.dataset.nav === current));
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------------- Mobile nav toggle ---------------- */
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');
  navToggle.addEventListener('click', () => {
    const isOpen = navLinks.classList.toggle('open');
    navToggle.classList.toggle('open', isOpen);
    navToggle.setAttribute('aria-expanded', String(isOpen));
  });
  navLinks.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      navLinks.classList.remove('open');
      navToggle.classList.remove('open');
      navToggle.setAttribute('aria-expanded', 'false');
    });
  });

  /* ---------------- Reveal-on-scroll ---------------- */
  const revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry, i) => {
        if (entry.isIntersecting) {
          setTimeout(() => entry.target.classList.add('in-view'), i * 60);
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -60px 0px' });
    revealEls.forEach(el => io.observe(el));
  } else {
    revealEls.forEach(el => el.classList.add('in-view'));
  }

  /* ---------------- Hero parallax (seal drifts slower than scroll) ---------------- */
  const sealFrame = document.querySelector('.seal-frame');
  const heroBadgeGlow = document.querySelector('.hero-badge-glow');
  if (sealFrame && !reduceMotion) {
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        if (y < window.innerHeight) {
          sealFrame.style.transform = `translateY(${y * 0.18}px)`;
          if (heroBadgeGlow) heroBadgeGlow.style.transform = `translateX(-50%) translateY(${y * 0.1}px)`;
        }
        ticking = false;
      });
    }, { passive: true });
  }

  /* ---------------- Subtle 3D tilt on cards ---------------- */
  if (!reduceMotion && window.matchMedia('(hover: hover)').matches) {
    document.querySelectorAll('.card').forEach(card => {
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width - 0.5;
        const py = (e.clientY - rect.top) / rect.height - 0.5;
        card.style.transform = `translateY(-8px) rotateX(${(-py * 6).toFixed(2)}deg) rotateY(${(px * 6).toFixed(2)}deg)`;
      });
      card.addEventListener('mouseleave', () => {
        card.style.transform = '';
      });
    });
  }

  /* ---------------- Starfield canvas (hero background) ---------------- */
  const canvas = document.getElementById('starfield');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    let stars = [];
    let sparkStars = [];
    let width, height, dpr;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth = canvas.parentElement.offsetWidth;
      height = canvas.clientHeight = canvas.parentElement.offsetHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seedStars();
    }

    function seedStars() {
      const count = Math.floor((width * height) / 9000);
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() * 1.4 + 0.3,
        baseAlpha: Math.random() * 0.5 + 0.3,
        twinkleSpeed: Math.random() * 0.02 + 0.005,
        phase: Math.random() * Math.PI * 2
      }));

      // occasional 4-point "sparkle" stars (Texas lone-star flavor)
      const sparkCount = Math.max(4, Math.floor(count / 60));
      sparkStars = Array.from({ length: sparkCount }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        size: Math.random() * 3 + 2,
        phase: Math.random() * Math.PI * 2,
        speed: Math.random() * 0.015 + 0.008
      }));
    }

    function drawSpark(s, alpha) {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = '#f0b429';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-s.size, 0); ctx.lineTo(s.size, 0);
      ctx.moveTo(0, -s.size); ctx.lineTo(0, s.size);
      ctx.stroke();
      ctx.restore();
    }

    let t = 0;
    function render() {
      ctx.clearRect(0, 0, width, height);

      stars.forEach(s => {
        const alpha = s.baseAlpha + Math.sin(t * s.twinkleSpeed + s.phase) * 0.25;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${Math.max(0, alpha)})`;
        ctx.fill();
      });

      sparkStars.forEach(s => {
        const alpha = 0.15 + (Math.sin(t * s.speed + s.phase) * 0.5 + 0.5) * 0.35;
        drawSpark(s, alpha);
      });

      t += 1;
      if (!reduceMotion) requestAnimationFrame(render);
    }

    window.addEventListener('resize', resize);
    resize();
    render();
  }
});
