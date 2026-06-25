/**
 * DEMO · API mock — substitui assets/api.js.
 * Não faz nenhuma chamada ao backend. Devolve dados de window.DEMO_DATA.
 * Mutações são no-op (mostram toast "modo demo · não persiste").
 *
 * Para correr depende de:
 *  - assets/demo-data.js carregado ANTES deste ficheiro (define window.DEMO_DATA)
 */
(function () {
  if (!window.DEMO_DATA) {
    console.error('[demo] window.DEMO_DATA não definida — assets/demo-data.js tem de carregar antes');
    return;
  }

  const toastDemo = (msg) => {
    if (window.toast) window.toast(msg || 'Modo demo · acção não persiste');
    else console.log('[demo]', msg);
  };

  const Api = {
    lastUpdate: new Date(),
    _cache: null,

    async getAll() {
      const data = window.DEMO_DATA;
      this.lastUpdate = new Date(data.lastUpdate || Date.now());
      this._cache = data;
      // Devolve já em formato adaptado (os atletas em DEMO_DATA já vêm assim)
      return {
        atletas: (data.atletas || []).slice(),
        historico: (data.historico || []).slice(),
        emails: (data.emails || []).slice(),
        config: Object.assign({}, data.config || {}),
        clube_counts: Object.assign({}, data.clube_counts || {}),
        counts: Object.assign({}, data.counts || {}),
        banco_files: (data.banco_files || []).slice(),
        tarefas: (data.tarefas || []).slice(),
        lastUpdate: this.lastUpdate
      };
    },

    getCachedSync() { return null; },
    clearCache() { /* no-op */ },

    // Stub de adapt para compatibilidade
    adapt(a) { return a; },

    // === Mutações: todas no-op com toast ===
    async _stub(label) { toastDemo('Modo demo · ' + label + ' não persiste'); return { ok: true, demo: true }; },

    updateSemanas()        { return this._stub('alteração de semanas'); },
    setOpcaoInscricao()    { return this._stub('alteração de Int/Ext'); },
    softDelete()           { return this._stub('eliminação'); },
    reactivate()           { return this._stub('reativação'); },
    updatePagamento()      { return this._stub('alteração de pagamento'); },
    confirmValor()         { return this._stub('confirmação de valor'); },
    unconfirmValor()       { return this._stub('desconfirmação de valor'); },
    setDevidoOverride()    { return this._stub('override de devido'); },
    setDescontoOutro()     { return this._stub('desconto'); },
    toggleIrmao()          { return this._stub('toggle irmão'); },
    addNota()              { return this._stub('nota'); },
    logEmail()             { return this._stub('registo de email'); },
    markEmailSent()        { return this._stub('marcação de email enviado'); },
    async createEmailDraft(atletaId, template) {
      const a = (window.DEMO_DATA.atletas || []).find(x => x.id === atletaId);
      const nome = a ? a.nome : atletaId;
      toastDemo('Modo demo · rascunho para ' + nome + ' (template: ' + (template || 'auto') + ') não foi criado');
      return { ok: true, demo: true, draftId: 'demo', url: '#', template: template || 'auto', to: a ? a.email_enc : '', subject: 'Demo' };
    },
    async createBulkEmailDraft(ids, template) {
      toastDemo('Modo demo · ' + (ids || []).length + ' rascunhos (template: ' + (template || 'auto') + ') não foram criados');
      return { ok: true, demo: true, draftId: 'demo', url: '#', template: template || 'auto', count: (ids || []).length, bcc: [] };
    },
    readComprovativo()         { return this._stub('leitura de comprovativo'); },
    readAllPending()           { return this._stub('leitura de comprovativos pendentes'); },
    markTrabalhoResolved()     { return this._stub('marcar resolvido'); },
    unmarkTrabalhoResolved()   { return this._stub('reabrir'); },
    tarefa_create()            { return this._stub('criação de tarefa'); },
    tarefa_resolve()           { return this._stub('resolução de tarefa'); },
    tarefa_reopen()            { return this._stub('reabertura de tarefa'); },
    tarefa_delete()            { return this._stub('eliminação de tarefa'); },
    banco_processAll()         { return this._stub('processar extratos'); },
    banco_matchAll()           { return this._stub('match de extratos'); },
    banco_delete()             { return this._stub('eliminar movimento'); },
    banco_reprocessFile()      { return this._stub('reprocessar ficheiro'); },
    async banco_list()         { return []; },
    async banco_listForAtleta(){ return []; },
    banco_confirm()            { return this._stub('confirmar match'); },
    banco_unconfirm()          { return this._stub('desconfirmar match'); },
    banco_reassign()           { return this._stub('reatribuir movimento'); },
    markBankConfirmed()        { return this._stub('confirmar entrada em conta'); },
    unmarkBankConfirmed()      { return this._stub('desconfirmar entrada em conta'); }
  };

  window.Api = Api;
})();
