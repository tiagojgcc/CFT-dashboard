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
        'num_inscricao'
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

    // 5. Aba Forms — acrescentar id_inscricao e migrado_em à direita
    sh = ss.getSheetByName('Respostas do Formulário 1');
    if (sh) {
      const lastCol = sh.getLastColumn();
      const headers = sh.getRange(1, 1, 1, Math.max(lastCol, 35)).getValues()[0];
      if (headers[33] !== 'id_inscricao') sh.getRange(1, 34).setValue('id_inscricao');
      if (headers[34] !== 'migrado_em')   sh.getRange(1, 35).setValue('migrado_em');
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
    const last = formSheet.getLastRow();
    let migrated = 0;
    for (let r = 2; r <= last; r++) {
      let id = formSheet.getRange(r, 34).getValue();
      if (!id) {
        id = Utilities.getUuid();
        formSheet.getRange(r, 34).setValue(id);
      }
      const migrado = formSheet.getRange(r, 35).getValue();
      if (migrado) continue;
      this.migrateRow_(r, formSheet, atletas);
      formSheet.getRange(r, 35).setValue(new Date());
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
    const f = formSheet.getRange(row, 1, 1, 35).getValues()[0]; // f[0..34]
    const id = f[33];
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
      ''         // 45 num_inscricao (preenchido depois por assignNumeros / trigger)
    ];
    atletas.appendRow(atletaRow);
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
    const formIds = formSheet.getRange(2, 34, formLast - 1, 1).getValues().flat();
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
