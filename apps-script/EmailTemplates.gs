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
 *
 * Concordância de género (G):
 *   data.gen_atleta ∈ {'m','f'} — heurística pelo 1º nome do atleta
 *   data.gen_ee     ∈ {'m','f'} — heurística pelo 1º nome do EE
 *   helper G_atl(data) e G_ee(data) devolvem objecto com chaves prontas a
 *   interpolar: {caro, oA, doA, oAtleta, oSeu, ele, dele, educando}.
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
  LOGO_URL: 'https://raw.githubusercontent.com/tiagojgcc/cft-dashboard/main/assets/logo_CFT.png',
  EDITION: '4ª EDIÇÃO · 2026',

  // ============ Helpers ============
  shortName(fullName) {
    const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0];
    return parts[0] + ' ' + parts[parts.length - 1];
  },

  firstName(fullName) {
    const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
    return parts[0] || '';
  },

  // Dicionários de nomes próprios PT-PT (normalizados sem diacríticos).
  // Cobrem ~250 nomes masculinos + ~230 femininos: clássicos, modernos,
  // diminutivos comuns e variantes Brasil/internacionais usadas em PT.
  // Nomes ausentes caem na heurística por terminação.
  NAMES_MALE: new Set([
    'abel','abilio','adao','adelio','adelino','adolfo','adriano','afonso',
    'agostinho','alberto','albino','alcides','alcino','aldo','aleixo','alex',
    'alexandre','alfredo','alipio','alvaro','amadeu','amancio','amaro',
    'ambrosio','americo','amilcar','anibal','antao','antonio','armando',
    'armenio','arnaldo','arsenio','artur','augusto','aurelio','baltasar',
    'bartolomeu','basilio','belmiro','benedito','benjamim','benjamin',
    'bernardino','bernardo','bertino','boaventura','braulio','bruno','caetano',
    'caio','camilo','candido','carlos','casimiro','cassiano','cassio',
    'celestino','celio','celso','cesar','christian','cipriano','cirilo',
    'claudio','clemente','conrado','cosme','cristiano','cristovao','custodio',
    'damiao','daniel','danilo','dario','david','davi','denis','dennis','diego',
    'diogo','dinis','diniz','dionisio','domingos','douglas','duarte','edgar',
    'edmundo','edson','eduardo','egidio','elder','elias','elio','eliseu',
    'elson','elvis','emanuel','emerson','emidio','emilio','enzo','eric',
    'erick','ernani','ernesto','esteban','estevao','eugenio','eurico',
    'eusebio','evandro','evaristo','ezequiel','fabiano','fabio','fabricio',
    'fausto','federico','felipe','fernando','fidel','filipe','firmino',
    'flavio','florencio','francisco','franklin','frederico','gabriel','gaspar',
    'geraldo','gerardo','germano','gerson','gil','gilberto','gilson','gino',
    'goncalo','gonzalo','gregorio','gualter','guido','guilherme','gustavo',
    'hamilton','heitor','helder','helio','henrique','herbert','hermano',
    'herminio','hernani','hilario','horacio','hudson','hugo','humberto','iago',
    'ian','igor','ilidio','inacio','irineu','isaac','isaias','ismael','israel',
    'italo','ivan','ivanildo','ivo','jacques','jaime','jair','jeremias',
    'jeronimo','jesse','jesus','joao','joaquim','jonas','jonathan','jordi',
    'jorge','jose','joshua','josue','juan','julian','juliano','julio','junior',
    'kelvin','kennedy','kevin','klaus','lauro','lazaro','leandro','leao','leo',
    'leon','leonardo','leonel','levi','lino','livio','lopo','lorenzo',
    'lourenco','lucas','luciano','lucio','ludovico','luis','luiz','luca',
    'luka','lukas','manuel','marc','marcel','marcelino','marcelo','marciano',
    'marcio','marco','marcos','mariano','mario','marius','marko','marlon',
    'martim','martin','martinho','marvin','mateus','matheus','matias',
    'mathias','mathieu','mauricio','mauro','max','maxime','maximiliano',
    'melchior','michel','miguel','milton','moises','murilo','natanael',
    'nelson','nestor','nicolae','nicolas','nicolau','nilo','nilson','noa',
    'noah','noel','norberto','nuno','octavio','olavo','olegario','omar',
    'orlando','oscar','osmar','osvaldo','oswaldo','otavio','pablo','paco',
    'paolo','pascoal','patricio','patrick','paulo','pedro','pierre','pio',
    'plinio','prudencio','quintino','rafael','raimundo','ramiro','ramon',
    'raul','ravi','reinaldo','renan','renato','rene','ricardo','rinaldo',
    'rivelino','robert','roberto','rocco','rodolfo','rodrigo','rogerio',
    'rolando','rolf','roman','romao','romario','romeo','romeu','ronald',
    'ronaldo','ronan','roque','rosario','ruben','rui','rurik','ruy','sabino',
    'salomao','salvador','salvio','samir','samuel','sancho','sandro',
    'santiago','saul','sebastian','sebastiao','sergio','serafim','severino',
    'severo','sidney','sidnei','sidonio','silas','silverio','silvestre',
    'silvino','silvio','simao','simon','stefan','steve','tadeu','tales',
    'tarcisio','telmo','teobaldo','teodoro','teofilo','thiago','tiago','tibor',
    'tito','tobias','tom','tomas','tomaz','tome','tristao','tulio','ulisses',
    'ulrico','urbano','valdemar','valdir','valentim','valter','vasco',
    'venancio','venceslau','vergilio','vicente','victor','vinicius','virgilio',
    'vital','vito','vitor','vladimir','waldemar','walter','washington',
    'wellington','wesley','wilfredo','wilson','winston','xavier','yago','yann',
    'yannick','yari','yuri','zacarias','ze','zeferino','zenildo'
  ]),

  NAMES_FEMALE: new Set([
    'adelaide','adela','ada','adelia','adelina','adriana','agata','agueda',
    'agnes','aida','alba','albertina','alcina','aldina','alessandra',
    'alexandra','alice','alicia','aline','alma','almira','amalia','amanda',
    'amaranta','amelia','amparo','ana','anabela','analu','andreia','angela',
    'angelica','angelina','angie','anita','antonella','antonia','aparecida',
    'apolonia','ariana','arlete','arlinda','armanda','armandina','arminda',
    'augusta','aurora','avelina','barbara','beatriz','belarmina','belmira',
    'benedita','benilde','benvinda','berenice','bernadete','bianca','brigida',
    'bruna','cacilda','camila','candida','carina','carla','carlota','carmem',
    'carmen','carmina','carminda','carolina','casandra','catarina','catia',
    'cecilia','celeste','celestina','celia','celina','celma','chantal',
    'chiara','cibele','cintia','cipriana','clara','clarice','claudia',
    'claudina','clelia','clementina','cleopatra','clotilde','conceicao',
    'constanca','constancia','consuelo','cora','coralia','corina','cornelia',
    'cristal','cristela','cristiana','cristina','daiana','dalia','dalva',
    'dania','daniela','danielle','dara','darcy','debora','deborah','delfina',
    'delia','delma','demetria','denise','deolinda','diana','dilia','dilma',
    'dina','divina','dolores','dora','dorinda','doris','dorotea','dulce',
    'edda','edite','edith','edivania','edna','eduarda','elaine','elena',
    'eleonora','elga','elia','eliana','eliane','elida','elisa','elisabete',
    'elisabeth','elisete','eliza','ellen','eloisa','elsa','elvira','ema',
    'emanuela','emily','emilia','emma','encarnacao','enedina','enia','erica',
    'erika','erminia','ernestina','esmeralda','esperanca','estefania','estela',
    'estelita','estephania','estrela','etelvina','eufemia','eugenia','eulalia',
    'eunice','eva','evangelina','evelina','evelyn','fabia','fabiana','fabiola',
    'fatima','felicia','felicidade','fernanda','filipa','filomena','fiona',
    'flavia','flora','florbela','florencia','florinda','francisca','frederica',
    'gabriela','gardenia','genoveva','georgina','geraldina','germana',
    'gertrudes','gilda','gioconda','gisela','gisele','glaucia','gloria',
    'graca','gracia','gracinda','graziela','guadalupe','guida','guilhermina',
    'helena','helia','helga','heliana','helma','henriqueta','herminia',
    'hilaria','hilda','honorina','idalia','idalina','ilda','ilidia','ilse',
    'imelda','ines','ingrid','iolanda','iracema','iraida','irene','iria',
    'iris','irma','isabel','isabela','isadora','isaura','ivete','ivone',
    'izabel','jade','jaqueline','jacinta','janaina','jane','janete','janine',
    'jasmim','jennifer','jessica','joana','joaquina','jocelia','joelma',
    'jordana','josefa','josefina','josiane','judit','judite','julia','juliana',
    'juliene','karen','karina','karla','katia','katherine','kathleen','kelly',
    'kim','kristina','lara','larissa','latifa','laura','laurinda','lavinia',
    'lea','leandra','leila','lena','lenita','leocadia','leonete','leonida',
    'leonor','leontina','leticia','lia','liana','libania','lidia','lilian',
    'liliana','lina','linda','lisa','livia','lola','lorena','lourdes','lucia',
    'luciana','lucila','lucilia','lucineia','ludmila','luisa','luiza','lurdes',
    'luzia','mabel','madalena','madeline','mafalda','magali','magda',
    'magdalena','manuela','mara','marcia','margarida','margarita','maria',
    'mariana','mariane','maribel','marielle','marilene','marilia','marina',
    'marinalva','marisa','marlene','marta','martina','mary','matilde','maura',
    'mauricia','melanie','melissa','mercedes','micaela','michele','michelle',
    'milena','minerva','miranda','miriam','mirian','mona','monica','mor',
    'morgana','muriel','nadia','nair','naomi','natacha','natalia','natasha',
    'neide','nelida','nelma','nicole','nina','nilda','nilza','noemi','noemia',
    'nora','norma','nubia','nuria','odete','olga','olimpia','olinda','olivia',
    'ondina','ofelia','otavia','palmira','paola','paula','paulina','pamela',
    'penelope','pia','pilar','piedade','priscila','priscilla','rafaela',
    'raissa','raquel','rebeca','regina','remedios','renata','rita','rosa',
    'rosalia','rosalina','rosana','rose','roseli','rosemarie','roxana','rufina',
    'ruth','sabina','sabrina','salete','salome','samanta','samantha','sandra',
    'sandrina','sara','sarah','sebastiana','selena','selma','serafina',
    'serena','sibele','sidonia','silmara','silvana','silvia','simone','sofia',
    'solange','soledade','sonia','sophia','soraia','stella','stephanie',
    'suelen','susana','suzana','suzete','sylvia','tais','tamara','tania',
    'tatiana','telma','teresa','terezinha','thais','thalia','thalita',
    'thamires','tessa','tina','tomasia','tonia','valentina','valeria','vanda',
    'vanessa','vania','vera','veronica','violeta','virginia','viviana',
    'viviane','wanda','walesca','walquiria','xenia','ximena','yara','yasmin',
    'yasmim','yolanda','yvette','zelinda','zilda','zilma','zelia','zenaide',
    'zoe'
  ]),

  // Heurística PT-PT para inferir género a partir do 1º nome.
  // Devolve 'm', 'f' ou 'u' (desconhecido / nome vazio).
  //   1) Lookup explícito nos dicionários NAMES_MALE / NAMES_FEMALE.
  //   2) Fallback por terminação: 'a' → feminino; 'o' → masculino;
  //      consoantes / outras vogais → masculino (convenção PT-PT).
  guessGender(fullName) {
    const first = this.firstName(fullName).toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '');  // strip diacríticos
    if (!first) return 'u';
    if (this.NAMES_MALE.has(first)) return 'm';
    if (this.NAMES_FEMALE.has(first)) return 'f';
    const last = first.slice(-1);
    if (last === 'a') return 'f';  // Maria, Joana, Sofia, …
    if (last === 'o') return 'm';  // Pedro, Tiago, joao (após NFD)
    // Consoante (Daniel, Manuel, Rafael, Miguel, …) ou vogal rara → masculino.
    return 'm';
  },

  // Devolve concordância para o atleta.
  G_atl(data) {
    const g = (data && data.gen_atleta) || this.guessGender(data && data.atleta);
    const isF = g === 'f';
    return {
      caro:      isF ? 'Cara' : 'Caro',
      oA:        isF ? 'a' : 'o',
      oAUpper:   isF ? 'A' : 'O',
      doA:       isF ? 'da' : 'do',
      noA:       isF ? 'na' : 'no',
      oAtleta:   isF ? 'a atleta' : 'o atleta',
      oSeu:      isF ? 'a sua' : 'o seu',
      ele:       isF ? 'ela' : 'ele',
      dele:      isF ? 'dela' : 'dele',
      educando:  isF ? 'educanda' : 'educando',
      pron_obj:  isF ? 'la' : 'lo',   // ex: ouvi-la / ouvi-lo
      inscrito:  isF ? 'inscrita' : 'inscrito',
      pronto:    isF ? 'pronta' : 'pronto',
      preparado: isF ? 'preparada' : 'preparado',
      benvindo:  isF ? 'bem-vinda' : 'bem-vindo'
    };
  },

  // Devolve concordância para o encarregado (caro/cara · seu/sua…).
  G_ee(data) {
    const g = (data && data.gen_ee) || this.guessGender(data && data.ee_nome);
    const isF = g === 'f';
    return {
      caro:    isF ? 'Cara' : 'Caro',
      caroUp:  isF ? 'CARA' : 'CARO',
      o:       isF ? 'a' : 'o',
      oSeu:    isF ? 'a sua' : 'o seu',
      seu:     isF ? 'sua' : 'seu',
      pron:    isF ? 'a' : 'o'
    };
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
    // Header em bege para que o logo (preto) seja visível. Gmail remove `filter` CSS,
    // por isso evitamos brightness/invert e usamos directamente fundo claro.
    const C = this.C;
    return `<div style="background:${C.beige};padding:24px 40px;border-bottom:1.5px solid ${C.charcoal};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="vertical-align:middle;"><img src="${this.LOGO_URL}" alt="CFT" style="height:44px;display:block;" /></td>
        <td style="vertical-align:middle;text-align:right;font-family:'Barlow Condensed','Arial Narrow',sans-serif;font-size:11px;font-weight:700;letter-spacing:0.22em;color:${C.charcoal};text-transform:uppercase;">${this.EDITION}</td>
      </tr></table>
    </div>`;
  },

  _signature() {
    // Assinatura: logo escuro sobre fundo bege (sem filter), nome grande e contactos.
    // Compatível com Gmail (table-based layout, sem flex).
    const C = this.C;
    return `<div style="padding:24px 40px 32px 40px;">
      <div style="border-top:1.5px solid ${C.charcoal};padding-top:24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td width="92" style="vertical-align:top;padding-right:20px;">
            <img src="${this.LOGO_URL}" alt="CFT" style="width:92px;height:auto;display:block;" />
          </td>
          <td style="vertical-align:top;">
            <div style="font-family:'Bebas Neue','Arial Narrow',sans-serif;font-size:30px;line-height:1;color:${C.nearBlack};letter-spacing:0.005em;">EQUIPA CFT</div>
            <div style="font-family:'Playfair Display',Georgia,serif;font-style:italic;font-size:14px;color:${C.midGray};margin-top:2px;margin-bottom:12px;">Campos de Formação Técnica</div>
            <div style="font-family:'DM Sans','Helvetica Neue',Arial,sans-serif;font-size:12px;color:${C.charcoal};line-height:1.8;">
              <span style="margin-right:24px;"><b style="color:${C.greenDark};">e</b>&nbsp;geral@camposft.com</span>
              <span style="margin-right:24px;"><b style="color:${C.greenDark};">w</b>&nbsp;camposft.com</span>
              <span><b style="color:${C.greenDark};">ig</b>&nbsp;@camposft</span>
            </div>
          </td>
        </tr></table>
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

  _greeting(ee, data) {
    // Saudação personalizada ao EE quando temos nome; bulk usa fallback.
    const C = this.C;
    const name = String((data && data.ee_nome) || '').trim();
    const txt = name
      ? `${ee.caroUp} ${this._esc(name).toUpperCase()},`
      : `${ee.caroUp} ENCARREGAD${ee.o === 'a' ? 'A' : 'O'} DE EDUCAÇÃO,`;
    return `<div style="font-family:'Bebas Neue','Arial Narrow',sans-serif;font-size:32px;color:${C.charcoal};margin:0 0 18px 0;">${txt}</div>`;
  },

  // ============ Per-atleta templates ============

  // 1. Valor errado (pagou a menos)
  valorErrado(data) {
    const C = this.C;
    const a = this.G_atl(data);
    const ee = this.G_ee(data);
    const subject = `CFT · Acerto de pagamento — ${data.atleta}`;
    const body = `
      <div style="padding:48px 40px 24px 40px;">
        ${this._over('Acerto de pagamento', C.orange)}
        ${this._display('Quase\ntudo certo.')}
      </div>
      <div style="padding:0 40px 24px 40px;">
        ${this._greeting(ee, data)}
        ${this._para(`Antes de mais, obrigado pela inscrição ${a.doA} <b>${this._esc(data.atleta)}</b> no CFT 2026.`)}
        ${this._para(`Estamos a fechar os acertos das inscrições e, ao confrontar os valores, parece-nos haver uma pequena diferença em relação ao previsto. Pode ser engano nosso, por isso queríamos confirmar consigo antes de seguir.`)}
      </div>
      ${this._infoBox([
        ['Atleta', this._esc(data.atleta)],
        ['Valor da inscrição', `${data.valor_esperado}€`],
        ['Valor recebido', `${data.valor_pago}€`],
        ['Diferença', `<b style="color:${C.orange};">${data.falta}€</b>`]
      ], 'Detalhes')}
      <div style="padding:24px 40px 8px 40px;">
        ${this._para(`Se realmente faltar regularizar este valor, pode fazê-lo por transferência bancária para o IBAN <b style="font-family:ui-monospace,Menlo,monospace;">${this.IBAN_CFT}</b>, indicando o nome ${a.doA} atleta na descrição.`)}
        ${this._para(`Caso considere que há algum engano, responda a este email — verificamos do nosso lado e voltamos a falar.`)}
      </div>
      <div style="padding:8px 40px 16px 40px;">
        <div style="font-family:'Playfair Display',Georgia,serif;font-style:italic;font-size:22px;color:${C.charcoal};">Obrigado,</div>
      </div>`;
    return { subject, html: this._wrap(body) };
  },

  // 2. Sem pagamento
  semPagamento(data) {
    const C = this.C;
    const a = this.G_atl(data);
    const ee = this.G_ee(data);
    const subject = `CFT · Inscrição ${a.doA} ${data.atleta}`;
    const body = `
      <div style="padding:48px 40px 24px 40px;">
        ${this._over('Inscrição reservada', C.orange)}
        ${this._display('Falta um\núltimo passo.')}
      </div>
      <div style="padding:0 40px 24px 40px;">
        ${this._greeting(ee, data)}
        ${this._para(`Obrigado pela inscrição ${a.doA} <b>${this._esc(data.atleta)}</b> no CFT 2026. Está praticamente tudo a postos para a participação ${a.dele}.`)}
        ${this._para(`Estamos a finalizar os registos de pagamento e, à data de hoje, ainda não nos chegou nenhum comprovativo. Pode ter-nos escapado, por isso queríamos confirmar consigo antes de fechar.`)}
      </div>
      ${this._infoBox([
        ['Atleta', this._esc(data.atleta)],
        ['Valor da inscrição', `<b>${data.valor_esperado}€</b>`],
        ['Prazo', `<span style="font-family:'Playfair Display',Georgia,serif;font-style:italic;">${this._esc(data.data_limite)}</span>`]
      ], 'Inscrição')}
      <div style="padding:24px 40px 8px 40px;">
        ${this._para(`Se já efectuou a transferência, basta responder a este email com o comprovativo (ou data e valor) que acertamos do nosso lado.`)}
        ${this._para(`Caso ainda esteja em falta, pode regularizar por transferência bancária para o IBAN <b style="font-family:ui-monospace,Menlo,monospace;">${this.IBAN_CFT}</b>, indicando o nome ${a.doA} atleta na descrição.`)}
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
    const a = this.G_atl(data);
    const ee = this.G_ee(data);
    const subject = `CFT · Inscrição ${a.doA} ${data.atleta}`;
    const body = `
      <div style="padding:48px 40px 24px 40px;">
        ${this._over('1ª prestação recebida', C.greenDark)}
        ${this._display('Está quase\ntudo pronto.')}
      </div>
      <div style="padding:0 40px 24px 40px;">
        ${this._greeting(ee, data)}
        ${this._para(`Obrigado pela 1ª prestação da inscrição ${a.doA} <b>${this._esc(data.atleta)}</b> — já está registada do nosso lado. Está praticamente tudo pronto para a participação ${a.dele} no CFT 2026.`)}
        ${this._para(`Este email é só para relembrar que a 2ª prestação tem como prazo <span style="font-family:'Playfair Display',Georgia,serif;font-style:italic;">${this._esc(data.data_limite)}</span>.`)}
      </div>
      ${this._infoBox([
        ['Atleta', this._esc(data.atleta)],
        ['1ª prestação', `${data.valor_pago}€ <span style="color:${C.greenDark};">✓</span>`],
        ['2ª prestação', `<b>${data.falta}€</b>`],
        ['Prazo', `<span style="font-family:'Playfair Display',Georgia,serif;font-style:italic;">${this._esc(data.data_limite)}</span>`]
      ], 'Pagamento em prestações')}
      <div style="padding:24px 40px 8px 40px;">
        ${this._para(`Pode liquidar por transferência bancária para o IBAN <b style="font-family:ui-monospace,Menlo,monospace;">${this.IBAN_CFT}</b>, indicando o nome ${a.doA} atleta na descrição.`)}
        ${this._para(`Se entretanto já tiver liquidado, ignore este email. E se houver alguma dificuldade com o prazo, fale connosco — encontramos solução.`)}
      </div>
      <div style="padding:8px 40px 16px 40px;">
        <div style="font-family:'Playfair Display',Georgia,serif;font-style:italic;font-size:22px;color:${C.charcoal};">Obrigado,</div>
      </div>`;
    return { subject, html: this._wrap(body) };
  },

  // 4. A devolver
  aDevolver(data) {
    const C = this.C;
    const a = this.G_atl(data);
    const ee = this.G_ee(data);
    const subject = `CFT · Devolução de valor — ${data.atleta}`;
    const body = `
      <div style="padding:48px 40px 24px 40px;">
        ${this._over('Valor em excesso', C.greenDark)}
        ${this._display('Temos um valor\na devolver-lhe.')}
      </div>
      <div style="padding:0 40px 24px 40px;">
        ${this._greeting(ee, data)}
        ${this._para(`Antes de mais, obrigado pela inscrição ${a.doA} <b>${this._esc(data.atleta)}</b> no CFT 2026.`)}
        ${this._para(`Ao fechar os registos, vimos que o valor recebido ficou acima do valor previsto para esta inscrição. Há, portanto, uma diferença a devolver.`)}
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

  // ============ Promocional (clube perto do desconto) ============

  // Avisa que o clube tem N atletas (<8) e que, se chegar a 8, o pagamento
  // fica mais barato e devolvemos a diferença. Usar antes do prazo final
  // para incentivar inscrições adicionais do mesmo clube.
  descontoClube(data) {
    const C = this.C;
    const a = this.G_atl(data);
    const ee = this.G_ee(data);
    const subject = `CFT · ${data.clube} — desconto de clube ao virar da esquina`;
    const faltam = data.clube_faltam || '?';
    const body = `
      <div style="padding:48px 40px 24px 40px;">
        ${this._over('Quase a desbloquear desconto', C.greenDark)}
        ${this._display('Falta pouco\npara poupar.')}
      </div>
      <div style="padding:0 40px 24px 40px;">
        ${this._greeting(ee, data)}
        ${this._para(`Obrigado pela inscrição ${a.doA} <b>${this._esc(data.atleta)}</b> no CFT 2026 pelo <b>${this._esc(data.clube)}</b>.`)}
        ${this._para(`Como sabe, oferecemos um desconto a todos os atletas inscritos por clubes com 8 ou mais participantes. À data de hoje, o <b>${this._esc(data.clube)}</b> tem <b>${this._esc(data.clube_atletas)}</b> atleta${data.clube_atletas === '1' ? '' : 's'} ${data.clube_atletas === '1' ? 'inscrito' : 'inscritos'} — falta${faltam === '1' ? '' : 'm'} apenas <b style="color:${C.greenDark};">${this._esc(String(faltam))}</b> para destravar o desconto.`)}
      </div>
      ${this._infoBox([
        ['Clube', this._esc(data.clube)],
        ['Inscritos até à data', `<b>${this._esc(data.clube_atletas)}</b> de 8`],
        ['Valor que pagou', `${this._esc(data.valor_atual)}`],
        ['Valor com desconto', `<b style="color:${C.greenDark};">${this._esc(data.valor_com_desconto)}</b>`],
        ['Diferença a devolver', `<b style="color:${C.greenDark};">${this._esc(data.diferenca)}</b>`]
      ], 'Como ficaria')}
      <div style="padding:24px 40px 8px 40px;">
        ${this._para(`Se ainda conhece <b>${this._esc(String(faltam))}</b> atleta${faltam === '1' ? '' : 's'} do clube que pondere${faltam === '1' ? '' : 'm'} inscrever-se, este é o momento — basta partilharem o link de inscrição. Assim que o clube atingir os 8, devolvemos automaticamente a diferença a todos os atletas afectados.`)}
        ${this._para(`Qualquer dúvida ou se precisar do link do formulário, é só responder a este email.`)}
      </div>
      <div style="padding:8px 40px 16px 40px;">
        <div style="font-family:'Playfair Display',Georgia,serif;font-style:italic;font-size:22px;color:${C.charcoal};">Obrigado,</div>
      </div>`;
    return { subject, html: this._wrap(body) };
  },

  // ============ Bulk templates ============

  // 5. Aviso de prazo (bulk — sem atleta específico)
  avisoPrazo(data) {
    const C = this.C;
    const subject = `CFT · Lembrete: prazo de pagamento a ${data.data_limite}`;
    const body = `
      <div style="padding:48px 40px 24px 40px;">
        ${this._over('Lembrete · prazo a aproximar', C.orange)}
        ${this._display('A data\nestá perto.')}
      </div>
      <div style="padding:0 40px 24px 40px;">
        <div style="font-family:'Bebas Neue','Arial Narrow',sans-serif;font-size:32px;color:${C.charcoal};margin:0 0 18px 0;">CARO/A ENCARREGADO/A DE EDUCAÇÃO,</div>
        ${this._para(`Estamos perto da data limite para regularização das inscrições e ainda temos alguns pagamentos pendentes referentes ao seu educando — este email é um lembrete amigável.`)}
      </div>
      ${this._infoBox([
        ['Prazo limite', `<b style="color:${C.orange};">${this._esc(data.data_limite)}</b>`],
        ['Pagamento', `Transferência bancária`],
        ['IBAN', `<span style="font-family:ui-monospace,Menlo,monospace;">${this.IBAN_CFT}</span>`],
        ['Referência', 'Nome do atleta na descrição']
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

  // 6. Informações práticas (per-atleta quando há nome; bulk quando não)
  infoPraticas(data) {
    const C = this.C;
    const a = this.G_atl(data);
    const ee = this.G_ee(data);
    const hasName = !!String(data.atleta || '').trim();
    const subject = `CFT · Informações para o início das atividades`;
    const greeting = hasName
      ? this._greeting(ee, data)
      : `<div style="font-family:'Bebas Neue','Arial Narrow',sans-serif;font-size:32px;color:${C.charcoal};margin:0 0 18px 0;">CARO/A ENCARREGADO/A,</div>`;
    const intro = hasName
      ? `Está quase a começar! Aqui ficam as informações práticas para os primeiros dias ${a.doA} <b>${this._esc(data.atleta)}</b>.`
      : `Está quase a começar! Aqui ficam as informações práticas para os primeiros dias do seu educando.`;
    const body = `
      <div style="padding:48px 40px 24px 40px;">
        ${this._over('Está quase a começar', C.greenDark)}
        ${this._display('Tudo o que\nprecisa saber.')}
      </div>
      <div style="padding:0 40px 24px 40px;">
        ${greeting}
        ${this._para(intro)}
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

  // 7. Confirmação de inscrição (per-atleta)
  confirmacao(data) {
    const C = this.C;
    const a = this.G_atl(data);
    const ee = this.G_ee(data);
    const subject = `CFT · Inscrição confirmada`;
    const body = `
      <div style="padding:48px 40px 24px 40px;">
        ${this._over('Inscrição confirmada', C.greenDark)}
        ${this._display('Bem-vindo\nao campus.')}
      </div>
      <div style="padding:0 40px 24px 40px;">
        ${this._greeting(ee, data)}
        ${this._para(`A inscrição ${a.doA} <b>${this._esc(data.atleta || 'seu educando')}</b> está confirmada e o pagamento recebido. Está tudo certo do nosso lado.`)}
        ${this._para(`Mais perto da data de início, enviaremos as informações práticas (local, horário, material).`)}
      </div>
      <div style="padding:8px 40px 16px 40px;">
        <div style="font-family:'Playfair Display',Georgia,serif;font-style:italic;font-size:22px;color:${C.charcoal};">Obrigado pela confiança,</div>
      </div>`;
    return { subject, html: this._wrap(body) };
  },

  // ============ Novos templates (Maio 2026) ============

  // 8. Boas-vindas — primeiro contacto pós-inscrição (independente do estado
  //    de pagamento; um abraço editorial com próximos passos).
  boasVindas(data) {
    const C = this.C;
    const a = this.G_atl(data);
    const ee = this.G_ee(data);
    const subject = `CFT · ${a.benvindo === 'bem-vinda' ? 'Bem-vinda' : 'Bem-vindo'}, ${this.firstName(data.atleta) || 'atleta'}`;
    const body = `
      <div style="padding:48px 40px 24px 40px;">
        ${this._over('Inscrição recebida', C.greenDark)}
        ${this._display(a.benvindo === 'bem-vinda' ? 'Bem-vinda\nao campus.' : 'Bem-vindo\nao campus.')}
      </div>
      <div style="padding:0 40px 24px 40px;">
        ${this._greeting(ee, data)}
        ${this._para(`É com muito gosto que recebemos a inscrição ${a.doA} <b>${this._esc(data.atleta)}</b> no <b>CFT 2026 · 4ª edição</b>. Bem-${a.benvindo} ao nosso campus.`)}
        ${this._para(`Vamos tratar de todos os detalhes nas próximas semanas. Nesta primeira mensagem, deixamos o resumo da inscrição e os passos seguintes.`)}
      </div>
      ${this._infoBox([
        ['Atleta', this._esc(data.atleta)],
        ['Clube', this._esc(data.clube || '—')],
        ['Valor da inscrição', `<b>${data.valor_esperado}</b>`],
        ['IBAN', `<span style="font-family:ui-monospace,Menlo,monospace;">${this.IBAN_CFT}</span>`],
        ['Prazo', `<span style="font-family:'Playfair Display',Georgia,serif;font-style:italic;">${this._esc(data.data_limite)}</span>`]
      ], 'Resumo da inscrição')}
      <div style="padding:24px 40px 8px 40px;">
        ${this._para(`<b>Próximos passos.</b> Se ainda não regularizou o pagamento, pode fazê-lo por transferência para o IBAN acima, indicando o nome ${a.doA} atleta na descrição. Assim que o valor entrar, confirmamos por email.`)}
        ${this._para(`Mais perto do início, enviaremos as <b>informações práticas</b> (local, horário, material, logística de chegada e saída).`)}
        ${this._para(`Qualquer questão — sobre semanas, equipamento, refeições, ou outra coisa que ainda não esteja clara — responda a este email que respondemos em 24h.`)}
      </div>
      <div style="padding:8px 40px 16px 40px;">
        <div style="font-family:'Playfair Display',Georgia,serif;font-style:italic;font-size:22px;color:${C.charcoal};">Até breve,</div>
      </div>`;
    return { subject, html: this._wrap(body) };
  },

  // 9. Genérico — admin escreve assunto + corpo livre. Mantém o wrapper
  //    branded (header, assinatura, footer). data.subject + data.body são
  //    populados pelo painel inline da Lista.
  generico(data) {
    const C = this.C;
    const ee = this.G_ee(data);
    const subject = data.subject || `CFT · Mensagem para ${this.firstName(data.ee_nome) || 'si'}`;
    // O corpo é texto livre; preserva quebras de linha em parágrafos.
    const raw = String(data.body || '').trim();
    const paragraphs = raw
      ? raw.split(/\n{2,}/).map(p => this._para(this._esc(p).replace(/\n/g, '<br>'))).join('')
      : this._para('<em>(escreva aqui a sua mensagem)</em>');
    const body = `
      <div style="padding:48px 40px 24px 40px;">
        ${this._over('Mensagem', C.greenDark)}
        ${this._display(data.heading || 'Uma palavra\nda nossa parte.')}
      </div>
      <div style="padding:0 40px 24px 40px;">
        ${this._greeting(ee, data)}
        ${paragraphs}
      </div>
      <div style="padding:8px 40px 16px 40px;">
        <div style="font-family:'Playfair Display',Georgia,serif;font-style:italic;font-size:22px;color:${C.charcoal};">${this._esc(data.signoff || 'Obrigado,')}</div>
      </div>`;
    return { subject, html: this._wrap(body) };
  },

  // 10. Pré-campus — comunicação a 1-2 semanas do início.
  //     Distinto do infoPraticas (que é mais perto da véspera): aqui dá-se
  //     um update geral, antecipa-se equipamento, e reforça-se prazos finais.
  prePampus(data) {
    const C = this.C;
    const a = this.G_atl(data);
    const ee = this.G_ee(data);
    const subject = `CFT · A duas semanas do início — preparação ${a.doA} ${data.atleta}`;
    const body = `
      <div style="padding:48px 40px 24px 40px;">
        ${this._over('Conta decrescente · pré-campus', C.greenDark)}
        ${this._display('A começar\nem breve.')}
      </div>
      <div style="padding:0 40px 24px 40px;">
        ${this._greeting(ee, data)}
        ${this._para(`Estamos a duas semanas do início do <b>CFT 2026</b> e ${a.oAtleta} <b>${this._esc(data.atleta)}</b> faz parte do grupo. Esta é uma mensagem rápida para ${ee.o === 'a' ? 'a' : 'o'} preparar para o que aí vem.`)}
      </div>
      ${this._infoBox([
        ['📅 Início', `<span style="font-family:'Playfair Display',Georgia,serif;font-style:italic;">${this._esc(data.data_inicio || '—')}</span>`],
        ['📍 Local', this._esc(data.local || '—')],
        ['🎒 Material', this._esc(data.material || '—')],
        ['🚗 Logística', this._esc(data.logistica || '—')]
      ], 'O que já pode preparar')}
      <div style="padding:24px 40px 8px 40px;">
        ${this._para(`<b>Equipamento.</b> Aproveite estes dias para garantir que ${a.oAtleta} tem todo o material listado em condições — calçado adequado, garrafa de água, muda de roupa.`)}
        ${this._para(`<b>Pagamento.</b> Se ainda houver alguma parcela em aberto, este é o momento para fechar antes do início (IBAN <b style="font-family:ui-monospace,Menlo,monospace;">${this.IBAN_CFT}</b>). Se está tudo regularizado do seu lado e tem alguma dúvida, responda a este email.`)}
        ${this._para(`<b>Comunicação.</b> Na semana anterior ao início, enviamos as informações finais (horários exactos, contactos de emergência, mapa do local). Mantenha-se atento à sua caixa de correio.`)}
      </div>
      <div style="padding:8px 40px 16px 40px;">
        <div style="font-family:'Playfair Display',Georgia,serif;font-style:italic;font-size:22px;color:${C.charcoal};">Até daqui a pouco,</div>
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
