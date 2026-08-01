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

    // Endpoint público (sem token): submissão do questionário de satisfação
    // pelos encarregados. Tudo o resto continua a exigir token de admin.
    if (action === 'survey_submit') {
      return json_({ ok: true, data: Satisfacao.submit(params) });
    }

    const user = Auth.verify(params.token);

    let result;
    switch (action) {
      case 'getAll':           result = Inscricoes.getAll(); break;
      case 'updateSemanas':    result = Inscricoes.updateSemanas(params.id, params.novas, params.motivo, user); break;
      case 'setOpcaoInscricao': result = Inscricoes.setOpcaoInscricao(params.id, params.opcao, params.motivo, user); break;
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
      case 'tarefa_create':    result = Tarefas.create({ titulo: params.titulo, descricao: params.descricao, id_atleta: params.atletaId, atleta_nome: params.atletaNome }, user); break;
      case 'tarefa_resolve':   result = Tarefas.resolve(params.id, user); break;
      case 'tarefa_reopen':    result = Tarefas.reopen(params.id, user); break;
      case 'tarefa_delete':    result = Tarefas.remove(params.id); break;
      case 'createEmailDraft':     result = EmailDraft.createForAtleta(params.atletaId, params.template, user, params.overrides); break;
      case 'createBulkEmailDraft': result = EmailDraft.createBulk(params.atletaIds, params.template, user, params.overrides); break;
      case 'despesa_add':      result = Despesas.add(params, user); break;
      case 'despesa_delete':   result = Despesas.remove(params.id); break;
      case 'despesa_import':   result = Despesas.importBulk(params.items, user); break;
      case 'fin_setMargem':    result = Despesas.setMargem(params.valor, user); break;
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
/**
 * Lógica de preços CFT 2027.
 *
 * Externo: 275 € por semana, fixo.
 * Interno + inscrição até 31 mar:
 *    pronto: 330 (s/desc) | 295 (c/desc)
 *    prestações: 375 total (s/desc) | 330 total (c/desc) — 120 + (255 ou 210)
 * Interno + inscrição depois de 31 mar:
 *    pronto obrigatório: 375 (s/desc) | 330 (c/desc)
 *
 * Desconto se: irmao_desconto = TRUE  OU  nSem >= 2  OU  clube_inscricoes >= 8.
 *
 * Classificação a partir de valor_pago: o admin tipa o valor depois de ver o
 * comprovativo; o sistema classifica em pago / parcial_1 / parcial_2 / valor_errado.
 */
const Pricing = {
  parseSems(s) {
    if (s === null || s === undefined) return [];
    // Inclui '.' para apanhar valores que o Sheets converteu para decimal em locale PT
    // (ex: "1,2" gravado pelo Apps Script pode ser interpretado como o número 1.2)
    // Edição 2026 só tem 2 semanas (3 foi cancelada) — n>=1 && n<=2.
    return String(s).split(/[.,;+\s]+/)
      .map(x => parseInt(x, 10))
      .filter(n => !isNaN(n) && n >= 1 && n <= 2);
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
    if ((clubeCounts[atleta.clube] || 0) >= 8) return '8 inscrições';
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
      // Sobrepagou (ex.: marcado externo mas pagou valor de interno) → a_devolver
      if (v > p.prontoTotal) return { estado: 'a_devolver', regime: null, devido: p.prontoTotal, sobra: v - p.prontoTotal, falta: 0, info: p };
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
  num_inscricao: 45, bank_confirmed_em: 46, bank_confirmed_por: 47,
  como_conheceu: 48, treinador_indicou: 49
};
const ATL_NCOLS = 49;

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
    // Contagem por clube para o desconto de volume: conta INSCRIÇÕES, não atletas
    // (1 atleta em 2 semanas = 2 inscrições). É sobre inscrições que assenta o ≥8.
    const cc = {};
    atletas.forEach(a => {
      if (a.ativo === true || a.ativo === 'TRUE') {
        cc[a.clube] = (cc[a.clube] || 0) + Pricing.parseSems(a.semanas_atuais).length;
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
    const vagasPorSemana = { 1: 0, 2: 0 };
    ativos.forEach(a => {
      Pricing.parseSems(a.semanas_atuais).forEach(s => { if (vagasPorSemana[s] !== undefined) vagasPorSemana[s]++; });
    });
    const totalInscricoes = vagasPorSemana[1] + vagasPorSemana[2];
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
      tarefas: Tarefas.list(),
      financas: Despesas.state(),
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

  setOpcaoInscricao(id, novaOpcao, motivo, user) {
    if (!motivo || String(motivo).trim().length < 10) throw new Error('Motivo obrigatório (≥10 caracteres)');
    const norm = String(novaOpcao || '').trim().toLowerCase();
    if (norm !== 'interno' && norm !== 'externo') throw new Error('opcao_inscricao deve ser "Interno" ou "Externo"');
    const valor = norm.charAt(0).toUpperCase() + norm.slice(1);  // "Interno" / "Externo"
    return this._withLock(() => {
      const sh = this.sheet();
      const r = this._findRow(id);
      const antes = sh.getRange(r, ATL_COLS.opcao_inscricao).getValue();
      if (String(antes).trim() === valor) return { id, opcao_inscricao: valor, changed: false };
      sh.getRange(r, ATL_COLS.opcao_inscricao).setValue(valor);
      this._stampUser(sh, r, user);
      const nome = sh.getRange(r, ATL_COLS.atleta).getValue();
      Historico.append({ utilizador: user, id_atleta: id, atleta: nome, tipo: 'alteracao_opcao', antes: String(antes), depois: valor, motivo });
      return { id, opcao_inscricao: valor, changed: true };
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
    const startMs = Date.now();
    const TIMEOUT_MS = 5 * 60 * 1000;  // 5 min — sai antes do limite duro de 6 min
    let stopped = false;
    for (let idx = 0; idx < pending.length; idx++) {
      const elapsed = Date.now() - startMs;
      if (elapsed > TIMEOUT_MS) {
        stopped = true;
        Logger.log('Saída antes do timeout. Processados: ' + idx + '/' + pending.length + '. Re-corre para continuar.');
        break;
      }
      const a = pending[idx];
      if (idx > 0) Utilities.sleep(3000);  // 3s pausa = ~20 RPM (limite Gemini lite é 15 RPM com burst)
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
    }
    const ok = results.filter(r => r.ok).length;
    Logger.log('readAllPending: ' + ok + '/' + results.length + ' lidos com sucesso. Total pendentes: ' + pending.length + (stopped ? ' (parado por tempo, re-correr)' : ''));
    return { processed: results.length, total: pending.length, results: results, stopped: stopped };
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
  // Defensivo: se a cell contém Date ou algo não-UUID, gera novo UUID e sobrescreve.
  // Isto evita que datas / valores corruptos cheguem a Atletas como id.
  const isValidUuid = typeof id === 'string' && /^[a-f0-9-]{20,}$/i.test(id);
  if (!isValidUuid) {
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

  // Constrói mapa header → índice 0-based, para ler campos do Forms por nome em vez de
  // posição. Robusto a reordenação/adição de colunas no Forms.
  // Para "Qual?" (repetido 4×) usamos posição imediatamente a seguir à pergunta-mãe.
  _buildHeaderMap(formSheet) {
    const lastCol = formSheet.getLastColumn();
    const headers = formSheet.getRange(1, 1, 1, lastCol).getValues()[0]
      .map(h => String(h).trim().replace(/\s+/g, ' '));
    const findExact = (text) => headers.indexOf(text);
    const findContains = (substr) => {
      const needle = substr.toLowerCase();
      for (let i = 0; i < headers.length; i++) {
        if (headers[i].toLowerCase().includes(needle)) return i;
      }
      return -1;
    };
    const m = {
      timestamp:        findExact('Carimbo de data/hora'),
      semanas:          findExact('Semana de inscrição'),
      como_conheceu:    findContains('como tomou conhecimento'),
      treinador_indicou:findContains('treinador'),
      opcao:            findExact('Opção de inscrição'),
      atleta:           findExact('Nome completo do atleta'),
      cc:               findExact('Nº Cartão de Cidadão'),
      dataNasc:         findExact('Data de nascimento'),
      nif:              findExact('NIF'),
      tshirt:           findExact('Tamanho equipamento'),
      tshirt_num:       findExact('Número colocar equipamento'),
      tshirt_nome:      findExact('Nome colocar equipamento'),
      clube:            findExact('Clube onde joga'),
      posicao:          findExact('Posição onde joga'),
      melhorar:         findExact('O que pretende melhorar com o campo?'),
      alergia_alim:     findExact('Tem alguma alergia alimentar?'),
      medicacao:        findExact('Faz alguma medicação regularmente?'),
      doenca:           findExact('Tem alguma doença?'),
      alergia_med:      findExact('Tem alguma alergia medicamentosa?'),
      encarregado:      findExact('Nome encarregado de educação'),
      email_ee:         findExact('Email'),
      telefone:         findExact('Telemóvel'),
      contacto_emerg:   findExact('Contacto de emergência'),
      decl_resp:        findContains('Declaro, como encarregado'),
      decl_imagem:      findContains('captação e divulgação'),
      decl_saida:       findContains('saída do seu educando'),
      iban:             findExact('Iban para devolução de dinheiro'),
      comprovativo:     findContains('Comprovativo pagamento inscrição')
    };
    // "Qual?" são sempre imediatamente a seguir à pergunta-mãe
    m.alergia_alim_qual = m.alergia_alim >= 0 ? m.alergia_alim + 1 : -1;
    m.medicacao_qual    = m.medicacao    >= 0 ? m.medicacao    + 1 : -1;
    m.doenca_qual       = m.doenca       >= 0 ? m.doenca       + 1 : -1;
    m.alergia_med_qual  = m.alergia_med  >= 0 ? m.alergia_med  + 1 : -1;
    return m;
  },

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
        'num_inscricao','bank_confirmed_em','bank_confirmed_por',
        'como_conheceu','treinador_indicou'
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
    // Defensivo: id deve ser uma string UUID-like. Não aceita Date ou outros tipos.
    if (!id || typeof id !== 'string' || !/^[a-f0-9-]{20,}$/i.test(id)) {
      throw new Error('Linha ' + row + ' com id_inscricao inválido: ' + (typeof id) + ' = ' + id);
    }
    // Verificar se já existe em Atletas (idempotência)
    const last = atletas.getLastRow();
    if (last >= 2) {
      const existing = atletas.getRange(2, 1, last - 1, 1).getValues().flat();
      if (existing.indexOf(id) !== -1) return;
    }
    const h = this._buildHeaderMap(formSheet);
    const v = (key) => (h[key] >= 0 ? f[h[key]] : '');
    const comprovativoUrl = h.comprovativo >= 0
      ? this.getCellUrl_(formSheet, row, h.comprovativo + 1)  // +1 = 1-based
      : '';
    const atletaRow = [
      id,                       // 1  id_inscricao
      v('timestamp'),           // 2  timestamp_inscricao
      v('atleta'),              // 3  atleta
      v('dataNasc'),            // 4  data_nascimento
      v('clube'),               // 5  clube
      v('encarregado'),         // 6  encarregado
      v('email_ee'),            // 7  email
      v('telefone'),            // 8  telefone
      v('opcao'),               // 9  opcao_inscricao
      v('semanas'),             // 10 semanas_originais
      v('semanas'),             // 11 semanas_atuais (=originais inicialmente)
      v('tshirt'),              // 12 tshirt
      v('tshirt_num'),          // 13 tshirt_num
      v('tshirt_nome'),         // 14 tshirt_nome
      v('alergia_alim'),        // 15 alergia_alim
      v('alergia_alim_qual'),   // 16 alergia_alim_qual
      v('medicacao'),           // 17 medicacao
      v('medicacao_qual'),      // 18 medicacao_qual
      v('doenca'),              // 19 doenca
      v('doenca_qual'),         // 20 doenca_qual
      v('alergia_med'),         // 21 alergia_med
      v('alergia_med_qual'),    // 22 alergia_med_qual
      v('cc'),                  // 23 cc
      v('nif'),                 // 24 nif
      v('posicao'),             // 25 posicao
      v('melhorar'),            // 26 melhorar
      v('contacto_emerg'),      // 27 contacto_emerg
      v('decl_resp'),           // 28 decl_responsabilidade
      v('decl_imagem'),         // 29 decl_imagem
      v('decl_saida'),          // 30 decl_saida
      v('iban'),                // 31 iban
      comprovativoUrl,          // 32 comprovativo_url
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
      '',        // 47 bank_confirmed_por
      v('como_conheceu'),     // 48 como_conheceu
      v('treinador_indicou')  // 49 treinador_indicou
    ];
    atletas.appendRow(atletaRow);
  },

  // One-off / idempotente: preenche as colunas como_conheceu (48) e treinador_indicou (49)
  // nos atletas já migrados, lendo essas respostas do Forms por id_inscricao. As inscrições
  // antigas já estão marcadas como migradas, por isso run() não lhes toca — usa isto para as
  // preencher retroativamente. Também garante que os headers dessas colunas existem.
  fillOrigem() {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const formSheet = ss.getSheetByName('Respostas do Formulário 1');
    const atletas = ss.getSheetByName('Atletas');
    if (!formSheet || !atletas) throw new Error('Abas em falta (Forms / Atletas)');
    // Garante os headers nas colunas 48/49 (setupSheets só os cria em aba vazia)
    if (!atletas.getRange(1, ATL_COLS.como_conheceu).getValue()) {
      atletas.getRange(1, ATL_COLS.como_conheceu).setValue('como_conheceu');
    }
    if (!atletas.getRange(1, ATL_COLS.treinador_indicou).getValue()) {
      atletas.getRange(1, ATL_COLS.treinador_indicou).setValue('treinador_indicou');
    }
    const idCol = this._idCol(formSheet);
    if (idCol === -1) throw new Error('id_inscricao em falta no Forms — corre setupSheets primeiro');
    const formLast = formSheet.getLastRow();
    if (formLast < 2) return { updated: 0, notFound: 0 };
    const h = this._buildHeaderMap(formSheet);
    const formData = formSheet.getRange(2, 1, formLast - 1, formSheet.getLastColumn()).getValues();
    const map = {};
    formData.forEach(row => {
      const fid = row[idCol - 1];
      if (!fid) return;
      map[fid] = {
        como:      h.como_conheceu     >= 0 ? row[h.como_conheceu]     : '',
        treinador: h.treinador_indicou >= 0 ? row[h.treinador_indicou] : ''
      };
    });
    const atLast = atletas.getLastRow();
    if (atLast < 2) return { updated: 0, notFound: 0 };
    const ids = atletas.getRange(2, ATL_COLS.id_inscricao, atLast - 1, 1).getValues().flat();
    let updated = 0, notFound = 0;
    const out = ids.map(id => {
      const src = map[id];
      if (!src) { notFound++; return ['', '']; }
      updated++;
      return [src.como || '', src.treinador || ''];
    });
    // como_conheceu (48) e treinador_indicou (49) são adjacentes → escreve de uma vez
    atletas.getRange(2, ATL_COLS.como_conheceu, out.length, 2).setValues(out);
    Logger.log('fillOrigem: ' + updated + ' atualizados, ' + notFound + ' sem match no Forms');
    return { updated, notFound };
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
    const h = this._buildHeaderMap(formSheet);
    const v = (key) => (h[key] >= 0 ? f[h[key]] : '');
    const comprovativoUrl = h.comprovativo >= 0
      ? this.getCellUrl_(formSheet, formRow, h.comprovativo + 1)
      : '';
    const updates = [
      [ATL_COLS.timestamp_inscricao,    v('timestamp')],
      [ATL_COLS.atleta,                 v('atleta')],
      [ATL_COLS.data_nascimento,        v('dataNasc')],
      [ATL_COLS.clube,                  v('clube')],
      [ATL_COLS.encarregado,            v('encarregado')],
      [ATL_COLS.email,                  v('email_ee')],
      [ATL_COLS.telefone,               v('telefone')],
      [ATL_COLS.opcao_inscricao,        v('opcao')],
      [ATL_COLS.semanas_originais,      v('semanas')],
      // semanas_atuais (col 11): NÃO sobrescrever — admin pode ter alterado
      [ATL_COLS.tshirt,                 v('tshirt')],
      [ATL_COLS.tshirt_num,             v('tshirt_num')],
      [ATL_COLS.tshirt_nome,            v('tshirt_nome')],
      [ATL_COLS.alergia_alim,           v('alergia_alim')],
      [ATL_COLS.alergia_alim_qual,      v('alergia_alim_qual')],
      [ATL_COLS.medicacao,              v('medicacao')],
      [ATL_COLS.medicacao_qual,         v('medicacao_qual')],
      [ATL_COLS.doenca,                 v('doenca')],
      [ATL_COLS.doenca_qual,            v('doenca_qual')],
      [ATL_COLS.alergia_med,            v('alergia_med')],
      [ATL_COLS.alergia_med_qual,       v('alergia_med_qual')],
      [ATL_COLS.cc,                     v('cc')],
      [ATL_COLS.nif,                    v('nif')],
      [ATL_COLS.posicao,                v('posicao')],
      [ATL_COLS.melhorar,               v('melhorar')],
      [ATL_COLS.contacto_emerg,         v('contacto_emerg')],
      [ATL_COLS.decl_responsabilidade,  v('decl_resp')],
      [ATL_COLS.decl_imagem,            v('decl_imagem')],
      [ATL_COLS.decl_saida,             v('decl_saida')],
      [ATL_COLS.iban,                   v('iban')],
      [ATL_COLS.comprovativo_url,       comprovativoUrl]
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

  // Detecta atletas com id_inscricao "estragado" (Date, vazio, ou não-UUID)
  // e re-atribui um UUID válido (sincroniza Forms ↔ Atletas).
  repairBrokenIds() {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const formSheet = ss.getSheetByName('Respostas do Formulário 1');
    const atletas = ss.getSheetByName('Atletas');
    if (!formSheet || !atletas) throw new Error('Abas em falta');
    const idCol = this._idCol(formSheet);
    if (idCol === -1) throw new Error('id_inscricao header em falta no Forms');

    const atLast = atletas.getLastRow();
    if (atLast < 2) return { fixed: 0 };
    const atData = atletas.getRange(2, 1, atLast - 1, ATL_NCOLS).getValues();
    const formLast = formSheet.getLastRow();
    const formLastCol = formSheet.getLastColumn();
    const formData = formSheet.getRange(2, 1, formLast - 1, formLastCol).getValues();

    // Build map: (atleta name + Carimbo) → { formRow, currentId }
    const formMap = {};
    formData.forEach((fr, i) => {
      const nome = String(fr[6] || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const ts = fr[0];
      const tsTime = (ts instanceof Date) ? ts.getTime() : String(ts);
      formMap[nome + '|' + tsTime] = { row: i + 2, currentId: fr[idCol - 1] };
    });

    const isValidUuid = id => typeof id === 'string' && /^[a-f0-9-]{20,}$/i.test(id);
    let fixed = 0;
    const errors = [];
    atData.forEach((ar, i) => {
      const atRow = i + 2;
      const atId = ar[ATL_COLS.id_inscricao - 1];
      if (isValidUuid(atId)) return;  // OK
      const nome = String(ar[ATL_COLS.atleta - 1] || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const ts = ar[ATL_COLS.timestamp_inscricao - 1];
      const tsTime = (ts instanceof Date) ? ts.getTime() : String(ts);
      const key = nome + '|' + tsTime;
      const match = formMap[key];
      if (!match) {
        errors.push(nome + ' (sem match em Forms)');
        return;
      }
      let newId = match.currentId;
      if (!isValidUuid(newId)) {
        newId = Utilities.getUuid();
        formSheet.getRange(match.row, idCol).setValue(newId);
      }
      atletas.getRange(atRow, 1).setValue(newId);
      Logger.log('Fixed ' + nome + ': ' + newId);
      fixed++;
    });
    Logger.log('repairBrokenIds: ' + fixed + ' atletas reparados' + (errors.length ? ', ' + errors.length + ' sem match' : ''));
    if (errors.length) errors.forEach(e => Logger.log('  ✗ ' + e));
    return { fixed, errors };
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

  // Repara semanas_atuais que foram interpretadas como decimal (ex: 1.2 em vez de "1,2").
  // Converte de volta para string formatada e força formato de célula = texto.
  fixSemanasAtuais() {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sh = ss.getSheetByName('Atletas');
    const last = sh.getLastRow();
    if (last < 2) { Logger.log('Atletas vazia'); return; }
    const range = sh.getRange(2, ATL_COLS.semanas_atuais, last - 1, 1);
    const vals = range.getValues();
    let fixed = 0;
    for (let i = 0; i < vals.length; i++) {
      const raw = vals[i][0];
      if (typeof raw === 'number') {
        // 1.2 → "1,2" · 1.23 → "1,2,3" · 1 → "1"
        const digits = String(raw).split('.').map(s => s.trim()).filter(Boolean);
        const sems = digits.flatMap(d => d.split('')).map(d => parseInt(d, 10)).filter(n => n >= 1 && n <= 3);
        const dedup = [...new Set(sems)].sort();
        const novo = dedup.join(',');
        if (novo && novo !== String(raw)) {
          const cell = sh.getRange(i + 2, ATL_COLS.semanas_atuais);
          cell.setNumberFormat('@');
          cell.setValue(novo);
          fixed++;
        }
      }
    }
    Logger.log('fixSemanasAtuais: ' + fixed + ' linhas reparadas.');
    return { fixed: fixed };
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
/**
 * Templates HTML para emails CFT.
 *
 * Visual: editorial bold (preto + bege + verde escuro · Bebas Neue display)
 * Texto: PT-PT, redacção do admin (tiagojgcc@gmail.com).
 *
 * Variáveis suportadas (placeholders {nome_var}):
 *   {atleta}              nome completo do atleta
 *   {ee_nome}             nome do encarregado (curto: primeiro + último)
 *   {ee_email}            email do encarregado
 *   {valor_esperado}      valor devido (€)
 *   {valor_pago}          valor recebido (€)
 *   {falta}               valor em falta (€)
 *   {excedente}           valor a devolver (€)
 *   {iban_cft}            IBAN da CFT
 *   {data_limite}         prazo de pagamento (texto)
 *   {local}, {horario}, {material}, {logistica}, {contacto_dia}  (info práticas)
 *
 * Concordância de género (G):
 *   data.gen_atleta ∈ {'m','f'} — heurística pelo 1º nome do atleta
 *   data.gen_ee     ∈ {'m','f'} — heurística pelo 1º nome do EE
 *   helper G_atl(data) e G_ee(data) devolvem objecto com chaves prontas a
 *   interpolar: {caro, oA, doA, oAtleta, oSeu, ele, dele, educando}.
 */
const EmailTemplates = {
  // Cores (paleta do mock)
  C: {
    beige: '#f4ede0',
    beigeMid: '#e5d9c4',
    sand: '#c9b99a',
    sandDark: '#a89278',
    charcoal: '#1c1c18',
    nearBlack: '#111110',
    midGray: '#6b6b65',
    greenDark: '#2d6b3c',
    greenBright: '#78c832',
    orange: '#d4845a',
    white: '#ffffff',
    offWhite: '#faf7f2'
  },

  IBAN_CFT: 'PT50 0007 0000 0065 0137 6512 3',
  LOGO_URL: 'https://raw.githubusercontent.com/tiagojgcc/cft-dashboard/main/assets/logo_CFT.png',
  LOGO_DARK_URL: 'https://raw.githubusercontent.com/tiagojgcc/cft-dashboard/main/assets/logo_CFT_dark.png',
  EDITION: '5ª EDIÇÃO · 2027',

  // ============ Helpers ============
  shortName(fullName) {
    const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0];
    return parts[0] + ' ' + parts[parts.length - 1];
  },

  firstName(fullName) {
    const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
    return parts[0] || '';
  },

  // Dicionários de nomes próprios PT-PT (normalizados sem diacríticos).
  // Cobrem ~250 nomes masculinos + ~230 femininos: clássicos, modernos,
  // diminutivos comuns e variantes Brasil/internacionais usadas em PT.
  // Nomes ausentes caem na heurística por terminação.
  NAMES_MALE: new Set([
    'abel','abilio','adao','adelio','adelino','adolfo','adriano','afonso',
    'agostinho','alberto','albino','alcides','alcino','aldo','aleixo','alex',
    'alexandre','alfredo','alipio','alvaro','amadeu','amancio','amaro',
    'ambrosio','americo','amilcar','anibal','antao','antonio','armando',
    'armenio','arnaldo','arsenio','artur','augusto','aurelio','baltasar',
    'bartolomeu','basilio','belmiro','benedito','benjamim','benjamin',
    'bernardino','bernardo','bertino','boaventura','braulio','bruno','caetano',
    'caio','camilo','candido','carlos','casimiro','cassiano','cassio',
    'celestino','celio','celso','cesar','christian','cipriano','cirilo',
    'claudio','clemente','conrado','cosme','cristiano','cristovao','custodio',
    'damiao','daniel','danilo','dario','david','davi','denis','dennis','diego',
    'diogo','dinis','diniz','dionisio','domingos','douglas','duarte','edgar',
    'edmundo','edson','eduardo','egidio','elder','elias','elio','eliseu',
    'elson','elvis','emanuel','emerson','emidio','emilio','enzo','eric',
    'erick','ernani','ernesto','esteban','estevao','eugenio','eurico',
    'eusebio','evandro','evaristo','ezequiel','fabiano','fabio','fabricio',
    'fausto','federico','felipe','fernando','fidel','filipe','firmino',
    'flavio','florencio','francisco','franklin','frederico','gabriel','gaspar',
    'geraldo','gerardo','germano','gerson','gil','gilberto','gilson','gino',
    'goncalo','gonzalo','gregorio','gualter','guido','guilherme','gustavo',
    'hamilton','heitor','helder','helio','henrique','herbert','hermano',
    'herminio','hernani','hilario','horacio','hudson','hugo','humberto','iago',
    'ian','igor','ilidio','inacio','irineu','isaac','isaias','ismael','israel',
    'italo','ivan','ivanildo','ivo','jacques','jaime','jair','jeremias',
    'jeronimo','jesse','jesus','joao','joaquim','jonas','jonathan','jordi',
    'jorge','jose','joshua','josue','juan','julian','juliano','julio','junior',
    'kelvin','kennedy','kevin','klaus','lauro','lazaro','leandro','leao','leo',
    'leon','leonardo','leonel','levi','lino','livio','lopo','lorenzo',
    'lourenco','lucas','luciano','lucio','ludovico','luis','luiz','luca',
    'luka','lukas','manuel','marc','marcel','marcelino','marcelo','marciano',
    'marcio','marco','marcos','mariano','mario','marius','marko','marlon',
    'martim','martin','martinho','marvin','mateus','matheus','matias',
    'mathias','mathieu','mauricio','mauro','max','maxime','maximiliano',
    'melchior','michel','miguel','milton','moises','murilo','natanael',
    'nelson','nestor','nicolae','nicolas','nicolau','nilo','nilson','noa',
    'noah','noel','norberto','nuno','octavio','olavo','olegario','omar',
    'orlando','oscar','osmar','osvaldo','oswaldo','otavio','pablo','paco',
    'paolo','pascoal','patricio','patrick','paulo','pedro','pierre','pio',
    'plinio','prudencio','quintino','rafael','raimundo','ramiro','ramon',
    'raul','ravi','reinaldo','renan','renato','rene','ricardo','rinaldo',
    'rivelino','robert','roberto','rocco','rodolfo','rodrigo','rogerio',
    'rolando','rolf','roman','romao','romario','romeo','romeu','ronald',
    'ronaldo','ronan','roque','rosario','ruben','rui','rurik','ruy','sabino',
    'salomao','salvador','salvio','samir','samuel','sancho','sandro',
    'santiago','saul','sebastian','sebastiao','sergio','serafim','severino',
    'severo','sidney','sidnei','sidonio','silas','silverio','silvestre',
    'silvino','silvio','simao','simon','stefan','steve','tadeu','tales',
    'tarcisio','telmo','teobaldo','teodoro','teofilo','thiago','tiago','tibor',
    'tito','tobias','tom','tomas','tomaz','tome','tristao','tulio','ulisses',
    'ulrico','urbano','valdemar','valdir','valentim','valter','vasco',
    'venancio','venceslau','vergilio','vicente','victor','vinicius','virgilio',
    'vital','vito','vitor','vladimir','waldemar','walter','washington',
    'wellington','wesley','wilfredo','wilson','winston','xavier','yago','yann',
    'yannick','yari','yuri','zacarias','ze','zeferino','zenildo'
  ]),

  NAMES_FEMALE: new Set([
    'adelaide','adela','ada','adelia','adelina','adriana','agata','agueda',
    'agnes','aida','alba','albertina','alcina','aldina','alessandra',
    'alexandra','alice','alicia','aline','alma','almira','amalia','amanda',
    'amaranta','amelia','amparo','ana','anabela','analu','andreia','angela',
    'angelica','angelina','angie','anita','antonella','antonia','aparecida',
    'apolonia','ariana','arlete','arlinda','armanda','armandina','arminda',
    'augusta','aurora','avelina','barbara','beatriz','belarmina','belmira',
    'benedita','benilde','benvinda','berenice','bernadete','bianca','brigida',
    'bruna','cacilda','camila','candida','carina','carla','carlota','carmem',
    'carmen','carmina','carminda','carolina','casandra','catarina','catia',
    'cecilia','celeste','celestina','celia','celina','celma','chantal',
    'chiara','cibele','cintia','cipriana','clara','clarice','claudia',
    'claudina','clelia','clementina','cleopatra','clotilde','conceicao',
    'constanca','constancia','consuelo','cora','coralia','corina','cornelia',
    'cristal','cristela','cristiana','cristina','daiana','dalia','dalva',
    'dania','daniela','danielle','dara','darcy','debora','deborah','delfina',
    'delia','delma','demetria','denise','deolinda','diana','dilia','dilma',
    'dina','divina','dolores','dora','dorinda','doris','dorotea','dulce',
    'edda','edite','edith','edivania','edna','eduarda','elaine','elena',
    'eleonora','elga','elia','eliana','eliane','elida','elisa','elisabete',
    'elisabeth','elisete','eliza','ellen','eloisa','elsa','elvira','ema',
    'emanuela','emily','emilia','emma','encarnacao','enedina','enia','erica',
    'erika','erminia','ernestina','esmeralda','esperanca','estefania','estela',
    'estelita','estephania','estrela','etelvina','eufemia','eugenia','eulalia',
    'eunice','eva','evangelina','evelina','evelyn','fabia','fabiana','fabiola',
    'fatima','felicia','felicidade','fernanda','filipa','filomena','fiona',
    'flavia','flora','florbela','florencia','florinda','francisca','frederica',
    'gabriela','gardenia','genoveva','georgina','geraldina','germana',
    'gertrudes','gilda','gioconda','gisela','gisele','glaucia','gloria',
    'graca','gracia','gracinda','graziela','guadalupe','guida','guilhermina',
    'helena','helia','helga','heliana','helma','henriqueta','herminia',
    'hilaria','hilda','honorina','idalia','idalina','ilda','ilidia','ilse',
    'imelda','ines','ingrid','iolanda','iracema','iraida','irene','iria',
    'iris','irma','isabel','isabela','isadora','isaura','ivete','ivone',
    'izabel','jade','jaqueline','jacinta','janaina','jane','janete','janine',
    'jasmim','jennifer','jessica','joana','joaquina','jocelia','joelma',
    'jordana','josefa','josefina','josiane','judit','judite','julia','juliana',
    'juliene','karen','karina','karla','katia','katherine','kathleen','kelly',
    'kim','kristina','lara','larissa','latifa','laura','laurinda','lavinia',
    'lea','leandra','leila','lena','lenita','leocadia','leonete','leonida',
    'leonor','leontina','leticia','lia','liana','libania','lidia','lilian',
    'liliana','lina','linda','lisa','livia','lola','lorena','lourdes','lucia',
    'luciana','lucila','lucilia','lucineia','ludmila','luisa','luiza','lurdes',
    'luzia','mabel','madalena','madeline','mafalda','magali','magda',
    'magdalena','manuela','mara','marcia','margarida','margarita','maria',
    'mariana','mariane','maribel','marielle','marilene','marilia','marina',
    'marinalva','marisa','marlene','marta','martina','mary','matilde','maura',
    'mauricia','melanie','melissa','mercedes','micaela','michele','michelle',
    'milena','minerva','miranda','miriam','mirian','mona','monica','mor',
    'morgana','muriel','nadia','nair','naomi','natacha','natalia','natasha',
    'neide','nelida','nelma','nicole','nina','nilda','nilza','noemi','noemia',
    'nora','norma','nubia','nuria','odete','olga','olimpia','olinda','olivia',
    'ondina','ofelia','otavia','palmira','paola','paula','paulina','pamela',
    'penelope','pia','pilar','piedade','priscila','priscilla','rafaela',
    'raissa','raquel','rebeca','regina','remedios','renata','rita','rosa',
    'rosalia','rosalina','rosana','rose','roseli','rosemarie','roxana','rufina',
    'ruth','sabina','sabrina','salete','salome','samanta','samantha','sandra',
    'sandrina','sara','sarah','sebastiana','selena','selma','serafina',
    'serena','sibele','sidonia','silmara','silvana','silvia','simone','sofia',
    'solange','soledade','sonia','sophia','soraia','stella','stephanie',
    'suelen','susana','suzana','suzete','sylvia','tais','tamara','tania',
    'tatiana','telma','teresa','terezinha','thais','thalia','thalita',
    'thamires','tessa','tina','tomasia','tonia','valentina','valeria','vanda',
    'vanessa','vania','vera','veronica','violeta','virginia','viviana',
    'viviane','wanda','walesca','walquiria','xenia','ximena','yara','yasmin',
    'yasmim','yolanda','yvette','zelinda','zilda','zilma','zelia','zenaide',
    'zoe'
  ]),

  // Heurística PT-PT para inferir género a partir do 1º nome.
  // Devolve 'm', 'f' ou 'u' (desconhecido / nome vazio).
  //   1) Lookup explícito nos dicionários NAMES_MALE / NAMES_FEMALE.
  //   2) Fallback por terminação: 'a' → feminino; 'o' → masculino;
  //      consoantes / outras vogais → masculino (convenção PT-PT).
  guessGender(fullName) {
    const first = this.firstName(fullName).toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '');  // strip diacríticos
    if (!first) return 'u';
    if (this.NAMES_MALE.has(first)) return 'm';
    if (this.NAMES_FEMALE.has(first)) return 'f';
    const last = first.slice(-1);
    if (last === 'a') return 'f';  // Maria, Joana, Sofia, …
    if (last === 'o') return 'm';  // Pedro, Tiago, joao (após NFD)
    // Consoante (Daniel, Manuel, Rafael, Miguel, …) ou vogal rara → masculino.
    return 'm';
  },

  // Devolve concordância para o atleta.
  G_atl(data) {
    const g = (data && data.gen_atleta) || this.guessGender(data && data.atleta);
    const isF = g === 'f';
    return {
      caro:      isF ? 'Cara' : 'Caro',
      oA:        isF ? 'a' : 'o',
      oAUpper:   isF ? 'A' : 'O',
      doA:       isF ? 'da' : 'do',
      noA:       isF ? 'na' : 'no',
      oAtleta:   isF ? 'a atleta' : 'o atleta',
      oSeu:      isF ? 'a sua' : 'o seu',
      ele:       isF ? 'ela' : 'ele',
      dele:      isF ? 'dela' : 'dele',
      educando:  isF ? 'educanda' : 'educando',
      pron_obj:  isF ? 'la' : 'lo',   // ex: ouvi-la / ouvi-lo
      inscrito:  isF ? 'inscrita' : 'inscrito',
      pronto:    isF ? 'pronta' : 'pronto',
      preparado: isF ? 'preparada' : 'preparado',
      benvindo:  isF ? 'bem-vinda' : 'bem-vindo'
    };
  },

  // Devolve concordância para o encarregado (caro/cara · seu/sua…).
  G_ee(data) {
    const g = (data && data.gen_ee) || this.guessGender(data && data.ee_nome);
    const isF = g === 'f';
    return {
      caro:    isF ? 'Cara' : 'Caro',
      caroUp:  isF ? 'CARA' : 'CARO',
      o:       isF ? 'a' : 'o',
      oSeu:    isF ? 'a sua' : 'o seu',
      seu:     isF ? 'sua' : 'seu',
      pron:    isF ? 'a' : 'o'
    };
  },

  fmt(value) {
    if (value === null || value === undefined || value === '') return '—';
    return String(value);
  },

  interp(text, data) {
    return String(text || '').replace(/\{(\w+)\}/g, (m, key) => {
      const v = data[key];
      return (v === undefined || v === null) ? m : String(v);
    });
  },

  // ============ Building blocks ============
  _styles() {
    return {
      body: `font-family: 'DM Sans','Helvetica Neue',Arial,sans-serif; font-size: 15px; line-height: 1.65; color: ${this.C.charcoal};`,
      display: `font-family: 'Bebas Neue','Arial Narrow',sans-serif; letter-spacing: 0.005em; text-transform: uppercase; margin: 0;`,
      condensed: `font-family: 'Barlow Condensed','Arial Narrow',sans-serif; letter-spacing: 0.22em; text-transform: uppercase; font-weight: 700;`,
      serif: `font-family: 'Playfair Display',Georgia,serif; font-style: italic;`,
    };
  },

  _googleFontsLink() {
    return `<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow+Condensed:wght@500;700&family=DM+Sans:wght@400;500;700&family=Playfair+Display:ital@1&display=swap" rel="stylesheet">`;
  },

  _header(edition) {
    // Banda preta com o logo claro (logo_CFT_dark) — versão Gmail-safe do
    // BrandHeader do design: table + bgcolor (Gmail remove `filter` CSS,
    // por isso o asset já vem claro) e width/height no <img> para o Gmail
    // não redimensionar o logo. `edition` (opcional) sobrepõe a edição
    // mostrada à direita — usado pelo agradecimento pós-edição.
    const C = this.C;
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.nearBlack}" style="background-color:${C.nearBlack};border-collapse:collapse;width:100%;"><tr>
      <td bgcolor="${C.nearBlack}" width="50%" align="left" style="background-color:${C.nearBlack};padding:26px 40px;"><img src="${this.LOGO_DARK_URL}" alt="CFT" width="150" height="55" style="display:block;width:150px;height:55px;" /></td>
      <td bgcolor="${C.nearBlack}" width="50%" align="right" style="background-color:${C.nearBlack};padding:26px 40px;font-family:'Barlow Condensed','Arial Narrow',sans-serif;font-size:11px;font-weight:700;letter-spacing:0.22em;color:${C.sand};text-transform:uppercase;">${edition || this.EDITION}</td>
    </tr></table>`;
  },

  _signature() {
    // Assinatura: logo escuro sobre fundo bege (sem filter), nome grande e contactos.
    // Compatível com Gmail (table-based layout, sem flex).
    const C = this.C;
    return `<div style="padding:24px 40px 32px 40px;">
      <div style="border-top:1.5px solid ${C.charcoal};padding-top:24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td width="92" style="vertical-align:top;padding-right:20px;">
            <img src="${this.LOGO_URL}" alt="CFT" style="width:92px;height:auto;display:block;" />
          </td>
          <td style="vertical-align:top;">
            <div style="font-family:'Bebas Neue','Arial Narrow',sans-serif;font-size:30px;line-height:1;color:${C.nearBlack};letter-spacing:0.005em;">EQUIPA CFT</div>
            <div style="font-family:'Playfair Display',Georgia,serif;font-style:italic;font-size:14px;color:${C.midGray};margin-top:2px;margin-bottom:12px;">Campos de Formação Técnica</div>
            <div style="font-family:'DM Sans','Helvetica Neue',Arial,sans-serif;font-size:12px;color:${C.charcoal};line-height:1.8;">
              <span style="margin-right:24px;"><b style="color:${C.greenDark};">e</b>&nbsp;geral@camposft.com</span>
              <span style="margin-right:24px;"><b style="color:${C.greenDark};">w</b>&nbsp;camposft.com</span>
              <span><b style="color:${C.greenDark};">ig</b>&nbsp;@camposft</span>
            </div>
          </td>
        </tr></table>
      </div>
    </div>`;
  },

  _footer() {
    const C = this.C;
    return `<div style="background:${C.charcoal};color:${C.beige};padding:24px 40px;font-family:'DM Sans','Helvetica Neue',Arial,sans-serif;font-size:11px;line-height:1.6;">
      <div style="display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:12px;">
        <div>
          <div style="font-family:'Barlow Condensed','Arial Narrow',sans-serif;font-size:11px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:${C.greenBright};margin-bottom:6px;">Campo de Formação Técnica</div>
          <div style="color:${C.sand};">APDFE · Associação Promoção e Desporto em Ferias Escolares</div>
        </div>
        <div style="color:${C.sand};font-size:10px;">Recebeu este email porque inscreveu o seu educando no CFT.</div>
      </div>
    </div>`;
  },

  _wrap(content, edition) {
    const C = this.C;
    return `<!DOCTYPE html><html lang="pt-PT"><head><meta charset="UTF-8">${this._googleFontsLink()}<style>body{margin:0;padding:0;}</style></head>
<body style="margin:0;padding:0;background:#f0eee9;font-family:'DM Sans','Helvetica Neue',Arial,sans-serif;color:${C.charcoal};">
  <div style="max-width:680px;margin:0 auto;background:${C.beige};border:1px solid ${C.beigeMid};">
    ${this._header(edition)}
    ${content}
    ${this._signature()}
    ${this._footer()}
  </div>
</body></html>`;
  },

  _over(text, color) {
    const C = this.C;
    return `<div style="font-family:'Barlow Condensed','Arial Narrow',sans-serif;font-size:12px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:${color || C.greenDark};margin-bottom:14px;">${this._esc(text)}</div>`;
  },

  _display(text, sub) {
    const C = this.C;
    return `<h1 style="font-family:'Bebas Neue','Arial Narrow',sans-serif;font-size:72px;line-height:0.92;color:${C.nearBlack};margin:0;text-transform:uppercase;letter-spacing:-0.005em;">${this._esc(text)}</h1>${sub ? `<div style="margin-top:16px;font-family:'Playfair Display',Georgia,serif;font-style:italic;font-size:18px;color:${C.charcoal};">${this._esc(sub)}</div>` : ''}`;
  },

  _para(text) {
    return `<p style="font-family:'DM Sans','Helvetica Neue',Arial,sans-serif;font-size:15px;line-height:1.65;color:${this.C.charcoal};margin:0 0 16px 0;">${text}</p>`;
  },

  _infoBox(rows, title) {
    const C = this.C;
    const rowsHtml = rows.map(([label, value, italic]) =>
      `<div style="display:flex;align-items:baseline;padding:14px 0;border-bottom:1px solid ${C.beigeMid};gap:24px;">
        <div style="width:130px;flex-shrink:0;font-family:'Barlow Condensed','Arial Narrow',sans-serif;font-size:11px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:${C.midGray};">${this._esc(label)}</div>
        <div style="flex:1;font-family:${italic ? "'Playfair Display',Georgia,serif" : "'DM Sans','Helvetica Neue',Arial,sans-serif"};font-style:${italic ? 'italic' : 'normal'};font-size:${italic ? '19px' : '15px'};font-weight:${italic ? 400 : 500};color:${C.charcoal};">${value}</div>
      </div>`
    ).join('');
    return `<div style="margin:0 40px;background:${C.offWhite};padding:8px 28px 20px 28px;border:1px solid ${C.beigeMid};">
      ${title ? `<div style="font-family:'Barlow Condensed','Arial Narrow',sans-serif;font-size:11px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:${C.greenDark};padding:18px 0 4px 0;">${this._esc(title)}</div>` : ''}
      ${rowsHtml}
    </div>`;
  },

  _esc(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },

  _greeting(ee, data) {
    // Saudação personalizada ao EE quando temos nome; bulk usa fallback.
    const C = this.C;
    const name = String((data && data.ee_nome) || '').trim();
    // Sem nome (ex.: bulk BCC) a saudação é neutra — o género de ee viria do
    // 1º atleta do lote, que não representa os restantes destinatários.
    const txt = name
      ? `${ee.caroUp} ${this._esc(name).toUpperCase()},`
      : `CARO(A) ENCARREGADO(A) DE EDUCAÇÃO,`;
    return `<div style="font-family:'Bebas Neue','Arial Narrow',sans-serif;font-size:32px;color:${C.charcoal};margin:0 0 18px 0;">${txt}</div>`;
  },

  // ============ Per-atleta templates ============

  // 1. Valor errado (pagou a menos)
  valorErrado(data) {
    const C = this.C;
    const a = this.G_atl(data);
    const ee = this.G_ee(data);
    const subject = `CFT · Acerto de pagamento — ${data.atleta}`;
    const body = `
      <div style="padding:48px 40px 24px 40px;">
        ${this._over('Acerto de pagamento', C.orange)}
        ${this._display('Quase\ntudo certo.')}
      </div>
      <div style="padding:0 40px 24px 40px;">
        ${this._greeting(ee, data)}
        ${this._para(`Antes de mais, obrigado pela inscrição ${a.doA} <b>${this._esc(data.atleta)}</b> no CFT 2027.`)}
        ${this._para(`Estamos a fechar os acertos das inscrições e, ao contabilizar as inscrições ${data.clube ? `do <b>${this._esc(data.clube)}</b>` : 'do clube'}, verificámos que o grupo ficou aquém do mínimo de <b>8 inscrições</b> necessário para atribuir o desconto de clube. Por esse motivo, precisamos de pedir a regularização da diferença face ao valor individual.`)}
      </div>
      ${this._infoBox([
        ['Atleta', this._esc(data.atleta)],
        ['Valor da inscrição', `${data.valor_esperado}`],
        ['Valor recebido', `${data.valor_pago}`],
        ['Diferença', `<b style="color:${C.orange};">${data.falta}</b>`]
      ], 'Detalhes')}
      <div style="padding:24px 40px 8px 40px;">
        ${this._para(`A regularização pode ser feita por transferência bancária para o IBAN <b style="font-family:ui-monospace,Menlo,monospace;">${this.IBAN_CFT}</b>, indicando o nome ${a.doA} atleta na descrição.`)}
        ${this._para(`Caso considere que há algum engano, responda a este email — verificamos do nosso lado e voltamos a falar.`)}
      </div>
      <div style="padding:8px 40px 16px 40px;">
        <div style="font-family:'Playfair Display',Georgia,serif;font-style:italic;font-size:22px;color:${C.charcoal};">Obrigado,</div>
      </div>`;
    return { subject, html: this._wrap(body) };
  },

  // 2. Sem pagamento
  semPagamento(data) {
    const C = this.C;
    const a = this.G_atl(data);
    const ee = this.G_ee(data);
    const subject = `CFT · Inscrição ${a.doA} ${data.atleta}`;
    const body = `
      <div style="padding:48px 40px 24px 40px;">
        ${this._over('Inscrição reservada', C.orange)}
        ${this._display('Falta um\núltimo passo.')}
      </div>
      <div style="padding:0 40px 24px 40px;">
        ${this._greeting(ee, data)}
        ${this._para(`Obrigado pela inscrição ${a.doA} <b>${this._esc(data.atleta)}</b> no CFT 2027. Está praticamente tudo a postos para a participação ${a.dele}.`)}
        ${this._para(`Estamos a finalizar os registos de pagamento e, à data de hoje, ainda não nos chegou nenhum comprovativo. Pode ter-nos escapado, por isso queríamos confirmar consigo antes de fechar.`)}
      </div>
      ${this._infoBox([
        ['Atleta', this._esc(data.atleta)],
        ['Valor da inscrição', `<b>${data.valor_esperado}</b>`],
        ['Prazo', `<span style="font-family:'Playfair Display',Georgia,serif;font-style:italic;">${this._esc(data.data_limite)}</span>`]
      ], 'Inscrição')}
      <div style="padding:24px 40px 8px 40px;">
        ${this._para(`Se já efectuou a transferência, basta responder a este email com o comprovativo (ou data e valor) que acertamos do nosso lado.`)}
        ${this._para(`Caso ainda esteja em falta, pode regularizar por transferência bancária para o IBAN <b style="font-family:ui-monospace,Menlo,monospace;">${this.IBAN_CFT}</b>, indicando o nome ${a.doA} atleta na descrição.`)}
        ${this._para(`Qualquer dúvida, é só responder a este email.`)}
      </div>
      <div style="padding:8px 40px 16px 40px;">
        <div style="font-family:'Playfair Display',Georgia,serif;font-style:italic;font-size:22px;color:${C.charcoal};">Obrigado,</div>
      </div>`;
    return { subject, html: this._wrap(body) };
  },

  // 3. Pagamento parcial
  pagamentoParcial(data) {
    const C = this.C;
    const a = this.G_atl(data);
    const ee = this.G_ee(data);
    const subject = `CFT · Inscrição ${a.doA} ${data.atleta}`;
    const body = `
      <div style="padding:48px 40px 24px 40px;">
        ${this._over('1ª prestação recebida', C.greenDark)}
        ${this._display('Está quase\ntudo pronto.')}
      </div>
      <div style="padding:0 40px 24px 40px;">
        ${this._greeting(ee, data)}
        ${this._para(`Obrigado pela 1ª prestação da inscrição ${a.doA} <b>${this._esc(data.atleta)}</b> — já está registada do nosso lado. Está praticamente tudo pronto para a participação ${a.dele} no CFT 2027.`)}
        ${this._para(`Este email é só para relembrar que a 2ª prestação tem como prazo <span style="font-family:'Playfair Display',Georgia,serif;font-style:italic;">${this._esc(data.data_limite)}</span>.`)}
      </div>
      ${this._infoBox([
        ['Atleta', this._esc(data.atleta)],
        ['1ª prestação', `${data.valor_pago} <span style="color:${C.greenDark};">✓</span>`],
        ['2ª prestação', `<b>${data.falta}</b>`],
        ['Prazo', `<span style="font-family:'Playfair Display',Georgia,serif;font-style:italic;">${this._esc(data.data_limite)}</span>`]
      ], 'Pagamento em prestações')}
      <div style="padding:24px 40px 8px 40px;">
        ${this._para(`Pode liquidar por transferência bancária para o IBAN <b style="font-family:ui-monospace,Menlo,monospace;">${this.IBAN_CFT}</b>, indicando o nome ${a.doA} atleta na descrição.`)}
        ${this._para(`Se entretanto já tiver liquidado, ignore este email. E se houver alguma dificuldade com o prazo, fale connosco — encontramos solução.`)}
      </div>
      <div style="padding:8px 40px 16px 40px;">
        <div style="font-family:'Playfair Display',Georgia,serif;font-style:italic;font-size:22px;color:${C.charcoal};">Obrigado,</div>
      </div>`;
    return { subject, html: this._wrap(body) };
  },

  // 4. A devolver
  aDevolver(data) {
    const C = this.C;
    const a = this.G_atl(data);
    const ee = this.G_ee(data);
    const subject = `CFT · Devolução de valor — ${data.atleta}`;
    const body = `
      <div style="padding:48px 40px 24px 40px;">
        ${this._over('Valor em excesso', C.greenDark)}
        ${this._display('Temos um valor\na devolver-lhe.')}
      </div>
      <div style="padding:0 40px 24px 40px;">
        ${this._greeting(ee, data)}
        ${this._para(`Antes de mais, obrigado pela inscrição ${a.doA} <b>${this._esc(data.atleta)}</b> no CFT 2027.`)}
        ${this._para(`Ao fechar os registos, vimos que o valor recebido ficou acima do valor previsto para esta inscrição. Há, portanto, uma diferença a devolver.`)}
      </div>
      ${this._infoBox([
        ['Atleta', this._esc(data.atleta)],
        ['Valor da inscrição', `${data.valor_esperado}`],
        ['Valor recebido', `${data.valor_pago}`],
        ['A devolver', `<b style="color:${C.greenDark};">${data.excedente}</b>`]
      ], 'Detalhes')}
      <div style="padding:24px 40px 8px 40px;">
        ${this._para(`Para fazermos a devolução, responda a este email com o IBAN para onde quer que transfiramos. Tratamos disso em poucos dias.`)}
      </div>
      <div style="padding:8px 40px 16px 40px;">
        <div style="font-family:'Playfair Display',Georgia,serif;font-style:italic;font-size:22px;color:${C.charcoal};">Obrigado pela confiança,</div>
      </div>`;
    return { subject, html: this._wrap(body) };
  },

  // ============ Promocional (clube perto do desconto) ============

  // Avisa que o clube tem N atletas (<8) e que, se chegar a 8, o pagamento
  // fica mais barato e devolvemos a diferença. Usar antes do prazo final
  // para incentivar inscrições adicionais do mesmo clube.
  descontoClube(data) {
    const C = this.C;
    const a = this.G_atl(data);
    const ee = this.G_ee(data);
    const subject = `CFT · ${data.clube} — desconto de clube ao virar da esquina`;
    const faltam = data.clube_faltam || '?';
    const body = `
      <div style="padding:48px 40px 24px 40px;">
        ${this._over('Quase a desbloquear desconto', C.greenDark)}
        ${this._display('Falta pouco\npara poupar.')}
      </div>
      <div style="padding:0 40px 24px 40px;">
        ${this._greeting(ee, data)}
        ${this._para(`Obrigado pela inscrição ${a.doA} <b>${this._esc(data.atleta)}</b> no CFT 2027 pelo <b>${this._esc(data.clube)}</b>.`)}
        ${this._para(`Como sabe, oferecemos um desconto a todos os atletas inscritos por clubes com 8 ou mais participantes. À data de hoje, o <b>${this._esc(data.clube)}</b> tem <b>${this._esc(data.clube_atletas)}</b> atleta${data.clube_atletas === '1' ? '' : 's'} ${data.clube_atletas === '1' ? 'inscrito' : 'inscritos'} — falta${faltam === '1' ? '' : 'm'} apenas <b style="color:${C.greenDark};">${this._esc(String(faltam))}</b> para destravar o desconto.`)}
      </div>
      ${this._infoBox([
        ['Clube', this._esc(data.clube)],
        ['Inscritos até à data', `<b>${this._esc(data.clube_atletas)}</b> de 8`],
        ['Valor que pagou', `${this._esc(data.valor_atual)}`],
        ['Valor com desconto', `<b style="color:${C.greenDark};">${this._esc(data.valor_com_desconto)}</b>`],
        ['Diferença a devolver', `<b style="color:${C.greenDark};">${this._esc(data.diferenca)}</b>`]
      ], 'Como ficaria')}
      <div style="padding:24px 40px 8px 40px;">
        ${this._para(`Se ainda conhece <b>${this._esc(String(faltam))}</b> atleta${faltam === '1' ? '' : 's'} do clube que pondere${faltam === '1' ? '' : 'm'} inscrever-se, este é o momento — basta partilharem o link de inscrição. Assim que o clube atingir os 8, devolvemos automaticamente a diferença a todos os atletas afectados.`)}
        ${this._para(`Qualquer dúvida ou se precisar do link do formulário, é só responder a este email.`)}
      </div>
      <div style="padding:8px 40px 16px 40px;">
        <div style="font-family:'Playfair Display',Georgia,serif;font-style:italic;font-size:22px;color:${C.charcoal};">Obrigado,</div>
      </div>`;
    return { subject, html: this._wrap(body) };
  },

  // ============ Bulk templates ============

  // 5. Aviso de prazo (bulk — sem atleta específico)
  avisoPrazo(data) {
    const C = this.C;
    const subject = `CFT · Lembrete: prazo de pagamento a ${data.data_limite}`;
    const body = `
      <div style="padding:48px 40px 24px 40px;">
        ${this._over('Lembrete · prazo a aproximar', C.orange)}
        ${this._display('A data\nestá perto.')}
      </div>
      <div style="padding:0 40px 24px 40px;">
        <div style="font-family:'Bebas Neue','Arial Narrow',sans-serif;font-size:32px;color:${C.charcoal};margin:0 0 18px 0;">CARO/A ENCARREGADO/A DE EDUCAÇÃO,</div>
        ${this._para(`Estamos perto da data limite para regularização das inscrições e ainda temos alguns pagamentos pendentes referentes ao seu educando — este email é um lembrete amigável.`)}
      </div>
      ${this._infoBox([
        ['Prazo limite', `<b style="color:${C.orange};">${this._esc(data.data_limite)}</b>`],
        ['Pagamento', `Transferência bancária`],
        ['IBAN', `<span style="font-family:ui-monospace,Menlo,monospace;">${this.IBAN_CFT}</span>`],
        ['Referência', 'Nome do atleta na descrição']
      ], 'Detalhes')}
      <div style="padding:24px 40px 8px 40px;">
        ${this._para(`Se já efetuou o pagamento nos últimos dias, ignore esta mensagem — pode estar simplesmente em processamento.`)}
        ${this._para(`Para qualquer questão sobre o valor em causa ou dificuldades com o prazo, responda a este email que tratamos caso a caso.`)}
      </div>
      <div style="padding:8px 40px 16px 40px;">
        <div style="font-family:'Playfair Display',Georgia,serif;font-style:italic;font-size:22px;color:${C.charcoal};">Obrigado,</div>
      </div>`;
    return { subject, html: this._wrap(body) };
  },

  // 6. Informações práticas (per-atleta quando há nome; bulk quando não)
  infoPraticas(data) {
    const C = this.C;
    const a = this.G_atl(data);
    const ee = this.G_ee(data);
    const hasName = !!String(data.atleta || '').trim();
    const subject = `CFT · Informações para o início das atividades`;
    const greeting = hasName
      ? this._greeting(ee, data)
      : `<div style="font-family:'Bebas Neue','Arial Narrow',sans-serif;font-size:32px;color:${C.charcoal};margin:0 0 18px 0;">CARO/A ENCARREGADO/A,</div>`;
    const intro = hasName
      ? `Está quase a começar! Aqui ficam as informações práticas para os primeiros dias ${a.doA} <b>${this._esc(data.atleta)}</b>.`
      : `Está quase a começar! Aqui ficam as informações práticas para os primeiros dias do seu educando.`;
    const body = `
      <div style="padding:48px 40px 24px 40px;">
        ${this._over('Está quase a começar', C.greenDark)}
        ${this._display('Tudo o que\nprecisa saber.')}
      </div>
      <div style="padding:0 40px 24px 40px;">
        ${greeting}
        ${this._para(intro)}
      </div>
      ${this._infoBox([
        ['📍 Local', this._esc(data.local || '—')],
        ['🕐 Horário', this._esc(data.horario || '—')],
        ['🎒 Material', this._esc(data.material || '—')],
        ['🚗 Chegada e saída', this._esc(data.logistica || '—')]
      ], 'Detalhes práticos')}
      <div style="padding:24px 40px 8px 40px;">
        ${this._para(`Em caso de imprevisto no próprio dia, contacte-nos por <b>${this._esc(data.contacto_dia || 'geral@camposft.com')}</b>.`)}
        ${this._para(`Estamos ansiosos por receber os atletas.`)}
      </div>
      <div style="padding:8px 40px 16px 40px;">
        <div style="font-family:'Playfair Display',Georgia,serif;font-style:italic;font-size:22px;color:${C.charcoal};">Até breve,</div>
      </div>`;
    return { subject, html: this._wrap(body) };
  },

  // 7. Confirmação de inscrição (per-atleta)
  confirmacao(data) {
    const C = this.C;
    const a = this.G_atl(data);
    const ee = this.G_ee(data);
    const subject = `CFT · Inscrição confirmada`;
    const body = `
      <div style="padding:48px 40px 24px 40px;">
        ${this._over('Inscrição confirmada', C.greenDark)}
        ${this._display('Bem-vindo\nao campus.')}
      </div>
      <div style="padding:0 40px 24px 40px;">
        ${this._greeting(ee, data)}
        ${this._para(`A inscrição ${a.doA} <b>${this._esc(data.atleta || 'seu educando')}</b> está confirmada e o pagamento recebido. Está tudo certo do nosso lado.`)}
        ${this._para(`Mais perto da data de início, enviaremos as informações práticas (local, horário, material).`)}
      </div>
      <div style="padding:8px 40px 16px 40px;">
        <div style="font-family:'Playfair Display',Georgia,serif;font-style:italic;font-size:22px;color:${C.charcoal};">Obrigado pela confiança,</div>
      </div>`;
    return { subject, html: this._wrap(body) };
  },

  // ============ Novos templates (Maio 2026) ============

  // 8. Boas-vindas — primeiro contacto pós-inscrição (independente do estado
  //    de pagamento; um abraço editorial com próximos passos).
  boasVindas(data) {
    const C = this.C;
    const a = this.G_atl(data);
    const ee = this.G_ee(data);
    const subject = `CFT · ${a.benvindo === 'bem-vinda' ? 'Bem-vinda' : 'Bem-vindo'}, ${this.firstName(data.atleta) || 'atleta'}`;
    const body = `
      <div style="padding:48px 40px 24px 40px;">
        ${this._over('Inscrição recebida', C.greenDark)}
        ${this._display(a.benvindo === 'bem-vinda' ? 'Bem-vinda\nao campus.' : 'Bem-vindo\nao campus.')}
      </div>
      <div style="padding:0 40px 24px 40px;">
        ${this._greeting(ee, data)}
        ${this._para(`É com muito gosto que recebemos a inscrição ${a.doA} <b>${this._esc(data.atleta)}</b> no <b>CFT 2027 · 5ª edição</b>. Bem-${a.benvindo} ao nosso campus.`)}
        ${this._para(`Vamos tratar de todos os detalhes nas próximas semanas. Nesta primeira mensagem, deixamos o resumo da inscrição e os passos seguintes.`)}
      </div>
      ${this._infoBox([
        ['Atleta', this._esc(data.atleta)],
        ['Clube', this._esc(data.clube || '—')],
        ['Valor da inscrição', `<b>${data.valor_esperado}</b>`],
        ['IBAN', `<span style="font-family:ui-monospace,Menlo,monospace;">${this.IBAN_CFT}</span>`],
        ['Prazo', `<span style="font-family:'Playfair Display',Georgia,serif;font-style:italic;">${this._esc(data.data_limite)}</span>`]
      ], 'Resumo da inscrição')}
      <div style="padding:24px 40px 8px 40px;">
        ${this._para(`<b>Próximos passos.</b> Se ainda não regularizou o pagamento, pode fazê-lo por transferência para o IBAN acima, indicando o nome ${a.doA} atleta na descrição. Assim que o valor entrar, confirmamos por email.`)}
        ${this._para(`Mais perto do início, enviaremos as <b>informações práticas</b> (local, horário, material, logística de chegada e saída).`)}
        ${this._para(`Qualquer questão — sobre semanas, equipamento, refeições, ou outra coisa que ainda não esteja clara — responda a este email que respondemos em 24h.`)}
      </div>
      <div style="padding:8px 40px 16px 40px;">
        <div style="font-family:'Playfair Display',Georgia,serif;font-style:italic;font-size:22px;color:${C.charcoal};">Até breve,</div>
      </div>`;
    return { subject, html: this._wrap(body) };
  },

  // 9. Genérico — admin escreve assunto + corpo livre. Mantém o wrapper
  //    branded (header, assinatura, footer). data.subject + data.body são
  //    populados pelo painel inline da Lista.
  generico(data) {
    const C = this.C;
    const ee = this.G_ee(data);
    const subject = data.subject || `CFT · Mensagem para ${this.firstName(data.ee_nome) || 'si'}`;
    // O corpo é texto livre; preserva quebras de linha em parágrafos.
    const raw = String(data.body || '').trim();
    const paragraphs = raw
      ? raw.split(/\n{2,}/).map(p => this._para(this._esc(p).replace(/\n/g, '<br>'))).join('')
      : this._para('<em>(escreva aqui a sua mensagem)</em>');
    const body = `
      <div style="padding:48px 40px 24px 40px;">
        ${this._over('Mensagem', C.greenDark)}
        ${this._display(data.heading || 'Uma palavra\nda nossa parte.')}
      </div>
      <div style="padding:0 40px 24px 40px;">
        ${this._greeting(ee, data)}
        ${paragraphs}
      </div>
      <div style="padding:8px 40px 16px 40px;">
        <div style="font-family:'Playfair Display',Georgia,serif;font-style:italic;font-size:22px;color:${C.charcoal};">${this._esc(data.signoff || 'Obrigado,')}</div>
      </div>`;
    return { subject, html: this._wrap(body) };
  },

  // 10. Informações finais — email logístico enviado dias antes do início.
  //     (Substitui o antigo "pré-campus".) Conteúdo fixo do CFT 2027:
  //     datas, check-in, horário dos externos, encerramento, local, o que
  //     trazer, alimentação/segurança, 2.ª semana, contacto e nota t-shirts.
  //     Design: claude.ai/design "Email" · Informacoes Finais para Gmail.html
  prePampus(data) {
    const C = this.C;
    const ee = this.G_ee(data);
    const subject = `[CFT 2027] Informações finais — tudo o que precisa antes do início`;
    const cond = `font-family:'Barlow Condensed','Arial Narrow',sans-serif;font-weight:700;text-transform:uppercase;`;
    const bebas = `font-family:'Bebas Neue','Arial Narrow',sans-serif;`;
    const serif = `font-family:'Playfair Display',Georgia,serif;font-style:italic;`;
    const sans = `font-family:'DM Sans','Helvetica Neue',Arial,sans-serif;`;
    // Chip de hora grande (faz as horas saltar dos blocos logísticos)
    const time = (t) => `<span style="${bebas}font-size:30px;line-height:1;color:${C.greenDark};letter-spacing:0.02em;">${t}</span>`;
    const timeCol = (label, t, padRight) => `<td valign="bottom" style="${padRight ? 'padding-right:40px;' : ''}">
      <div style="${cond}font-size:11px;letter-spacing:0.2em;color:${C.midGray};margin-bottom:2px;">${label}</div>
      ${time(t)}
    </td>`;
    // Secção logística: label condensado + conteúdo livre
    const logBlock = (label, inner, last) => `<div style="padding:22px 0;${last ? '' : `border-bottom:1px solid ${C.beigeMid};`}">
      <div style="${cond}font-size:12px;letter-spacing:0.22em;color:${C.greenDark};margin-bottom:10px;">${label}</div>
      ${inner}
    </div>`;
    const p15 = (html) => `<p style="${sans}font-size:15px;line-height:1.65;color:${C.charcoal};margin:0;">${html}</p>`;
    // Coluna de semana no bloco escuro de datas
    const semana = (nome, dias, borda) => `<td valign="top" width="50%" style="width:50%;${borda ? `padding-right:20px;border-right:1px solid rgba(201,185,154,0.3);` : 'padding-left:24px;'}">
      <div style="${serif}font-size:16px;color:${C.sand};">${nome}</div>
      <div style="${bebas}font-size:46px;line-height:0.95;color:${C.beige};margin-top:4px;letter-spacing:0.01em;">${dias}</div>
      <div style="${cond}font-size:15px;font-weight:600;letter-spacing:0.14em;color:${C.greenBright};margin-top:2px;">de julho</div>
    </td>`;
    const trazer = [
      'Roupa e sapatilhas de treino para todos os dias',
      'Saco-cama/lençóis e almofada (o colchão é fornecido pela organização)',
      'Chinelos, calções de banho, toalha e protetor solar',
      'Produtos de higiene pessoal',
      'Medicação habitual ou ocasional, se aplicável — entregue identificada (nome + posologia) a um treinador no check-in'
    ].map(x => `<tr>
      <td valign="top" width="22" style="width:22px;padding:9px 14px 9px 0;border-bottom:1px solid ${C.beigeMid};"><span style="display:inline-block;width:8px;height:8px;background:${C.greenBright};border-radius:50%;">&nbsp;</span></td>
      <td valign="top" style="padding:9px 0;border-bottom:1px solid ${C.beigeMid};${sans}font-size:15px;color:${C.charcoal};line-height:1.55;">${x}</td>
    </tr>`).join('');
    const body = `
      <div style="padding:48px 40px 28px 40px;">
        ${this._over('CFT 2027 · Informações finais')}
        <h1 style="${bebas}font-size:62px;line-height:1.04;color:${C.nearBlack};margin:0;text-transform:uppercase;letter-spacing:0.005em;">Tudo o que precisa<br>antes do <span style="color:${C.greenDark};">início.</span></h1>
        <div style="${serif}font-size:21px;color:${C.midGray};margin-top:16px;">Campus de Formação Técnica 2027 · Ponte da Barca</div>
      </div>
      <div style="padding:0 40px 8px 40px;">
        ${this._greeting(ee, data)}
        ${this._para(`Falta pouco para o arranque do <b>Campus de Formação Técnica 2027</b> e queremos deixar-lhe toda a informação necessária para uma semana tranquila.`)}
      </div>
      <div style="margin:20px 40px 0 40px;background:${C.nearBlack};color:${C.beige};padding:28px 30px;">
        <div style="${cond}font-size:12px;letter-spacing:0.22em;color:${C.greenBright};margin-bottom:18px;">Datas</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;"><tr>
          ${semana('1.ª semana', '12 a 18', true)}
          ${semana('2.ª semana', '19 a 25', false)}
        </tr></table>
      </div>
      <div style="padding:12px 40px 8px 40px;">
        ${logBlock('Check-in (domingo)', `
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-bottom:12px;"><tr>
            ${timeCol('Internos', '21h00', true)}
            ${timeCol('Externos', '21h45', false)}
          </tr></table>
          ${p15(`Às <b style="color:${C.greenDark};">22h00</b> há um treino de abertura para organização dos grupos — todos os atletas devem estar presentes. Pedimos também a presença dos encarregados de educação dos atletas em regime de externato neste momento inicial.`)}
        `)}
        ${logBlock('Horário dos externos (dias de semana)', `
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr>
            ${timeCol('Entrada', '9h30', true)}
            ${timeCol('Saída', '19h00', true)}
            <td valign="bottom" style="${serif}font-size:16px;color:${C.charcoal};padding-bottom:2px;">O almoço está incluído.</td>
          </tr></table>
        `)}
        ${logBlock('Encerramento (sábado)', p15(`Os pais podem estar no pavilhão a partir das <b style="color:${C.greenDark};">9h30</b>; a atividade final começa às <b style="color:${C.greenDark};">10h00</b>. Encerramento e levantamento dos atletas entre as <b style="color:${C.greenDark};">12h15</b> e as <b style="color:${C.greenDark};">13h30</b>.`), true)}
      </div>
      <div style="margin:8px 40px 0 40px;background:${C.offWhite};border:1px solid ${C.beigeMid};border-left:4px solid ${C.greenDark};padding:20px 24px;">
        <div style="${cond}font-size:12px;letter-spacing:0.22em;color:${C.greenDark};margin-bottom:8px;">Local</div>
        <div style="${bebas}font-size:30px;line-height:1;color:${C.nearBlack};letter-spacing:0.01em;text-transform:uppercase;">Escola Básica Integrada Diogo Bernardes</div>
        <div style="${serif}font-size:17px;color:${C.midGray};margin-top:6px;">Pct Frei Agostinho da Cruz, Ponte da Barca</div>
      </div>
      <div style="padding:32px 40px 8px 40px;">
        ${this._over('O que trazer', C.charcoal)}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;margin-top:12px;">${trazer}</table>
      </div>
      <div style="padding:28px 40px 8px 40px;">
        ${logBlock('Alimentação', p15(`São asseguradas todas as refeições (pequeno-almoço, lanche da manhã, almoço, lanche da tarde, jantar e ceia). Não é necessário trazer alimentos; os atletas podem trazer snacks individuais, se quiserem.`))}
        ${logBlock('Segurança', p15(`Os atletas nunca saem do recinto sem acompanhamento dos treinadores. A ida à praia fluvial decorre numa zona de baía vigiada por nadadores-salvadores.`), true)}
      </div>
      <div style="margin:8px 40px 0 40px;background:${C.offWhite};border:1px solid ${C.beigeMid};padding:20px 24px;">
        <div style="${cond}font-size:12px;letter-spacing:0.22em;color:${C.greenDark};margin-bottom:8px;">Atletas da 2.ª semana (e das duas semanas)</div>
        ${p15(`Todos os atletas terminam e são levantados no sábado. Os inscritos na 2.ª semana — quer façam só a 2.ª semana, quer façam as duas — entram no domingo para o novo check-in.`)}
      </div>
      <div style="margin:24px 40px 0 40px;background:${C.greenDark};color:${C.white};padding:28px 30px;">
        <div style="${cond}font-size:12px;letter-spacing:0.22em;color:${C.greenBright};margin-bottom:8px;">Contacto durante o campus</div>
        <p style="${sans}font-size:14px;color:rgba(255,255,255,0.85);line-height:1.55;margin:0 0 12px 0;">Para qualquer necessidade ao longo da semana:</p>
        <a href="tel:+351963474592" style="display:inline-block;text-decoration:none;${bebas}font-size:54px;line-height:0.9;color:${C.white};letter-spacing:0.03em;">963 474 592</a>
      </div>
      <div style="margin:24px 40px 0 40px;padding:16px 22px;background:${C.offWhite};border:1px solid ${C.beigeMid};border-left:4px solid ${C.orange};">
        <div style="${cond}font-size:11px;letter-spacing:0.22em;color:${C.orange};margin-bottom:4px;">Nota</div>
        <div style="${sans}font-size:14px;color:${C.charcoal};line-height:1.55;">Os atletas inscritos após 22 de junho poderão receber a t-shirt CFT em data posterior ao início do campus.</div>
      </div>
      <div style="padding:28px 40px 16px 40px;">
        ${this._para(`Em anexo seguem os planos semanais (Semana 1 e Semana 2) e o documento com todas as informações oficiais.`)}
        ${this._para(`Qualquer dúvida, estamos disponíveis por esta via.`)}
        ${this._para(`Os melhores cumprimentos,`)}
        <div style="${serif}font-size:20px;color:${C.charcoal};">Organização do Campus de Formação Técnica 2027</div>
      </div>`;
    return { subject, html: this._wrap(body) };
  },

  // 11. Agradecimento pós-edição + questionário de satisfação.
  //     Enviado no fim da edição: obrigado pela inscrição/participação e
  //     pedido de 3 minutos para o questionário (link em {survey_link}).
  //     Funciona per-atleta (link pré-preenchido com nome/clube) e em bulk
  //     (sem nome — link genérico). A fase "No campo" do questionário é para
  //     ser respondida em conjunto com o atleta, e o email di-lo claramente.
  agradecimento(data) {
    const C = this.C;
    const a = this.G_atl(data);
    const ee = this.G_ee(data);
    const hasName = !!String(data.atleta || '').trim();
    const surveyLink = data.survey_link || data.survey_url || '#';
    const edicao = data.edicao_curta || 'este ano';
    const subject = `CFT · Obrigado — e 3 minutos que valem ouro`;
    const cond = `font-family:'Barlow Condensed','Arial Narrow',sans-serif;font-weight:700;text-transform:uppercase;`;
    const intro = hasName
      ? `A edição chegou ao fim e queríamos agradecer-lhe a inscrição ${a.doA} <b>${this._esc(data.atleta)}</b> e a confiança que depositou em nós durante o campus. Esperamos que tenha sido uma semana para recordar.`
      : `A edição chegou ao fim e queríamos agradecer-lhe a confiança que depositou em nós com a inscrição do seu educando. Esperamos que tenha sido uma semana para recordar.`;
    const body = `
      <div style="padding:48px 40px 24px 40px;">
        ${this._over('Obrigado por fazerem parte', C.greenDark)}
        ${this._display('Foi um prazer\nreceber-vos.')}
      </div>
      <div style="padding:0 40px 24px 40px;">
        ${this._greeting(ee, data)}
        ${this._para(intro)}
        ${this._para(`Antes de arrumarmos de vez as bolas ${edicao !== 'este ano' ? `do ${this._esc(edicao)}` : 'desta edição'}, pedimos-lhe uma última coisa: <b>3 minutos</b> para nos dizer como correu. É um questionário curto, em <b>4 fases</b>, quase tudo respondido com um toque — e nenhuma pergunta é obrigatória.`)}
      </div>
      <div style="margin:0 40px;background:${C.greenDark};padding:28px 30px;">
        <div style="${cond}font-size:12px;letter-spacing:0.22em;color:${C.greenBright};margin-bottom:10px;">Questionário de satisfação</div>
        <p style="font-family:'DM Sans','Helvetica Neue',Arial,sans-serif;font-size:14px;color:rgba(255,255,255,0.9);line-height:1.6;margin:0 0 18px 0;">4 fases curtas · menos de 3 minutos · respostas confidenciais</p>
        <a href="${surveyLink}" style="display:inline-block;text-decoration:none;background:${C.white};color:${C.greenDark};${cond}font-size:15px;letter-spacing:0.18em;padding:15px 26px;">Responder agora →</a>
      </div>
      <div style="margin:20px 40px 0 40px;background:${C.offWhite};border:1px solid ${C.beigeMid};border-left:4px solid ${C.orange};padding:16px 22px;">
        <div style="${cond}font-size:11px;letter-spacing:0.22em;color:${C.orange};margin-bottom:4px;">Respondam a meias</div>
        <div style="font-family:'DM Sans','Helvetica Neue',Arial,sans-serif;font-size:14px;color:${C.charcoal};line-height:1.55;">A fase <b>«No campo»</b> é sobre os treinos, os treinadores e a vida no campus — como os pais não estiveram lá dentro, pedimos que essa parte seja respondida <b>em conjunto com ${hasName ? `${a.oA} ${this._esc(this.firstName(data.atleta))}` : 'o vosso atleta'}</b>.</div>
      </div>
      <div style="padding:24px 40px 8px 40px;">
        ${this._para(`As respostas servem exclusivamente para melhorarmos a próxima edição — e são levadas a sério, uma a uma. A crítica sincera vale-nos mais do que o elogio simpático.`)}
        ${this._para(`Obrigado, e esperamos voltar a ver-vos para o ano.`)}
      </div>
      <div style="padding:8px 40px 16px 40px;">
        <div style="font-family:'Playfair Display',Georgia,serif;font-style:italic;font-size:22px;color:${C.charcoal};">Até já,</div>
      </div>`;
    // Header com a edição que terminou (ex.: "CFT 2026 · Obrigado"), não a próxima.
    const headerEd = data.edicao_curta ? (this._esc(data.edicao_curta).toUpperCase() + ' · OBRIGADO') : null;
    return { subject, html: this._wrap(body, headerEd) };
  },

  // ============ Entry point: render template by name ============
  render(templateName, data) {
    const fn = this[templateName];
    if (typeof fn !== 'function') throw new Error('Template desconhecido: ' + templateName);
    return fn.call(this, data || {});
  }
};
/**
 * Cria Gmail drafts (não envia) usando EmailTemplates.
 *
 * Fluxo:
 *  - Dashboard chama createForAtleta(id, template?) → cria draft no Gmail do admin
 *    activo (geral@camposft.com) e devolve { draftId, messageId, url }.
 *  - Frontend abre `url` numa nova tab → admin revê + envia manualmente.
 *
 * Permissão necessária no scope do projeto: gmail.compose.
 */
const EmailDraft = {

  /** Auto-detecta o template a partir do estado de pagamento. */
  pickTemplate(atleta) {
    const estado = atleta && atleta.pricing && atleta.pricing.estado;
    switch (estado) {
      case 'pendente':      return 'semPagamento';
      case 'parcial_1':     return 'pagamentoParcial';
      case 'parcial_2':     return 'pagamentoParcial';
      case 'valor_errado':  return 'valorErrado';
      case 'a_devolver':    return 'aDevolver';
      case 'pago':          return 'confirmacao';
      default:              return 'semPagamento';
    }
  },

  /** Lê 1 atleta com contexto (clube count, clube_counts totais). */
  _getAtletaWithContext(atletaId) {
    const all = Inscricoes.getAll();
    const a = (all.atletas || []).find(x => x.id_inscricao === atletaId);
    if (!a) throw new Error('Atleta não encontrado: ' + atletaId);
    const clubeCounts = all.clube_counts || {};
    return { atleta: a, clubeCount: clubeCounts[a.clube] || 0, clubeCounts: clubeCounts };
  },

  /** Versão legacy — só atleta. */
  _getAtleta(atletaId) {
    return this._getAtletaWithContext(atletaId).atleta;
  },

  /** Calcula o valor de inscrição com desconto (clube ≥8), só para internos sem desconto já aplicado. */
  _calcValorComDesconto(atleta) {
    const p = atleta.pricing || {};
    const info = p.info || {};
    if (info.tipo !== 'interno' || info.desc) return null;
    const nSem = info.nSem || 0;
    if (nSem === 0) return null;
    // Preço pronto com desconto: before cutoff = 295/sem · after = 330/sem
    const prontoComDescTotal = (info.before ? 295 : 330) * nSem;
    // Preço prestações com desconto: before = 330/sem · after = n/a (depois cutoff só pronto)
    const prestComDescTotal = info.before ? (330 * nSem) : null;
    return { pronto: prontoComDescTotal, prest: prestComDescTotal };
  },

  /** Constrói o objeto de dados (placeholders) a partir do atleta + contexto. */
  _buildData(atleta, overrides, ctx) {
    const p = atleta.pricing || {};
    const devido = Number(p.devido || 0);
    const pago   = Number(atleta.valor_pago || 0);
    const falta  = Math.max(0, devido - pago);
    const excedente = Math.max(0, pago - devido);
    // Contexto do clube (para o template descontoClube)
    const clubeCount = ctx && ctx.clubeCount ? Number(ctx.clubeCount) : 0;
    const clubeFaltam = Math.max(0, 8 - clubeCount);
    const comDesc = this._calcValorComDesconto(atleta);
    const valorComDesc = comDesc ? comDesc.pronto : devido;
    const diferenca = Math.max(0, devido - valorComDesc);
    const data = {
      atleta:          atleta.atleta || '',
      ee_nome:         EmailTemplates.shortName(atleta.encarregado || ''),
      ee_email:        atleta.email || '',
      clube:           atleta.clube || '',
      clube_atletas:   String(clubeCount),
      clube_faltam:    String(clubeFaltam),
      // Inferência de género PT-PT pelo 1º nome (atleta + EE) — usada em todos
      // os templates para concordância. Pode ser sobreposta por override.
      gen_atleta:      EmailTemplates.guessGender(atleta.atleta || ''),
      gen_ee:          EmailTemplates.guessGender(atleta.encarregado || ''),
      valor_esperado:  devido ? (devido + ' €') : '—',
      valor_pago:      pago   ? (pago   + ' €') : '0 €',
      valor_atual:     devido + ' €',
      valor_com_desconto: valorComDesc + ' €',
      diferenca:       diferenca + ' €',
      falta:           falta  ? (falta  + ' €') : '0 €',
      excedente:       excedente ? (excedente + ' €') : '0 €',
      iban_cft:        EmailTemplates.IBAN_CFT,
      data_inicio:     (Config.get('email_data_inicio')   || ''),
      data_limite:     (Config.get('email_data_limite')   || '21 de junho'),
      local:           (Config.get('email_local')         || 'Pavilhão Municipal de Sobral de Monte Agraço'),
      horario:         (Config.get('email_horario')       || '09h00 às 17h30'),
      material:        (Config.get('email_material')      || 'equipamento desportivo, ténis de corte interior, garrafa de água e uma muda de roupa'),
      logistica:       (Config.get('email_logistica')     || 'entrada a partir das 08h30 · saída até às 18h00'),
      contacto_dia:    (Config.get('email_contacto_dia') || '912 345 678')
    };
    // Questionário de satisfação (template agradecimento):
    //   survey_url  — base configurável na aba Config (key survey_url)
    //   survey_link — com nome/clube pré-preenchidos para reduzir fricção
    const surveyBase = String(Config.get('survey_url') || 'https://tiagojgcc.github.io/CFT-dashboard/questionario.html');
    data.survey_url = surveyBase;
    data.survey_link = surveyBase
      + (surveyBase.indexOf('?') === -1 ? '?' : '&')
      + 'atleta=' + encodeURIComponent(atleta.atleta || '')
      + '&clube=' + encodeURIComponent(atleta.clube || '')
      + '&ref=email';
    data.edicao_curta = String(Config.get('survey_edicao') || '');
    if (overrides) Object.keys(overrides).forEach(k => { data[k] = overrides[k]; });
    return data;
  },

  /** Cria draft para 1 atleta. */
  createForAtleta(atletaId, templateName, user, overrides) {
    if (!atletaId) throw new Error('atletaId em falta');
    const ctx = this._getAtletaWithContext(atletaId);
    const atleta = ctx.atleta;
    const tpl = templateName || this.pickTemplate(atleta);
    const data = this._buildData(atleta, overrides, ctx);
    const { subject, html } = EmailTemplates.render(tpl, data);
    const to = (atleta.email || '').trim();
    if (!to) throw new Error('Atleta sem email: ' + atleta.atleta);

    const draft = GmailApp.createDraft(to, subject, this._plainFallback(html), {
      htmlBody: html,
      name: 'CFT — Inscrições'
    });
    // Não chamamos draft.getMessage() para evitar exigir scope gmail.readonly.
    // O messageId real só fica disponível depois do envio; para o log basta o draftId.
    const draftId = draft.getId();
    const url = 'https://mail.google.com/mail/u/0/#drafts?compose=' + draftId;

    // Log em Emails + Historico
    try {
      Emails.log({
        id_atleta: atletaId,
        atleta:    atleta.atleta,
        para:      to,
        assunto:   subject,
        tipo:      tpl,
        estado:    'rascunho',
        message_id: 'draft:' + draftId
      }, user);
    } catch (e) { Logger.log('Emails.log falhou: ' + e.message); }
    try {
      Historico.append({
        utilizador: user,
        id_atleta:  atletaId,
        atleta:     atleta.atleta,
        tipo:       'email_rascunho',
        antes:      '',
        depois:     tpl,
        motivo:     subject
      });
    } catch (e) { Logger.log('Historico.append falhou: ' + e.message); }

    return { draftId: draftId, url: url, template: tpl, to: to, subject: subject };
  },

  /**
   * Cria 1 draft com BCC de vários atletas (bulk).
   * Para templates "bulk" (avisoPrazo, infoPraticas, confirmacao) que não dependem
   * de valores por-atleta.
   */
  createBulk(atletaIds, templateName, user, overrides) {
    if (!Array.isArray(atletaIds) || atletaIds.length === 0) {
      throw new Error('atletaIds vazio');
    }
    const tpl = templateName || 'avisoPrazo';
    const all = Inscricoes.getAll();
    const map = {};
    (all.atletas || []).forEach(a => { map[a.id_inscricao] = a; });

    const atletas = atletaIds.map(id => map[id]).filter(Boolean);
    if (atletas.length === 0) throw new Error('Nenhum atleta encontrado');
    const comEmail = atletas.filter(a => (a.email || '').trim());
    // Dedupe (irmãos partilham o email do encarregado) preservando a ordem.
    const bccList = [...new Set(comEmail.map(a => a.email.trim()))];
    if (bccList.length === 0) throw new Error('Nenhum dos atletas tem email');

    // Para bulk usamos dados genéricos (placeholders por-atleta ficam vazios).
    const data = this._buildData(atletas[0], overrides);
    data.atleta = '';  // bulk: não personalizar
    data.ee_nome = '';
    // bulk: link do questionário sem pré-preenchimento (o do 1º atleta não
    // representa os restantes destinatários em BCC)
    data.survey_link = data.survey_url
      + (String(data.survey_url).indexOf('?') === -1 ? '?' : '&') + 'ref=email';

    const { subject, html } = EmailTemplates.render(tpl, data);

    // GmailApp.createDraft limita a ~50 destinatários por mensagem, o que
    // rebenta com envios a todos os pais. Acima desse limite criamos o draft
    // via API REST do Gmail (limites normais do Gmail: 500 destinatários).
    let draftId, msgId;
    if (bccList.length <= 45) {
      const draft = GmailApp.createDraft('geral@camposft.com', subject, this._plainFallback(html), {
        bcc: bccList.join(','),
        htmlBody: html,
        name: 'CFT — Inscrições'
      });
      draftId = draft.getId();
      msgId = '';
    } else {
      const created = this._createDraftRaw('geral@camposft.com', bccList, subject, html, this._plainFallback(html));
      draftId = created.id;
      msgId = (created.message && created.message.id) || '';
    }

    // Log em Emails com ids_atletas — permite ao dashboard marcar "já enviado"
    // por atleta mesmo quando o envio foi um único rascunho BCC.
    try {
      Emails.log({
        template:      tpl,
        assunto:       subject,
        corpo:         '',
        destinatarios: bccList,
        ids_atletas:   comEmail.map(a => a.id_inscricao)
      }, user);
    } catch (e) { Logger.log('Emails.log bulk falhou: ' + e.message); }
    try {
      Historico.append({
        utilizador: user,
        id_atleta:  '',
        atleta:     '(bulk · ' + atletas.length + ' atletas)',
        tipo:       'email_rascunho_bulk',
        antes:      '',
        depois:     tpl,
        motivo:     subject + ' [' + bccList.length + ' destinatários]'
      });
    } catch (e) { Logger.log('Historico bulk falhou: ' + e.message); }

    const url = 'https://mail.google.com/mail/u/0/#drafts?compose=' + (msgId || draftId);
    return { draftId: draftId, url: url, template: tpl, count: bccList.length, bcc: bccList };
  },

  /**
   * Cria um draft via serviço avançado Gmail (users.drafts.create).
   * Necessário para BCC > ~50: o GmailApp impõe um limite de destinatários
   * por mensagem que a API não tem (aplica-se o limite normal do Gmail, 500).
   * Requer o serviço avançado "Gmail API" ativo no editor do Apps Script
   * (Serviços + → Gmail API → Adicionar) — isto também ativa a API no
   * projeto GCP por trás do script, que é gerido pelo Google e não é
   * acessível pela consola.
   */
  _createDraftRaw(to, bccList, subject, htmlBody, plainBody) {
    if (typeof Gmail === 'undefined') {
      throw new Error('O serviço avançado "Gmail API" não está ativo. No editor do Apps Script: barra lateral → Serviços (+) → Gmail API → Adicionar, e volte a tentar.');
    }
    const nl = '\r\n';
    const wrap = (b64) => b64.replace(/(.{76})/g, '$1\r\n');
    const boundary = 'cft_' + Utilities.getUuid().replace(/-/g, '');
    const mime =
      'To: ' + to + nl +
      'Bcc: ' + bccList.join(',') + nl +
      'Subject: =?UTF-8?B?' + Utilities.base64Encode(subject, Utilities.Charset.UTF_8) + '?=' + nl +
      'MIME-Version: 1.0' + nl +
      'Content-Type: multipart/alternative; boundary="' + boundary + '"' + nl + nl +
      '--' + boundary + nl +
      'Content-Type: text/plain; charset=UTF-8' + nl +
      'Content-Transfer-Encoding: base64' + nl + nl +
      wrap(Utilities.base64Encode(plainBody, Utilities.Charset.UTF_8)) + nl +
      '--' + boundary + nl +
      'Content-Type: text/html; charset=UTF-8' + nl +
      'Content-Transfer-Encoding: base64' + nl + nl +
      wrap(Utilities.base64Encode(htmlBody, Utilities.Charset.UTF_8)) + nl +
      '--' + boundary + '--';
    return Gmail.Users.Drafts.create(
      { message: { raw: Utilities.base64EncodeWebSafe(mime) } },
      'me'
    );
  },

  /** Converte HTML em texto simples (fallback para clientes sem HTML). */
  _plainFallback(html) {
    return String(html || '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|h1|h2|h3|li|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
};
// ============ TOP-LEVEL ENTRY POINTS ============
function setupSheets()         { return Backfill.setupSheets(); }
function backfillRun()         { return Backfill.run(); }
function fillOrigem()          { return Backfill.fillOrigem(); }
function upgradeAtletas()      { return Backfill.upgradeAtletas(); }
function fixComprovativoUrls() { return Backfill.fixComprovativoUrls(); }
function assignNumeros()       { return Backfill.assignNumeros(); }
function renameComprovativos() { return Backfill.renameComprovativos(); }
function resyncAllFromForms()  { return Backfill.resyncAllFromForms(); }
function remapAtletasIds()     { return Backfill.remapAtletasIds(); }
function repairBrokenIds()     { return Backfill.repairBrokenIds(); }
function fixSemanasAtuais()    { return Backfill.fixSemanasAtuais(); }
function installTrigger()      { return Triggers.install(); }
function readAllComprovativos(){ return Comprovativo.readAllPending('geral@camposft.com'); }
function improveForms()        { return FormImprovement.run(); }
function fixAuth()             { var d = DocumentApp.create('cft_tmp'); DriveApp.getFileById(d.getId()).setTrashed(true); }

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


// ================================================================
// ============ SATISFACAO (Satisfacao.gs) ============
// ================================================================

/**
 * Questionário de satisfação pós-edição.
 *
 * As respostas chegam do questionario.html (hospedado com o Dashboard) via a
 * action pública `survey_submit` — sem token, porque quem responde são os
 * encarregados, não admins. Proteções: honeypot (campo "website"), caps de
 * tamanho nos textos e coerção numérica das avaliações.
 *
 * As respostas caem na aba "Satisfacao" do Sheet (criada automaticamente na
 * primeira submissão). Analisar diretamente no Sheets — filtros/pivots.
 */
const Satisfacao = {
  SHEET_NAME: 'Satisfacao',

  // Ordem das colunas na aba (a seguir a timestamp/edicao/meta).
  // [chave, tipo] — tipo: 'r5' avaliação 1-5 · 'n10' NPS 0-10 · 't' texto
  FIELDS: [
    // Fase 1 · Inscrição & comunicação (pais)
    ['insc_processo',        'r5'],
    ['insc_clareza',         'r5'],
    ['insc_comunicacao',     'r5'],
    ['insc_melhorar',        't'],
    // Fase 2 · Organização & confiança (pais)
    ['log_checkin',          'r5'],
    ['log_informado',        'r5'],
    ['log_seguranca',        'r5'],
    ['log_qualidade_preco',  'r5'],
    // Fase 3 · No campo (respondida em conjunto com o atleta)
    ['campo_treinos',        'r5'],
    ['campo_treinadores',    'r5'],
    ['treinadores_destaque', 't'],
    ['campo_alimentacao',    'r5'],
    ['campo_instalacoes',    'r5'],
    ['campo_ambiente',       'r5'],
    ['mais_gostou',          't'],
    ['menos_gostou',         't'],
    // Fase 4 · Para o ano
    ['nps',                  'n10'],
    ['volta',                't'],
    ['mudar_uma_coisa',      't'],
    // Identificação opcional
    ['atleta',               't'],
    ['clube',                't']
  ],

  sheet_() {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    let sh = ss.getSheetByName(this.SHEET_NAME);
    if (!sh) {
      sh = ss.insertSheet(this.SHEET_NAME);
      const headers = ['timestamp', 'edicao', 'origem', 'duracao_seg']
        .concat(this.FIELDS.map(f => f[0]));
      sh.getRange(1, 1, 1, headers.length).setValues([headers]);
      sh.setFrozenRows(1);
    }
    return sh;
  },

  _clean(v, type) {
    if (v === null || v === undefined) return '';
    if (type === 'r5') {
      const n = Number(v);
      return (Number.isFinite(n) && n >= 1 && n <= 5) ? Math.round(n) : '';
    }
    if (type === 'n10') {
      const n = Number(v);
      return (Number.isFinite(n) && n >= 0 && n <= 10) ? Math.round(n) : '';
    }
    return String(v).slice(0, 1000).trim();
  },

  submit(params) {
    // Honeypot: bots preenchem o campo escondido — finge sucesso e descarta.
    if (String(params.website || '').trim() !== '') return { recebido: true };

    const r = params.respostas || {};
    // Submissão completamente vazia não vale a pena registar.
    const temAlgo = this.FIELDS.some(([k]) => {
      const v = r[k];
      return v !== undefined && v !== null && String(v).trim() !== '';
    });
    if (!temAlgo) return { recebido: true };

    const row = [
      new Date(),
      String(params.edicao || '').slice(0, 100),
      String(params.origem || '').slice(0, 100),
      Number(params.duracao_seg) || ''
    ].concat(this.FIELDS.map(([k, type]) => this._clean(r[k], type)));

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      this.sheet_().appendRow(row);
    } finally {
      lock.releaseLock();
    }
    return { recebido: true };
  }
};
