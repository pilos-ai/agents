// Docs sidebar scroll-spy

export function initDocs() {
  const links = document.querySelectorAll('.docs-nav-link');
  const sections = [];

  links.forEach(link => {
    const id = link.getAttribute('href')?.replace('#', '');
    if (id) {
      const el = document.getElementById(id);
      if (el) sections.push({ id, el, link });
    }
  });

  if (sections.length === 0) return;

  function updateActive() {
    let current = sections[0];

    for (const section of sections) {
      const rect = section.el.getBoundingClientRect();
      if (rect.top <= 120) {
        current = section;
      }
    }

    links.forEach(l => l.classList.remove('active'));
    if (current) current.link.classList.add('active');
  }

  window.addEventListener('scroll', updateActive, { passive: true });
  updateActive();

  // Smooth scroll for sidebar links
  links.forEach(link => {
    link.addEventListener('click', (e) => {
      const id = link.getAttribute('href')?.replace('#', '');
      const target = id ? document.getElementById(id) : null;
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        history.replaceState(null, '', `#${id}`);
      }
    });
  });
}
