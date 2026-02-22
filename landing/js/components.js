// Shared nav + footer components injected via JS
// Usage: import { renderNav, renderFooter } from '/js/components.js';

const GITHUB_URL = 'https://github.com/nicepkg/pilos-agents';
const DISCORD_URL = 'https://discord.gg/PLACEHOLDER';
const RELEASES_URL = 'https://github.com/nicepkg/pilos-agents/releases/latest';

export function renderNav(activePage = 'home') {
  const nav = document.createElement('nav');
  nav.className = 'nav';
  nav.innerHTML = `
    <div class="nav-inner">
      <a href="/" class="nav-logo">
        <span class="logo-icon">\u25C8</span>
        <span class="logo-text">Pilos Agents</span>
      </a>
      <div class="nav-links">
        <a href="/#features"${activePage === 'features' ? ' class="nav-active"' : ''}>Features</a>
        <a href="/#agents"${activePage === 'agents' ? ' class="nav-active"' : ''}>Multi-Agent</a>
        <a href="/#mcp"${activePage === 'mcp' ? ' class="nav-active"' : ''}>Integrations</a>
        <a href="/docs"${activePage === 'docs' ? ' class="nav-active"' : ''}>Docs</a>
        <a href="/pricing"${activePage === 'pricing' ? ' class="nav-active"' : ''}>Pricing</a>
        <a href="${RELEASES_URL}" class="nav-cta">Download</a>
      </div>
    </div>
  `;
  document.body.prepend(nav);

  // Scroll shadow
  window.addEventListener('scroll', () => {
    nav.classList.toggle('nav-scrolled', window.scrollY > 20);
  });
  // Apply on load if already scrolled
  nav.classList.toggle('nav-scrolled', window.scrollY > 20);
}

export function renderFooter() {
  const footer = document.createElement('footer');
  footer.className = 'footer';
  footer.innerHTML = `
    <div class="footer-inner">
      <div class="footer-top">
        <div class="footer-brand">
          <div class="footer-logo">
            <span class="logo-icon">\u25C8</span>
            <span class="logo-text">Pilos Agents</span>
          </div>
          <p class="footer-tagline">Your AI Development Team, on your Desktop.<br />Open core \u00B7 MIT License \u00B7 Built in public.</p>
          <div class="footer-badges">
            <span class="footer-badge">MIT License</span>
            <span class="footer-badge">Open Core</span>
            <span class="footer-badge">v1.4.0</span>
          </div>
        </div>
        <div class="footer-nav">
          <div class="footer-nav-col">
            <div class="footer-nav-title">Product</div>
            <a href="/#features">Features</a>
            <a href="/#agents">Multi-Agent</a>
            <a href="/#mcp">Integrations</a>
            <a href="/pricing">Pricing</a>
            <a href="${GITHUB_URL}/releases">Changelog</a>
          </div>
          <div class="footer-nav-col">
            <div class="footer-nav-title">Open Source</div>
            <a href="${GITHUB_URL}" target="_blank">GitHub</a>
            <a href="/docs">Documentation</a>
            <a href="${GITHUB_URL}/blob/main/CONTRIBUTING.md" target="_blank">Contributing</a>
            <a href="${GITHUB_URL}/blob/main/LICENSE" target="_blank">MIT License</a>
            <a href="${GITHUB_URL}/releases" target="_blank">Releases</a>
          </div>
          <div class="footer-nav-col">
            <div class="footer-nav-title">Community</div>
            <a href="${DISCORD_URL}" target="_blank">Discord</a>
            <a href="https://x.com/pilosagents" target="_blank">X / Twitter</a>
            <a href="https://reddit.com/r/pilosagents" target="_blank">Reddit</a>
            <a href="https://producthunt.com/posts/pilos-agents" target="_blank">Product Hunt</a>
          </div>
        </div>
        <div class="footer-newsletter">
          <div class="footer-nav-title">Stay in the loop</div>
          <p class="footer-newsletter-desc">Get release notes and early access announcements.</p>
          <form class="newsletter-form" onsubmit="return false;">
            <input type="email" class="newsletter-input" placeholder="your@email.com" />
            <button type="submit" class="newsletter-btn">Subscribe</button>
          </form>
          <p class="newsletter-note">No spam. Unsubscribe anytime.</p>
        </div>
      </div>
      <div class="footer-bottom">
        <p class="footer-copy">\u00A9 2026 Pilos Agents. Open source software released under the <a href="${GITHUB_URL}/blob/main/LICENSE" target="_blank">MIT License</a>.</p>
        <div class="footer-bottom-links">
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="${GITHUB_URL}/security" target="_blank">Security</a>
        </div>
      </div>
    </div>
  `;
  document.body.append(footer);
}
