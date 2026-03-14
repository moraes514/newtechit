/* ============================================
   NewTechIT — Main Script
   ============================================ */

// ===== NAVBAR SCROLL EFFECT =====
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  if (window.scrollY > 40) {
    navbar.classList.add('scrolled');
  } else {
    navbar.classList.remove('scrolled');
  }
}, { passive: true });

// ===== SCROLL HINT HIDE =====
const scrollHint = document.querySelector('.hero-scroll-hint');
if (scrollHint) {
  window.addEventListener('scroll', () => {
    if (window.scrollY > 100) {
      scrollHint.style.opacity = '0';
      scrollHint.style.pointerEvents = 'none';
    } else {
      scrollHint.style.opacity = '1';
      scrollHint.style.pointerEvents = '';
    }
  }, { passive: true });
}

// ===== MOBILE MENU =====
const hamburger = document.getElementById('hamburger');
const navLinks = document.getElementById('navLinks');

hamburger.addEventListener('click', () => {
  hamburger.classList.toggle('active');
  navLinks.classList.toggle('open');
  document.body.style.overflow = navLinks.classList.contains('open') ? 'hidden' : '';
});

// Close mobile menu on link click
navLinks.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    hamburger.classList.remove('active');
    navLinks.classList.remove('open');
    document.body.style.overflow = '';
  });
});

// ===== PARTICLES =====
function createParticles() {
  const container = document.getElementById('particles');
  if (!container) return;

  const count = 30;
  for (let i = 0; i < count; i++) {
    const particle = document.createElement('div');
    particle.className = 'particle';

    const left = Math.random() * 100;
    const delay = Math.random() * 15;
    const duration = 8 + Math.random() * 12;
    const size = 1 + Math.random() * 3;

    particle.style.cssText = `
      left: ${left}%;
      animation-delay: ${delay}s;
      animation-duration: ${duration}s;
      width: ${size}px;
      height: ${size}px;
      opacity: ${0.3 + Math.random() * 0.5};
    `;
    container.appendChild(particle);
  }
}

createParticles();

// ===== SCROLL REVEAL =====
function initScrollReveal() {
  const serviceCards = document.querySelectorAll('.service-card');
  const trustCards = document.querySelectorAll('.trust-card');
  const stepCards = document.querySelectorAll('.step-card');
  const testimonialCards = document.querySelectorAll('.testimonial-card');
  const companyCards = document.querySelectorAll('.company-card');
  const cloudFeatures = document.querySelectorAll('.cloud-features li');

  // Helper: create IntersectionObserver that adds 'visible' when scrolled into view
  function makeRevealObserver(elements, delayFn) {
    elements.forEach((el, index) => {
      el.classList.add('reveal');
      const delay = delayFn ? delayFn(index) : 0;
      el.style.transitionDelay = delay + 'ms';

      const obs = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            el.classList.add('visible');
            obs.unobserve(el);
          }
        });
      }, { threshold: 0.05 });

      obs.observe(el);
    });
  }

  // Service cards
  serviceCards.forEach((card, index) => {
    const delay = parseInt(card.dataset.delay || '0');
    card.style.transitionDelay = delay + 'ms';

    const cardObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          cardObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.05 });

    cardObserver.observe(card);
  });

  // Trust, testimonial, company cards are handled by CSS directly (no JS animation needed)
  // They are always visible; CSS adds a subtle entrance animation via @keyframes


  // Observe step cards
  stepCards.forEach((card, index) => {
    const stepObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          setTimeout(() => {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
          }, index * 150);
          stepObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.05 });

    card.style.opacity = '0';
    card.style.transform = 'translateY(30px)';
    card.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    stepObserver.observe(card);
  });

  // Observe cloud features with stagger
  cloudFeatures.forEach((li, index) => {
    li.style.opacity = '0';
    li.style.transform = 'translateX(-20px)';
    li.style.transition = `opacity 0.5s ease ${index * 100}ms, transform 0.5s ease ${index * 100}ms`;

    const featureObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          li.style.opacity = '1';
          li.style.transform = 'translateX(0)';
          featureObserver.unobserve(li);
        }
      });
    }, { threshold: 0.05 });

    featureObserver.observe(li);
  });
}

initScrollReveal();


