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

  invalidate() { this._cache = null; }
};
