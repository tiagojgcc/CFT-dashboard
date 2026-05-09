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
        maxOutputTokens: 16000,
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
        }
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
    const text = json.candidates && json.candidates[0] && json.candidates[0].content
                 && json.candidates[0].content.parts && json.candidates[0].content.parts[0]
                 && json.candidates[0].content.parts[0].text;
    if (!text) throw new Error('Gemini devolveu resposta vazia');
    let arr;
    try { arr = JSON.parse(text); } catch (e) { throw new Error('JSON inválido do Gemini: ' + text.slice(0, 200)); }
    if (!Array.isArray(arr)) throw new Error('Gemini não devolveu array');
    return arr;
  },

  saveTransfers(filename, fileId, transfers) {
    const sh = this.sheet();
    transfers.forEach(t => {
      sh.appendRow([
        Utilities.getUuid(), filename, fileId,
        t.data_operacao || '', t.data_valor || '', Number(t.valor) || 0,
        t.nome_ordenante || '', t.iban_ordenante || '', t.info_adicional || '', t.referencia || '',
        '', 0, 'pendente',
        false, '', ''
      ]);
    });
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
      if (processed.has(f.getId())) continue;
      if (count > 0) Utilities.sleep(5000);  // throttle Gemini RPM
      count++;
      try {
        const transfers = this.extractTransfers(f.getId());
        this.saveTransfers(f.getName(), f.getId(), transfers);
        results.push({ file: f.getName(), inserted: transfers.length, ok: true });
      } catch (e) {
        results.push({ file: f.getName(), error: e.message, ok: false });
      }
    }
    this.matchAll();
    return { processed: results.length, results };
  },

  // Match algorithm: para cada movimento sem atleta, procura candidatos por valor + nome
  matchAll() {
    const sh = this.sheet();
    const last = sh.getLastRow();
    if (last < 2) return { matched: 0 };
    const all = Inscricoes.getAll();
    const atletas = all.atletas;
    const range = sh.getRange(2, 1, last - 1, 16).getValues();
    let matched = 0;
    range.forEach((row, idx) => {
      if (row[10]) return;  // já tem match
      const valor = Number(row[5]) || 0;
      const ordenante = String(row[6] || '').toLowerCase();
      const info = String(row[8] || '').toLowerCase();
      const candidates = atletas.filter(a => {
        if (!a.ativo) return false;
        if (Number(a.valor_pago) !== valor) return false;
        // 1) match por nome do encarregado vs ordenante
        const enc = String(a.encarregado || '').toLowerCase();
        if (enc && ordenante) {
          const encWords = enc.split(/\s+/).filter(w => w.length > 3);
          const matchedWords = encWords.filter(w => ordenante.indexOf(w) !== -1);
          if (matchedWords.length >= 2) return true;
        }
        // 2) match por nome do atleta vs info_adicional
        const nome = String(a.atleta || '').toLowerCase();
        if (nome && info && info.indexOf('notprovided') === -1) {
          const nomeWords = nome.split(/\s+/).filter(w => w.length > 3);
          const matchedWords = nomeWords.filter(w => info.indexOf(w) !== -1);
          if (matchedWords.length >= 2) return true;
        }
        return false;
      });
      const sheetRow = idx + 2;
      if (candidates.length === 1) {
        sh.getRange(sheetRow, 11).setValue(candidates[0].id_inscricao);
        sh.getRange(sheetRow, 12).setValue(0.9);
        sh.getRange(sheetRow, 13).setValue('auto_alta');
        matched++;
      } else if (candidates.length > 1) {
        sh.getRange(sheetRow, 11).setValue(candidates[0].id_inscricao);
        sh.getRange(sheetRow, 12).setValue(0.5);
        sh.getRange(sheetRow, 13).setValue('auto_ambiguo');
      } else {
        sh.getRange(sheetRow, 13).setValue('sem_match');
      }
    });
    return { matched };
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

Extrai TODAS as transferências CRÉDITO recebidas (incluindo "Trf Imediata Sepa+", "Trf Cred Intrab", "Trf Sepa+" e similares).

NÃO incluas: débitos (saídas), comissões, impostos, ordens permanentes a fornecedores, pagamentos de cartão.

Foca-te na secção "AVISOS DE LANÇAMENTO" (páginas 3+) que tem o detalhe completo de cada transferência: Banco Ordenante, IBAN Ordenante, Nome Ordenante, Referência Ordenante, Informação Adicional, Montante.

Formato esperado para cada transferência (objeto JSON):
- data_operacao: "YYYY-MM-DD"
- data_valor: "YYYY-MM-DD"
- valor: número decimal (ex: 120.00, sem símbolo €)
- nome_ordenante: nome completo do remetente em maiúsculas (ex: "ELISABETE FARIA DE BRITO QUESA")
- iban_ordenante: IBAN do remetente sem espaços (ex: "PT50001000004280994000117")
- info_adicional: campo "Informação Adicional" (pode conter "NOTPROVIDED", nome do atleta, ou descrição como "CAMPO FORMACAO BASQUETEBOL-JUL"). String vazia se não houver.
- referencia: campo "Referência Ordenante". String vazia se não houver.

Devolve UM array JSON com todos os objetos. Sem texto à volta, sem markdown. Se não houver transferências, devolve [].`;