// ===== ANIMATE NUMBERS (Counter) =====
function animateCounter(el, target, suffix = '') {
  const duration = 1800;
  const step = 16;
  const steps = duration / step;
  const increment = target / steps;
  let current = 0;

  const timer = setInterval(() => {
    current += increment;
    if (current >= target) {
      current = target;
      clearInterval(timer);
    }
    el.textContent = Math.floor(current) + suffix;
  }, step);
}

// Counter observer
const statNumbers = document.querySelectorAll('.stat-number');
let countersTriggered = false;

const counterObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting && !countersTriggered) {
      countersTriggered = true;
      statNumbers.forEach(el => {
        const text = el.textContent.trim();
        if (text.includes('100+')) animateCounter(el, 100, '+');
        else if (text.includes('99.9%')) {
          let v = 0;
          const t = setInterval(() => {
            v += 2;
            if (v >= 99.9) { v = 99.9; clearInterval(t); }
            el.textContent = v.toFixed(1) + '%';
          }, 16);
        }
        // 24/7 stays as is
      });
    }
  });
}, { threshold: 0.5 });

statNumbers.forEach(el => counterObserver.observe(el));

// ===== CONTACT FORM =====
function handleFormSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('submitBtn');
  const success = document.getElementById('formSuccess');

  btn.textContent = 'Enviando...';
  btn.disabled = true;

  // Simulate form submission
  setTimeout(() => {
    btn.textContent = 'Solicitar Consultoria Gratuita';
    btn.disabled = false;
    success.style.display = 'block';
    e.target.reset();

    setTimeout(() => {
      success.style.display = 'none';
    }, 5000);
  }, 1500);
}

// ===== SMOOTH SECTION TRANSITIONS =====
// Add CSS variable for scroll progress
window.addEventListener('scroll', () => {
  const scrolled = window.scrollY;
  const maxScroll = document.body.scrollHeight - window.innerHeight;
  const progress = scrolled / maxScroll;
  document.documentElement.style.setProperty('--scroll-progress', progress);
}, { passive: true });

// ===== ACTIVE NAV LINK =====
const sections = document.querySelectorAll('section[id]');
const navLinkEls = document.querySelectorAll('.nav-links a[href^="#"]');

window.addEventListener('scroll', () => {
  let current = '';
  sections.forEach(section => {
    const sectionTop = section.offsetTop - 120;
    if (window.scrollY >= sectionTop) {
      current = section.getAttribute('id');
    }
  });

  navLinkEls.forEach(link => {
    link.classList.remove('active-link');
    if (link.getAttribute('href') === `#${current}`) {
      link.classList.add('active-link');
    }
  });
}, { passive: true });

// ===== CARD TILT EFFECT =====
document.querySelectorAll('.service-card, .trust-card').forEach(card => {
  card.addEventListener('mousemove', (e) => {
    const rect = card.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;

    card.style.transform = `
      translateY(-6px)
      rotateX(${-y * 5}deg)
      rotateY(${x * 5}deg)
    `;
    card.style.transformStyle = 'preserve-3d';
  });

  card.addEventListener('mouseleave', () => {
    card.style.transform = 'translateY(0) rotateX(0) rotateY(0)';
  });
});

// ===== TYPED HERO TITLE EFFECT (subtle word highlight) =====
const heroTitle = document.querySelector('.hero-title');
if (heroTitle) {
  heroTitle.style.opacity = '0';
  heroTitle.style.transform = 'translateY(30px)';
  heroTitle.style.transition = 'opacity 0.8s ease 0.1s, transform 0.8s ease 0.1s';
  
  setTimeout(() => {
    heroTitle.style.opacity = '1';
    heroTitle.style.transform = 'translateY(0)';
  }, 100);
}

// ===== ENSURE LOGO LINKS SCROLL TO TOP =====
document.querySelectorAll('.logo').forEach(logo => {
  logo.addEventListener('click', (e) => {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
});

// ===== PREVENT BROKEN LINKS FROM NAVIGATING =====
document.querySelectorAll('a[href="#"]').forEach(link => {
  link.addEventListener('click', e => e.preventDefault());
});

// ===== INIT =====
console.log('%cNewTechIT 🔴 Ready', 'color:#E30613; font-size:14px; font-weight:bold;');
