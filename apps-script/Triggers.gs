/**
 * Trigger onFormSubmit: cria UUID na linha do Forms e replica para Atletas.
 * Instalar uma vez via Triggers.install().
 */
const Triggers = {
  install() {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    // Remove triggers antigos com o mesmo handler para evitar duplicação
    ScriptApp.getProjectTriggers().forEach(t => {
      if (t.getHandlerFunction() === 'onFormSubmitTrigger_') {
        ScriptApp.deleteTrigger(t);
      }
    });
    ScriptApp.newTrigger('onFormSubmitTrigger_')
      .forSpreadsheet(ss)
      .onFormSubmit()
      .create();
    Logger.log('Trigger onFormSubmit instalado.');
  }
};

// Top-level (Apps Script triggers exigem função global, não método)
function onFormSubmitTrigger_(e) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const formSheet = ss.getSheetByName('Respostas do Formulário 1');
  if (!formSheet) {
    Logger.log('Aba "Respostas do Formulário 1" não encontrada — trigger abortado.');
    return;
  }
  const row = e.range.getRow();
  const idCol = Backfill._idCol(formSheet);
  const migradoCol = Backfill._migradoCol(formSheet);
  if (idCol === -1 || migradoCol === -1) {
    Logger.log('Trigger abortado: colunas id_inscricao/migrado_em em falta');
    return;
  }
  let id = formSheet.getRange(row, idCol).getValue();
  // Defensivo: se a cell contém Date ou algo não-UUID, gera novo UUID e sobrescreve.
  // Isto evita que datas / valores corruptos cheguem a Atletas como id.
  const isValidUuid = typeof id === 'string' && /^[a-f0-9-]{20,}$/i.test(id);
  if (!isValidUuid) {
    id = Utilities.getUuid();
    formSheet.getRange(row, idCol).setValue(id);
  }
  formSheet.getRange(row, migradoCol).setValue(new Date());
  Backfill.migrateRow_(row, formSheet, ss.getSheetByName('Atletas'));
  // Atribuir número de inscrição + renomear ficheiro no Drive
  try {
    Backfill.assignNumeroAndRename_(id);
  } catch (e) {
    Logger.log('Numeração/rename falhou para ' + id + ': ' + e.message);
  }
  // Ler comprovativo automaticamente
  try {
    Comprovativo.readAndSave(id, 'auto-trigger');
  } catch (e) {
    Logger.log('OCR auto falhou para ' + id + ': ' + e.message);
  }
}
