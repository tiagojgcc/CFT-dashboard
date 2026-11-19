/**
 * Lógica de preços CFT 2027 (5ª edição).
 *
 * O preço depende só da data de inscrição (não de como se paga). 3 escalões
 * (proposta do Miguel, aceite pelo Tiago a 19/11/2026):
 *   Interno, inscrição até 31 jan:   350 € / semana (310 € com desconto)
 *   Interno, inscrição até 31 mar:   375 € / semana (330 € com desconto)
 *   Interno, inscrição depois:       395 € / semana (350 € com desconto)
 *   Externo:                         290 € / semana
 * Pagamento: tudo de uma vez, OU sinal de 130 € por semana + resto até 21/6.
 * O total é o mesmo nas duas formas. O sinal não é devolvido.
 *
 * Desconto (não acumula) se: irmao_desconto = TRUE  OU  nSem >= 2  OU  clube_inscricoes >= 8
 * OU desconto_outro_motivo preenchido (exceção acordada Tiago+Miguel).
 *
 * Classificação a partir de valor_pago: o admin tipa o valor depois de ver o
 * comprovativo; o sistema classifica em pago / parcial_1 (sinal) / parcial_2 / valor_errado.
 */
const PRECOS_2027 = {
  escaloes: [
    { ate: '2027-01-31', preco: 350, desc: 310 },
    { ate: '2027-03-31', preco: 375, desc: 330 },
    { ate: null,         preco: 395, desc: 350 }
  ],
  externo: 290, sinal: 130
};

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
    const raw = Config.get('cutoff_desconto') || '2027-03-31';
    let cutoff;
    if (raw instanceof Date) {
      cutoff = new Date(raw.getFullYear(), raw.getMonth(), raw.getDate(), 23, 59, 59);
    } else {
      cutoff = new Date(String(raw) + 'T23:59:59');
    }
    if (isNaN(cutoff.getTime())) cutoff = new Date('2027-03-31T23:59:59');
    return new Date(timestamp) <= cutoff;
  },

  // Escalão de preço conforme a data de inscrição.
  escalao(timestamp) {
    const t = new Date(timestamp);
    const valid = !isNaN(t.getTime());
    return PRECOS_2027.escaloes.find(e => !e.ate || (valid && t <= new Date(e.ate + 'T23:59:59'))) ||
      PRECOS_2027.escaloes[PRECOS_2027.escaloes.length - 1];
  },

  calc(atleta, clubeCounts) {
    const P = PRECOS_2027;
    const nSem = this.parseSems(atleta.semanas_atuais).length;
    if (nSem === 0) {
      return { tipo: 'sem_semanas', desc: false, prontoTotal: 0, prestTotal: null, prest1: null, prest2: null, nSem: 0 };
    }
    const externo = this.isExterno(atleta.opcao_inscricao);
    const desc = externo ? false : this.hasDesconto(atleta, clubeCounts);
    const before = this.isBeforeCutoff(atleta.timestamp_inscricao);
    const esc = this.escalao(atleta.timestamp_inscricao);
    const porSemana = externo ? P.externo : (desc ? esc.desc : esc.preco);
    const total = porSemana * nSem;
    // Mesmo total com ou sem sinal: prestTotal = prontoTotal.
    const prest1 = Math.min(P.sinal * nSem, total);
    const prest2 = total - prest1;
    return { tipo: externo ? 'externo' : 'interno', desc, before, escalao: esc, porSemana, prontoTotal: total, prestTotal: total, prest1, prest2, nSem };
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
    if (v === p.prontoTotal) return { estado: 'pago', regime: 'pronto', devido: p.prontoTotal, falta: 0, info: p };
    if (v === p.prest1) return { estado: 'parcial_1', regime: 'prestacoes', devido: p.prestTotal, falta: p.prest2, info: p };
    if (v === p.prest2) return { estado: 'parcial_2', regime: 'prestacoes', devido: p.prestTotal, falta: p.prest1, info: p };
    // Sobrepagou → "a devolver"
    if (v > p.prontoTotal) {
      return { estado: 'a_devolver', regime: null, devido: p.prontoTotal, sobra: v - p.prontoTotal, falta: 0, info: p };
    }
    return { estado: 'valor_errado', regime: null, devido: p.prontoTotal, falta: p.prontoTotal - v, info: p };
  }
};
