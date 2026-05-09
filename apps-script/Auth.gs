/**
 * Verifica ID token Google e valida contra whitelist em Config.
 * Retorna o email do utilizador autenticado ou lança erro.
 */
const Auth = {
  verify(token) {
    if (!token) throw new Error('Missing token');
    const url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token);
    const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) throw new Error('Invalid token');
    const info = JSON.parse(resp.getContentText());
    if (info.email_verified === false || info.email_verified === 'false') {
      throw new Error('Email not verified');
    }
    if (!info.email) throw new Error('Token has no email');
    const expectedAud = Config.get('client_id');
    if (expectedAud && info.aud !== expectedAud) {
      throw new Error('Token audience mismatch');
    }
    const wl = String(Config.get('whitelist_emails') || '')
      .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    if (wl.indexOf(info.email.toLowerCase()) === -1) {
      throw new Error('Email not authorized: ' + info.email);
    }
    return info.email.toLowerCase();
  }
};
