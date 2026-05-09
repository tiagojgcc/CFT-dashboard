/**
 * Router. Substituir SHEET_ID pela cópia de teste primeiro.
 */
const SHEET_ID = '1yLPtKZk-vjs-0lLBLzjw3VyOl9xo7Tz54vdK26dfPbc';

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
      case 'banco_list':       result = Banco.list(); break;
      case 'banco_listForAtleta': result = Banco.listForAtleta(params.atletaId); break;
      case 'banco_confirm':    result = Banco.confirmMatch(params.movId, params.atletaId, user); break;
      case 'banco_unconfirm':  result = Banco.unconfirmMatch(params.movId, user); break;
      case 'banco_reassign':   result = Banco.reassignMatch(params.movId, params.atletaId, user); break;
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
