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
    try { CacheService.getScriptCache().remove('clube_counts'); } catch (e) {}

    // 4. Irmão declarado no site: marca o desconto (o admin pode desligar no Dashboard)
    if (id && String(r.irmao) === 'Sim') {
      try { Inscricoes.toggleIrmao(id, true, 'site'); } catch (e) { Logger.log('irmão falhou: ' + e.message); }
    }
    // 5. Forma de pagamento escolhida no site fica como nota no Dashboard
    if (id && r.pagamento) {
      try { Inscricoes.addNota(id, 'Site: pagou ' + (String(r.pagamento) === 'sinal' ? 'o sinal' : 'a totalidade') + ' na inscrição', 'site'); } catch (e) { Logger.log('nota falhou: ' + e.message); }
    }
    // 6. Email automático de confirmação (não bloqueia a inscrição se falhar)
    let email = 'nao_enviado';
    try { email = this.enviarConfirmacao_(r, id, !!comprovativoUrl); } catch (e) { Logger.log('Email confirmação falhou: ' + e.message); }
    return { recebido: true, id: id || null, comprovativo: !!comprovativoUrl, email: email };
  },

  // Email automático "Inscrição recebida". Desliga-se pondo email_auto_inscricao = nao no Config.
  enviarConfirmacao_(r, id, temComprovativo) {
    const flag = String(Config.get('email_auto_inscricao') || 'sim').trim().toLowerCase();
    if (flag === 'nao' || flag === 'não' || flag === 'false') return 'desligado';
    const to = String(r.email_ee || '').trim();
    if (!to) return 'sem email';
    const atleta = {
      timestamp_inscricao: new Date(), opcao_inscricao: r.opcao, semanas_atuais: r.semanas,
      irmao_desconto: String(r.irmao) === 'Sim', clube: r.clube
    };
    const p = Pricing.calc(atleta, {});
    const eur = (n) => (Number(n) || 0) + ' €';
    const data = {
      atleta: String(r.atleta || ''), ee_nome: EmailTemplates.shortName(r.encarregado || ''),
      gen_atleta: EmailTemplates.guessGender(r.atleta || ''), gen_ee: EmailTemplates.guessGender(r.encarregado || ''),
      semanas: String(r.semanas || ''), opcao: String(r.opcao || ''),
      total: eur(p.prontoTotal), sinal: eur(p.prest1), resto: eur(p.prest2), desconto: !!p.desc,
      comprovativo: !!temComprovativo,
      pagamento: String(r.pagamento) === 'sinal' ? 'sinal' : 'total'
    };
    const { subject, html } = EmailTemplates.render('inscricaoRecebida', data);
    const plain = EmailDraft._plainFallback(html);
    const nl = '\r\n', wrap = (b64) => b64.replace(/(.{76})/g, '$1\r\n');
    const boundary = 'cft_' + Utilities.getUuid().replace(/-/g, '');
    const mime =
      'From: =?UTF-8?B?' + Utilities.base64Encode('CFT · Campo de Formação Técnica', Utilities.Charset.UTF_8) + '?= <geral@camposft.com>' + nl +
      'To: ' + to.replace(/[\r\n,;<>]/g, '') + nl +
      'Subject: =?UTF-8?B?' + Utilities.base64Encode(subject, Utilities.Charset.UTF_8) + '?=' + nl +
      'MIME-Version: 1.0' + nl +
      'Content-Type: multipart/alternative; boundary="' + boundary + '"' + nl + nl +
      '--' + boundary + nl + 'Content-Type: text/plain; charset=UTF-8' + nl + 'Content-Transfer-Encoding: base64' + nl + nl +
      wrap(Utilities.base64Encode(plain, Utilities.Charset.UTF_8)) + nl +
      '--' + boundary + nl + 'Content-Type: text/html; charset=UTF-8' + nl + 'Content-Transfer-Encoding: base64' + nl + nl +
      wrap(Utilities.base64Encode(html, Utilities.Charset.UTF_8)) + nl +
      '--' + boundary + '--';
    Gmail.Users.Messages.send({ raw: Utilities.base64EncodeWebSafe(mime) }, 'me');
    try {
      Emails.log({ template: 'inscricaoRecebida', assunto: subject, corpo: '', destinatarios: [to], ids_atletas: id ? [id] : [] }, 'site');
    } catch (e) { Logger.log('Emails.log falhou: ' + e.message); }
    return 'enviado';
  },

  // Público: quantas inscrições tem um clube (para o contador do desconto de clube no site).
  // Conta inscrições (1 atleta em 2 semanas = 2), como no desconto. Cache de 5 minutos.
  clubeContagem(clube) {
    const nome = String(clube || '').trim();
    if (!nome) return { clube: '', inscritos: 0, minimo: 8 };
    const cache = CacheService.getScriptCache();
    let counts = null;
    try { counts = JSON.parse(cache.get('clube_counts') || 'null'); } catch (e) {}
    if (!counts) {
      counts = Inscricoes.getAll().clube_counts || {};
      try { cache.put('clube_counts', JSON.stringify(counts), 300); } catch (e) {}
    }
    const key = Object.keys(counts).find(k => k.trim().toLowerCase() === nome.toLowerCase());
    return { clube: nome, inscritos: key ? Number(counts[key]) || 0 : 0, minimo: 8 };
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
