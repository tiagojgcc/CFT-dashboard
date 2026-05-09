/**
 * Google Identity Services (GIS) wrapper.
 * Mostra ecrã de login até obter um ID token válido. Token guardado em memória.
 *
 * Configurar antes de usar:
 *   window.CFT_CONFIG = { CLIENT_ID: '...', API_URL: '...' }
 *
 * O CLIENT_ID é o "Web client" criado em https://console.cloud.google.com/apis/credentials
 * (o mesmo valor deve estar na aba Config → client_id do Sheet).
 */
(function () {
  const Auth = {
    token: null,
    email: null,
    listeners: [],

    onChange(fn) { this.listeners.push(fn); },

    _emit() { this.listeners.forEach(fn => { try { fn(this.token, this.email); } catch (e) { console.error(e); } }); },

    init() {
      if (!window.CFT_CONFIG || !window.CFT_CONFIG.CLIENT_ID) {
        this._showError('CFT_CONFIG.CLIENT_ID não configurado.');
        return;
      }
      const ready = () => {
        if (!window.google || !google.accounts || !google.accounts.id) {
          setTimeout(ready, 100); return;
        }
        google.accounts.id.initialize({
          client_id: window.CFT_CONFIG.CLIENT_ID,
          callback: this._handleCredential.bind(this),
          auto_select: true,
          ux_mode: 'popup'
        });
        google.accounts.id.renderButton(
          document.getElementById('gsi-button'),
          { theme: 'filled_black', size: 'large', text: 'signin_with', shape: 'rectangular', logo_alignment: 'left' }
        );
        google.accounts.id.prompt();
      };
      ready();
    },

    _handleCredential(resp) {
      if (!resp || !resp.credential) {
        this._showError('Login falhou.');
        return;
      }
      const payload = JSON.parse(atob(resp.credential.split('.')[1]));
      this.token = resp.credential;
      this.email = payload.email;
      this._hideOverlay();
      this._emit();
    },

    _hideOverlay() {
      const o = document.getElementById('login-overlay');
      if (o) o.style.display = 'none';
    },

    _showOverlay() {
      const o = document.getElementById('login-overlay');
      if (o) o.style.display = 'flex';
    },

    _showError(msg) {
      const el = document.getElementById('gsi-error');
      if (el) el.textContent = msg;
    },

    forceLogin() {
      this.token = null; this.email = null;
      this._showOverlay();
      try { google.accounts.id.prompt(); } catch (e) {}
      this._emit();
    }
  };

  window.Auth = Auth;
})();
