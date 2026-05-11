/**
 * Tarefas manuais — criadas pelo admin no dashboard, visíveis na tab Trabalho.
 * Persistidas na aba "Tarefas" (criada on-the-fly se não existir).
 *
 * Colunas: id | criado_em | criado_por | titulo | descricao | id_atleta | atleta_nome | estado | resolvido_em | resolvido_por
 *
 * Estado: 'pendente' | 'resolvida'.
 */
const Tarefas = {
  SHEET_NAME: 'Tarefas',
  HEADERS: ['id', 'criado_em', 'criado_por', 'titulo', 'descricao', 'id_atleta', 'atleta_nome', 'estado', 'resolvido_em', 'resolvido_por'],

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

  create({ titulo, descricao, id_atleta, atleta_nome }, user) {
    const t = String(titulo || '').trim();
    if (!t) throw new Error('Título obrigatório');
    if (t.length < 3) throw new Error('Título demasiado curto (mínimo 3 caracteres)');
    const sh = this.sheet();
    const id = Utilities.getUuid();
    sh.appendRow([
      id, new Date(), user, t,
      String(descricao || '').trim(),
      id_atleta || '', atleta_nome || '',
      'pendente', '', ''
    ]);
    return { id, titulo: t, estado: 'pendente' };
  },

  list() {
    const sh = this.sheet();
    const last = sh.getLastRow();
    if (last < 2) return [];
    const values = sh.getRange(2, 1, last - 1, this.HEADERS.length).getValues();
    return values.map(r => ({
      id: r[0],
      criado_em: r[1],
      criado_por: r[2],
      titulo: r[3],
      descricao: r[4],
      id_atleta: r[5],
      atleta_nome: r[6],
      estado: r[7] || 'pendente',
      resolvido_em: r[8],
      resolvido_por: r[9]
    })).reverse();  // mais recentes primeiro
  },

  resolve(id, user) {
    return this._setEstado(id, 'resolvida', user);
  },

  reopen(id, user) {
    return this._setEstado(id, 'pendente', user);
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

  _setEstado(id, novoEstado, user) {
    const sh = this.sheet();
    const last = sh.getLastRow();
    if (last < 2) throw new Error('Tarefa não encontrada: ' + id);
    const ids = sh.getRange(2, 1, last - 1, 1).getValues().flat();
    const idx = ids.indexOf(id);
    if (idx === -1) throw new Error('Tarefa não encontrada: ' + id);
    const row = idx + 2;
    sh.getRange(row, 8).setValue(novoEstado);
    if (novoEstado === 'resolvida') {
      sh.getRange(row, 9).setValue(new Date());
      sh.getRange(row, 10).setValue(user);
    } else {
      sh.getRange(row, 9).setValue('');
      sh.getRange(row, 10).setValue('');
    }
    return { id, estado: novoEstado };
  }
};
