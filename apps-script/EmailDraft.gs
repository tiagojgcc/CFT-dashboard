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

  /** Lê 1 atleta da aba (já com pricing aplicado, usando getAll). */
  _getAtleta(atletaId) {
    const all = Inscricoes.getAll();
    const a = (all.atletas || []).find(x => x.id_inscricao === atletaId);
    if (!a) throw new Error('Atleta não encontrado: ' + atletaId);
    return a;
  },

  /** Constrói o objeto de dados (placeholders) a partir do atleta. */
  _buildData(atleta, overrides) {
    const p = atleta.pricing || {};
    const devido = Number(p.devido || 0);
    const pago   = Number(atleta.valor_pago || 0);
    const falta  = Math.max(0, devido - pago);
    const excedente = Math.max(0, pago - devido);
    const data = {
      atleta:          atleta.atleta || '',
      ee_nome:         EmailTemplates.shortName(atleta.encarregado || ''),
      ee_email:        atleta.email || '',
      valor_esperado:  devido ? (devido + ' €') : '—',
      valor_pago:      pago   ? (pago   + ' €') : '0 €',
      falta:           falta  ? (falta  + ' €') : '0 €',
      excedente:       excedente ? (excedente + ' €') : '0 €',
      iban_cft:        EmailTemplates.IBAN_CFT,
      data_limite:     (Config.get('email_data_limite')   || '31 de maio'),
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
    const atleta = this._getAtleta(atletaId);
    const tpl = templateName || this.pickTemplate(atleta);
    const data = this._buildData(atleta, overrides);
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
    const bccList = atletas.map(a => (a.email || '').trim()).filter(Boolean);
    if (bccList.length === 0) throw new Error('Nenhum dos atletas tem email');

    // Para bulk usamos dados genéricos (placeholders por-atleta ficam vazios).
    const data = this._buildData(atletas[0], overrides);
    data.atleta = '';  // bulk: não personalizar
    data.ee_nome = '';

    const { subject, html } = EmailTemplates.render(tpl, data);

    const draft = GmailApp.createDraft('geral@camposft.com', subject, this._plainFallback(html), {
      bcc: bccList.join(','),
      htmlBody: html,
      name: 'CFT — Inscrições'
    });

    try {
      Historico.append({
        utilizador: user,
        id_atleta:  '',
        atleta:     '(bulk · ' + atletas.length + ' atletas)',
        tipo:       'email_rascunho_bulk',
        antes:      '',
        depois:     tpl,
        motivo:     subject + ' [' + atletas.length + ' destinatários]'
      });
    } catch (e) { Logger.log('Historico bulk falhou: ' + e.message); }

    const url = 'https://mail.google.com/mail/u/0/#drafts?compose=' + draft.getId();
    return { draftId: draft.getId(), url: url, template: tpl, count: atletas.length, bcc: bccList };
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
