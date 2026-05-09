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

Devolve UM array JSON com todos os objetos. Sem texto à volta, sem markdown. Se não houver transferências crédito, devolve [].`;
