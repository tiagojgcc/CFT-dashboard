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
