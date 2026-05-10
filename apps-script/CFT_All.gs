/**
 * Router. Substituir SHEET_ID pela cópia de teste primeiro.
 */
const SHEET_ID = '1LXOqqTt2Ct7xNtRvv_Nu38z5V3pza0NtacgxBM3_WSY';  // Sheet real ligado ao Forms (em geral@camposft.com)

function doGet(e)  { return handle_(e, 'GET'); }
function doPost(e) { return handle_(e, 'POST'); }

function handle_(e, method) {
  try {
    const body = (method === 'POST' && e.postData && e.postData.contents)
      ? JSON.parse(e.postData.contents) : {};
    const params = Object.assign({}, e.parameter || {}, body);
    const action = params.action;
    if (!action) throw new Error('Missing action');

    const user = Auth.verify(params.token);

    let result;
    switch (action) {
      case 'getAll':           result = Inscricoes.getAll(); break;
      case 'updateSemanas':    result = Inscricoes.updateSemanas(params.id, params.novas, params.motivo, user); break;
      case 'softDelete':       result = Inscricoes.softDelete(params.id, params.motivo, user); break;
      case 'reactivate':       result = Inscricoes.reactivate(params.id, params.motivo, user); break;
      case 'updatePagamento':  result = Inscricoes.updatePagamento(params.id, params.valor, user, params.confirm === true); break;
      case 'confirmValor':     result = Inscricoes.confirmValor(params.id, params.valor, user); break;
      case 'unconfirmValor':   result = Inscricoes.unconfirmValor(params.id, user); break;
      case 'setDevidoOverride':result = Inscricoes.setDevidoOverride(params.id, params.valor, user); break;
      case 'setDescontoOutro': result = Inscricoes.setDescontoOutro(params.id, params.motivo, user); break;
      case 'toggleIrmao':      result = Inscricoes.toggleIrmao(params.id, params.valor, user); break;
      case 'addNota':          result = Inscricoes.addNota(params.id, params.nota, user); break;
      case 'logEmail':         result = Emails.log(params, user); break;
      case 'markEmailSent':    result = Emails.markSent(params.id, user); break;
      case 'markTrabalhoResolved':
        Historico.append({ utilizador: user, id_atleta: params.atletaId || '', atleta: params.atletaNome || '', tipo: 'trabalho_resolvido', antes: '', depois: params.itemId, motivo: params.motivo || '' });
        result = { ok: true };
        break;
      case 'unmarkTrabalhoResolved':
        Historico.append({ utilizador: user, id_atleta: params.atletaId || '', atleta: params.atletaNome || '', tipo: 'trabalho_reaberto', antes: params.itemId, depois: '', motivo: params.motivo || '' });
        result = { ok: true };
        break;
      case 'readComprovativo': result = Comprovativo.readAndSave(params.id, user); break;
      case 'readAllPending':   result = Comprovativo.readAllPending(user); break;
      case 'banco_processAll': result = Banco.processAll(); break;
      case 'banco_matchAll':   result = Banco.matchAll(); break;
      case 'banco_delete':     result = Banco.deleteMovimento(params.movId); break;
      case 'banco_reprocessFile': result = Banco.reprocessFile(params.fileId); break;
      case 'banco_list':       result = Banco.list(); break;
      case 'banco_listForAtleta': result = Banco.listForAtleta(params.atletaId); break;
      case 'markBankConfirmed':   result = Inscricoes.markBankConfirmed(params.atletaId, user); break;
      case 'unmarkBankConfirmed': result = Inscricoes.unmarkBankConfirmed(params.atletaId, user); break;
      case 'banco_confirm':    result = Banco.confirmMatch(params.movId, params.atletaId, user); break;
      case 'banco_unconfirm':  result = Banco.unconfirmMatch(params.movId, user); break;
      case 'banco_reassign':   result = Banco.reassignMatch(params.movId, params.atletaId, user); break;
      default: throw new Error('Unknown action: ' + action);
    }
    return json_({ ok: true, user: user, data: result });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
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
/**
 * Lógica de preços CFT 2026.
 *
 * Externo: 275 € por semana, fixo.
 * Interno + inscrição até 31 mar:
 *    pronto: 330 (s/desc) | 295 (c/desc)
 *    prestações: 375 total (s/desc) | 330 total (c/desc) — 120 + (255 ou 210)
 * Interno + inscrição depois de 31 mar:
 *    pronto obrigatório: 375 (s/desc) | 330 (c/desc)
 *
 * Desconto se: irmao_desconto = TRUE  OU  nSem >= 2  OU  clube_count >= 8.
 *
 * Classificação a partir de valor_pago: o admin tipa o valor depois de ver o
 * comprovativo; o sistema classifica em pago / parcial_1 / parcial_2 / valor_errado.
 */
const Pricing = {
  parseSems(s) {
    if (s === null || s === undefined) return [];
    return String(s).split(/[,;+\s]+/)
      .map(x => parseInt(x, 10))
      .filter(n => !isNaN(n) && n >= 1 && n <= 3);
  },

  isExterno(opcao) {
    return String(opcao || '').trim().toLowerCase() === 'externo';
  },

  hasDesconto(atleta, clubeCounts) {
    if (atleta.irmao_desconto === true || atleta.irmao_desconto === 'TRUE') return true;
    if (this.parseSems(atleta.semanas_atuais).length >= 2) return true;
    if ((clubeCounts[atleta.clube] || 0) >= 8) return true;
    if (atleta.desconto_outro_motivo && String(atleta.desconto_outro_motivo).trim()) return true;
    return false;
  },

  // Devolve a razão textual do desconto (ou null se não há)
  descontoMotivo(atleta, clubeCounts) {
    if (atleta.irmao_desconto === true || atleta.irmao_desconto === 'TRUE') return 'irmão';
    if ((clubeCounts[atleta.clube] || 0) >= 8) return '8 atletas';
    if (this.parseSems(atleta.semanas_atuais).length >= 2) return '≥2 semanas';
    if (atleta.desconto_outro_motivo && String(atleta.desconto_outro_motivo).trim()) {
      return String(atleta.desconto_outro_motivo).trim();
    }
    return null;
  },

  isBeforeCutoff(timestamp) {
    const raw = Config.get('cutoff_desconto') || '2026-03-31';
    let cutoff;
    if (raw instanceof Date) {
      cutoff = new Date(raw.getFullYear(), raw.getMonth(), raw.getDate(), 23, 59, 59);
    } else {
      cutoff = new Date(String(raw) + 'T23:59:59');
    }
    if (isNaN(cutoff.getTime())) cutoff = new Date('2026-03-31T23:59:59');
    return new Date(timestamp) <= cutoff;
  },

  calc(atleta, clubeCounts) {
    const nSem = this.parseSems(atleta.semanas_atuais).length;
    if (nSem === 0) {
      return { tipo: 'sem_semanas', desc: false, prontoTotal: 0, prestTotal: null, prest1: null, prest2: null, nSem: 0 };
    }
    if (this.isExterno(atleta.opcao_inscricao)) {
      return { tipo: 'externo', desc: false, prontoTotal: 275 * nSem, prestTotal: null, prest1: null, prest2: null, nSem };
    }
    const desc = this.hasDesconto(atleta, clubeCounts);
    const before = this.isBeforeCutoff(atleta.timestamp_inscricao);
    const prontoPS = before ? (desc ? 295 : 330) : (desc ? 330 : 375);
    const prestPS  = before ? (desc ? 330 : 375) : null;
    const prontoTotal = prontoPS * nSem;
    const prestTotal  = prestPS ? prestPS * nSem : null;
    const prest1 = prestTotal !== null ? 120 * nSem : null;
    const prest2 = prestTotal !== null ? prestTotal - prest1 : null;
    return { tipo: 'interno', desc, before, prontoTotal, prestTotal, prest1, prest2, nSem };
  },

  classify(atleta, valorPago, clubeCounts) {
    const p = this.calc(atleta, clubeCounts);
    const v = Number(valorPago) || 0;
    // Override manual do devido (admin pode forçar valor diferente para descontos especiais)
    const overrideRaw = atleta.valor_devido_override;
    const hasOverride = overrideRaw !== '' && overrideRaw !== null && overrideRaw !== undefined && !isNaN(Number(overrideRaw));
    if (hasOverride) {
      const devido = Number(overrideRaw);
      let estado;
      if (v === 0) estado = 'pendente';
      else if (v === devido) estado = 'pago';
      else if (v < devido) estado = 'parcial_1';
      else estado = 'valor_errado';
      return { estado, regime: 'manual', devido, falta: Math.max(0, devido - v), info: p, override: true };
    }
    if (p.tipo === 'sem_semanas') return { estado: 'sem_semanas', regime: null, devido: 0, falta: 0, info: p };
    if (v === 0) return { estado: 'pendente', regime: null, devido: p.prontoTotal, falta: p.prontoTotal, info: p };
    if (p.tipo === 'externo') {
      if (v === p.prontoTotal) return { estado: 'pago', regime: 'externo', devido: p.prontoTotal, falta: 0, info: p };
      return { estado: 'valor_errado', regime: 'externo', devido: p.prontoTotal, falta: p.prontoTotal - v, info: p };
    }
    if (v === p.prontoTotal) return { estado: 'pago', regime: 'pronto', devido: p.prontoTotal, falta: 0, info: p };
    if (p.prestTotal !== null) {
      if (v === p.prestTotal) return { estado: 'pago', regime: 'prestacoes', devido: p.prestTotal, falta: 0, info: p };
      if (v === p.prest1)     return { estado: 'parcial_1', regime: 'prestacoes', devido: p.prestTotal, falta: p.prest2, info: p };
      if (v === p.prest2)     return { estado: 'parcial_2', regime: 'prestacoes', devido: p.prestTotal, falta: p.prest1, info: p };
    }
    // Sobrepagou: pago > maior valor possível esperado → "a devolver"
    const maxExpected = Math.max(p.prontoTotal, p.prestTotal || 0);
    if (v > maxExpected) {
      return { estado: 'a_devolver', regime: null, devido: maxExpected, sobra: v - maxExpected, falta: 0, info: p };
    }
    return { estado: 'valor_errado', regime: null, devido: p.prontoTotal, falta: p.prontoTotal - v, info: p };
  }
};
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
      sh.getRange(r, ATL_COLS.semanas_atuais).setValue(novasStr);
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
/**
 * Lê o valor pago a partir do comprovativo (PDF/imagem no Drive),
 * usando a Google Gemini API (visão multimodal) com a skill
 * "extrator-valor-comprovativos" como system instruction.
 *
 * GRATUITO no plano Free: 1500 calls/dia, sem cartão de crédito.
 *
 * SETUP (uma vez, no Apps Script):
 *   1. Abre https://aistudio.google.com/app/apikey
 *   2. Faz login com Google → "Create API key" → escolhe o projeto (ou cria novo) → copia
 *   3. No editor Apps Script: ⚙️ Configurações do projeto → Propriedades do script →
 *      Adicionar: GEMINI_API_KEY = AIza...
 */
const Comprovativo = {
  MODEL: 'gemini-2.5-flash-lite',
  API_URL: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent',
  MAX_FILE_BYTES: 20 * 1024 * 1024,  // 20 MB — limite Gemini inline

  extractFileId(url) {
    if (!url) return null;
    const patterns = [
      /\/file\/d\/([a-zA-Z0-9_-]+)/,
      /[?&]id=([a-zA-Z0-9_-]+)/,
      /\/d\/([a-zA-Z0-9_-]+)/,
      /^([a-zA-Z0-9_-]{20,})$/
    ];
    for (let i = 0; i < patterns.length; i++) {
      const m = String(url).match(patterns[i]);
      if (m) return m[1];
    }
    return null;
  },

  /**
   * Pede ao Gemini o valor exacto transferido. Devolve número (float) ou null.
   */
  extractValue(fileId) {
    const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY não definida. Vai a https://aistudio.google.com/app/apikey criar uma chave grátis e mete-a em ⚙️ Configurações do projeto → Propriedades do script.');
    }
    const file = DriveApp.getFileById(fileId);
    let mime = file.getMimeType();
    let blob;
    if (mime === 'application/vnd.google-apps.document' ||
        mime === 'application/vnd.google-apps.spreadsheet') {
      blob = file.getAs('application/pdf');
      mime = 'application/pdf';
    } else {
      blob = file.getBlob();
    }
    const bytes = blob.getBytes();
    if (bytes.length > this.MAX_FILE_BYTES) {
      throw new Error('Ficheiro grande demais (' + Math.round(bytes.length / 1024 / 1024) + ' MB)');
    }
    const base64 = Utilities.base64Encode(bytes);

    // Gemini aceita: image/* (jpeg, png, gif, webp, heic, heif), application/pdf, text/*
    const supported = (
      mime === 'application/pdf' ||
      mime.indexOf('image/') === 0 ||
      mime === 'text/plain'
    );
    if (!supported) {
      throw new Error('Tipo de ficheiro não suportado: ' + mime);
    }

    const payload = {
      system_instruction: { parts: [{ text: SKILL_PROMPT }] },
      contents: [{
        role: 'user',
        parts: [
          { inline_data: { mime_type: mime, data: base64 } },
          { text: 'Extrai o valor transferido neste comprovativo. Devolve apenas o número decimal (ex: 120.00) ou null.' }
        ]
      }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 20,
        responseMimeType: 'text/plain'
      }
    };

    const resp = UrlFetchApp.fetch(this.API_URL + '?key=' + encodeURIComponent(apiKey), {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    const code = resp.getResponseCode();
    if (code !== 200) {
      const body = resp.getContentText().slice(0, 300);
      throw new Error('Gemini API ' + code + ': ' + body);
    }
    const json = JSON.parse(resp.getContentText());
    const text = (json.candidates && json.candidates[0] && json.candidates[0].content
                  && json.candidates[0].content.parts && json.candidates[0].content.parts[0]
                  && json.candidates[0].content.parts[0].text)
      ? String(json.candidates[0].content.parts[0].text).trim() : '';
    if (!text || /^null$/i.test(text)) return null;
    const m = text.match(/-?\d+([.,]\d+)?/);
    if (!m) return null;
    const num = parseFloat(m[0].replace(',', '.'));
    if (isNaN(num)) return null;
    if (num < 0 || num > 10000) return null;
    return Math.abs(num);
  },

  forAtleta(atletaId) {
    const sh = Inscricoes.sheet();
    const r = Inscricoes._findRow(atletaId);
    const url = sh.getRange(r, ATL_COLS.comprovativo_url).getValue();
    const fileId = this.extractFileId(url);
    if (!fileId) return { amount: null, error: 'URL de comprovativo inválido ou vazio', url: url };
    try {
      const amount = this.extractValue(fileId);
      return { amount: amount, url: url, fileId: fileId };
    } catch (e) {
      return { amount: null, error: e.message, url: url };
    }
  },

  readAndSave(atletaId, user) {
    const result = this.forAtleta(atletaId);
    if (result.amount === null) {
      throw new Error(result.error || 'Não consegui extrair valor do comprovativo. Verifica o ficheiro manualmente.');
    }
    Inscricoes.updatePagamento(atletaId, result.amount, user);
    return { id: atletaId, valor_pago: result.amount };
  },

  readAllPending(user) {
    const all = Inscricoes.getAll();
    const pending = all.atletas.filter(function (a) {
      const v = Number(a.valor_pago) || 0;
      return v === 0 && a.comprovativo_url && a.ativo;
    });
    const results = [];
    pending.forEach(function (a, idx) {
      // Throttle: 5 segundos entre chamadas → ~12 RPM, abaixo dos 15 do plano grátis.
      if (idx > 0) Utilities.sleep(5000);
      try {
        const res = Comprovativo.forAtleta(a.id_inscricao);
        if (res.amount !== null) {
          Inscricoes.updatePagamento(a.id_inscricao, res.amount, user);
          results.push({ atleta: a.atleta, amount: res.amount, ok: true });
        } else {
          results.push({ atleta: a.atleta, error: res.error || 'sem valor extraído', ok: false });
        }
      } catch (e) {
        results.push({ atleta: a.atleta, error: e.message, ok: false });
      }
    });
    return { processed: results.length, results: results };
  }
};

// ============ SKILL PROMPT (extrator-valor-comprovativos) ============
const SKILL_PROMPT =
'# Extrator de Valor de Comprovativos de Pagamento\n' +
'\n' +
'## Tarefa\n' +
'Extrair o valor exato transferido num comprovativo de pagamento bancário português.\n' +
'OUTPUT: apenas o número decimal no formato XXX.XX (ponto como separador decimal, sem símbolo de moeda, sem texto à volta).\n' +
'- Output válido: 330.00, 120.00, 75.50\n' +
'- Output inválido: €330,00, "330 EUR", "O valor é 330.00"\n' +
'- Se não conseguir extrair com confiança razoável: devolver exatamente null\n' +
'\n' +
'## Regra fundamental\n' +
'O valor só conta se estiver associado a um destes labels:\n' +
'Montante, Montante e Moeda, Valor, Valor da Transferência, Importância a Transferir, Amount.\n' +
'Em apps bancárias, aceitar número grande visualmente em destaque, mas confirmar que NÃO é saldo.\n' +
'\n' +
'## Lista negra: NUNCA extrair valor destes contextos\n' +
'- Capital social no rodapé legal (ex: "Capital Social: 1.391.779.674 €", "4.525.714.495,00 €", "Cap. Soc. EUR 314.938.565,00") — ARMADILHA MAIS FREQUENTE\n' +
'- Número de conta / IBAN (ex: 000314774939020)\n' +
'- Referência de operação (ex: 6922INE05166713, OP000001070)\n' +
'- Cartão de cidadão (ex: CC31439321)\n' +
'- NIF / NIPC\n' +
'- Saldo disponível (ex: "Disponível 5008,24 €")\n' +
'- Comissão / Imposto / IVA / Custos / Total\n' +
'- Desconto narrado em descrição (ex: "considerando o desconto 75 euros")\n' +
'- Print Id, ID documento\n' +
'- Hora/data com formato numérico\n' +
'\n' +
'## Algoritmo\n' +
'1. Localizar label mais forte (preferência: Montante > Valor da Transferência > Importância a Transferir > Valor solto > número visualmente destacado).\n' +
'2. Ler número imediatamente adjacente ao label.\n' +
'3. Normalizar: 330,00 EUR → 330.00, EUR 275,00 → 275.00.\n' +
'4. Validar plausibilidade: 50 ≤ valor ≤ 600 EUR (intervalo típico de inscrições). Se obtiver valor fora deste intervalo, está provavelmente errado — voltar a procurar.\n' +
'5. Sinal negativo é informacional ("saída de conta"): output sempre positivo.\n' +
'\n' +
'## Casos especiais\n' +
'- Desconto narrado: o Montante já reflete o valor final. Ignorar o desconto narrado.\n' +
'- Talão Multibanco: label é "IMPORTÂNCIA A TRANSFERIR".\n' +
'- App bancária com número grande: aceitar SE for visualmente o protagonista E não estiver rotulado como "Disponível".\n' +
'- Comprovativo com comissão: valor a extrair é o Montante (o que chega), NÃO o Total. Ex: Montante 330,00 + Comissão 1,04 = Total 331,04 → output 330.00.\n' +
'- Documento ilegível: devolver null.\n' +
'\n' +
'## Exemplos\n' +
'\n' +
'Ex 1 — "Montante e Moeda: 120,00 EUR" → 120.00\n' +
'\n' +
'Ex 2 — "Valor: 120,00€ ... Capital Social: 1.391.779.674 €" → 120.00 (NÃO 674)\n' +
'\n' +
'Ex 3 — "Montante: 330,00EUR ... Capital Social 4.525.714.495,00 €" → 330.00 (NÃO 495)\n' +
'\n' +
'Ex 4 — "Montante: 330,00 € / Total custos 1,04 € / Cap. Soc. EUR 314.938.565,00" → 330.00\n' +
'\n' +
'Ex 5 — "Conta origem: 000314774939020 / Montante: 345,00 EUR" → 345.00\n' +
'\n' +
'Ex 6 — "Descrição: Vicente Ferraria CC31439321 / Valor da Transferência: EUR 120,00 / Imposto: EUR 0,00" → 120.00\n' +
'\n' +
'Ex 7 — App: "Enviado 330 €" topo / "Disponível 5008,24 €" → 330.00\n' +
'\n' +
'Ex 8 — "Pgt Gonçalo Reis (considerando o desconto 75 euros) / Montante: 220,00 EUR" → 220.00 (NÃO 75)\n' +
'\n' +
'Ex 9 — Talão MB: "IMPORTÂNCIA A TRANSFERIR: 295,00 EURO / N.CAIXA: 0010/0295/03 / CONTA: 002524237000001" → 295.00\n' +
'\n' +
'Ex 10 — Email: "Valor -275,00€" → 275.00\n' +
'\n' +
'Ex 11 — Imagem ilegível ou documento que não é comprovativo → null\n' +
'\n' +
'## Verificação final\n' +
'1. Valor entre 50 e 600 EUR?\n' +
'2. Label associado é dos labels válidos?\n' +
'3. NÃO é capital social, conta, referência, NIF, CC, saldo, comissão ou data?\n' +
'\n' +
'Se as 3 são SIM: devolver o número.\n' +
'Senão: devolver null.\n' +
'\n' +
'OUTPUT FINAL: apenas o número decimal (ex: 120.00) ou a palavra null. Nada mais.\n';
/**
 * Reconciliação bancária via extratos NovoBanco em PDF.
 * - Lê PDFs duma pasta no Drive
 * - Extrai transferências CRÉDITO via Gemini
 * - Persiste em "Banco_Movimentos" sheet
 * - Faz match automático com atletas (por valor + nome ordenante + nome atleta no info_adicional)
 * - Permite confirmação/correção manual via dashboard
 *
 * SETUP (uma vez):
 *   - Pasta partilhada: ID em Config.banco_folder_id
 *   - Gemini API key (já está em Properties)
 */
const Banco = {
  MODEL: 'gemini-2.5-flash-lite',
  API_URL: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent',

  folderId() {
    const id = Config.get('banco_folder_id');
    if (!id) throw new Error('Config "banco_folder_id" em falta. Mete o ID da pasta partilhada na aba Config.');
    return String(id).trim();
  },

  setupSheet() {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    let sh = ss.getSheetByName('Banco_Movimentos');
    if (sh) return;
    sh = ss.insertSheet('Banco_Movimentos');
    sh.appendRow([
      'id_movimento','extrato_filename','extrato_fileid',
      'data_operacao','data_valor','valor',
      'nome_ordenante','iban_ordenante','info_adicional','referencia',
      'atleta_match_id','match_score','match_status',
      'confirmado','confirmado_em','confirmado_por'
    ]);
    sh.getRange(1,1,1,16).setFontWeight('bold').setBackground('#1a1a1a').setFontColor('#fff');
    sh.setFrozenRows(1);
  },

  sheet() {
    return SpreadsheetApp.openById(SHEET_ID).getSheetByName('Banco_Movimentos');
  },

  getProcessedFileIds() {
    const sh = this.sheet();
    if (!sh || sh.getLastRow() < 2) return new Set();
    const ids = sh.getRange(2, 3, sh.getLastRow() - 1, 1).getValues().flat();
    return new Set(ids.filter(Boolean));
  },

  // Gemini extraction
  extractTransfers(fileId) {
    const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    if (!apiKey) throw new Error('GEMINI_API_KEY em falta');
    const file = DriveApp.getFileById(fileId);
    const blob = file.getBlob();
    const base64 = Utilities.base64Encode(blob.getBytes());
    const payload = {
      system_instruction: { parts: [{ text: BANCO_PROMPT }] },
      contents: [{
        role: 'user',
        parts: [
          { inline_data: { mime_type: 'application/pdf', data: base64 } },
          { text: 'Extrai TODAS as transferências CRÉDITO recebidas neste extrato como JSON.' }
        ]
      }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 8000,  // ~50 transferências máx — mais é alucinação
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              data_operacao:  { type: 'STRING' },
              data_valor:     { type: 'STRING' },
              valor:          { type: 'NUMBER' },
              nome_ordenante: { type: 'STRING' },
              iban_ordenante: { type: 'STRING' },
              info_adicional: { type: 'STRING' },
              referencia:     { type: 'STRING' }
            },
            required: ['data_operacao','valor','nome_ordenante']
          }
        },
        // Desativa "thinking" para libertar todos os tokens para o output (Gemini 2.5 lite tem thinking on por defeito)
        thinkingConfig: { thinkingBudget: 0 }
      }
    };
    const resp = UrlFetchApp.fetch(this.API_URL + '?key=' + encodeURIComponent(apiKey), {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    const code = resp.getResponseCode();
    if (code !== 200) throw new Error('Gemini ' + code + ': ' + resp.getContentText().slice(0, 300));
    const json = JSON.parse(resp.getContentText());
    const cand = json.candidates && json.candidates[0];
    const finishReason = cand && cand.finishReason;
    const text = cand && cand.content && cand.content.parts && cand.content.parts[0] && cand.content.parts[0].text;
    if (!text) throw new Error('Gemini resposta vazia (finishReason=' + finishReason + ')');
    let arr;
    try {
      arr = JSON.parse(text);
    } catch (e) {
      // Tenta recuperar JSON truncado: completa array com ']' se faltar
      Logger.log('JSON inválido, tentando recuperar... finishReason=' + finishReason + ', tamanho=' + text.length);
      const recovered = this._tryRecoverTruncatedJson(text);
      if (recovered) {
        Logger.log('Recuperados ' + recovered.length + ' itens do JSON truncado');
        return recovered;
      }
      throw new Error('JSON inválido (finishReason=' + finishReason + ', tamanho=' + text.length + '): ' + text.slice(0, 300) + '...' + text.slice(-200));
    }
    if (!Array.isArray(arr)) throw new Error('Gemini não devolveu array');
    // Deduplicar — Gemini às vezes entra em loop a repetir entradas
    const seen = new Set();
    const unique = [];
    arr.forEach(t => {
      if (!t) return;
      const key = String(t.data_operacao || '') + '|' + (Number(t.valor) || 0).toFixed(2) + '|' + String(t.nome_ordenante || '').trim().toLowerCase();
      if (!seen.has(key)) { seen.add(key); unique.push(t); }
    });
    if (unique.length !== arr.length) {
      Logger.log('Dedup: ' + arr.length + ' → ' + unique.length + ' (removidos ' + (arr.length - unique.length) + ' duplicados)');
    }
    return unique;
  },

  // Recupera JSON truncado descartando o último item incompleto
  _tryRecoverTruncatedJson(text) {
    try {
      // Encontra o último '}' completo seguido de '},' ou '}'
      const lastClose = text.lastIndexOf('}');
      if (lastClose < 0) return null;
      // Tenta cortar no último } e fechar o array
      const candidate = text.slice(0, lastClose + 1) + ']';
      const arr = JSON.parse(candidate);
      if (Array.isArray(arr)) return arr;
    } catch (e) {}
    // Estratégia 2: tenta um } a menos
    try {
      const closes = [];
      for (let i = 0; i < text.length; i++) if (text[i] === '}') closes.push(i);
      // Trim ate ao penúltimo }
      if (closes.length >= 2) {
        const idx = closes[closes.length - 2];
        const candidate = text.slice(0, idx + 1) + ']';
        const arr = JSON.parse(candidate);
        if (Array.isArray(arr)) return arr;
      }
    } catch (e) {}
    return null;
  },

  // Lista negra: padrões que NUNCA devem ser tratados como crédito de inscrição
  // (Gemini às vezes confunde débitos e créditos).
  _isFalsePositive(t) {
    const text = ((t.nome_ordenante || '') + ' ' + (t.info_adicional || '') + ' ' + (t.referencia || '')).toLowerCase();
    const patterns = [
      /ordem\s+permanente/,
      /perguicar|contabilid/,
      /google\s*workspace|workspace_camp/,
      /netflix|spotify|amazon\s*prime/,
      /cart[aã]o\s+\*+|\*{4}\d{3,}\*?/,
      /comiss[aã]o|imp\s*s\/?com|impost/,
      /pagamento\s+servi[cç]o/,
      /sepa\+\s+para\s+/,  // "Trf Sepa+ Para X" = saída
      /saldo\s+anterior|saldo\s+contabil/,
      /^trf\s+.*\s+para\s+/i
    ];
    return patterns.some(re => re.test(text));
  },

  saveTransfers(filename, fileId, transfers) {
    const sh = this.sheet();
    let saved = 0, skipped = 0;
    transfers.forEach(t => {
      if (this._isFalsePositive(t)) { skipped++; return; }
      const valor = Number(t.valor) || 0;
      // Inscrições são tipicamente entre 50€ e 1500€. Filtra valores fora deste intervalo.
      if (valor < 30 || valor > 2000) { skipped++; return; }
      sh.appendRow([
        Utilities.getUuid(), filename, fileId,
        t.data_operacao || '', t.data_valor || '', valor,
        t.nome_ordenante || '', t.iban_ordenante || '', t.info_adicional || '', t.referencia || '',
        '', 0, 'pendente',
        false, '', ''
      ]);
      saved++;
    });
    if (skipped > 0) Logger.log('saveTransfers ' + filename + ': guardados ' + saved + ', filtrados ' + skipped + ' (débitos/falsos positivos)');
  },

  deleteMovimento(movId) {
    const sh = this.sheet();
    const last = sh.getLastRow();
    if (last < 2) return;
    const ids = sh.getRange(2, 1, last - 1, 1).getValues().flat();
    const idx = ids.indexOf(movId);
    if (idx === -1) throw new Error('Movimento não encontrado');
    sh.deleteRow(idx + 2);
    return { ok: true };
  },

  // Apaga todos os movimentos que correspondem aos padrões de débito (Perguicar, Google, etc.)
  cleanFalsePositives() {
    const sh = this.sheet();
    const last = sh.getLastRow();
    if (last < 2) return { deleted: 0 };
    const data = sh.getRange(2, 1, last - 1, 16).getValues();
    let deleted = 0;
    for (let i = data.length - 1; i >= 0; i--) {
      const t = {
        nome_ordenante: data[i][6],
        info_adicional: data[i][8],
        referencia: data[i][9]
      };
      if (this._isFalsePositive(t)) {
        Logger.log('Apagado: ' + data[i][6] + ' / ' + data[i][8] + ' / ' + data[i][5] + '€');
        sh.deleteRow(i + 2);
        deleted++;
      }
    }
    return { deleted };
  },

  // Apaga TUDO e re-extrai com o prompt atual. Perde confirmações.
  forceReprocessAll() {
    const sh = this.sheet();
    if (sh.getLastRow() >= 2) {
      sh.deleteRows(2, sh.getLastRow() - 1);
    }
    return this.processAll();
  },

  // Reprocessa um ficheiro específico: apaga todos os seus movimentos e re-extrai
  reprocessFile(fileId) {
    const sh = this.sheet();
    const last = sh.getLastRow();
    if (last >= 2) {
      const fileIds = sh.getRange(2, 3, last - 1, 1).getValues().flat();
      // Apaga de baixo para cima para não desalinhar índices
      for (let i = fileIds.length - 1; i >= 0; i--) {
        if (fileIds[i] === fileId) sh.deleteRow(i + 2);
      }
    }
    const file = DriveApp.getFileById(fileId);
    const transfers = this.extractTransfers(fileId);
    this.saveTransfers(file.getName(), fileId, transfers);
    this.matchAll();
    return { file: file.getName(), inserted: transfers.length };
  },

  // Processa todos os PDFs da pasta que ainda não foram processados.
  processAll() {
    this.setupSheet();
    const folder = DriveApp.getFolderById(this.folderId());
    const files = folder.getFilesByType(MimeType.PDF);
    const processed = this.getProcessedFileIds();
    const results = [];
    let count = 0;
    while (files.hasNext()) {
      const f = files.next();
      if (processed.has(f.getId())) {
        results.push({ file: f.getName(), skipped: true });
        continue;
      }
      if (count > 0) Utilities.sleep(5000);  // throttle Gemini RPM
      count++;
      try {
        const transfers = this.extractTransfers(f.getId());
        this.saveTransfers(f.getName(), f.getId(), transfers);
        results.push({ file: f.getName(), inserted: transfers.length, ok: true });
        Logger.log(f.getName() + ': ' + transfers.length + ' transferências');
      } catch (e) {
        results.push({ file: f.getName(), error: e.message, ok: false });
        Logger.log(f.getName() + ': ERRO ' + e.message);
      }
    }
    const matchResult = this.matchAll();
    return { processed: count, results, totalMatched: matchResult.matched };
  },

  // Normaliza IBAN: remove espaços e maiúsculas
  _normIban(iban) { return String(iban || '').replace(/\s+/g, '').toUpperCase(); },

  // Match algorithm em 3 níveis: IBAN > nome+valor > nome só.
  // Não sobrescreve matches já confirmados manualmente.
  matchAll() {
    const sh = this.sheet();
    const last = sh.getLastRow();
    if (last < 2) return { matched: 0 };
    const all = Inscricoes.getAll();
    const atletas = all.atletas.filter(a => a.ativo);
    // Indexa atletas por IBAN (normalizado)
    const byIban = {};
    atletas.forEach(a => {
      const ib = this._normIban(a.iban);
      if (ib && ib.length >= 15) {
        (byIban[ib] = byIban[ib] || []).push(a);
      }
    });
    const range = sh.getRange(2, 1, last - 1, 16).getValues();
    let matched = 0;
    range.forEach((row, idx) => {
      if (row[12] === 'confirmado' || row[13] === true || row[13] === 'TRUE') return;  // não mexer em confirmados
      const valor = Number(row[5]) || 0;
      const ordenante = String(row[6] || '').toLowerCase();
      const ibanOrd = this._normIban(row[7]);
      const info = String(row[8] || '').toLowerCase();
      const sheetRow = idx + 2;
      let chosen = null;
      let score = 0;
      let status = 'sem_match';
      // 1) Match por IBAN — mais fiável (não exige valor exato)
      if (ibanOrd && byIban[ibanOrd]) {
        const cands = byIban[ibanOrd];
        if (cands.length === 1) {
          chosen = cands[0]; score = 0.95; status = 'auto_iban';
        } else {
          // Vários atletas com mesmo IBAN (irmãos): preferir o que casa o valor
          const exactValor = cands.find(a => Number(a.valor_pago) === valor);
          chosen = exactValor || cands[0];
          score = exactValor ? 0.85 : 0.6;
          status = exactValor ? 'auto_iban' : 'auto_iban_ambiguo';
        }
      }
      // 2) Match por nome (encarregado vs ordenante, ou atleta vs info_adicional).
      // Não exige valor exato — assim apanha pagamentos parciais (ex: pai paga 120€ mas devido é 295€).
      if (!chosen) {
        const candidates = atletas.filter(a => {
          const enc = String(a.encarregado || '').toLowerCase();
          if (enc && ordenante) {
            const encWords = enc.split(/\s+/).filter(w => w.length > 3);
            const matchedWords = encWords.filter(w => ordenante.indexOf(w) !== -1);
            if (matchedWords.length >= 2) return true;
          }
          const nome = String(a.atleta || '').toLowerCase();
          if (nome && info && info.indexOf('notprovided') === -1) {
            const nomeWords = nome.split(/\s+/).filter(w => w.length > 3);
            const matchedWords = nomeWords.filter(w => info.indexOf(w) !== -1);
            if (matchedWords.length >= 2) return true;
          }
          return false;
        });
        if (candidates.length === 1) {
          chosen = candidates[0]; score = 0.85; status = 'auto_nome';
        } else if (candidates.length > 1) {
          // Mais que um atleta com mesmo encarregado (irmãos): preferir o que tem valor exato
          const exactValor = candidates.find(a => Number(a.valor_pago) === valor);
          chosen = exactValor || candidates[0];
          score = exactValor ? 0.8 : 0.5;
          status = exactValor ? 'auto_nome' : 'auto_ambiguo';
        }
      }
      // Escreve resultado
      sh.getRange(sheetRow, 11).setValue(chosen ? chosen.id_inscricao : '');
      sh.getRange(sheetRow, 12).setValue(score);
      sh.getRange(sheetRow, 13).setValue(status);
      if (chosen) matched++;
    });
    return { matched };
  },

  // Devolve lista de movimentos relacionados a um atleta específico (inclui pendentes e confirmados).
  listForAtleta(atletaId) {
    const all = this.list();
    return all.filter(m => m.atleta_match_id === atletaId);
  },

  list() {
    const sh = this.sheet();
    if (!sh || sh.getLastRow() < 2) return [];
    const data = sh.getRange(2, 1, sh.getLastRow() - 1, 16).getValues();
    return data.map(r => ({
      id: r[0], filename: r[1], fileId: r[2],
      data_operacao: r[3], data_valor: r[4], valor: Number(r[5]) || 0,
      nome_ordenante: r[6], iban_ordenante: r[7], info_adicional: r[8], referencia: r[9],
      atleta_match_id: r[10], score: Number(r[11]) || 0, match_status: r[12],
      confirmado: r[13] === true || r[13] === 'TRUE',
      confirmado_em: r[14], confirmado_por: r[15]
    }));
  },

  confirmMatch(movId, atletaId, user) {
    const sh = this.sheet();
    const last = sh.getLastRow();
    if (last < 2) throw new Error('Sem movimentos');
    const ids = sh.getRange(2, 1, last - 1, 1).getValues().flat();
    const idx = ids.indexOf(movId);
    if (idx === -1) throw new Error('Movimento não encontrado');
    sh.getRange(idx + 2, 11).setValue(atletaId);
    sh.getRange(idx + 2, 13).setValue('confirmado');
    sh.getRange(idx + 2, 14).setValue(true);
    sh.getRange(idx + 2, 15).setValue(new Date());
    sh.getRange(idx + 2, 16).setValue(user);
    // Marca o atleta como bank_confirmed
    if (atletaId) {
      const aSh = Inscricoes.sheet();
      const aLast = aSh.getLastRow();
      if (aLast >= 2) {
        const aIds = aSh.getRange(2, ATL_COLS.id_inscricao, aLast - 1, 1).getValues().flat();
        const aIdx = aIds.indexOf(atletaId);
        if (aIdx !== -1) {
          aSh.getRange(aIdx + 2, ATL_COLS.bank_confirmed_em).setValue(new Date());
          aSh.getRange(aIdx + 2, ATL_COLS.bank_confirmed_por).setValue(user);
        }
        Historico.append({
          utilizador: user, id_atleta: atletaId, atleta: '',
          tipo: 'bank_match', antes: '', depois: movId, motivo: 'reconciliação'
        });
      }
    }
    return { ok: true };
  },

  unconfirmMatch(movId, user) {
    const sh = this.sheet();
    const last = sh.getLastRow();
    if (last < 2) return;
    const ids = sh.getRange(2, 1, last - 1, 1).getValues().flat();
    const idx = ids.indexOf(movId);
    if (idx === -1) throw new Error('Movimento não encontrado');
    const atletaId = sh.getRange(idx + 2, 11).getValue();
    sh.getRange(idx + 2, 13).setValue('pendente');
    sh.getRange(idx + 2, 14).setValue(false);
    sh.getRange(idx + 2, 15).setValue('');
    sh.getRange(idx + 2, 16).setValue('');
    if (atletaId) {
      const aSh = Inscricoes.sheet();
      const aLast = aSh.getLastRow();
      if (aLast >= 2) {
        const aIds = aSh.getRange(2, ATL_COLS.id_inscricao, aLast - 1, 1).getValues().flat();
        const aIdx = aIds.indexOf(atletaId);
        if (aIdx !== -1) {
          aSh.getRange(aIdx + 2, ATL_COLS.bank_confirmed_em).setValue('');
          aSh.getRange(aIdx + 2, ATL_COLS.bank_confirmed_por).setValue('');
        }
      }
      Historico.append({
        utilizador: user, id_atleta: atletaId, atleta: '',
        tipo: 'bank_unmatch', antes: movId, depois: '', motivo: 'reconciliação desfeita'
      });
    }
    return { ok: true };
  },

  // Re-atribui o match para outro atleta (caso o auto-match tenha errado)
  reassignMatch(movId, novoAtletaId, user) {
    const sh = this.sheet();
    const last = sh.getLastRow();
    if (last < 2) return;
    const ids = sh.getRange(2, 1, last - 1, 1).getValues().flat();
    const idx = ids.indexOf(movId);
    if (idx === -1) throw new Error('Movimento não encontrado');
    sh.getRange(idx + 2, 11).setValue(novoAtletaId || '');
    sh.getRange(idx + 2, 13).setValue(novoAtletaId ? 'manual' : 'sem_match');
    return { ok: true };
  }
};

const BANCO_PROMPT = `Estás a analisar um extrato bancário em PDF do NovoBanco Empresas.

OBJETIVO: extrair APENAS as transferências CRÉDITO recebidas (entradas de dinheiro de pessoas particulares).

==============================
INCLUI (✓):
- "Trf Imediata Sepa+ De [Pessoa]" — RECEBIDA
- "Trf Cred Intrab De [Pessoa]" — RECEBIDA
- "Trf Sepa+ De [Pessoa]" — RECEBIDA
- Qualquer transferência onde o valor aparece na coluna CRÉDITO
- Qualquer linha com "AVISOS DE LANÇAMENTO" descrevendo entrada de dinheiro

NÃO INCLUI (✗ — são débitos/saídas, NUNCA extrair):
- "Ordem Permanente Sepa+ Para [Empresa]" (saída para fornecedor)
- "Trf Sepa+ Para [Pessoa]" (saída — note "Para" em vez de "De")
- "Google Workspace_Camp ... Eur Cartão" (subscrição/débito de cartão)
- Movimentos com "Cartão ****1234" no descritivo (débitos de cartão)
- Comissões, impostos, "Imp s/Com Transf"
- Pagamentos a contabilistas (ex: "Perguicar Contabilid")
- Saldo anterior, saldo contabilístico
- Qualquer linha onde o valor aparece na coluna DÉBITO
==============================

FONTES de transferências CRÉDITO (extrai de AMBAS):

A) **Página 2 — "MOVIMENTOS DE CONTA"**: tabela com colunas DATA · DATA VALOR · DESCRITIVO · DÉBITO · CRÉDITO · SALDO. Extrai TODAS as linhas onde o valor está na coluna CRÉDITO (e nada na coluna DÉBITO). Os descritivos são tipicamente:
   - "Trf Imediata Sepa+ De [Nome]" — RECEBIDA
   - "Trf Cred Intrab De [Nome]" — RECEBIDA (transferência interna dentro do NovoBanco; **estas NÃO têm detalhe em AVISOS, mas DEVEM ser extraídas**)
   - "Trf Sepa+ De [Nome]" — RECEBIDA

   Para estas, usa:
   - data_operacao = 1ª coluna de data
   - data_valor = 2ª coluna de data
   - valor = valor da coluna CRÉDITO
   - nome_ordenante = parte após "De " no descritivo (em maiúsculas)
   - iban_ordenante = "" (não disponível em "Trf Cred Intrab")
   - info_adicional = "" (não disponível)
   - referencia = "" (não disponível)

B) **Páginas 3+ — "AVISOS DE LANÇAMENTO"**: detalhe das transferências SEPA com IBAN, Nome Ordenante, Referência, Informação Adicional. Cada bloco que começa com "N° Contrato a Crédito" é UMA transferência crédito a extrair.

IMPORTANTE: extrai TODAS as transferências crédito, mesmo as que aparecem só na página 2 (Trf Cred Intrab) e não têm detalhe nos AVISOS. NÃO duplicar — uma transferência aparece em A) ou em A)+B), conta como uma só (preferir os dados de B) quando ambos disponíveis).

Formato esperado para cada transferência (objeto JSON):
- data_operacao: "YYYY-MM-DD"
- data_valor: "YYYY-MM-DD"
- valor: número decimal POSITIVO (ex: 120.00, sem símbolo €, sem sinal)
- nome_ordenante: nome completo do remetente em maiúsculas (ex: "ELISABETE FARIA DE BRITO QUESA")
- iban_ordenante: IBAN do remetente sem espaços (ex: "PT50001000004280994000117")
- info_adicional: campo "Informação Adicional" (pode conter "NOTPROVIDED", nome do atleta, ou descrição). String vazia se não houver.
- referencia: campo "Referência Ordenante". String vazia se não houver.

DICA: cada bloco de "AVISOS DE LANÇAMENTO" começa com "N° Contrato a Crédito" — sinal de que é uma entrada. Se o bloco diz "N° Contrato a Débito" é saída, IGNORA.

REGRAS RÍGIDAS:
- **NÃO repetir transferências** — cada operação aparece UMA vez no JSON.
- Cada extrato mensal tem tipicamente 5-30 transferências crédito (raramente mais de 50).
- NÃO preencher o array com dados duplicados ou inventados — se já extraíste todas as visíveis, PARA.
- Após extrair todas as transferências reais, fecha o array com ] imediatamente.

Devolve UM array JSON com todos os objetos únicos. Sem texto à volta, sem markdown. Se não houver transferências crédito, devolve [].`;
/**
 * Melhorias automáticas ao Google Forms ligado ao Sheet.
 * Não muda o tipo de perguntas (preserva posição das colunas).
 *
 * Apenas:
 *   1. Marca IBAN como obrigatório
 *   2. Acrescenta secção informativa com tabela de preços
 *   3. Acrescenta nota explicativa no campo Clube (lista dos nomes em uso)
 *
 * Para correr: dropdown → improveForms → ▶ Executar (pede autorização para FormApp).
 */
const FormImprovement = {
  PRICE_TEXT:
    'INTERNOS — pago em 2026\n' +
    '• Pronto pagamento (até 31 mar): 330€ por semana · 295€ com desconto\n' +
    '• Em prestações (até 31 mar): 375€ total (120€ entrada + 255€) · 330€ com desconto\n' +
    '• Após 31 mar: 375€ a pronto · 330€ com desconto\n\n' +
    'EXTERNOS\n' +
    '• 275€ por semana (fixo)\n\n' +
    'DESCONTOS (não cumuláveis):\n' +
    '• Tens irmão também inscrito\n' +
    '• Inscrição em 2 ou mais semanas\n' +
    '• O teu clube tem 8 ou mais atletas inscritos\n\n' +
    'PRAZOS\n' +
    '• Até 31 mar: 1ª prestação (120€) ou pagamento a pronto\n' +
    '• Até 21 jun: liquidação da 2ª prestação',

  PRICE_SECTION_TITLE: 'Tabela de preços — confere antes de seguir',

  run() {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const respSh = ss.getSheetByName('Respostas do Formulário 1');
    if (!respSh) throw new Error('Aba "Respostas do Formulário 1" não encontrada');
    const formUrl = respSh.getFormUrl();
    if (!formUrl) throw new Error('Sheet não está vinculado a um Form');
    const form = FormApp.openByUrl(formUrl);
    const log = [];

    const items = form.getItems();

    // 1. IBAN obrigatório
    const ibanItem = items.find(i => /iban\s+para\s+devolu/i.test(i.getTitle()));
    if (ibanItem) {
      try {
        ibanItem.asTextItem().setRequired(true);
        log.push('✓ IBAN: marcado como obrigatório');
      } catch (e) {
        log.push('✗ IBAN: erro — ' + e.message);
      }
    } else {
      log.push('? IBAN: pergunta não encontrada (procurei "Iban para devolução")');
    }

    // 2. Secção informativa — tabela de preços (antes de "Opção de inscrição")
    const existing = items.find(i => i.getType() === FormApp.ItemType.SECTION_HEADER && i.getTitle() === this.PRICE_SECTION_TITLE);
    if (existing) {
      // Atualiza help text caso preços tenham mudado
      existing.asSectionHeaderItem().setHelpText(this.PRICE_TEXT);
      log.push('✓ Secção preços: atualizada (já existia)');
    } else {
      const sec = form.addSectionHeaderItem().setTitle(this.PRICE_SECTION_TITLE).setHelpText(this.PRICE_TEXT);
      const opcaoIdx = form.getItems().findIndex(i => /op[çc][ãa]o\s+de\s+inscri/i.test(i.getTitle()));
      if (opcaoIdx >= 0) {
        try { form.moveItem(sec, opcaoIdx); log.push('✓ Secção preços: criada e movida para antes de "Opção de inscrição"'); }
        catch (e) { log.push('? Secção preços: criada mas não consegui mover (' + e.message + ')'); }
      } else {
        log.push('✓ Secção preços: criada (no fim — não encontrei "Opção de inscrição")');
      }
    }

    // 3. Nota no campo Clube com lista dos clubes existentes (lista do Sheet Atletas)
    const atletasSh = ss.getSheetByName('Atletas');
    let clubeListNote = '';
    if (atletasSh && atletasSh.getLastRow() >= 2) {
      const clubeCol = ATL_COLS.clube;
      const clubes = atletasSh.getRange(2, clubeCol, atletasSh.getLastRow() - 1, 1).getValues().flat()
        .map(c => String(c).trim()).filter(Boolean);
      const unique = [...new Set(clubes)].sort();
      if (unique.length > 0) {
        clubeListNote = 'IMPORTANTE: usa exatamente o mesmo nome se o teu clube já tem atletas inscritos.\n\nClubes já inscritos:\n• ' + unique.join('\n• ') + '\n\nSe o teu clube não está aqui, escreve livremente.';
      }
    }
    const clubeItem = items.find(i => /clube\s+onde\s+joga/i.test(i.getTitle()));
    if (clubeItem) {
      try {
        clubeItem.setHelpText(clubeListNote || 'Escreve o nome do clube exatamente como já figura noutras inscrições, para evitar duplicados.');
        log.push('✓ Clube: helpText atualizado com lista (' + (clubeListNote.match(/•/g) || []).length + ' clubes)');
      } catch (e) {
        log.push('✗ Clube: erro — ' + e.message);
      }
    } else {
      log.push('? Clube: pergunta não encontrada');
    }

    log.forEach(l => Logger.log(l));
    return { log };
  }
};
/**
 * Trigger onFormSubmit: cria UUID na linha do Forms e replica para Atletas.
 * Instalar uma vez via Triggers.install().
 */
const Triggers = {
  install() {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    // Remove triggers antigos com o mesmo handler para evitar duplicação
    ScriptApp.getProjectTriggers().forEach(t => {
      if (t.getHandlerFunction() === 'onFormSubmitTrigger_') {
        ScriptApp.deleteTrigger(t);
      }
    });
    ScriptApp.newTrigger('onFormSubmitTrigger_')
      .forSpreadsheet(ss)
      .onFormSubmit()
      .create();
    Logger.log('Trigger onFormSubmit instalado.');
  }
};

// Top-level (Apps Script triggers exigem função global, não método)
function onFormSubmitTrigger_(e) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const formSheet = ss.getSheetByName('Respostas do Formulário 1');
  if (!formSheet) {
    Logger.log('Aba "Respostas do Formulário 1" não encontrada — trigger abortado.');
    return;
  }
  const row = e.range.getRow();
  const idCol = Backfill._idCol(formSheet);
  const migradoCol = Backfill._migradoCol(formSheet);
  if (idCol === -1 || migradoCol === -1) {
    Logger.log('Trigger abortado: colunas id_inscricao/migrado_em em falta');
    return;
  }
  let id = formSheet.getRange(row, idCol).getValue();
  if (!id) {
    id = Utilities.getUuid();
    formSheet.getRange(row, idCol).setValue(id);
  }
  formSheet.getRange(row, migradoCol).setValue(new Date());
  Backfill.migrateRow_(row, formSheet, ss.getSheetByName('Atletas'));
  // Atribuir número de inscrição + renomear ficheiro no Drive
  try {
    Backfill.assignNumeroAndRename_(id);
  } catch (e) {
    Logger.log('Numeração/rename falhou para ' + id + ': ' + e.message);
  }
  // Ler comprovativo automaticamente
  try {
    Comprovativo.readAndSave(id, 'auto-trigger');
  } catch (e) {
    Logger.log('OCR auto falhou para ' + id + ': ' + e.message);
  }
}
/**
 * Setup uma vez:
 *   Backfill.setupSheets()  — cria/garante abas Atletas, Historico, Emails, Config
 *                             + coloca id_inscricao e migrado_em na aba do Forms
 *   Backfill.run()          — copia respostas existentes do Forms para Atletas
 *   Triggers.install()      — instala onFormSubmit para inscrições futuras
 *
 * Mapeamento de colunas do Forms (1-indexed):
 *   1 Carimbo de data/hora       18 Alergia alimentar qual
 *   2 Endereço de email          19 Faz medicação?
 *   3 Semana de inscrição        20 Medicação qual
 *   4 Como tomou conhecimento    21 Tem alguma doença?
 *   5 Treinador (nome)           22 Doença qual
 *   6 Opção de inscrição         23 Alergia medicamentosa?
 *   7 Nome completo do atleta    24 Alergia medicamentosa qual
 *   8 Nº Cartão de Cidadão       25 Nome encarregado
 *   9 Data de nascimento         26 Email
 *  10 NIF                        27 Telemóvel
 *  11 Tamanho equipamento        28 Contacto de emergência
 *  12 Número equipamento         29 Decl. responsabilidade
 *  13 Nome equipamento           30 Decl. imagem
 *  14 Clube                      31 Decl. saída
 *  15 Posição                    32 IBAN devolução
 *  16 O que pretende melhorar    33 Comprovativo pagamento
 *  17 Alergia alimentar?         34 id_inscricao  (acrescentado)
 *                                35 migrado_em   (acrescentado)
 */
const Backfill = {
  // Procura uma coluna na linha 1 da aba Forms pelo nome do header.
  // Devolve índice 1-based ou -1.
  _findFormCol(formSheet, headerName) {
    const lastCol = formSheet.getLastColumn();
    if (lastCol < 1) return -1;
    const headers = formSheet.getRange(1, 1, 1, lastCol).getValues()[0];
    for (let i = 0; i < headers.length; i++) {
      if (String(headers[i]).trim() === headerName) return i + 1;
    }
    return -1;
  },

  // Coluna onde está id_inscricao (descoberta dinamicamente). Se não existe, devolve -1.
  _idCol(formSheet) { return this._findFormCol(formSheet, 'id_inscricao'); },
  _migradoCol(formSheet) { return this._findFormCol(formSheet, 'migrado_em'); },

  setupSheets() {
    const ss = SpreadsheetApp.openById(SHEET_ID);

    // 1. Atletas
    let sh = ss.getSheetByName('Atletas');
    if (!sh) sh = ss.insertSheet('Atletas');
    if (sh.getLastRow() === 0) {
      const headers = [
        'id_inscricao','timestamp_inscricao','atleta','data_nascimento','clube',
        'encarregado','email','telefone','opcao_inscricao','semanas_originais',
        'semanas_atuais','tshirt','tshirt_num','tshirt_nome','alergia_alim',
        'alergia_alim_qual','medicacao','medicacao_qual','doenca','doenca_qual',
        'alergia_med','alergia_med_qual','cc','nif','posicao','melhorar',
        'contacto_emerg','decl_responsabilidade','decl_imagem','decl_saida',
        'iban','comprovativo_url','valor_pago','irmao_desconto','ativo',
        'motivo_eliminacao','eliminado_em','eliminado_por','notas_internas',
        'ultima_alteracao_em','ultima_alteracao_por',
        'valor_confirmado','valor_devido_override','desconto_outro_motivo',
        'num_inscricao','bank_confirmed_em','bank_confirmed_por'
      ];
      sh.appendRow(headers);
      sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#1a1a1a').setFontColor('#fff');
      sh.setFrozenRows(1);
    }

    // 2. Historico
    sh = ss.getSheetByName('Historico');
    if (!sh) sh = ss.insertSheet('Historico');
    if (sh.getLastRow() === 0) {
      const headers = ['id_evento','timestamp','utilizador','id_atleta','atleta','tipo','antes','depois','motivo'];
      sh.appendRow(headers);
      sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#1a1a1a').setFontColor('#fff');
      sh.setFrozenRows(1);
    }

    // 3. Emails
    sh = ss.getSheetByName('Emails');
    if (!sh) sh = ss.insertSheet('Emails');
    if (sh.getLastRow() === 0) {
      const headers = ['id','timestamp','enviado_por','template','assunto','corpo','destinatarios','ids_atletas','abriu_no_gmail'];
      sh.appendRow(headers);
      sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#1a1a1a').setFontColor('#fff');
      sh.setFrozenRows(1);
    }

    // 4. Config
    sh = ss.getSheetByName('Config');
    if (!sh) sh = ss.insertSheet('Config');
    if (sh.getLastRow() === 0) {
      sh.appendRow(['key','value','notas']);
      sh.appendRow(['whitelist_emails','geral@camposft.com','separar por vírgula']);
      sh.appendRow(['client_id','','OAuth client ID do frontend (preencher após criar)']);
      sh.appendRow(['vagas_total','180','60 × 3 semanas']);
      sh.appendRow(['vagas_por_semana','60','']);
      sh.appendRow(['cutoff_desconto','2026-03-31','até esta data: pronto pagamento mais barato']);
      sh.appendRow(['prazo_pagamento','2026-06-21','liquidação 2ª prestação']);
      sh.appendRow(['edicao','4','4ª edição']);
      sh.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#1a1a1a').setFontColor('#fff');
      sh.setFrozenRows(1);
    }
    Config.invalidate();

    // 5. Aba Forms — acrescentar id_inscricao e migrado_em à direita (sem destruir colunas existentes)
    sh = ss.getSheetByName('Respostas do Formulário 1');
    if (sh) {
      const lastCol = sh.getLastColumn();
      const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
      const hasId = headers.indexOf('id_inscricao') !== -1;
      const hasMig = headers.indexOf('migrado_em') !== -1;
      let nextCol = lastCol + 1;
      if (!hasId) { sh.getRange(1, nextCol).setValue('id_inscricao'); nextCol++; }
      if (!hasMig) { sh.getRange(1, nextCol).setValue('migrado_em'); }
    } else {
      Logger.log('AVISO: aba "Respostas do Formulário 1" não encontrada.');
    }

    Logger.log('setupSheets OK.');
  },

  run() {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const formSheet = ss.getSheetByName('Respostas do Formulário 1');
    const atletas = ss.getSheetByName('Atletas');
    if (!formSheet) throw new Error('Aba Forms não encontrada');
    if (!atletas) throw new Error('Aba Atletas não encontrada (corre setupSheets primeiro)');
    const idCol = this._idCol(formSheet);
    const migradoCol = this._migradoCol(formSheet);
    if (idCol === -1 || migradoCol === -1) throw new Error('Colunas id_inscricao/migrado_em em falta — corre setupSheets primeiro');
    const last = formSheet.getLastRow();
    let migrated = 0;
    for (let r = 2; r <= last; r++) {
      let id = formSheet.getRange(r, idCol).getValue();
      if (!id) {
        id = Utilities.getUuid();
        formSheet.getRange(r, idCol).setValue(id);
      }
      const migrado = formSheet.getRange(r, migradoCol).getValue();
      if (migrado) continue;
      this.migrateRow_(r, formSheet, atletas);
      formSheet.getRange(r, migradoCol).setValue(new Date());
      migrated++;
    }
    Logger.log('Backfill: ' + migrated + ' linhas migradas. Total Atletas: ' + (atletas.getLastRow() - 1));
  },

  // Lê uma célula extraindo a URL escondida em hyperlink (se existir),
  // senão devolve o valor visível. Usado para a coluna do comprovativo (col 33),
  // que muitas vezes vem como rich-text com URL Drive por baixo.
  getCellUrl_(sheet, row, col) {
    const range = sheet.getRange(row, col);
    try {
      const rich = range.getRichTextValue();
      if (rich) {
        const linkUrl = rich.getLinkUrl();
        if (linkUrl) return linkUrl;
        // Pode ter runs com URLs separados — apanha o primeiro
        const runs = rich.getRuns();
        for (let i = 0; i < runs.length; i++) {
          const u = runs[i].getLinkUrl();
          if (u) return u;
        }
      }
    } catch (e) {}
    const formula = range.getFormula();
    if (formula) {
      const m = formula.match(/HYPERLINK\s*\(\s*"([^"]+)"/i);
      if (m) return m[1];
    }
    return range.getValue();
  },

  migrateRow_(row, formSheet, atletas) {
    const lastCol = formSheet.getLastColumn();
    const f = formSheet.getRange(row, 1, 1, lastCol).getValues()[0];
    const idCol = this._idCol(formSheet);
    const id = idCol > 0 ? f[idCol - 1] : null;
    if (!id) throw new Error('Linha ' + row + ' sem id_inscricao');
    // Verificar se já existe em Atletas (idempotência)
    const last = atletas.getLastRow();
    if (last >= 2) {
      const existing = atletas.getRange(2, 1, last - 1, 1).getValues().flat();
      if (existing.indexOf(id) !== -1) return;
    }
    const atletaRow = [
      id,        // 1  id_inscricao
      f[0],      // 2  timestamp_inscricao  ← Carimbo
      f[6],      // 3  atleta
      f[8],      // 4  data_nascimento
      f[13],     // 5  clube
      f[24],     // 6  encarregado
      f[25],     // 7  email
      f[26],     // 8  telefone
      f[5],      // 9  opcao_inscricao  ← "interno"/"externo"
      f[2],      // 10 semanas_originais
      f[2],     // 11 semanas_atuais (=originais inicialmente)
      f[10],     // 12 tshirt
      f[11],     // 13 tshirt_num
      f[12],     // 14 tshirt_nome
      f[16],     // 15 alergia_alim
      f[17],     // 16 alergia_alim_qual
      f[18],     // 17 medicacao
      f[19],     // 18 medicacao_qual
      f[20],     // 19 doenca
      f[21],     // 20 doenca_qual
      f[22],     // 21 alergia_med
      f[23],     // 22 alergia_med_qual
      f[7],      // 23 cc
      f[9],      // 24 nif
      f[14],     // 25 posicao
      f[15],     // 26 melhorar
      f[27],     // 27 contacto_emerg
      f[28],     // 28 decl_responsabilidade
      f[29],     // 29 decl_imagem
      f[30],     // 30 decl_saida
      f[31],     // 31 iban
      this.getCellUrl_(formSheet, row, 33),  // 32 comprovativo_url (extrai hyperlink real)
      0,         // 33 valor_pago
      false,     // 34 irmao_desconto
      true,      // 35 ativo
      '',        // 36 motivo_eliminacao
      '',        // 37 eliminado_em
      '',        // 38 eliminado_por
      '',        // 39 notas_internas
      '',        // 40 ultima_alteracao_em
      '',        // 41 ultima_alteracao_por
      false,     // 42 valor_confirmado
      '',        // 43 valor_devido_override
      '',        // 44 desconto_outro_motivo
      '',        // 45 num_inscricao
      '',        // 46 bank_confirmed_em
      ''         // 47 bank_confirmed_por
    ];
    atletas.appendRow(atletaRow);
  },

  // Remapeia os id_inscricao em Atletas para baterem com os do Forms.
  // Útil quando os IDs ficaram dessincronizados (ex: Forms ganhou colunas, IDs migraram).
  // Faz match por nome do atleta + timestamp de inscrição.
  remapAtletasIds() {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const formSheet = ss.getSheetByName('Respostas do Formulário 1');
    const atletas = ss.getSheetByName('Atletas');
    if (!formSheet || !atletas) throw new Error('Abas em falta');
    const idCol = this._idCol(formSheet);
    if (idCol === -1) throw new Error('id_inscricao em falta no Forms');
    const formLast = formSheet.getLastRow();
    if (formLast < 2) return { updated: 0 };
    const formLastCol = formSheet.getLastColumn();
    const formData = formSheet.getRange(2, 1, formLast - 1, formLastCol).getValues();
    // Map (nome+timestamp) -> formId
    const map = {};
    formData.forEach(row => {
      const fid = row[idCol - 1];
      if (!fid) return;
      const nome = String(row[6] || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const ts = row[0];
      const tsKey = (ts instanceof Date) ? ts.getTime() : String(ts);
      const key = nome + '|' + tsKey;
      map[key] = fid;
    });
    // Para cada atleta, encontrar e atualizar
    const atLast = atletas.getLastRow();
    if (atLast < 2) return { updated: 0 };
    const atRows = atletas.getRange(2, 1, atLast - 1, ATL_NCOLS).getValues();
    let updated = 0, notFound = 0;
    atRows.forEach((r, i) => {
      const oldId = r[ATL_COLS.id_inscricao - 1];
      const nome = String(r[ATL_COLS.atleta - 1] || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const ts = r[ATL_COLS.timestamp_inscricao - 1];
      const tsKey = (ts instanceof Date) ? ts.getTime() : String(ts);
      const key = nome + '|' + tsKey;
      const newId = map[key];
      if (!newId) { notFound++; return; }
      if (newId === oldId) return;  // já bate, ignora
      atletas.getRange(i + 2, ATL_COLS.id_inscricao).setValue(newId);
      updated++;
    });
    Logger.log('remapAtletasIds: ' + updated + ' atualizados, ' + notFound + ' sem match');
    return { updated, notFound };
  },

  // Re-sincroniza um atleta a partir de "Respostas do Formulário 1" (sobrescreve
  // os campos vindos do Forms, mas PRESERVA campos operacionais — valor_pago,
  // semanas_atuais, valor_confirmado, notas, num_inscricao, bank_confirmed_*, etc.)
  resyncFromForms(idInscricao) {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const formSheet = ss.getSheetByName('Respostas do Formulário 1');
    const atletas = ss.getSheetByName('Atletas');
    if (!formSheet || !atletas) throw new Error('Abas em falta');
    const formLast = formSheet.getLastRow();
    if (formLast < 2) throw new Error('Forms vazio');
    const idCol = this._idCol(formSheet);
    if (idCol === -1) throw new Error('Coluna id_inscricao em falta no Forms');
    const formIds = formSheet.getRange(2, idCol, formLast - 1, 1).getValues().flat();
    const formIdx = formIds.indexOf(idInscricao);
    if (formIdx === -1) throw new Error('Atleta não encontrado em Respostas: ' + idInscricao);
    const formRow = formIdx + 2;
    const atletasLast = atletas.getLastRow();
    const atletasIds = atletas.getRange(2, ATL_COLS.id_inscricao, atletasLast - 1, 1).getValues().flat();
    const atletasIdx = atletasIds.indexOf(idInscricao);
    if (atletasIdx === -1) throw new Error('Atleta não está em Atletas (corre backfillRun primeiro): ' + idInscricao);
    const atletasRow = atletasIdx + 2;
    const lastCol = formSheet.getLastColumn();
    const f = formSheet.getRange(formRow, 1, 1, lastCol).getValues()[0];
    const updates = [
      [ATL_COLS.timestamp_inscricao,    f[0]],
      [ATL_COLS.atleta,                 f[6]],
      [ATL_COLS.data_nascimento,        f[8]],
      [ATL_COLS.clube,                  f[13]],
      [ATL_COLS.encarregado,            f[24]],
      [ATL_COLS.email,                  f[25]],
      [ATL_COLS.telefone,               f[26]],
      [ATL_COLS.opcao_inscricao,        f[5]],
      [ATL_COLS.semanas_originais,      f[2]],
      // semanas_atuais (col 11): NÃO sobrescrever — admin pode ter alterado
      [ATL_COLS.tshirt,                 f[10]],
      [ATL_COLS.tshirt_num,             f[11]],
      [ATL_COLS.tshirt_nome,            f[12]],
      [ATL_COLS.alergia_alim,           f[16]],
      [ATL_COLS.alergia_alim_qual,      f[17]],
      [ATL_COLS.medicacao,              f[18]],
      [ATL_COLS.medicacao_qual,         f[19]],
      [ATL_COLS.doenca,                 f[20]],
      [ATL_COLS.doenca_qual,            f[21]],
      [ATL_COLS.alergia_med,            f[22]],
      [ATL_COLS.alergia_med_qual,       f[23]],
      [ATL_COLS.cc,                     f[7]],
      [ATL_COLS.nif,                    f[9]],
      [ATL_COLS.posicao,                f[14]],
      [ATL_COLS.melhorar,               f[15]],
      [ATL_COLS.contacto_emerg,         f[27]],
      [ATL_COLS.decl_responsabilidade,  f[28]],
      [ATL_COLS.decl_imagem,            f[29]],
      [ATL_COLS.decl_saida,             f[30]],
      [ATL_COLS.iban,                   f[31]],
      [ATL_COLS.comprovativo_url,       this.getCellUrl_(formSheet, formRow, 33)]
    ];
    updates.forEach(([col, value]) => {
      atletas.getRange(atletasRow, col).setValue(value);
    });
    return { id: idInscricao, updated: updates.length };
  },

  // Re-sincroniza TODOS os atletas a partir do Forms.
  // Útil quando editaste linhas em "Respostas do Formulário 1" e queres propagar.
  resyncAllFromForms() {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const formSheet = ss.getSheetByName('Respostas do Formulário 1');
    if (!formSheet) throw new Error('Aba Respostas não encontrada');
    const last = formSheet.getLastRow();
    if (last < 2) return { count: 0 };
    const idCol = this._idCol(formSheet);
    if (idCol === -1) throw new Error('Coluna id_inscricao em falta — corre setupSheets primeiro');
    const formIds = formSheet.getRange(2, idCol, last - 1, 1).getValues().flat();
    let count = 0;
    const errors = [];
    formIds.forEach(id => {
      if (!id) return;
      try { this.resyncFromForms(id); count++; }
      catch (e) { errors.push({ id, error: e.message }); }
    });
    Logger.log('resyncAllFromForms: ' + count + ' atletas atualizados' + (errors.length ? ', ' + errors.length + ' erros' : ''));
    if (errors.length) errors.slice(0, 5).forEach(e => Logger.log('  ✗ ' + e.id + ': ' + e.error));
    return { count, errors };
  },

  // Re-extrai os URLs dos comprovativos da aba Forms para a aba Atletas,
  // apanhando os hyperlinks "escondidos" (texto visível ≠ URL real).
  // Idempotente — pode correr quantas vezes quiseres.
  fixComprovativoUrls() {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const formSheet = ss.getSheetByName('Respostas do Formulário 1');
    const atletas = ss.getSheetByName('Atletas');
    if (!formSheet || !atletas) throw new Error('Abas em falta');
    const formLast = formSheet.getLastRow();
    const idCol = this._idCol(formSheet);
    if (idCol === -1) throw new Error('Coluna id_inscricao em falta');
    const formIds = formSheet.getRange(2, idCol, formLast - 1, 1).getValues().flat();
    const atletasLast = atletas.getLastRow();
    const atletasIds = atletas.getRange(2, ATL_COLS.id_inscricao, atletasLast - 1, 1).getValues().flat();
    let fixed = 0;
    for (let i = 0; i < formIds.length; i++) {
      const id = formIds[i];
      if (!id) continue;
      const formRow = i + 2;
      let url = this.getCellUrl_(formSheet, formRow, 33);
      // Fallback: se ainda for filename plain text, procurar no Drive por nome
      if (typeof url === 'string' && url && !/^https?:\/\//i.test(url)) {
        const filename = url.trim();
        try {
          const safe = filename.replace(/'/g, "\\'");
          const files = DriveApp.searchFiles("title = '" + safe + "' and trashed = false");
          if (files.hasNext()) {
            url = files.next().getUrl();
          }
        } catch (e) { /* ignora, mantém o filename original */ }
      }
      const atletasIdx = atletasIds.indexOf(id);
      if (atletasIdx === -1) continue;
      const atletasRow = atletasIdx + 2;
      const current = atletas.getRange(atletasRow, ATL_COLS.comprovativo_url).getValue();
      if (String(url || '') !== String(current || '')) {
        atletas.getRange(atletasRow, ATL_COLS.comprovativo_url).setValue(url);
        fixed++;
      }
    }
    Logger.log('fixComprovativoUrls: ' + fixed + ' URLs atualizados.');
  },

  // Idempotente: garante que as colunas 42, 43 e 44 existem na aba Atletas.
  upgradeAtletas() {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sh = ss.getSheetByName('Atletas');
    if (!sh) throw new Error('Aba Atletas não existe — corre setupSheets primeiro');
    const lastCol = sh.getLastColumn();
    const headers = sh.getRange(1, 1, 1, Math.max(lastCol, 44)).getValues()[0];
    if (headers[41] !== 'valor_confirmado') {
      sh.getRange(1, 42).setValue('valor_confirmado').setFontWeight('bold').setBackground('#1a1a1a').setFontColor('#fff');
      const lastRow = sh.getLastRow();
      if (lastRow >= 2) sh.getRange(2, 42, lastRow - 1, 1).setValue(false);
    }
    if (headers[42] !== 'valor_devido_override') {
      sh.getRange(1, 43).setValue('valor_devido_override').setFontWeight('bold').setBackground('#1a1a1a').setFontColor('#fff');
    }
    if (headers[43] !== 'desconto_outro_motivo') {
      sh.getRange(1, 44).setValue('desconto_outro_motivo').setFontWeight('bold').setBackground('#1a1a1a').setFontColor('#fff');
    }
    if (headers[44] !== 'num_inscricao') {
      sh.getRange(1, 45).setValue('num_inscricao').setFontWeight('bold').setBackground('#1a1a1a').setFontColor('#fff');
    }
    if (headers[45] !== 'bank_confirmed_em') {
      sh.getRange(1, 46).setValue('bank_confirmed_em').setFontWeight('bold').setBackground('#1a1a1a').setFontColor('#fff');
    }
    if (headers[46] !== 'bank_confirmed_por') {
      sh.getRange(1, 47).setValue('bank_confirmed_por').setFontWeight('bold').setBackground('#1a1a1a').setFontColor('#fff');
    }
    // Garante que aba Banco_Movimentos existe
    Banco.setupSheet();
    // Garante que Config tem banco_folder_id
    const configSh = ss.getSheetByName('Config');
    if (configSh) {
      const configKeys = configSh.getRange(2, 1, configSh.getLastRow() - 1, 1).getValues().flat();
      if (configKeys.indexOf('banco_folder_id') === -1) {
        configSh.appendRow(['banco_folder_id', '', 'ID da pasta do Drive com os PDFs do extrato NovoBanco']);
        Config.invalidate();
      }
    }
    Logger.log('upgradeAtletas OK.');
  },

  // ============ Numeração e renomeação ============
  shortName_(fullName) {
    const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'sem_nome';
    if (parts.length === 1) return parts[0];
    return parts[0] + ' ' + parts[parts.length - 1];
  },

  formatDateDMY_(d) {
    if (!d) return '';
    const date = (d instanceof Date) ? d : new Date(d);
    if (isNaN(date.getTime())) return '';
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    return dd + '-' + mm + '-' + date.getFullYear();
  },

  formatNum_(n) {
    return String(Number(n) || 0).padStart(2, '0');
  },

  buildFilename_(num, atleta, dateInscricao, ext) {
    return this.formatNum_(num) + '_' + this.shortName_(atleta) + '_' + this.formatDateDMY_(dateInscricao) + '.' + ext;
  },

  // Atribui números 1..N a todos os atletas, ordenados por timestamp_inscricao ascendente.
  // Idempotente — pode correr quantas vezes quiseres.
  assignNumeros() {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sh = ss.getSheetByName('Atletas');
    const last = sh.getLastRow();
    if (last < 2) { Logger.log('Atletas vazia'); return; }
    const data = sh.getRange(2, 1, last - 1, ATL_NCOLS).getValues();
    const indexed = data.map(function (r, i) {
      return {
        sheetRow: i + 2,
        timestamp: r[ATL_COLS.timestamp_inscricao - 1] || new Date(0)
      };
    });
    indexed.sort(function (a, b) {
      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    });
    indexed.forEach(function (entry, i) {
      sh.getRange(entry.sheetRow, ATL_COLS.num_inscricao).setValue(i + 1);
    });
    Logger.log('assignNumeros: ' + indexed.length + ' atletas numerados.');
  },

  // Renomeia ficheiros no Drive: NN_NomeCurto_DD-MM-YYYY.<ext>
  renameComprovativos() {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sh = ss.getSheetByName('Atletas');
    const last = sh.getLastRow();
    if (last < 2) return { renamed: 0, errors: [] };
    const data = sh.getRange(2, 1, last - 1, ATL_NCOLS).getValues();
    let renamed = 0;
    const errors = [];
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const num = row[ATL_COLS.num_inscricao - 1];
      const nome = row[ATL_COLS.atleta - 1];
      const ts = row[ATL_COLS.timestamp_inscricao - 1];
      const url = row[ATL_COLS.comprovativo_url - 1];
      if (!num || !nome || !url) continue;
      const fileId = Comprovativo.extractFileId(url);
      if (!fileId) { errors.push({ atleta: nome, error: 'sem fileId — URL: ' + url }); continue; }
      try {
        const file = DriveApp.getFileById(fileId);
        const oldName = file.getName();
        const extMatch = oldName.match(/\.([a-zA-Z0-9]{2,5})$/);
        const ext = extMatch ? extMatch[1].toLowerCase() : 'bin';
        const newName = this.buildFilename_(num, nome, ts, ext);
        if (oldName !== newName) {
          file.setName(newName);
          renamed++;
        }
      } catch (e) {
        errors.push({ atleta: nome, error: e.message });
      }
    }
    Logger.log('renameComprovativos: ' + renamed + ' renomeados. ' + errors.length + ' erros.');
    if (errors.length > 0) errors.forEach(function (e) { Logger.log('  ✗ ' + e.atleta + ': ' + e.error); });
    return { renamed: renamed, errors: errors };
  },

  // Atribui número e renomeia comprovativo para 1 atleta (chamado pelo trigger).
  assignNumeroAndRename_(atletaId) {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sh = ss.getSheetByName('Atletas');
    const last = sh.getLastRow();
    if (last < 2) return;
    const ids = sh.getRange(2, ATL_COLS.id_inscricao, last - 1, 1).getValues().flat();
    const idx = ids.indexOf(atletaId);
    if (idx === -1) return;
    const sheetRow = idx + 2;
    // Próximo número = max(existentes) + 1
    const allNums = sh.getRange(2, ATL_COLS.num_inscricao, last - 1, 1).getValues().flat()
      .map(function (n) { return Number(n) || 0; });
    const nextNum = Math.max.apply(null, allNums.concat([0])) + 1;
    sh.getRange(sheetRow, ATL_COLS.num_inscricao).setValue(nextNum);
    // Rename do comprovativo
    const nome = sh.getRange(sheetRow, ATL_COLS.atleta).getValue();
    const ts = sh.getRange(sheetRow, ATL_COLS.timestamp_inscricao).getValue();
    const url = sh.getRange(sheetRow, ATL_COLS.comprovativo_url).getValue();
    const fileId = Comprovativo.extractFileId(url);
    if (fileId) {
      try {
        const file = DriveApp.getFileById(fileId);
        const oldName = file.getName();
        const extMatch = oldName.match(/\.([a-zA-Z0-9]{2,5})$/);
        const ext = extMatch ? extMatch[1].toLowerCase() : 'bin';
        const newName = this.buildFilename_(nextNum, nome, ts, ext);
        if (oldName !== newName) file.setName(newName);
      } catch (e) {
        Logger.log('Rename trigger falhou: ' + e.message);
      }
    }
  }
};

// ============ TOP-LEVEL ENTRY POINTS ============
function setupSheets()         { return Backfill.setupSheets(); }
function backfillRun()         { return Backfill.run(); }
function upgradeAtletas()      { return Backfill.upgradeAtletas(); }
function fixComprovativoUrls() { return Backfill.fixComprovativoUrls(); }
function assignNumeros()       { return Backfill.assignNumeros(); }
function renameComprovativos() { return Backfill.renameComprovativos(); }
function resyncAllFromForms()  { return Backfill.resyncAllFromForms(); }
function remapAtletasIds()     { return Backfill.remapAtletasIds(); }
function installTrigger()      { return Triggers.install(); }
function readAllComprovativos(){ return Comprovativo.readAllPending('tiagojgcc@gmail.com'); }
function improveForms()        { return FormImprovement.run(); }
function fixAuth()             { var d = DocumentApp.create('cft_tmp'); DriveApp.getFileById(d.getId()).setTrashed(true); }
