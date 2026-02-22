// Billing toggle + Stripe Payment Link redirect

const STRIPE_LINKS = {
  pro_monthly:   'https://buy.stripe.com/PLACEHOLDER_PRO_MONTHLY',
  pro_annual:    'https://buy.stripe.com/PLACEHOLDER_PRO_ANNUAL',
  teams_monthly: 'https://buy.stripe.com/PLACEHOLDER_TEAMS_MONTHLY',
  teams_annual:  'https://buy.stripe.com/PLACEHOLDER_TEAMS_ANNUAL',
};

let isAnnual = false;

export function initPricing() {
  const toggleBtn = document.getElementById('billing-toggle');
  const labelMonthly = document.getElementById('label-monthly');
  const labelAnnual = document.getElementById('label-annual');
  const proBilled = document.getElementById('pro-billed');
  const teamsBilled = document.getElementById('teams-billed');
  const proBtn = document.getElementById('pro-cta');
  const teamsBtn = document.getElementById('teams-cta');

  function updatePricing() {
    document.querySelectorAll('.price-amount[data-monthly]').forEach(el => {
      el.textContent = isAnnual ? el.dataset.annual : el.dataset.monthly;
    });
    document.querySelectorAll('.price-period[data-monthly]').forEach(el => {
      el.innerHTML = isAnnual
        ? el.dataset.annual.replace('/ ', '/&nbsp;')
        : el.dataset.monthly.replace('/ ', '/&nbsp;');
    });
    if (proBilled) proBilled.textContent = isAnnual ? 'Billed $96 / year' : '\u00A0';
    if (teamsBilled) teamsBilled.textContent = isAnnual ? 'Billed $156 / seat / year' : '\u00A0';
    if (labelMonthly) labelMonthly.classList.toggle('billing-label-active', !isAnnual);
    if (labelAnnual) labelAnnual.classList.toggle('billing-label-active', isAnnual);
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-pressed', isAnnual);
      toggleBtn.classList.toggle('toggle-on', isAnnual);
    }
  }

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      isAnnual = !isAnnual;
      updatePricing();
    });
  }

  // Wire up Get Pro button
  if (proBtn) {
    proBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const link = isAnnual ? STRIPE_LINKS.pro_annual : STRIPE_LINKS.pro_monthly;
      window.location.href = link;
    });
  }

  // Wire up Contact Sales button
  if (teamsBtn) {
    teamsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.href = 'mailto:sales@pilosagents.com';
    });
  }

  updatePricing();
}
