/**
 * Inscrição pública a partir do site (camposft.com/inscricao.html).
 *
 * O Google Form tem reCAPTCHA, por isso o site não consegue submeter
 * diretamente para o formResponse. Em vez disso, o site faz POST para este
 * endpoint (action pública 'inscricao_submit', sem token), que:
 *   1. guarda o comprovativo na pasta do Drive (se vier ficheiro);
 *   2. escreve uma linha em "Respostas do Formulário 1" com o MESMO formato
 *      que o Form escreve (colunas encontradas pelo título);
 *   3. corre o mesmo processamento do trigger onFormSubmit (id, Atletas,
 *      número de inscrição, leitura do comprovativo).
 *
 * Pasta dos comprovativos: Propriedade do script COMPROVATIVOS_FOLDER_ID.
 * Se não existir, cria a pasta "CFT 2027 - Comprovativos (site)" e guarda o id.
 */
const InscricaoSite = {
  MAX_FILE_BYTES: 10 * 1024 * 1024,
  MIME_OK: /^(application\/pdf|image\/(jpeg|png|gif|webp|heic|heif))$/i,

  // chave do site -> como encontrar a coluna no Sheet (exato ou "contém")
  COLS: [
    ['email_resp',        { exact: 'Endereço de e-mail' }],
    ['semanas',           { exact: 'Semana de inscrição' }],
    ['como_conheceu',     { contains: 'como tomou conhecimento' }],
    ['treinador_indicou', { contains: 'caso tenha respondido treinador' }],
    ['opcao',             { exact: 'Opção de inscrição' }],
    ['atleta',            { exact: 'Nome completo do atleta' }],
    ['cc',                { exact: 'Nº Cartão de Cidadão' }],
    ['dataNasc',          { exact: 'Data de nascimento', type: 'date' }],
    ['nif',               { exact: 'NIF' }],
    ['tshirt',            { exact: 'Tamanho equipamento' }],
    ['tshirt_num',        { exact: 'Número colocar equipamento' }],
    ['tshirt_nome',       { exact: 'Nome colocar equipamento' }],
    ['clube',             { exact: 'Clube onde joga' }],
    ['posicao',           { exact: 'Posição onde joga' }],
    ['melhorar',          { exact: 'O que pretende melhorar com o campo?' }],
    ['alergia_alim',      { exact: 'Tem alguma alergia alimentar?', qual: 'alergia_alim_qual' }],
    ['medicacao',         { exact: 'Faz alguma medicação regularmente?', qual: 'medicacao_qual' }],
    ['doenca',            { exact: 'Tem alguma doença?', qual: 'doenca_qual' }],
    ['alergia_med',       { exact: 'Tem alguma alergia medicamentosa?', qual: 'alergia_med_qual' }],
    ['encarregado',       { exact: 'Nome encarregado de educação' }],
    ['email_ee',          { exact: 'Email' }],
    ['telefone',          { exact: 'Telemóvel' }],
    ['contacto_emerg',    { exact: 'Contacto de emergência' }],
    ['decl_resp',         { contains: 'declaro, como encarregado' }],
    ['decl_imagem',       { contains: 'captação e divulgação' }],
    ['decl_saida',        { contains: 'saída do seu educando' }],
    ['iban',              { exact: 'Iban para devolução de dinheiro' }],
    ['iban_pag',          { exact: 'IBAN pagamento' }],
    ['irmao',             { contains: 'irmão inscrito' }]
  ],
  OBRIGATORIOS: ['semanas', 'opcao', 'atleta', 'dataNasc', 'encarregado', 'email_ee', 'telefone', 'decl_resp'],

  submit(params) {
    // Honeypot: bots preenchem o campo escondido. Finge sucesso e descarta.
    if (String(params.website || '').trim() !== '') return { recebido: true };

    const r = params.respostas || {};
    if (!r.email_resp) r.email_resp = r.email_ee;
    const falta = this.OBRIGATORIOS.filter(k => String(r[k] || '').trim() === '');
    if (falta.length) throw new Error('Faltam campos obrigatórios: ' + falta.join(', '));
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(r.email_ee).trim())) throw new Error('Email inválido');

    // 1. Comprovativo (opcional: quem paga depois pode enviar mais tarde)
    let comprovativoUrl = '';
    if (params.ficheiro && params.ficheiro.base64) {
      comprovativoUrl = this.saveFile_(params.ficheiro, r.atleta);
    }

    // 2. Linha no formato do Form
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sh = ss.getSheetByName('Respostas do Formulário 1');
    if (!sh) throw new Error('Aba "Respostas do Formulário 1" não encontrada');

    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    let row;
    try {
      const lastCol = sh.getLastColumn();
      const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0]
        .map(h => String(h).trim().replace(/\s+/g, ' '));
      const lower = headers.map(h => h.toLowerCase());
      const linha = new Array(lastCol).fill('');
      const put = (idx, val) => { if (idx >= 0 && idx < lastCol) linha[idx] = val; };

      put(headers.indexOf('Carimbo de data/hora'), new Date());
      this.COLS.forEach(([key, spec]) => {
        const idx = spec.exact ? headers.indexOf(spec.exact)
          : lower.findIndex(h => h.indexOf(spec.contains) >= 0);
        if (idx < 0) return;
        put(idx, this.clean_(r[key], spec.type));
        // "Qual?" fica sempre na coluna a seguir à pergunta-mãe (igual ao Backfill)
        if (spec.qual) put(idx + 1, this.clean_(r[spec.qual]));
      });
      const compIdx = lower.findIndex(h => h.indexOf('comprovativo pagamento inscrição') >= 0);
      put(compIdx, comprovativoUrl);

      sh.appendRow(linha);
      row = sh.getLastRow();
    } finally {
      lock.releaseLock();
    }

    // 3. Mesmo processamento do trigger do Form
    const id = processFormRow_(row);
    return { recebido: true, id: id || null, comprovativo: !!comprovativoUrl };
  },

  clean_(v, type) {
    if (v === undefined || v === null) return '';
    if (Array.isArray(v)) v = v.join(', ');
    let s = String(v).trim().slice(0, 1000);
    // Evita que texto comece por = + - @ e seja lido como fórmula
    // e que telefones como +351... virem números
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    if (type === 'date') {
      const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    }
    return s;
  },

  folder_() {
    const props = PropertiesService.getScriptProperties();
    const id = props.getProperty('COMPROVATIVOS_FOLDER_ID');
    if (id) {
      try { return DriveApp.getFolderById(id); } catch (e) { /* recria */ }
    }
    const f = DriveApp.createFolder('CFT 2027 - Comprovativos (site)');
    props.setProperty('COMPROVATIVOS_FOLDER_ID', f.getId());
    return f;
  },

  saveFile_(fic, atleta) {
    const mime = String(fic.mime || '').toLowerCase();
    if (!this.MIME_OK.test(mime)) throw new Error('O comprovativo tem de ser PDF ou imagem');
    const bytes = Utilities.base64Decode(String(fic.base64));
    if (bytes.length > this.MAX_FILE_BYTES) throw new Error('Comprovativo grande demais (máx. 10 MB)');
    const ext = (String(fic.nome || '').match(/\.([a-zA-Z0-9]{2,5})$/) || [, mime.split('/')[1]])[1];
    const base = String(atleta || 'atleta').replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 60) || 'atleta';
    const nome = 'site_' + Utilities.formatDate(new Date(), 'Europe/Lisbon', 'yyyyMMdd-HHmmss') + '_' + base + '.' + ext.toLowerCase();
    const file = this.folder_().createFile(Utilities.newBlob(bytes, mime, nome));
    return file.getUrl();
  }
};
