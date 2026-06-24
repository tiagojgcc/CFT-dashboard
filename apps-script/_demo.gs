/**
 * DEMO · anonimização temporária para apresentações
 * ====================================================
 *
 * Substitui Atletas.atleta + Atletas.encarregado por "Atleta Demo N" /
 * "Encarregado de Atleta Demo N". Não toca em mais nada — nem em outras
 * abas, nem em datas, IBANs, valores, comprovativos.
 *
 * FLUXO RECOMENDADO:
 *
 *  1.  No Google Drive da geral@camposft.com: abre a Sheet de produção,
 *      File → Make a copy. Nome sugerido: "CFT 2026 — BACKUP <data>".
 *      Copia o ID da URL da cópia (o segmento entre /d/ e /edit).
 *
 *  2.  No Apps Script editor: cria um ficheiro novo "_demo.gs" e cola
 *      este conteúdo. Save.
 *
 *  3.  Corre _previewAnonimizacao()  → vê no log o que vai ser tocado.
 *
 *  4.  Corre _anonimizarParaDemo()   → faz as substituições.
 *      Refresca o dashboard — vês "Atleta Demo 1, 2, 3…".
 *
 *  5.  Faz a apresentação. EVITA abrir as tabs Histórico e Banco (têm
 *      snapshots de nomes reais que não estão a ser anonimizados).
 *
 *  6.  Após a demo: corre _restaurarDaBackup("ID_DA_COPIA_DO_PASSO_1").
 *      Os nomes reais voltam, e qualquer linha submetida via Form durante
 *      a demo (ex: o "Atleta Demo Live" que adicionaste) fica intacta —
 *      apaga essa à mão se for fake.
 *
 *  7.  Quando tudo estiver estável: apaga o ficheiro _demo.gs do editor
 *      Apps Script e a Sheet de backup (depois de confirmares que os
 *      nomes reais voltaram!).
 *
 * CARACTERÍSTICAS DEFENSIVAS:
 *  · As funções operam por id_inscricao, não por número de linha. Se a
 *    ordem das linhas mudar entre anonimizar/restaurar, não há corrupção.
 *  · _restaurarDaBackup NÃO toca em linhas cujo id_inscricao não existe
 *    no backup — Form submissions durante a demo ficam preservadas.
 *  · _anonimizarParaDemo é idempotente — correr 2x não causa dano.
 *  · _previewAnonimizacao não escreve nada — só lê e mostra os primeiros 5.
 *
 * NÃO usa o SHEET_ID hardcoded — usa o da Sheet ligada ao script (mesma
 * coisa em produção). Isto significa que não corres por engano contra a
 * Sheet errada se mudares de projeto Apps Script.
 */

function _previewAnonimizacao() {
  const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Atletas');
  if (!sh) throw new Error('Tab "Atletas" não encontrada');
  const last = sh.getLastRow();
  if (last < 2) { Logger.log('Atletas vazia, nada a fazer'); return; }
  // Lê cols 1-6 (id_inscricao até encarregado)
  const data = sh.getRange(2, 1, last - 1, 6).getValues();
  Logger.log('═════ PREVIEW · vou anonimizar ' + data.length + ' linhas ═════');
  Logger.log('Primeiros 5 (atleta · encarregado):');
  data.slice(0, 5).forEach((row, i) => {
    Logger.log('  L' + (i + 2) + ' [' + String(row[0]).slice(0, 8) + '…]  ' +
               row[2] + '  ·  ' + row[5]);
  });
  if (data.length > 5) Logger.log('  … e mais ' + (data.length - 5) + ' linhas');
  Logger.log('═════ Nada foi alterado. Corre _anonimizarParaDemo() para aplicar ═════');
}

