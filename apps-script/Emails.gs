/**
 * Registo de emails preparados/abertos no Gmail compose.
 * Nesta fase NÃO envia email — só regista a intenção e marca quando o admin
 * confirma que carregou em "enviar" no Gmail.
 */
const Emails = {
  sheet() { return SpreadsheetApp.openById(SHEET_ID).getSheetByName('Emails'); },

  log({ template, assunto, corpo, destinatarios, ids_atletas }, user) {
    const sh = this.sheet();
    const id = Utilities.getUuid();
    sh.appendRow([
      id, new Date(), user,
      template || 'livre',
      assunto || '', corpo || '',
      Array.isArray(destinatarios) ? destinatarios.join(',') : String(destinatarios || ''),
      Array.isArray(ids_atletas) ? ids_atletas.join(',') : String(ids_atletas || ''),
      false
    ]);
    Historico.append({
      utilizador: user, id_atleta: '', atleta: '(múltiplos)',
      tipo: 'email_preparado', antes: '', depois: assunto || '', motivo: template || ''
    });
    return { id };
  },

  markSent(id, user) {
    const sh = this.sheet();
    const last = sh.getLastRow();
    if (last < 2) throw new Error('Email log vazio');
    const ids = sh.getRange(2, 1, last - 1, 1).getValues().flat();
    const idx = ids.indexOf(id);
    if (idx === -1) throw new Error('Email log não encontrado: ' + id);
    sh.getRange(idx + 2, 9).setValue(true);
    Historico.append({
      utilizador: user, id_atleta: '', atleta: '(múltiplos)',
      tipo: 'email_enviado', antes: '', depois: id, motivo: ''
    });
    return { id, abriu_no_gmail: true };
  },

  list() {
    const sh = this.sheet();
    const last = sh.getLastRow();
    if (last < 2) return [];
    const values = sh.getRange(2, 1, last - 1, 9).getValues();
    return values.map(r => ({
      id: r[0], timestamp: r[1], enviado_por: r[2], template: r[3],
      assunto: r[4], corpo: r[5], destinatarios: r[6], ids_atletas: r[7], abriu_no_gmail: r[8]
    })).reverse();
  }
};
