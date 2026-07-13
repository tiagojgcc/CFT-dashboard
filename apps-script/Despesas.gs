/**
 * Despesas do campo — registadas pelo admin na tab Finanças.
 * Persistidas na aba "Despesas" (criada on-the-fly se não existir), para as
 * finanças serem partilhadas entre dispositivos e entre os dois admins
 * (antes viviam só no localStorage de um browser).
 *
 * Colunas: id | criado_em | criado_por | data | categoria | descricao | valor | semana
 *
 * semana ∈ {'', '1', '2'} — '' = geral/ambas.
 * A margem-alvo (número) vive na aba Config sob a chave 'fin_margem_alvo'.
 */
const Despesas = {
  SHEET_NAME: 'Despesas',
  HEADERS: ['id', 'criado_em', 'criado_por', 'data', 'categoria', 'descricao', 'valor', 'semana'],
  MARGEM_KEY: 'fin_margem_alvo',
  CATEGORIAS: ['Refeições', 'Staff (treinadores/fisio)', 'Equipamentos', 'Medalhas/Prémios', 'Gasóleo/Deslocações', 'Jantares equipa', 'Outro'],

  sheet() {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    let sh = ss.getSheetByName(this.SHEET_NAME);
    if (!sh) {
      sh = ss.insertSheet(this.SHEET_NAME);
      sh.getRange(1, 1, 1, this.HEADERS.length).setValues([this.HEADERS]).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
    return sh;
  },

  list() {
    const sh = this.sheet();
    const last = sh.getLastRow();
    if (last < 2) return [];
    const values = sh.getRange(2, 1, last - 1, this.HEADERS.length).getValues();
    return values.map(r => ({
      id: r[0],
      data: this._fmtData(r[3]),
      categoria: r[4] || 'Outro',
      descricao: r[5] || '',
      valor: Number(r[6]) || 0,
      semana: r[7] === '' || r[7] == null ? '' : String(r[7])
    }));
  },

  // Estado completo das finanças para o getAll.
  state() {
    return {
      despesas: this.list(),
      margemAlvo: this.getMargem()
    };
  },

  getMargem() {
    const v = Number(Config.get(this.MARGEM_KEY));
    return (v >= 0 && v <= 90) ? v : 35;
  },

  setMargem(valor, user) {
    let n = Number(valor);
    if (Number.isNaN(n)) n = 35;
    n = Math.max(0, Math.min(90, n));
    Config.set(this.MARGEM_KEY, n);
    return { margemAlvo: n };
  },

  add({ categoria, descricao, valor, semana }, user) {
    const v = Number(valor);
    if (Number.isNaN(v) || v <= 0) throw new Error('Valor tem de ser maior que zero');
    const cat = this.CATEGORIAS.indexOf(categoria) !== -1 ? categoria : 'Outro';
    const sem = (semana === '1' || semana === '2' || semana === 1 || semana === 2) ? String(semana) : '';
    const sh = this.sheet();
    const id = 'd' + Utilities.getUuid();
    const hoje = new Date();
    sh.appendRow([
      id, hoje, user, hoje,
      cat, String(descricao || '').trim(), v, sem
    ]);
    return { id, categoria: cat, descricao: String(descricao || '').trim(), valor: v, semana: sem, data: this._fmtData(hoje) };
  },

  remove(id) {
    const sh = this.sheet();
    const last = sh.getLastRow();
    if (last < 2) return { removed: false };
    const ids = sh.getRange(2, 1, last - 1, 1).getValues().flat();
    const idx = ids.indexOf(id);
    if (idx === -1) return { removed: false };
    sh.deleteRow(idx + 2);
    return { removed: true };
  },

  // Importa em bloco despesas vindas do localStorage antigo (migração única).
  // Cada item: {categoria, descricao, valor, semana, data?}. Devolve nº importadas.
  importBulk(items, user) {
    if (!Array.isArray(items) || items.length === 0) return { imported: 0 };
    const sh = this.sheet();
    const rows = [];
    items.forEach(it => {
      const v = Number(it && it.valor);
      if (Number.isNaN(v) || v <= 0) return;
      const cat = this.CATEGORIAS.indexOf(it.categoria) !== -1 ? it.categoria : 'Outro';
      const sem = (String(it.semana) === '1' || String(it.semana) === '2') ? String(it.semana) : '';
      const data = it.data ? new Date(it.data) : new Date();
      rows.push(['d' + Utilities.getUuid(), new Date(), user, isNaN(data.getTime()) ? new Date() : data,
        cat, String(it.descricao || '').trim(), v, sem]);
    });
    if (rows.length === 0) return { imported: 0 };
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, this.HEADERS.length).setValues(rows);
    return { imported: rows.length };
  },

  _fmtData(d) {
    if (d instanceof Date && !isNaN(d.getTime())) {
      const p = n => String(n).padStart(2, '0');
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    }
    return String(d || '').slice(0, 10);
  }
};
