/**
 * Operações sobre a aba Atletas (escrita + leitura).
 * Cada mutação:
 *   1. valida (motivo obrigatório onde aplicável)
 *   2. usa LockService para evitar race entre os 2 admins
 *   3. atualiza ultima_alteracao_em / por
 *   4. escreve evento em Historico
 */

// Mapeamento coluna (1-indexed) na aba Atletas — bate certo com Backfill.setupSheets
const ATL_COLS = {
  id_inscricao: 1, timestamp_inscricao: 2, atleta: 3, data_nascimento: 4,
  clube: 5, encarregado: 6, email: 7, telefone: 8,
  opcao_inscricao: 9, semanas_originais: 10, semanas_atuais: 11,
  tshirt: 12, tshirt_num: 13, tshirt_nome: 14,
  alergia_alim: 15, alergia_alim_qual: 16,
  medicacao: 17, medicacao_qual: 18,
  doenca: 19, doenca_qual: 20,
  alergia_med: 21, alergia_med_qual: 22,
  cc: 23, nif: 24, posicao: 25, melhorar: 26, contacto_emerg: 27,
  decl_responsabilidade: 28, decl_imagem: 29, decl_saida: 30,
  iban: 31, comprovativo_url: 32,
  valor_pago: 33, irmao_desconto: 34, ativo: 35,
  motivo_eliminacao: 36, eliminado_em: 37, eliminado_por: 38,
  notas_internas: 39, ultima_alteracao_em: 40, ultima_alteracao_por: 41,
  valor_confirmado: 42, valor_devido_override: 43, desconto_outro_motivo: 44,
  num_inscricao: 45, bank_confirmed_em: 46, bank_confirmed_por: 47
};
const ATL_NCOLS = 47;

