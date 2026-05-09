/**
 * Wrapper para o backend Apps Script (CFT Dashboard).
 *
 * Configurar antes de usar:
 *   window.CFT_CONFIG = { API_URL: '.../exec', CLIENT_ID: '...' }
 *
 * Adapter: backend devolve atletas com campos da aba "Atletas". Aqui mapeamos para
 * o formato que as funções de render existentes esperam (r.nome, r.email_enc, r.tipo, etc.)
 * para minimizar churn no Dashboard.html.
 */
(function () {
  const Api = {
    lastUpdate: null,
    _cache: null,

    async _call(action, params) {
      if (!window.CFT_CONFIG || !window.CFT_CONFIG.API_URL) {
        throw new Error('CFT_CONFIG.API_URL não configurado');
      }
      if (!Auth.token) throw new Error('Não autenticado');
      const body = Object.assign({ action, token: Auth.token }, params || {});
      const resp = await fetch(window.CFT_CONFIG.API_URL, {
        method: 'POST',
        // text/plain evita CORS preflight no Apps Script
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body),
        redirect: 'follow'
      });
      const json = await resp.json();
      if (!json.ok) {
        if (/token|authorized/i.test(json.error || '')) {
          Auth.forceLogin();
        }
        throw new Error(json.error || 'erro desconhecido');
      }
      return json.data;
    },

    async getAll() {
      const data = await this._call('getAll');
      this.lastUpdate = new Date(data.lastUpdate);
      this._cache = data;
      return {
        atletas: (data.atletas || []).map(a => this.adapt(a)),
        historico: data.historico || [],
        emails: data.emails || [],
        config: data.config || {},
        clube_counts: data.clube_counts || {},
        counts: data.counts || { inscricoes_ativas: 0, atletas_unicos: 0, vagas_por_semana: {}, total_vagas_ocupadas: 0 },
        lastUpdate: this.lastUpdate
      };
    },

    adapt(a) {
      const isExterno = String(a.opcao_inscricao || '').trim().toLowerCase() === 'externo';
      const ymd = a.timestamp_inscricao instanceof Date
        ? a.timestamp_inscricao.toISOString().slice(0, 10)
        : (a.timestamp_inscricao
            ? new Date(a.timestamp_inscricao).toISOString().slice(0, 10)
            : '');
      const sim = v => /^sim/i.test(String(v || '').trim());
      const r = {
        // chaves usadas pelo render legado
        id: a.id_inscricao,
        num: (a.num_inscricao === '' || a.num_inscricao == null) ? null : Number(a.num_inscricao),
        nome: a.atleta || '',
        email_enc: a.email || '',
        clube: a.clube || '',
        tipo: isExterno ? 'Externo' : 'Interno',
        ts: ymd,
        semana: String(a.semanas_atuais || ''),
        val_pago: (a.valor_pago === '' || a.valor_pago === null || a.valor_pago === undefined)
          ? null : Number(a.valor_pago),
        nota: a.notas_internas || '',
        iban: !!(a.iban && String(a.iban).trim()),
        med: sim(a.medicacao),
        doenca: sim(a.doenca),
        alergia: sim(a.alergia_alim) || sim(a.alergia_med),
        // novos campos
        ativo: a.ativo !== false,
        irmao: !!a.irmao_desconto,
        desconto_motivo: a.desconto_motivo || null,
        desconto_outro_motivo: a.desconto_outro_motivo || '',
        eliminado_em: a.eliminado_em || null,
        eliminado_por: a.eliminado_por || '',
        motivo_eliminacao: a.motivo_eliminacao || '',
        valor_confirmado: !!a.valor_confirmado,
        valor_devido_override: (a.valor_devido_override === '' || a.valor_devido_override == null) ? null : Number(a.valor_devido_override),
        duplicate_warning: !!a.duplicate_warning,
        duplicate_ids: a.duplicate_ids || [],
        comprovativo_url: a.comprovativo_url || '',
        encarregado: a.encarregado || '',
        telefone: a.telefone || '',
        data_nascimento: a.data_nascimento || '',
        semanas_originais: a.semanas_originais || '',
        pricing: a.pricing || null,
        // legacy fallbacks (já não usados — mantidos para evitar undefined)
        custom_total: 0,
        // raw para debug
        _raw: a
      };
      return r;
    },

    updateSemanas(id, novas, motivo) { return this._call('updateSemanas', { id, novas, motivo }); },
    softDelete(id, motivo)            { return this._call('softDelete',     { id, motivo }); },
    reactivate(id, motivo)            { return this._call('reactivate',     { id, motivo }); },
    updatePagamento(id, valor, confirm) { return this._call('updatePagamento',{ id, valor, confirm: !!confirm }); },
    confirmValor(id, valor)           { return this._call('confirmValor',   { id, valor }); },
    unconfirmValor(id)                { return this._call('unconfirmValor', { id }); },
    setDevidoOverride(id, valor)      { return this._call('setDevidoOverride', { id, valor }); },
    setDescontoOutro(id, motivo)      { return this._call('setDescontoOutro', { id, motivo }); },
    toggleIrmao(id, valor)            { return this._call('toggleIrmao',    { id, valor }); },
    addNota(id, nota)                 { return this._call('addNota',        { id, nota }); },
    logEmail(p)                       { return this._call('logEmail', p); },
    markEmailSent(id)                 { return this._call('markEmailSent',  { id }); },
    readComprovativo(id)              { return this._call('readComprovativo', { id }); },
    readAllPending()                  { return this._call('readAllPending'); },
    markTrabalhoResolved(itemId, atletaId, atletaNome) { return this._call('markTrabalhoResolved', { itemId, atletaId, atletaNome }); },
    unmarkTrabalhoResolved(itemId, atletaId, atletaNome){ return this._call('unmarkTrabalhoResolved', { itemId, atletaId, atletaNome }); }
  };

  window.Api = Api;
})();
