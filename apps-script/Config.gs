/**
 * Aba Config: key/value/notas. Lê tudo de uma vez para evitar I/O repetido.
 */
const Config = {
  _cache: null,

  sheet() {
    return SpreadsheetApp.openById(SHEET_ID).getSheetByName('Config');
  },

  all() {
    if (this._cache) return this._cache;
    const sh = this.sheet();
    const last = sh.getLastRow();
    const o = {};
    if (last >= 2) {
      const values = sh.getRange(2, 1, last - 1, 2).getValues();
      values.forEach(([k, v]) => { if (k) o[k] = v; });
    }
    this._cache = o;
    return o;
  },

  get(key) {
    return this.all()[key];
  },

  // Escreve (ou cria) uma chave na aba Config. Invalida a cache.
  set(key, value) {
    if (!key) throw new Error('Config.set: key obrigatória');
    const sh = this.sheet();
    const last = sh.getLastRow();
    let row = 0;
    if (last >= 2) {
      const keys = sh.getRange(2, 1, last - 1, 1).getValues().flat();
      const idx = keys.indexOf(key);
      if (idx !== -1) row = idx + 2;
    }
    if (row) sh.getRange(row, 2).setValue(value);
    else sh.appendRow([key, value, '']);
    this.invalidate();
    return { key, value };
  },

  invalidate() { this._cache = null; }
};
