/**
 * Melhorias automáticas ao Google Forms ligado ao Sheet.
 * Não muda o tipo de perguntas (preserva posição das colunas).
 *
 * Apenas:
 *   1. Marca IBAN como obrigatório
 *   2. Acrescenta secção informativa com tabela de preços
 *   3. Acrescenta nota explicativa no campo Clube (lista dos nomes em uso)
 *
 * Para correr: dropdown → improveForms → ▶ Executar (pede autorização para FormApp).
 */
const FormImprovement = {
  PRICE_TEXT:
    'INTERNOS — pago em 2026\n' +
    '• Pronto pagamento (até 31 mar): 330€ por semana · 295€ com desconto\n' +
    '• Em prestações (até 31 mar): 375€ total (120€ entrada + 255€) · 330€ com desconto\n' +
    '• Após 31 mar: 375€ a pronto · 330€ com desconto\n\n' +
    'EXTERNOS\n' +
    '• 275€ por semana (fixo)\n\n' +
    'DESCONTOS (não cumuláveis):\n' +
    '• Tens irmão também inscrito\n' +
    '• Inscrição em 2 ou mais semanas\n' +
    '• O teu clube tem 8 ou mais atletas inscritos\n\n' +
    'PRAZOS\n' +
    '• Até 31 mar: 1ª prestação (120€) ou pagamento a pronto\n' +
    '• Até 21 jun: liquidação da 2ª prestação',

  PRICE_SECTION_TITLE: 'Tabela de preços — confere antes de seguir',

  run() {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const respSh = ss.getSheetByName('Respostas do Formulário 1');
    if (!respSh) throw new Error('Aba "Respostas do Formulário 1" não encontrada');
    const formUrl = respSh.getFormUrl();
    if (!formUrl) throw new Error('Sheet não está vinculado a um Form');
    const form = FormApp.openByUrl(formUrl);
    const log = [];

    const items = form.getItems();

    // 1. IBAN obrigatório
    const ibanItem = items.find(i => /iban\s+para\s+devolu/i.test(i.getTitle()));
    if (ibanItem) {
      try {
        ibanItem.asTextItem().setRequired(true);
        log.push('✓ IBAN: marcado como obrigatório');
      } catch (e) {
        log.push('✗ IBAN: erro — ' + e.message);
      }
    } else {
      log.push('? IBAN: pergunta não encontrada (procurei "Iban para devolução")');
    }

    // 2. Secção informativa — tabela de preços (antes de "Opção de inscrição")
    const existing = items.find(i => i.getType() === FormApp.ItemType.SECTION_HEADER && i.getTitle() === this.PRICE_SECTION_TITLE);
    if (existing) {
      // Atualiza help text caso preços tenham mudado
      existing.asSectionHeaderItem().setHelpText(this.PRICE_TEXT);
      log.push('✓ Secção preços: atualizada (já existia)');
    } else {
      const sec = form.addSectionHeaderItem().setTitle(this.PRICE_SECTION_TITLE).setHelpText(this.PRICE_TEXT);
      const opcaoIdx = form.getItems().findIndex(i => /op[çc][ãa]o\s+de\s+inscri/i.test(i.getTitle()));
      if (opcaoIdx >= 0) {
        try { form.moveItem(sec, opcaoIdx); log.push('✓ Secção preços: criada e movida para antes de "Opção de inscrição"'); }
        catch (e) { log.push('? Secção preços: criada mas não consegui mover (' + e.message + ')'); }
      } else {
        log.push('✓ Secção preços: criada (no fim — não encontrei "Opção de inscrição")');
      }
    }

    // 3. Nota no campo Clube com lista dos clubes existentes (lista do Sheet Atletas)
    const atletasSh = ss.getSheetByName('Atletas');
    let clubeListNote = '';
    if (atletasSh && atletasSh.getLastRow() >= 2) {
      const clubeCol = ATL_COLS.clube;
      const clubes = atletasSh.getRange(2, clubeCol, atletasSh.getLastRow() - 1, 1).getValues().flat()
        .map(c => String(c).trim()).filter(Boolean);
      const unique = [...new Set(clubes)].sort();
      if (unique.length > 0) {
        clubeListNote = 'IMPORTANTE: usa exatamente o mesmo nome se o teu clube já tem atletas inscritos.\n\nClubes já inscritos:\n• ' + unique.join('\n• ') + '\n\nSe o teu clube não está aqui, escreve livremente.';
      }
    }
    const clubeItem = items.find(i => /clube\s+onde\s+joga/i.test(i.getTitle()));
    if (clubeItem) {
      try {
        clubeItem.setHelpText(clubeListNote || 'Escreve o nome do clube exatamente como já figura noutras inscrições, para evitar duplicados.');
        log.push('✓ Clube: helpText atualizado com lista (' + (clubeListNote.match(/•/g) || []).length + ' clubes)');
      } catch (e) {
        log.push('✗ Clube: erro — ' + e.message);
      }
    } else {
      log.push('? Clube: pergunta não encontrada');
    }

    log.forEach(l => Logger.log(l));
    return { log };
  }
};
