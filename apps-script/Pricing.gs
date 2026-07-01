/**
 * Lógica de preços CFT 2026.
 *
 * Externo: 275 € por semana, fixo.
 * Interno + inscrição até 31 mar:
 *    pronto: 330 (s/desc) | 295 (c/desc)
 *    prestações: 375 total (s/desc) | 330 total (c/desc) — 120 + (255 ou 210)
 * Interno + inscrição depois de 31 mar:
 *    pronto obrigatório: 375 (s/desc) | 330 (c/desc)
 *
 * Desconto se: irmao_desconto = TRUE  OU  nSem >= 2  OU  clube_inscricoes >= 8.
 *
 * Classificação a partir de valor_pago: o admin tipa o valor depois de ver o
 * comprovativo; o sistema classifica em pago / parcial_1 / parcial_2 / valor_errado.
 */
const Pricing = {
  parseSems(s) {
    if (s === null || s === undefined) return [];
    // Inclui '.' para apanhar valores que o Sheets converteu para decimal em locale PT
    // (ex: "1,2" gravado pelo Apps Script pode ser interpretado como o número 1.2)
    // Edição 2026 só tem 2 semanas (3 foi cancelada) — n>=1 && n<=2.
    return String(s).split(/[.,;+\s]+/)
      .map(x => parseInt(x, 10))
      .filter(n => !isNaN(n) && n >= 1 && n <= 2);
  },

  isExterno(opcao) {
    return String(opcao || '').trim().toLowerCase() === 'externo';
  },

  hasDesconto(atleta, clubeCounts) {
    if (atleta.irmao_desconto === true || atleta.irmao_desconto === 'TRUE') return true;
    if (this.parseSems(atleta.semanas_atuais).length >= 2) return true;
    if ((clubeCounts[atleta.clube] || 0) >= 8) return true;
    if (atleta.desconto_outro_motivo && String(atleta.desconto_outro_motivo).trim()) return true;
    return false;
  },

  // Devolve a razão textual do desconto (ou null se não há)
  descontoMotivo(atleta, clubeCounts) {
    if (atleta.irmao_desconto === true || atleta.irmao_desconto === 'TRUE') return 'irmão';
    if ((clubeCounts[atleta.clube] || 0) >= 8) return '8 inscrições';
    if (this.parseSems(atleta.semanas_atuais).length >= 2) return '≥2 semanas';
    if (atleta.desconto_outro_motivo && String(atleta.desconto_outro_motivo).trim()) {
      return String(atleta.desconto_outro_motivo).trim();
    }
    return null;
  },

  isBeforeCutoff(timestamp) {
    const raw = Config.get('cutoff_desconto') || '2026-03-31';
    let cutoff;
    if (raw instanceof Date) {
      cutoff = new Date(raw.getFullYear(), raw.getMonth(), raw.getDate(), 23, 59, 59);
    } else {
      cutoff = new Date(String(raw) + 'T23:59:59');
    }
    if (isNaN(cutoff.getTime())) cutoff = new Date('2026-03-31T23:59:59');
    return new Date(timestamp) <= cutoff;
  },

  calc(atleta, clubeCounts) {
    const nSem = this.parseSems(atleta.semanas_atuais).length;
    if (nSem === 0) {
      return { tipo: 'sem_semanas', desc: false, prontoTotal: 0, prestTotal: null, prest1: null, prest2: null, nSem: 0 };
    }
    if (this.isExterno(atleta.opcao_inscricao)) {
      return { tipo: 'externo', desc: false, prontoTotal: 275 * nSem, prestTotal: null, prest1: null, prest2: null, nSem };
    }
    const desc = this.hasDesconto(atleta, clubeCounts);
    const before = this.isBeforeCutoff(atleta.timestamp_inscricao);
    const prontoPS = before ? (desc ? 295 : 330) : (desc ? 330 : 375);
    const prestPS  = before ? (desc ? 330 : 375) : null;
    const prontoTotal = prontoPS * nSem;
    const prestTotal  = prestPS ? prestPS * nSem : null;
    const prest1 = prestTotal !== null ? 120 * nSem : null;
    const prest2 = prestTotal !== null ? prestTotal - prest1 : null;
    return { tipo: 'interno', desc, before, prontoTotal, prestTotal, prest1, prest2, nSem };
  },

  classify(atleta, valorPago, clubeCounts) {
    const p = this.calc(atleta, clubeCounts);
    const v = Number(valorPago) || 0;
    // Override manual do devido (admin pode forçar valor diferente para descontos especiais)
    const overrideRaw = atleta.valor_devido_override;
    const hasOverride = overrideRaw !== '' && overrideRaw !== null && overrideRaw !== undefined && !isNaN(Number(overrideRaw));
    if (hasOverride) {
      const devido = Number(overrideRaw);
      let estado;
      if (v === 0) estado = 'pendente';
      else if (v === devido) estado = 'pago';
      else if (v < devido) estado = 'parcial_1';
      else estado = 'valor_errado';
      return { estado, regime: 'manual', devido, falta: Math.max(0, devido - v), info: p, override: true };
    }
    if (p.tipo === 'sem_semanas') return { estado: 'sem_semanas', regime: null, devido: 0, falta: 0, info: p };
    if (v === 0) return { estado: 'pendente', regime: null, devido: p.prontoTotal, falta: p.prontoTotal, info: p };
    if (p.tipo === 'externo') {
      if (v === p.prontoTotal) return { estado: 'pago', regime: 'externo', devido: p.prontoTotal, falta: 0, info: p };
      // Sobrepagou (ex.: marcado externo mas pagou valor de interno) → a_devolver
      if (v > p.prontoTotal) return { estado: 'a_devolver', regime: null, devido: p.prontoTotal, sobra: v - p.prontoTotal, falta: 0, info: p };
      return { estado: 'valor_errado', regime: 'externo', devido: p.prontoTotal, falta: p.prontoTotal - v, info: p };
    }
    if (v === p.prontoTotal) return { estado: 'pago', regime: 'pronto', devido: p.prontoTotal, falta: 0, info: p };
    if (p.prestTotal !== null) {
      if (v === p.prestTotal) return { estado: 'pago', regime: 'prestacoes', devido: p.prestTotal, falta: 0, info: p };
      if (v === p.prest1)     return { estado: 'parcial_1', regime: 'prestacoes', devido: p.prestTotal, falta: p.prest2, info: p };
      if (v === p.prest2)     return { estado: 'parcial_2', regime: 'prestacoes', devido: p.prestTotal, falta: p.prest1, info: p };
    }
    // Sobrepagou: pago > maior valor possível esperado → "a devolver"
    const maxExpected = Math.max(p.prontoTotal, p.prestTotal || 0);
    if (v > maxExpected) {
      return { estado: 'a_devolver', regime: null, devido: maxExpected, sobra: v - maxExpected, falta: 0, info: p };
    }
    return { estado: 'valor_errado', regime: null, devido: p.prontoTotal, falta: p.prontoTotal - v, info: p };
  }
};
