/**
 * Templates HTML para emails CFT.
 *
 * Visual: editorial bold (preto + bege + verde escuro · Bebas Neue display)
 * Texto: PT-PT, redacção do admin (tiagojgcc@gmail.com).
 *
 * Variáveis suportadas (placeholders {nome_var}):
 *   {atleta}              nome completo do atleta
 *   {ee_nome}             nome do encarregado (curto: primeiro + último)
 *   {ee_email}            email do encarregado
 *   {valor_esperado}      valor devido (€)
 *   {valor_pago}          valor recebido (€)
 *   {falta}               valor em falta (€)
 *   {excedente}           valor a devolver (€)
 *   {iban_cft}            IBAN da CFT
 *   {data_limite}         prazo de pagamento (texto)
 *   {local}, {horario}, {material}, {logistica}, {contacto_dia}  (info práticas)
 */
const EmailTemplates = {
  // Cores (paleta do mock)
  C: {
    beige: '#f4ede0',
    beigeMid: '#e5d9c4',
    sand: '#c9b99a',
    sandDark: '#a89278',
    charcoal: '#1c1c18',
    nearBlack: '#111110',
    midGray: '#6b6b65',
    greenDark: '#2d6b3c',
    greenBright: '#78c832',
    orange: '#d4845a',
    white: '#ffffff',
    offWhite: '#faf7f2'
  },

  IBAN_CFT: 'PT50 0007 0000 0065 0137 6512 3',
  LOGO_URL: 'https://raw.githubusercontent.com/tiagojgcc/CFT-dashboard/main/assets/logo_CFT.png',
  EDITION: '4ª EDIÇÃO · 2026',

  // ============ Helpers ============
  shortName(fullName) {
    const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0];
    return parts[0] + ' ' + parts[parts.length - 1];
  },

  fmt(value) {
    if (value === null || value === undefined || value === '') return '—';
    return String(value);
  },

  interp(text, data) {
    return String(text || '').replace(/\{(\w+)\}/g, (m, key) => {
      const v = data[key];
      return (v === undefined || v === null) ? m : String(v);
    });
  },

  // ============ Building blocks ============
  _styles() {
    return {
      body: `font-family: 'DM Sans','Helvetica Neue',Arial,sans-serif; font-size: 15px; line-height: 1.65; color: ${this.C.charcoal};`,
      display: `font-family: 'Bebas Neue','Arial Narrow',sans-serif; letter-spacing: 0.005em; text-transform: uppercase; margin: 0;`,
      condensed: `font-family: 'Barlow Condensed','Arial Narrow',sans-serif; letter-spacing: 0.22em; text-transform: uppercase; font-weight: 700;`,
      serif: `font-family: 'Playfair Display',Georgia,serif; font-style: italic;`,
    };
  },

  _googleFontsLink() {
    return `<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow+Condensed:wght@500;700&family=DM+Sans:wght@400;500;700&family=Playfair+Display:ital@1&display=swap" rel="stylesheet">`;
  },

  _header() {
    const C = this.C;
    return `<div style="background:${C.nearBlack};padding:20px 40px;display:flex;align-items:center;justify-content:space-between;">
      <img src="${this.LOGO_URL}" alt="CFT" style="height:38px;filter:brightness(0) invert(1);" />
      <div style="font-family:'Barlow Condensed','Arial Narrow',sans-serif;font-size:11px;font-weight:700;letter-spacing:0.22em;color:${C.sand};text-transform:uppercase;">${this.EDITION}</div>
    </div>`;
  },

  _signature() {
    const C = this.C;
    return `<div style="padding:0 40px 32px 40px;">
      <div style="border-top:1.5px solid ${C.charcoal};padding-top:20px;margin-top:40px;display:flex;gap:20px;align-items:flex-start;">
        <div style="width:64px;height:64px;background:${C.nearBlack};flex-shrink:0;padding:8px;display:flex;align-items:center;justify-content:center;">
          <img src="${this.LOGO_URL}" alt="CFT" style="width:100%;height:100%;object-fit:contain;filter:brightness(0) invert(1);" />
        </div>
        <div style="flex:1;">
          <div style="font-family:'Bebas Neue','Arial Narrow',sans-serif;font-size:30px;line-height:1;color:${C.nearBlack};letter-spacing:0.005em;">EQUIPA CFT</div>
          <div style="font-family:'Playfair Display',Georgia,serif;font-style:italic;font-size:14px;color:${C.midGray};margin-top:2px;margin-bottom:10px;">Campo de Formação Técnica · Ponte da Barca</div>
          <div style="font-family:'DM Sans','Helvetica Neue',Arial,sans-serif;font-size:12px;color:${C.charcoal};">
            <span style="margin-right:18px;"><b style="color:${C.greenDark};">e</b>&nbsp; geral@camposft.com</span>
            <span style="margin-right:18px;"><b style="color:${C.greenDark};">w</b>&nbsp; camposft.com</span>
            <span><b style="color:${C.greenDark};">ig</b>&nbsp; @camposft</span>
          </div>
          <div style="margin-top:12px;font-family:'Barlow Condensed','Arial Narrow',sans-serif;font-size:10px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:${C.sandDark};">4ª Edição · Julho 2026</div>
        </div>
      </div>
    </div>`;
  },

  _footer() {
    const C = this.C;
    return `<div style="background:${C.charcoal};color:${C.beige};padding:24px 40px;font-family:'DM Sans','Helvetica Neue',Arial,sans-serif;font-size:11px;line-height:1.6;">
      <div style="display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:12px;">
        <div>
          <div style="font-family:'Barlow Condensed','Arial Narrow',sans-serif;font-size:11px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:${C.greenBright};margin-bottom:6px;">Campo de Formação Técnica</div>
          <div style="color:${C.sand};">APDFE · Associação Promoção e Desporto em Ferias Escolares</div>
        </div>
        <div style="color:${C.sand};font-size:10px;">Recebeu este email porque inscreveu o seu educando no CFT.</div>
      </div>
    </div>`;
  },

  _wrap(content) {
    const C = this.C;
    return `<!DOCTYPE html><html lang="pt-PT"><head><meta charset="UTF-8">${this._googleFontsLink()}<style>body{margin:0;padding:0;}</style></head>
<body style="margin:0;padding:0;background:#f0eee9;font-family:'DM Sans','Helvetica Neue',Arial,sans-serif;color:${C.charcoal};">
  <div style="max-width:680px;margin:0 auto;background:${C.beige};border:1px solid ${C.beigeMid};">
    ${this._header()}
    ${content}
    ${this._signature()}
    ${this._footer()}
  </div>
</body></html>`;
  },

  _over(text, color) {
    const C = this.C;
    return `<div style="font-family:'Barlow Condensed','Arial Narrow',sans-serif;font-size:12px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:${color || C.greenDark};margin-bottom:14px;">${this._esc(text)}</div>`;
  },

  _display(text, sub) {
    const C = this.C;
    return `<h1 style="font-family:'Bebas Neue','Arial Narrow',sans-serif;font-size:72px;line-height:0.92;color:${C.nearBlack};margin:0;text-transform:uppercase;letter-spacing:-0.005em;">${this._esc(text)}</h1>${sub ? `<div style="margin-top:16px;font-family:'Playfair Display',Georgia,serif;font-style:italic;font-size:18px;color:${C.charcoal};">${this._esc(sub)}</div>` : ''}`;
  },

  _para(text) {
    return `<p style="font-family:'DM Sans','Helvetica Neue',Arial,sans-serif;font-size:15px;line-height:1.65;color:${this.C.charcoal};margin:0 0 16px 0;">${text}</p>`;
  },

  _infoBox(rows, title) {
    const C = this.C;
    const rowsHtml = rows.map(([label, value, italic]) =>
      `<div style="display:flex;align-items:baseline;padding:14px 0;border-bottom:1px solid ${C.beigeMid};gap:24px;">
        <div style="width:130px;flex-shrink:0;font-family:'Barlow Condensed','Arial Narrow',sans-serif;font-size:11px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:${C.midGray};">${this._esc(label)}</div>
        <div style="flex:1;font-family:${italic ? "'Playfair Display',Georgia,serif" : "'DM Sans','Helvetica Neue',Arial,sans-serif"};font-style:${italic ? 'italic' : 'normal'};font-size:${italic ? '19px' : '15px'};font-weight:${italic ? 400 : 500};color:${C.charcoal};">${value}</div>
      </div>`
    ).join('');
    return `<div style="margin:0 40px;background:${C.offWhite};padding:8px 28px 20px 28px;border:1px solid ${C.beigeMid};">
      ${title ? `<div style="font-family:'Barlow Condensed','Arial Narrow',sans-serif;font-size:11px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:${C.greenDark};padding:18px 0 4px 0;">${this._esc(title)}</div>` : ''}
      ${rowsHtml}
    </div>`;
  },

  _esc(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },

  // ============ Per-atleta templates ============

  // 1. Valor errado (pagou a menos)
  valorErrado(data) {
    const C = this.C;
    const subject = `CFT · Acerto de pagamento — ${data.atleta}`;
    const body = `
      <div style="padding:48px 40px 24px 40px;">
        ${this._over('Acerto de pagamento', C.orange)}
        ${this._display('Detetámos uma\ndiferença.')}
      </div>
      <div style="padding:0 40px 24px 40px;">
        <div style="font-family:'Bebas Neue','Arial Narrow',sans-serif;font-size:32px;color:${C.charcoal};margin:0 0 18px 0;">CARO(A) ${this._esc(data.ee_nome).toUpperCase()},</div>
        ${this._para(`Estamos a fazer o acerto das inscrições e detetámos uma diferença no pagamento do/a <b>${this._esc(data.atleta)}</b>. Queríamos confirmar consigo antes de seguir.`)}
      </div>
      ${this._infoBox([
        ['Atleta', this._esc(data.atleta)],
        ['Valor da inscrição', `${data.valor_esperado}€`],
        ['Valor recebido', `${data.valor_pago}€`],
        ['Em falta', `<b style="color:${C.orange};">${data.falta}€</b>`]
      ], 'Detalhes')}
      <div style="padding:24px 40px 8px 40px;">
        ${this._para(`Pode regularizar por transferência bancária para o IBAN <b style="font-family:ui-monospace,Menlo,monospace;">${this.IBAN_CFT}</b>, indicando o nome do/a atleta na descrição.`)}
        ${this._para(`Se achar que há algum engano nestes valores, responda a este email que verificamos do nosso lado.`)}
      </div>
      <div style="padding:8px 40px 16px 40px;">
        <div style="font-family:'Playfair Display',Georgia,serif;font-style:italic;font-size:22px;color:${C.charcoal};">Obrigado,</div>
      </div>`;
    return { subject, html: this._wrap(body) };
  },

  // 2. Sem pagamento
  semPagamento(data) {
    const C = this.C;
    const subject = `CFT · Pagamento da inscrição — ${data.atleta}`;
    const body = `
      <div style="padding:48px 40px 24px 40px;">
        ${this._over('Inscrição por finalizar', C.orange)}
        ${this._display('Falta um\núltimo passo.')}
      </div>
      <div style="padding:0 40px 24px 40px;">
        <div style="font-family:'Bebas Neue','Arial Narrow',sans-serif;font-size:32px;color:${C.charcoal};margin:0 0 18px 0;">CARO(A) ${this._esc(data.ee_nome).toUpperCase()},</div>
        ${this._para(`Estamos a finalizar as inscrições e ainda não recebemos o pagamento do/a <b>${this._esc(data.atleta)}</b>. Pode ter-nos escapado a nós — por isso, antes de qualquer coisa, queríamos confirmar consigo.`)}
      </div>
      ${this._infoBox([
        ['Atleta', this._esc(data.atleta)],
        ['Valor da inscrição', `<b>${data.valor_esperado}€</b>`],
        ['Estado', `<span style="color:${C.orange};">Por liquidar</span>`]
      ], 'Inscrição')}
      <div style="padding:24px 40px 8px 40px;">
        ${this._para(`Se já efetuou o pagamento, responda com o comprovativo (ou data e valor) que acertamos os registos. Caso contrário, pode pagar por transferência bancária para o IBAN <b style="font-family:ui-monospace,Menlo,monospace;">${this.IBAN_CFT}</b>, indicando o nome do/a atleta na descrição.`)}
        ${this._para(`Qualquer dúvida, é só responder a este email.`)}
      </div>
      <div style="padding:8px 40px 16px 40px;">
        <div style="font-family:'Playfair Display',Georgia,serif;font-style:italic;font-size:22px;color:${C.charcoal};">Obrigado,</div>
      </div>`;
    return { subject, html: this._wrap(body) };
  },

  // 3. Pagamento parcial
  pagamentoParcial(data) {
    const C = this.C;
    const subject = `CFT · 2ª prestação — ${data.atleta}`;
    const body = `
      <div style="padding:48px 40px 24px 40px;">
        ${this._over('1ª prestação recebida', C.greenDark)}
        ${this._display('Falta a\n2ª prestação.')}
      </div>
      <div style="padding:0 40px 24px 40px;">
        <div style="font-family:'Bebas Neue','Arial Narrow',sans-serif;font-size:32px;color:${C.charcoal};margin:0 0 18px 0;">CARO(A) ${this._esc(data.ee_nome).toUpperCase()},</div>
        ${this._para(`A 1ª prestação da inscrição do/a <b>${this._esc(data.atleta)}</b> está acertada — obrigado. Este email é só para lembrar que a 2ª prestação tem como prazo <span style="font-family:'Playfair Display',Georgia,serif;font-style:italic;">${this._esc(data.data_limite)}</span>.`)}
      </div>
      ${this._infoBox([
        ['Atleta', this._esc(data.atleta)],
        ['1ª prestação', `${data.valor_pago}€ <span style="color:${C.greenDark};">✓</span>`],
        ['2ª prestação', `<b style="color:${C.orange};">${data.falta}€</b>`],
        ['Prazo', `<span style="font-family:'Playfair Display',Georgia,serif;font-style:italic;">${this._esc(data.data_limite)}</span>`]
      ], 'Pagamento em prestações')}
      <div style="padding:24px 40px 8px 40px;">
        ${this._para(`Pode liquidar por transferência bancária para o IBAN <b style="font-family:ui-monospace,Menlo,monospace;">${this.IBAN_CFT}</b>, indicando o nome do/a atleta na descrição.`)}
        ${this._para(`Se houver qualquer dificuldade com o prazo, fale connosco — encontramos solução.`)}
      </div>
      <div style="padding:8px 40px 16px 40px;">
        <div style="font-family:'Playfair Display',Georgia,serif;font-style:italic;font-size:22px;color:${C.charcoal};">Obrigado,</div>
      </div>`;
    return { subject, html: this._wrap(body) };
  },

  // 4. A devolver
  aDevolver(data) {
    const C = this.C;
    const subject = `CFT · Devolução de valor — ${data.atleta}`;
    const body = `
      <div style="padding:48px 40px 24px 40px;">
        ${this._over('Valor em excesso', C.greenDark)}
        ${this._display('Temos um valor\na devolver-lhe.')}
      </div>
      <div style="padding:0 40px 24px 40px;">
        <div style="font-family:'Bebas Neue','Arial Narrow',sans-serif;font-size:32px;color:${C.charcoal};margin:0 0 18px 0;">CARO(A) ${this._esc(data.ee_nome).toUpperCase()},</div>
        ${this._para(`Ao fazer o acerto das inscrições, vimos que o pagamento do/a <b>${this._esc(data.atleta)}</b> foi acima do valor previsto. Temos um valor a devolver-lhe.`)}
      </div>
      ${this._infoBox([
        ['Atleta', this._esc(data.atleta)],
        ['Valor da inscrição', `${data.valor_esperado}€`],
        ['Valor recebido', `${data.valor_pago}€`],
        ['A devolver', `<b style="color:${C.greenDark};">${data.excedente}€</b>`]
      ], 'Detalhes')}
      <div style="padding:24px 40px 8px 40px;">
        ${this._para(`Para fazermos a devolução, responda a este email com o IBAN para onde quer que transfiramos. Tratamos disso em poucos dias.`)}
      </div>
      <div style="padding:8px 40px 16px 40px;">
        <div style="font-family:'Playfair Display',Georgia,serif;font-style:italic;font-size:22px;color:${C.charcoal};">Obrigado pela confiança,</div>
      </div>`;
    return { subject, html: this._wrap(body) };
  },

  // ============ Bulk templates ============

  // 5. Aviso de prazo
  avisoPrazo(data) {
    const C = this.C;
    const subject = `CFT · Lembrete: prazo de pagamento a ${data.data_limite}`;
    const body = `
      <div style="padding:48px 40px 24px 40px;">
        ${this._over('Lembrete · prazo a aproximar', C.orange)}
        ${this._display('A data\nestá perto.')}
      </div>
      <div style="padding:0 40px 24px 40px;">
        <div style="font-family:'Bebas Neue','Arial Narrow',sans-serif;font-size:32px;color:${C.charcoal};margin:0 0 18px 0;">CARO(A) ENCARREGADO(A) DE EDUCAÇÃO,</div>
        ${this._para(`Estamos perto da data limite para regularização das inscrições e ainda temos alguns pagamentos pendentes referentes ao/à seu/sua educando/a — este email é um lembrete amigável.`)}
      </div>
      ${this._infoBox([
        ['Prazo limite', `<b style="color:${C.orange};">${this._esc(data.data_limite)}</b>`],
        ['Pagamento', `Transferência bancária`],
        ['IBAN', `<span style="font-family:ui-monospace,Menlo,monospace;">${this.IBAN_CFT}</span>`],
        ['Referência', 'Nome do/a atleta na descrição']
      ], 'Detalhes')}
      <div style="padding:24px 40px 8px 40px;">
        ${this._para(`Se já efetuou o pagamento nos últimos dias, ignore esta mensagem — pode estar simplesmente em processamento.`)}
        ${this._para(`Para qualquer questão sobre o valor em causa ou dificuldades com o prazo, responda a este email que tratamos caso a caso.`)}
      </div>
      <div style="padding:8px 40px 16px 40px;">
        <div style="font-family:'Playfair Display',Georgia,serif;font-style:italic;font-size:22px;color:${C.charcoal};">Obrigado,</div>
      </div>`;
    return { subject, html: this._wrap(body) };
  },

  // 6. Informações práticas
  infoPraticas(data) {
    const C = this.C;
    const subject = `CFT · Informações para o início das atividades`;
    const body = `
      <div style="padding:48px 40px 24px 40px;">
        ${this._over('Está quase a começar', C.greenDark)}
        ${this._display('Tudo o que\nprecisa saber.')}
      </div>
      <div style="padding:0 40px 24px 40px;">
        <div style="font-family:'Bebas Neue','Arial Narrow',sans-serif;font-size:32px;color:${C.charcoal};margin:0 0 18px 0;">CARO(A) ENCARREGADO(A),</div>
        ${this._para(`Está quase a começar! Aqui ficam as informações práticas para os primeiros dias do/a seu/sua educando/a.`)}
      </div>
      ${this._infoBox([
        ['📍 Local', this._esc(data.local || '—')],
        ['🕐 Horário', this._esc(data.horario || '—')],
        ['🎒 Material', this._esc(data.material || '—')],
        ['🚗 Chegada e saída', this._esc(data.logistica || '—')]
      ], 'Detalhes práticos')}
      <div style="padding:24px 40px 8px 40px;">
        ${this._para(`Em caso de imprevisto no próprio dia, contacte-nos por <b>${this._esc(data.contacto_dia || 'geral@camposft.com')}</b>.`)}
        ${this._para(`Estamos ansiosos por receber os atletas.`)}
      </div>
      <div style="padding:8px 40px 16px 40px;">
        <div style="font-family:'Playfair Display',Georgia,serif;font-style:italic;font-size:22px;color:${C.charcoal};">Até breve,</div>
      </div>`;
    return { subject, html: this._wrap(body) };
  },

  // 7. Confirmação de inscrição
  confirmacao(data) {
    const C = this.C;
    const subject = `CFT · Inscrição confirmada`;
    const body = `
      <div style="padding:48px 40px 24px 40px;">
        ${this._over('Inscrição confirmada', C.greenDark)}
        ${this._display('Bem-vindo\nao campus.')}
      </div>
      <div style="padding:0 40px 24px 40px;">
        <div style="font-family:'Bebas Neue','Arial Narrow',sans-serif;font-size:32px;color:${C.charcoal};margin:0 0 18px 0;">CARO(A) ENCARREGADO(A),</div>
        ${this._para(`A inscrição do/a seu/sua educando/a está confirmada e o pagamento recebido. Está tudo certo do nosso lado.`)}
        ${this._para(`Mais perto da data de início, enviaremos as informações práticas (local, horário, material).`)}
      </div>
      <div style="padding:8px 40px 16px 40px;">
        <div style="font-family:'Playfair Display',Georgia,serif;font-style:italic;font-size:22px;color:${C.charcoal};">Obrigado pela confiança,</div>
      </div>`;
    return { subject, html: this._wrap(body) };
  },

  // ============ Entry point: render template by name ============
  render(templateName, data) {
    const fn = this[templateName];
    if (typeof fn !== 'function') throw new Error('Template desconhecido: ' + templateName);
    return fn.call(this, data || {});
  }
};
