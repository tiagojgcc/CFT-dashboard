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