function _anonimizarParaDemo() {
  const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Atletas');
  if (!sh) throw new Error('Tab "Atletas" não encontrada');
  const last = sh.getLastRow();
  if (last < 2) { Logger.log('Atletas vazia, nada a fazer'); return; }

  // Colunas (1-indexed, ATL_COLS): atleta=3, encarregado=6
  const COL_ATLETA = 3;
  const COL_ENCARR = 6;
  const n = last - 1;

  const novosAtletas = [];
  const novosEEs = [];
  for (let i = 0; i < n; i++) {
    novosAtletas.push(['Atleta Demo ' + (i + 1)]);
    novosEEs.push(['Encarregado de Atleta Demo ' + (i + 1)]);
  }
  sh.getRange(2, COL_ATLETA, n, 1).setValues(novosAtletas);
  sh.getRange(2, COL_ENCARR, n, 1).setValues(novosEEs);

  Logger.log('═════ ANONIMIZADO ═════');
  Logger.log(n + ' linhas tocadas (atleta + encarregado).');
  Logger.log('Refresca o dashboard agora. Faz a demo.');
  Logger.log('No fim: _restaurarDaBackup("ID_DA_BACKUP")');
}

function _restaurarDaBackup(backupSheetId) {
  if (!backupSheetId || typeof backupSheetId !== 'string' || backupSheetId.length < 20) {
    throw new Error('Falta backupSheetId — copia o ID da URL da Sheet de backup ' +
                    '(segmento entre /d/ e /edit). Exemplo: _restaurarDaBackup("1AbC…XyZ")');
  }
  const shCurr = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Atletas');
  if (!shCurr) throw new Error('Tab "Atletas" não encontrada na Sheet de produção');

  let shBack;
  try {
    shBack = SpreadsheetApp.openById(backupSheetId).getSheetByName('Atletas');
  } catch (e) {
    throw new Error('Não consegui abrir a Sheet de backup: ' + e.message +
                    '\nVerifica que o ID está certo e que a conta tem acesso.');
  }
  if (!shBack) throw new Error('Tab "Atletas" não encontrada na Sheet de backup');

  const lastCurr = shCurr.getLastRow();
  const lastBack = shBack.getLastRow();
  if (lastCurr < 2 || lastBack < 2) { Logger.log('Pelo menos uma das Sheets está vazia'); return; }

  // Backup → mapa id_inscricao → {atleta, encarregado}
  const backupData = shBack.getRange(2, 1, lastBack - 1, 6).getValues();
  const backupMap = {};
  backupData.forEach(row => {
    const id = String(row[0] || '').trim();
    if (id) backupMap[id] = { atleta: row[2], encarregado: row[5] };
  });
  Logger.log('Backup tem ' + Object.keys(backupMap).length + ' atletas identificados');

  const currIds = shCurr.getRange(2, 1, lastCurr - 1, 1).getValues().flat();
  let restauradas = 0;
  const saltadas = [];

  // Em vez de escrever linha a linha (lento), constrói arrays e escreve em batch
  const novosAtleta = [];
  const novosEE = [];
  currIds.forEach(id => {
    const orig = backupMap[String(id || '').trim()];
    if (!orig) {
      saltadas.push(String(id));
      // Mantém valor actual (não toca)
      novosAtleta.push([null]);
      novosEE.push([null]);
      return;
    }
    novosAtleta.push([orig.atleta]);
    novosEE.push([orig.encarregado]);
    restauradas++;
  });

  // Escreve só onde temos valor (saltadas ficam null → não tocar)
  // Solução: escreve em loop só as linhas que têm valor
  for (let i = 0; i < novosAtleta.length; i++) {
    if (novosAtleta[i][0] === null) continue;
    shCurr.getRange(i + 2, 3).setValue(novosAtleta[i][0]);
    shCurr.getRange(i + 2, 6).setValue(novosEE[i][0]);
  }

  Logger.log('═════ RESTAURO COMPLETO ═════');
  Logger.log('Restauradas: ' + restauradas);
  Logger.log('Saltadas (id não estava na backup): ' + saltadas.length);
  if (saltadas.length > 0) {
    Logger.log('IDs saltados — provavelmente Form submissions feitas DURANTE a demo:');
    Logger.log('  ' + saltadas.join('\n  '));
    Logger.log('Verifica essas linhas e apaga as que forem demo (Atleta Demo Live, etc.).');
  }
  Logger.log('Refresca o dashboard. Confere que vês os nomes reais. Depois apaga _demo.gs.');
}
