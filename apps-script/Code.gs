/**
 * Router. Substituir SHEET_ID pela cópia de teste primeiro.
 */
const SHEET_ID = '1LXOqqTt2Ct7xNtRvv_Nu38z5V3pza0NtacgxBM3_WSY';  // Sheet real ligado ao Forms (em geral@camposft.com)

function doGet(e)  { return handle_(e, 'GET'); }
function doPost(e) { return handle_(e, 'POST'); }

function handle_(e, method) {
  try {
    const body = (method === 'POST' && e.postData && e.postData.contents)
      ? JSON.parse(e.postData.contents) : {};
    const params = Object.assign({}, e.parameter || {}, body);
    const action = params.action;
    if (!action) throw new Error('Missing action');

    const user = Auth.verify(params.token);

    let result;
    switch (action) {
      case 'getAll':           result = Inscricoes.getAll(); break;
      case 'updateSemanas':    result = Inscricoes.updateSemanas(params.id, params.novas, params.motivo, user); break;
      case 'setOpcaoInscricao': result = Inscricoes.setOpcaoInscricao(params.id, params.opcao, params.motivo, user); break;
      case 'softDelete':       result = Inscricoes.softDelete(params.id, params.motivo, user); break;
      case 'reactivate':       result = Inscricoes.reactivate(params.id, params.motivo, user); break;
      case 'updatePagamento':  result = Inscricoes.updatePagamento(params.id, params.valor, user, params.confirm === true); break;
      case 'confirmValor':     result = Inscricoes.confirmValor(params.id, params.valor, user); break;
      case 'unconfirmValor':   result = Inscricoes.unconfirmValor(params.id, user); break;
      case 'setDevidoOverride':result = Inscricoes.setDevidoOverride(params.id, params.valor, user); break;
      case 'setDescontoOutro': result = Inscricoes.setDescontoOutro(params.id, params.motivo, user); break;
      case 'toggleIrmao':      result = Inscricoes.toggleIrmao(params.id, params.valor, user); break;
      case 'addNota':          result = Inscricoes.addNota(params.id, params.nota, user); break;
      case 'logEmail':         result = Emails.log(params, user); break;
      case 'markEmailSent':    result = Emails.markSent(params.id, user); break;
      case 'markTrabalhoResolved':
        Historico.append({ utilizador: user, id_atleta: params.atletaId || '', atleta: params.atletaNome || '', tipo: 'trabalho_resolvido', antes: '', depois: params.itemId, motivo: params.motivo || '' });
        result = { ok: true };
        break;
      case 'unmarkTrabalhoResolved':
        Historico.append({ utilizador: user, id_atleta: params.atletaId || '', atleta: params.atletaNome || '', tipo: 'trabalho_reaberto', antes: params.itemId, depois: '', motivo: params.motivo || '' });
        result = { ok: true };
        break;
      case 'readComprovativo': result = Comprovativo.readAndSave(params.id, user); break;
      case 'readAllPending':   result = Comprovativo.readAllPending(user); break;
      case 'banco_processAll': result = Banco.processAll(); break;
      case 'banco_matchAll':   result = Banco.matchAll(); break;
      case 'banco_delete':     result = Banco.deleteMovimento(params.movId); break;
      case 'banco_reprocessFile': result = Banco.reprocessFile(params.fileId); break;
      case 'banco_list':       result = Banco.list(); break;
      case 'banco_listForAtleta': result = Banco.listForAtleta(params.atletaId); break;
      case 'markBankConfirmed':   result = Inscricoes.markBankConfirmed(params.atletaId, user); break;
      case 'unmarkBankConfirmed': result = Inscricoes.unmarkBankConfirmed(params.atletaId, user); break;
      case 'banco_confirm':    result = Banco.confirmMatch(params.movId, params.atletaId, user); break;
      case 'banco_unconfirm':  result = Banco.unconfirmMatch(params.movId, user); break;
      case 'banco_reassign':   result = Banco.reassignMatch(params.movId, params.atletaId, user); break;
      case 'tarefa_create':    result = Tarefas.create({ titulo: params.titulo, descricao: params.descricao, id_atleta: params.atletaId, atleta_nome: params.atletaNome }, user); break;
      case 'tarefa_resolve':   result = Tarefas.resolve(params.id, user); break;
      case 'tarefa_reopen':    result = Tarefas.reopen(params.id, user); break;
      case 'tarefa_delete':    result = Tarefas.remove(params.id); break;
      case 'createEmailDraft':     result = EmailDraft.createForAtleta(params.atletaId, params.template, user, params.overrides); break;
      case 'createBulkEmailDraft': result = EmailDraft.createBulk(params.atletaIds, params.template, user, params.overrides); break;
      case 'despesa_add':      result = Despesas.add(params, user); break;
      case 'despesa_delete':   result = Despesas.remove(params.id); break;
      case 'despesa_import':   result = Despesas.importBulk(params.items, user); break;
      case 'fin_setMargem':    result = Despesas.setMargem(params.valor, user); break;
      default: throw new Error('Unknown action: ' + action);
    }
    return json_({ ok: true, user: user, data: result });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