const Inscricoes = {
  sheet() { return SpreadsheetApp.openById(SHEET_ID).getSheetByName('Atletas'); },

  getAll() {
    const sh = this.sheet();
    const last = sh.getLastRow();
    const atletas = [];
    if (last >= 2) {
      const values = sh.getRange(2, 1, last - 1, ATL_NCOLS).getValues();
      values.forEach(row => atletas.push(this._rowToObj(row)));
    }
    const cc = {};
    atletas.forEach(a => {
      if (a.ativo === true || a.ativo === 'TRUE') {
        cc[a.clube] = (cc[a.clube] || 0) + 1;
      }
    });
    // Deteção de possíveis duplicados: mesmo nome + mesmas semanas (entre atletas ativos)
    const dupGroups = {};
    atletas.forEach(a => {
      if (!a.ativo) return;
      const sems = Pricing.parseSems(a.semanas_atuais).join(',');
      const nome = String(a.atleta || '').trim().toLowerCase().replace(/\s+/g, ' ');
      if (!nome) return;
      const key = nome + '|' + sems;
      (dupGroups[key] = dupGroups[key] || []).push(a.id_inscricao);
    });
    atletas.forEach(a => {
      a.pricing = Pricing.classify(a, a.valor_pago, cc);
      a.desconto_motivo = Pricing.descontoMotivo(a, cc);
      const sems = Pricing.parseSems(a.semanas_atuais).join(',');
      const nome = String(a.atleta || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const key = nome + '|' + sems;
      const group = dupGroups[key] || [];
      a.duplicate_warning = group.length > 1;
      a.duplicate_ids = a.duplicate_warning ? group.filter(x => x !== a.id_inscricao) : [];
    });
    // Counts úteis: atletas únicos, inscrições (= soma das semanas), vagas por semana.
    // Definição combinada com user: 1 atleta em 2 semanas = 1 atleta + 2 inscrições.
    const ativos = atletas.filter(a => a.ativo);
    const uniqueKey = a => (String(a.atleta || '').trim().toLowerCase().replace(/\s+/g, ' ')) + '|' + (String(a.encarregado || a.email || '').trim().toLowerCase());
    const uniqueAtletas = new Set(ativos.map(uniqueKey)).size;
    const vagasPorSemana = { 1: 0, 2: 0, 3: 0 };
    ativos.forEach(a => {
      Pricing.parseSems(a.semanas_atuais).forEach(s => { if (vagasPorSemana[s] !== undefined) vagasPorSemana[s]++; });
    });
    const totalInscricoes = vagasPorSemana[1] + vagasPorSemana[2] + vagasPorSemana[3];
    return {
      atletas,
      historico: Historico.list().slice(0, 200),  // últimos 200 eventos (mais novos primeiro)
      emails: Emails.list().slice(0, 100),
      config: Config.all(),
      clube_counts: cc,
      counts: {
        atletas_ativos: ativos.length,
        atletas_unicos: uniqueAtletas,
        inscricoes:     totalInscricoes,
        vagas_por_semana: vagasPorSemana,
        total_vagas_ocupadas: totalInscricoes
      },
      banco_files: this._getBancoFiles(),
      lastUpdate: new Date().toISOString()
    };
  },

  _rowToObj(row) {
    const o = {};
    Object.keys(ATL_COLS).forEach(k => { o[k] = row[ATL_COLS[k] - 1]; });
    o.ativo = (o.ativo === true || o.ativo === 'TRUE' || o.ativo === '');
    o.irmao_desconto = (o.irmao_desconto === true || o.irmao_desconto === 'TRUE');
    o.valor_confirmado = (o.valor_confirmado === true || o.valor_confirmado === 'TRUE');
    return o;
  },

  _findRow(id) {
    const sh = this.sheet();
    const last = sh.getLastRow();
    if (last < 2) throw new Error('Atleta não encontrado: ' + id);
    const ids = sh.getRange(2, ATL_COLS.id_inscricao, last - 1, 1).getValues().flat();
    const idx = ids.indexOf(id);
    if (idx === -1) throw new Error('Atleta não encontrado: ' + id);
    return idx + 2;
  },

  _getBancoFiles() {
    try {
      const folderId = Config.get('banco_folder_id');
      if (!folderId) return [];
      const folder = DriveApp.getFolderById(String(folderId).trim());
      const files = folder.getFilesByType(MimeType.PDF);
      const out = [];
      while (files.hasNext()) {
        const f = files.next();
        out.push({ name: f.getName(), id: f.getId(), url: f.getUrl() });
      }
      out.sort((a, b) => a.name.localeCompare(b.name));
      return out;
    } catch (e) {
      Logger.log('_getBancoFiles erro: ' + e.message);
      return [];
    }
  },

  _stampUser(sh, r, user) {
    sh.getRange(r, ATL_COLS.ultima_alteracao_em).setValue(new Date());
    sh.getRange(r, ATL_COLS.ultima_alteracao_por).setValue(user);
  },

  _withLock(fn) {
    const lock = LockService.getDocumentLock();
    lock.waitLock(10000);
    try { return fn(); } finally { lock.releaseLock(); }
  },

  updateSemanas(id, novas, motivo, user) {
    if (!motivo || String(motivo).trim().length < 10) throw new Error('Motivo obrigatório (≥10 caracteres)');
    return this._withLock(() => {
      const sh = this.sheet();
      const r = this._findRow(id);
      const antes = sh.getRange(r, ATL_COLS.semanas_atuais).getValue();
      const novasStr = Array.isArray(novas) ? novas.join(',') : String(novas);
      // Em PT-PT, Sheets interpreta "1,2" como número decimal 1.2. Força formato texto
      // ANTES de escrever para que fique "1,2" como string e não 1.2 como número.
      const cell = sh.getRange(r, ATL_COLS.semanas_atuais);
      cell.setNumberFormat('@');
      cell.setValue(novasStr);
      this._stampUser(sh, r, user);
      const nome = sh.getRange(r, ATL_COLS.atleta).getValue();
      Historico.append({ utilizador: user, id_atleta: id, atleta: nome, tipo: 'alteracao_semanas', antes: String(antes), depois: novasStr, motivo });
      return { id, semanas_atuais: novasStr };
    });
  },

  softDelete(id, motivo, user) {
    if (!motivo || String(motivo).trim().length < 10) throw new Error('Motivo obrigatório (≥10 caracteres)');
    return this._withLock(() => {
      const sh = this.sheet();
      const r = this._findRow(id);
      sh.getRange(r, ATL_COLS.ativo).setValue(false);
      sh.getRange(r, ATL_COLS.motivo_eliminacao).setValue(motivo);
      sh.getRange(r, ATL_COLS.eliminado_em).setValue(new Date());
      sh.getRange(r, ATL_COLS.eliminado_por).setValue(user);
      this._stampUser(sh, r, user);
      const nome = sh.getRange(r, ATL_COLS.atleta).getValue();
      Historico.append({ utilizador: user, id_atleta: id, atleta: nome, tipo: 'soft_delete', antes: 'ativo', depois: 'inativo', motivo });
      return { id, ativo: false };
    });
  },

  reactivate(id, motivo, user) {
    if (!motivo || String(motivo).trim().length < 10) throw new Error('Motivo obrigatório (≥10 caracteres)');
    return this._withLock(() => {
      const sh = this.sheet();
      const r = this._findRow(id);
      sh.getRange(r, ATL_COLS.ativo).setValue(true);
      sh.getRange(r, ATL_COLS.motivo_eliminacao).setValue('');
      sh.getRange(r, ATL_COLS.eliminado_em).setValue('');
      sh.getRange(r, ATL_COLS.eliminado_por).setValue('');
      this._stampUser(sh, r, user);
      const nome = sh.getRange(r, ATL_COLS.atleta).getValue();
      Historico.append({ utilizador: user, id_atleta: id, atleta: nome, tipo: 'reativacao', antes: 'inativo', depois: 'ativo', motivo });
      return { id, ativo: true };
    });
  },

  updatePagamento(id, valor, user, autoConfirm) {
    return this._withLock(() => {
      const sh = this.sheet();
      const r = this._findRow(id);
      const antes = sh.getRange(r, ATL_COLS.valor_pago).getValue();
      const v = Number(valor) || 0;
      sh.getRange(r, ATL_COLS.valor_pago).setValue(v);
      // Edição manual confirma automaticamente; OCR não confirma.
      if (autoConfirm === true) {
        sh.getRange(r, ATL_COLS.valor_confirmado).setValue(true);
      }
      this._stampUser(sh, r, user);
      const nome = sh.getRange(r, ATL_COLS.atleta).getValue();
      Historico.append({ utilizador: user, id_atleta: id, atleta: nome, tipo: 'pagamento', antes: String(antes), depois: String(v), motivo: autoConfirm ? 'manual+confirmado' : '' });
      return { id, valor_pago: v, valor_confirmado: !!autoConfirm };
    });
  },

  confirmValor(id, valor, user) {
    return this._withLock(() => {
      const sh = this.sheet();
      const r = this._findRow(id);
      const v = Number(valor) || 0;
      const antes = sh.getRange(r, ATL_COLS.valor_pago).getValue();
      sh.getRange(r, ATL_COLS.valor_pago).setValue(v);
      sh.getRange(r, ATL_COLS.valor_confirmado).setValue(true);
      this._stampUser(sh, r, user);
      const nome = sh.getRange(r, ATL_COLS.atleta).getValue();
      Historico.append({ utilizador: user, id_atleta: id, atleta: nome, tipo: 'confirmacao_valor', antes: String(antes), depois: String(v), motivo: '' });
      return { id, valor_pago: v, valor_confirmado: true };
    });
  },

  unconfirmValor(id, user) {
    return this._withLock(() => {
      const sh = this.sheet();
      const r = this._findRow(id);
      sh.getRange(r, ATL_COLS.valor_confirmado).setValue(false);
      this._stampUser(sh, r, user);
      const nome = sh.getRange(r, ATL_COLS.atleta).getValue();
      Historico.append({ utilizador: user, id_atleta: id, atleta: nome, tipo: 'confirmacao_valor', antes: 'confirmado', depois: 'por confirmar', motivo: '' });
      return { id, valor_confirmado: false };
    });
  },

  markBankConfirmed(atletaId, user) {
    return this._withLock(() => {
      const sh = this.sheet();
      const r = this._findRow(atletaId);
      sh.getRange(r, ATL_COLS.bank_confirmed_em).setValue(new Date());
      sh.getRange(r, ATL_COLS.bank_confirmed_por).setValue(user);
      this._stampUser(sh, r, user);
      const nome = sh.getRange(r, ATL_COLS.atleta).getValue();
      Historico.append({ utilizador: user, id_atleta: atletaId, atleta: nome, tipo: 'bank_confirmed', antes: '', depois: 'sim', motivo: '' });
      return { id: atletaId, bank_confirmed_em: new Date() };
    });
  },

  unmarkBankConfirmed(atletaId, user) {
    return this._withLock(() => {
      const sh = this.sheet();
      const r = this._findRow(atletaId);
      sh.getRange(r, ATL_COLS.bank_confirmed_em).setValue('');
      sh.getRange(r, ATL_COLS.bank_confirmed_por).setValue('');
      this._stampUser(sh, r, user);
      const nome = sh.getRange(r, ATL_COLS.atleta).getValue();
      Historico.append({ utilizador: user, id_atleta: atletaId, atleta: nome, tipo: 'bank_confirmed', antes: 'sim', depois: '', motivo: 'desfeito' });
      return { id: atletaId, bank_confirmed_em: null };
    });
  },

  setDescontoOutro(id, motivo, user) {
    return this._withLock(() => {
      const sh = this.sheet();
      const r = this._findRow(id);
      const antes = sh.getRange(r, ATL_COLS.desconto_outro_motivo).getValue();
      const v = String(motivo || '').trim();
      sh.getRange(r, ATL_COLS.desconto_outro_motivo).setValue(v);
      this._stampUser(sh, r, user);
      const nome = sh.getRange(r, ATL_COLS.atleta).getValue();
      Historico.append({ utilizador: user, id_atleta: id, atleta: nome, tipo: 'ajuste_desconto', antes: String(antes || ''), depois: v, motivo: 'outro motivo' });
      return { id, desconto_outro_motivo: v };
    });
  },

  setDevidoOverride(id, valor, user) {
    return this._withLock(() => {
      const sh = this.sheet();
      const r = this._findRow(id);
      const antes = sh.getRange(r, ATL_COLS.valor_devido_override).getValue();
      const v = (valor === '' || valor === null || valor === undefined) ? '' : (Number(valor) || 0);
      sh.getRange(r, ATL_COLS.valor_devido_override).setValue(v);
      this._stampUser(sh, r, user);
      const nome = sh.getRange(r, ATL_COLS.atleta).getValue();
      Historico.append({ utilizador: user, id_atleta: id, atleta: nome, tipo: 'override_devido', antes: String(antes || ''), depois: String(v), motivo: 'desconto manual' });
      return { id, valor_devido_override: v };
    });
  },

  toggleIrmao(id, valor, user) {
    return this._withLock(() => {
      const sh = this.sheet();
      const r = this._findRow(id);
      const antes = sh.getRange(r, ATL_COLS.irmao_desconto).getValue();
      const v = !!valor;
      sh.getRange(r, ATL_COLS.irmao_desconto).setValue(v);
      this._stampUser(sh, r, user);
      const nome = sh.getRange(r, ATL_COLS.atleta).getValue();
      Historico.append({ utilizador: user, id_atleta: id, atleta: nome, tipo: 'ajuste_desconto', antes: String(antes), depois: String(v), motivo: 'toggle irmão' });
      return { id, irmao_desconto: v };
    });
  },

  addNota(id, nota, user) {
    if (!nota || String(nota).trim().length < 1) throw new Error('Nota vazia');
    return this._withLock(() => {
      const sh = this.sheet();
      const r = this._findRow(id);
      const antes = sh.getRange(r, ATL_COLS.notas_internas).getValue() || '';
      const stamp = Utilities.formatDate(new Date(), 'Europe/Lisbon', 'yyyy-MM-dd HH:mm');
      const novaNota = '[' + stamp + ' ' + user + '] ' + String(nota).trim();
      const depois = antes ? (antes + '\n' + novaNota) : novaNota;
      sh.getRange(r, ATL_COLS.notas_internas).setValue(depois);
      const nome = sh.getRange(r, ATL_COLS.atleta).getValue();
      Historico.append({ utilizador: user, id_atleta: id, atleta: nome, tipo: 'nota', antes: '', depois: String(nota).trim(), motivo: '' });
      return { id, notas_internas: depois };
    });
  }
};
