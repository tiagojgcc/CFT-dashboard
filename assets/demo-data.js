/**
 * DEMO · dados ficícios para apresentação.
 * Não tem qualquer ligação ao backend real ou à Sheet de produção.
 * 5 atletas demo com diferentes estados de pagamento, para mostrar a UI.
 */
window.DEMO_DATA = (function () {
  const HOJE = new Date();
  const HOJE_ISO = HOJE.toISOString();
  const diasAtras = n => new Date(HOJE.getTime() - n * 86400000).toISOString();

  // === Atletas (já no formato adaptado pelo Api.adapt) ===
  const atletas = [
    // 1. Tudo pago, 2 semanas, masculino
    {
      id: 'demo-001', num: 1,
      nome: 'Atleta Demo 1',
      encarregado: 'Encarregado de Atleta Demo 1',
      email_enc: 'demo1@example.com',
      telefone: '912000001',
      clube: 'Sporting Clube Demo',
      tipo: 'Interno', ts: '2026-02-12',
      semana: '1,2',
      val_pago: 530, nota: '',
      iban: true, med: false, doenca: false, alergia: false,
      ativo: true, irmao: false,
      desconto_motivo: null, desconto_outro_motivo: '',
      eliminado_em: null, eliminado_por: '', motivo_eliminacao: '',
      valor_confirmado: true, valor_devido_override: null,
      bank_confirmed_em: '2026-02-15', bank_confirmed_por: 'demo@cft.com',
      duplicate_warning: false, duplicate_ids: [],
      comprovativo_url: '',
      data_nascimento: '2014-05-12',
      semanas_originais: '1,2',
      pricing: {
        estado: 'pago', regime: 'pronto', devido: 530, falta: 0, sobra: 0,
        info: { tipo: 'interno', nSem: 2, before: true, desc: false, prontoTotal: 530, prestTotal: 660, prest1: 250, prest2: 410 }
      },
      custom_total: 0,
      _raw: { tshirt: 'M', tshirt_num: '10', tshirt_nome: 'DEMO 1', medicacao: 'Não', doenca: 'Não', alergia_alim: 'Não', alergia_med: 'Não' }
    },
    // 2. Parcial (1ª prestação paga), 1 semana, masculino
    {
      id: 'demo-002', num: 2,
      nome: 'Atleta Demo 2',
      encarregado: 'Encarregado de Atleta Demo 2',
      email_enc: 'demo2@example.com',
      telefone: '912000002',
      clube: 'Sporting Clube Demo',
      tipo: 'Interno', ts: '2026-03-05',
      semana: '1',
      val_pago: 175, nota: '',
      iban: true, med: false, doenca: false, alergia: false,
      ativo: true, irmao: false,
      desconto_motivo: null, desconto_outro_motivo: '',
      eliminado_em: null, eliminado_por: '', motivo_eliminacao: '',
      valor_confirmado: true, valor_devido_override: null,
      bank_confirmed_em: null, bank_confirmed_por: '',
      duplicate_warning: false, duplicate_ids: [],
      comprovativo_url: '',
      data_nascimento: '2015-08-20',
      semanas_originais: '1',
      pricing: {
        estado: 'parcial_1', regime: 'prestacoes', devido: 350, falta: 175, sobra: 0,
        info: { tipo: 'interno', nSem: 1, before: true, desc: false, prontoTotal: 295, prestTotal: 350, prest1: 175, prest2: 175 }
      },
      custom_total: 0,
      _raw: { tshirt: 'S', tshirt_num: '7', tshirt_nome: 'DEMO 2' }
    },
    // 3. Sem pagamento, 1 semana, feminina
    {
      id: 'demo-003', num: 3,
      nome: 'Atleta Demo 3',
      encarregado: 'Encarregada de Atleta Demo 3',
      email_enc: 'demo3@example.com',
      telefone: '912000003',
      clube: 'Benfica Demo',
      tipo: 'Interno', ts: '2026-04-22',
      semana: '2',
      val_pago: 0, nota: '',
      iban: false, med: false, doenca: false, alergia: false,
      ativo: true, irmao: false,
      desconto_motivo: null, desconto_outro_motivo: '',
      eliminado_em: null, eliminado_por: '', motivo_eliminacao: '',
      valor_confirmado: false, valor_devido_override: null,
      bank_confirmed_em: null, bank_confirmed_por: '',
      duplicate_warning: false, duplicate_ids: [],
      comprovativo_url: '',
      data_nascimento: '2014-10-03',
      semanas_originais: '2',
      pricing: {
        estado: 'pendente', regime: null, devido: 295, falta: 295, sobra: 0,
        info: { tipo: 'interno', nSem: 1, before: false, desc: false, prontoTotal: 295, prestTotal: null, prest1: 0, prest2: 0 }
      },
      custom_total: 0,
      _raw: { tshirt: 'M', tshirt_num: '5', tshirt_nome: 'DEMO 3' }
    },
    // 4. Valor errado (pagou 200, esperado 530), 2 sem, masculino, com alerta médico
    {
      id: 'demo-004', num: 4,
      nome: 'Atleta Demo 4',
      encarregado: 'Encarregado de Atleta Demo 4',
      email_enc: 'demo4@example.com',
      telefone: '912000004',
      clube: 'Sporting Clube Demo',
      tipo: 'Interno', ts: '2026-03-15',
      semana: '1,2',
      val_pago: 200, nota: '',
      iban: true, med: true, doenca: false, alergia: false,
      ativo: true, irmao: false,
      desconto_motivo: null, desconto_outro_motivo: '',
      eliminado_em: null, eliminado_por: '', motivo_eliminacao: '',
      valor_confirmado: true, valor_devido_override: null,
      bank_confirmed_em: null, bank_confirmed_por: '',
      duplicate_warning: false, duplicate_ids: [],
      comprovativo_url: '',
      data_nascimento: '2013-07-25',
      semanas_originais: '1,2',
      pricing: {
        estado: 'valor_errado', regime: null, devido: 530, falta: 330, sobra: 0,
        info: { tipo: 'interno', nSem: 2, before: true, desc: false, prontoTotal: 530, prestTotal: 660, prest1: 250, prest2: 410 }
      },
      custom_total: 0,
      _raw: { tshirt: 'L', tshirt_num: '11', tshirt_nome: 'DEMO 4', medicacao: 'Sim · paracetamol se febre' }
    },
    // 5. A devolver (pagou 350, devido 295), 1 sem, feminina
    {
      id: 'demo-005', num: 5,
      nome: 'Atleta Demo 5',
      encarregado: 'Encarregada de Atleta Demo 5',
      email_enc: 'demo5@example.com',
      telefone: '912000005',
      clube: 'Benfica Demo',
      tipo: 'Interno', ts: '2026-02-28',
      semana: '1',
      val_pago: 350, nota: '',
      iban: true, med: false, doenca: false, alergia: false,
      ativo: true, irmao: false,
      desconto_motivo: null, desconto_outro_motivo: '',
      eliminado_em: null, eliminado_por: '', motivo_eliminacao: '',
      valor_confirmado: true, valor_devido_override: null,
      bank_confirmed_em: '2026-03-01', bank_confirmed_por: 'demo@cft.com',
      duplicate_warning: false, duplicate_ids: [],
      comprovativo_url: '',
      data_nascimento: '2015-12-10',
      semanas_originais: '1',
      pricing: {
        estado: 'a_devolver', regime: null, devido: 295, falta: 0, sobra: 55,
        info: { tipo: 'interno', nSem: 1, before: true, desc: false, prontoTotal: 295, prestTotal: 350, prest1: 175, prest2: 175 }
      },
      custom_total: 0,
      _raw: { tshirt: 'S', tshirt_num: '8', tshirt_nome: 'DEMO 5' }
    }
  ];

  // === Historico — alguns eventos para a timeline de comunicação ===
  const historico = [
    { id_evento: 'h-1', timestamp: diasAtras(2),  utilizador: 'demo@cft.com', id_atleta: 'demo-001', atleta: 'Atleta Demo 1', tipo: 'email_rascunho', antes: '', depois: 'boasVindas',       motivo: 'CFT · Bem-vindo' },
    { id_evento: 'h-2', timestamp: diasAtras(10), utilizador: 'demo@cft.com', id_atleta: 'demo-002', atleta: 'Atleta Demo 2', tipo: 'email_rascunho', antes: '', depois: 'pagamentoParcial', motivo: 'CFT · Inscrição' },
    { id_evento: 'h-3', timestamp: diasAtras(20), utilizador: 'demo@cft.com', id_atleta: 'demo-004', atleta: 'Atleta Demo 4', tipo: 'email_rascunho', antes: '', depois: 'valorErrado',       motivo: 'CFT · Acerto de pagamento' },
    { id_evento: 'h-4', timestamp: diasAtras(15), utilizador: 'demo@cft.com', id_atleta: 'demo-005', atleta: 'Atleta Demo 5', tipo: 'email_rascunho', antes: '', depois: 'aDevolver',         motivo: 'CFT · Devolução de valor' },
    { id_evento: 'h-5', timestamp: diasAtras(40), utilizador: 'demo@cft.com', id_atleta: 'demo-001', atleta: 'Atleta Demo 1', tipo: 'pagamento',      antes: '0', depois: '530',             motivo: 'manual+confirmado' },
    { id_evento: 'h-6', timestamp: diasAtras(35), utilizador: 'demo@cft.com', id_atleta: 'demo-005', atleta: 'Atleta Demo 5', tipo: 'pagamento',      antes: '0', depois: '350',             motivo: 'manual+confirmado' }
  ];

  return {
    atletas,
    historico,
    emails: [],
    config: {
      edicao: '4',
      whitelist_emails: 'demo@cft.com',
      vagas_total: 120,
      cutoff_desconto: '2026-03-31',
      prazo_pagamento: '2026-06-21',
      email_data_inicio: '2026-07-12',
      email_local: 'Pavilhão Demo',
      email_horario: '9h00 às 17h30',
      email_material: 'equipamento desportivo',
      email_logistica: 'entrada a partir das 8h30',
      email_contacto_dia: '912000000',
      banco_folder_id: ''
    },
    clube_counts: { 'Sporting Clube Demo': 3, 'Benfica Demo': 2 },
    counts: {
      atletas_ativos: 5,
      atletas_unicos: 5,
      inscricoes: 7,
      vagas_por_semana: { 1: 4, 2: 3 },
      total_vagas_ocupadas: 7
    },
    banco_files: [],
    tarefas: [],
    lastUpdate: HOJE_ISO
  };
})();
