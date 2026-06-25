/**
 * DEMO · auth mock — bypassa login Google totalmente.
 * Define Auth com token fake e esconde o overlay de login assim que o DOM carrega.
 */
window.Auth = {
  token: 'demo-no-auth',
  user: 'demo@cft.com',
  init() { /* no-op */ },
  forceLogin() { /* no-op */ },
  signOut() { location.reload(); }
};

window.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('login-overlay');
  if (overlay) overlay.style.display = 'none';
  const userEl = document.getElementById('ab-user');
  if (userEl) userEl.textContent = 'modo demo';
  document.body.classList.add('demo-mode');
});
