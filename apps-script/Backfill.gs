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
