// T4BF Bonus Features — Interactions
(function () {
  'use strict';

  // Mobile hamburger toggle
  const hamburger = document.querySelector('.hamburger');
  const navLinks = document.querySelector('.nav-links');

  if (hamburger && navLinks) {
    hamburger.addEventListener('click', () => {
      navLinks.classList.toggle('open');
      hamburger.textContent = navLinks.classList.contains('open') ? '[x]' : '[=]';
    });

    // Close menu when a link is clicked
    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('open');
        hamburger.textContent = '[=]';
      });
    });
  }

  // Smooth scroll for anchor links (fallback for browsers without CSS scroll-behavior)
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', e => {
      const target = document.querySelector(link.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  // Active nav link highlighting
  const sections = document.querySelectorAll('section[id]');
  const navItems = document.querySelectorAll('.nav-links a');

  if (sections.length && navItems.length) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const id = entry.target.id;
          navItems.forEach(item => {
            item.classList.toggle('active', item.getAttribute('href') === '#' + id);
          });
        }
      });
    }, { rootMargin: '-20% 0px -70% 0px' });

    sections.forEach(section => observer.observe(section));
  }

  // Fade-in on scroll for feature sections
  const fadeEls = document.querySelectorAll('.feature-section');
  if (fadeEls.length) {
    const fadeObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          fadeObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });

    fadeEls.forEach(el => fadeObserver.observe(el));
  }

  // Typing animation on hero tagline
  const tagline = document.querySelector('.hero-tagline');
  if (tagline) {
    const text = tagline.dataset.text || tagline.textContent;
    tagline.innerHTML = '<span class="cursor">&nbsp;</span>';
    let i = 0;

    function typeChar() {
      if (i < text.length) {
        tagline.innerHTML = text.slice(0, i + 1) + '<span class="cursor">&nbsp;</span>';
        i++;
        setTimeout(typeChar, 35 + Math.random() * 25);
      } else {
        tagline.innerHTML = text + '<span class="cursor">&nbsp;</span>';
      }
    }

    // Start typing after a short delay
    setTimeout(typeChar, 600);
  }

  // Copy button on code blocks
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const block = btn.closest('.code-block');
      const code = block.querySelector('pre').textContent;

      navigator.clipboard.writeText(code).then(() => {
        const orig = btn.textContent;
        btn.textContent = 'copied!';
        btn.style.color = 'var(--green)';
        setTimeout(() => {
          btn.textContent = orig;
          btn.style.color = '';
        }, 1500);
      }).catch(() => {
        btn.textContent = 'failed';
        setTimeout(() => { btn.textContent = 'copy'; }, 1500);
      });
    });
  });
})();
