/**
 * Audit log append-only.
 * Colunas: id_evento | timestamp | utilizador | id_atleta | atleta | tipo | antes | depois | motivo
 */
const Historico = {
  sheet() { return SpreadsheetApp.openById(SHEET_ID).getSheetByName('Historico'); },

  append({ utilizador, id_atleta, atleta, tipo, antes, depois, motivo }) {
    const sh = this.sheet();
    const id = Utilities.getUuid();
    sh.appendRow([id, new Date(), utilizador, id_atleta || '', atleta || '', tipo, antes || '', depois || '', motivo || '']);
    return id;
  },

  list() {
    const sh = this.sheet();
    const last = sh.getLastRow();
    if (last < 2) return [];
    const values = sh.getRange(2, 1, last - 1, 9).getValues();
    return values.map(r => ({
      id_evento: r[0], timestamp: r[1], utilizador: r[2], id_atleta: r[3],
      atleta: r[4], tipo: r[5], antes: r[6], depois: r[7], motivo: r[8]
    })).reverse();
  }
};
