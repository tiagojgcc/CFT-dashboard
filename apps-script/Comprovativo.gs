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
