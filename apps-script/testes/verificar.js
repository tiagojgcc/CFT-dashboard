#!/usr/bin/env node
/**
 * Verificação do backend antes de o colar no Apps Script.
 *
 *   node apps-script/testes/verificar.js
 *
 * Corre o CFT_All.gs com uma folha de cálculo simulada em memória (não toca em
 * nada real: nem Sheet, nem Drive, nem Gmail) e confirma:
 *   - que o ficheiro tem tudo o que o site precisa (inscrição, vagas, postal, preços 2027);
 *   - preços oficiais;
 *   - 25 inscrições seguidas com números todos diferentes;
 *   - reenvio da mesma inscrição não duplica;
 *   - semana cheia vai para lista de espera;
 *   - comprovativo inválido não impede a inscrição.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FICHEIRO = path.join(__dirname, '..', 'CFT_All.gs');
const src = fs.readFileSync(FICHEIRO, 'utf8');

let falhas = 0, feitos = 0;
function ok(cond, nome, extra) {
  feitos++;
  if (cond) console.log('  ok   ' + nome);
  else { falhas++; console.log('  FALHA ' + nome + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : '')); }
}

// ---------- 1. O ficheiro tem tudo ----------
console.log('\n1. Conteúdo do ficheiro único');
[
  ["action === 'inscricao_submit'", 'inscrição pelo site'],
  ["action === 'clube_contagem'", 'contador de clube'],
  ["action === 'vagas'", 'consulta de vagas'],
  ["let SHEET_ID = '1abTVSDX0-4bBQezHltaVPECSYynQMRWgGi7ryTyqeeM'", 'Sheet 2027 por omissão'],
  ['const SHEET_ID_2026', 'arquivo 2026'],
  ['const Pricing2026', 'preços do arquivo 2026'],
  ["{ ate: '2026-12-24', preco: 350, desc: 315 }", 'escalão de Natal 350/315'],
  ["{ ate: '2027-03-31', preco: 375, desc: 335 }", 'escalão até 31/3 375/335'],
  ['{ ate: null,         preco: 395, desc: 355 }', 'escalão final 395/355'],
  ['externo: 290, sinal: 130', 'externo 290 e sinal 130'],
  ['_postalNatal(data)', 'postal de Natal no email'],
  ['postalNatalAtivo_()', 'postal só até 24/12'],
  ['listaEspera(data)', 'email de lista de espera'],
  ['function lerComprovativosPendentes_', 'leitura do comprovativo fora do pedido'],
  ['function processFormRow_', 'processamento do Form']
].forEach(([s, nome]) => ok(src.indexOf(s) >= 0, nome));

// ---------- Folha de cálculo simulada ----------
function Folha(nome, headers) { this.nome = nome; this.linhas = [headers.slice()]; }
Folha.prototype.getLastRow = function () { return this.linhas.length; };
Folha.prototype.getLastColumn = function () { return this.linhas[0].length; };
// Como a folha verdadeira: texto só com algarismos vira número, a não ser que a célula esteja em formato de texto.
const comoFolha = (v) => (typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v);
Folha.prototype.appendRow = function (r) { const l = r.map(comoFolha); while (l.length < this.linhas[0].length) l.push(''); this.linhas.push(l); };
Folha.prototype.getRange = function (r, c, nr, nc) {
  const f = this; nr = nr || 1; nc = nc || 1;
  const cel = (i, j) => { const l = f.linhas[r - 1 + i] || []; const v = l[c - 1 + j]; return v === undefined ? '' : v; };
  return {
    getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => cel(i, j))),
    getValue: () => cel(0, 0),
    setValues: (vals) => vals.forEach((linha, i) => linha.forEach((v, j) => { while (f.linhas.length < r + i) f.linhas.push([]); f.linhas[r - 1 + i][c - 1 + j] = comoFolha(v); })),
    setValue(v) { f.linhas[r - 1][c - 1] = this.texto ? v : comoFolha(v); },
    getRichTextValue: () => null, getFormula: () => '',
    setNumberFormat(fmt) { this.texto = fmt === '@'; return this; }, setFontWeight() { return this; }, setBackground() { return this; }, setFontColor() { return this; }
  };
};

const HEAD_FORM = ['Carimbo de data/hora', 'Endereço de e-mail', 'Semana de inscrição', 'Como tomou conhecimento do CFT?',
  'Caso tenha respondido treinador, qual?', 'Opção de inscrição', 'Nome completo do atleta', 'Nº Cartão de Cidadão',
  'Data de nascimento', 'NIF', 'Tamanho equipamento', 'Número colocar equipamento', 'Nome colocar equipamento',
  'Clube onde joga', 'Posição onde joga', 'O que pretende melhorar com o campo?', 'Tem alguma alergia alimentar?', 'Qual?',
  'Faz alguma medicação regularmente?', 'Qual?', 'Tem alguma doença?', 'Qual?', 'Tem alguma alergia medicamentosa?', 'Qual?',
  'Nome encarregado de educação', 'Email', 'Telemóvel', 'Contacto de emergência',
  'Declaro, como encarregado de educação, que autorizo', 'Autorizo a captação e divulgação de imagens',
  'Autorizo a saída do seu educando', 'Iban para devolução de dinheiro', 'Comprovativo pagamento inscrição',
  'Tem algum irmão inscrito?', 'id_inscricao', 'migrado_em'];

function novoMundo(config) {
  const folhas = {
    'Respostas do Formulário 1': new Folha('Respostas', HEAD_FORM),
    'Atletas': new Folha('Atletas', new Array(49).fill('h')),
    'Historico': new Folha('Historico', new Array(9).fill('h')),
    'Emails': new Folha('Emails', new Array(9).fill('h')),
    'Tarefas': new Folha('Tarefas', new Array(10).fill('h')),
    'Config': new Folha('Config', ['key', 'value', 'notas'])
  };
  Object.keys(config || {}).forEach(k => folhas.Config.appendRow([k, config[k], '']));
  const cache = {}, props = {}, enviados = [], ficheiros = [], triggers = [];
  let uuid = 0;
  const ctx = {
    console, JSON, Math, Date, String, Number, Array, Object, RegExp, Error, parseInt, parseFloat, isNaN, encodeURIComponent,
    Logger: { log() {} },
    SpreadsheetApp: { openById: () => ({ getSheetByName: (n) => folhas[n] || null, insertSheet: (n) => (folhas[n] = new Folha(n, [])) }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock() {}, releaseLock() {} }), getDocumentLock: () => ({ waitLock() {}, releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({ get: (k) => (k in cache ? cache[k] : null), put: (k, v) => { cache[k] = v; }, remove: (k) => { delete cache[k]; } }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = v; }, deleteProperty: (k) => { delete props[k]; } }) },
    Utilities: {
      getUuid: () => '00000000-0000-4000-8000-' + String(++uuid).padStart(12, '0'),
      formatDate: (d, tz, f) => f === 'yyyy-MM-dd' ? ctx.__hoje : '2026-11-27 21:00',
      base64Encode: (s) => Buffer.from(String(s), 'utf8').toString('base64'),
      base64EncodeWebSafe: (s) => Buffer.from(String(s), 'utf8').toString('base64url'),
      base64Decode: (s) => Array.from(Buffer.from(String(s), 'base64')),
      newBlob: (bytes, mime, nome) => ({ bytes, mime, nome }),
      Charset: { UTF_8: 'utf8' }, sleep() {}
    },
    DriveApp: {
      getFolderById: () => ctx.DriveApp.__pasta, createFolder: () => ctx.DriveApp.__pasta,
      __pasta: { getId: () => 'pasta', createFile: (b) => { const f = { id: 'fich' + (ficheiros.length + 1), nome: b.nome, mime: b.mime, lixo: false }; ficheiros.push(f); return { getUrl: () => 'https://drive.google.com/file/d/' + f.id + '/view', getId: () => f.id }; } },
      getFileById: (id) => { const f = ficheiros.find(x => x.id === id); return { getName: () => f.nome, setName: (n) => { f.nome = n; }, setTrashed: (v) => { f.lixo = v; } }; }
    },
    Gmail: { Users: { Messages: { send: (m) => { enviados.push(Buffer.from(m.raw, 'base64url').toString('utf8')); } } } },
    ScriptApp: { newTrigger: (fn) => ({ timeBased: () => ({ after: () => ({ create: () => { triggers.push(fn); } }) }) }), getProjectTriggers: () => [], deleteTrigger() {} },
    UrlFetchApp: { fetch: () => { throw new Error('sem rede nos testes'); } },
    ContentService: { createTextOutput: (t) => ({ setMimeType() { return this; }, texto: t }), MimeType: { JSON: 'json' } },
    __hoje: '2026-11-27'
  };
  vm.createContext(ctx);
  vm.runInContext(src + '\n;this.InscricaoSite = InscricaoSite; this.Pricing = Pricing; this.Pricing2026 = Pricing2026; this.handle_ = handle_; this.ATL_COLS = ATL_COLS; this.EmailTemplates = EmailTemplates;', ctx, { filename: 'CFT_All.gs' });
  return { ctx, folhas, enviados, ficheiros, triggers };
}

let nChave = 0;
const chave = () => '11111111-2222-4333-8444-' + String(++nChave).padStart(12, '0');
function pedido(extra, respostasExtra) {
  return Object.assign({
    action: 'inscricao_submit', website: '', chave: chave(),
    respostas: Object.assign({
      semanas: 'Semana 1 - 11 a 17 de julho', opcao: 'Interno', irmao: 'Não', atleta: 'Ana Teste', dataNasc: '2014-05-02',
      cc: '12345678', nif: '123456789', clube: 'Clube A', tshirt: 'M', tshirt_num: '7', tshirt_nome: 'ANA',
      alergia_alim: 'Não', medicacao: 'Não', doenca: 'Não', alergia_med: 'Não', encarregado: 'Maria Teste',
      email_ee: 'maria@example.com', telefone: '+351912345678', contacto_emerg: '912345678', como_conheceu: 'Clube',
      decl_resp: 'Sim', decl_imagem: 'Sim', decl_saida: 'Sim', pagamento: 'sinal', iban: 'PT50000000000000000000000'
    }, respostasExtra || {}),
    ficheiro: { nome: 'comprovativo.pdf', mime: 'application/pdf', base64: Buffer.from('pdf').toString('base64') }
  }, extra || {});
}
const post = (m, p) => JSON.parse(m.ctx.handle_({ parameter: {}, postData: { contents: JSON.stringify(p) } }, 'POST').texto);
const get = (m, params) => JSON.parse(m.ctx.handle_({ parameter: params }, 'GET').texto);
const col = (m, nome) => m.folhas.Atletas.linhas.slice(1).map(l => l[m.ctx.ATL_COLS[nome] - 1]);

// ---------- 2. Preços oficiais ----------
console.log('\n2. Preços oficiais 2027');
{
  const m = novoMundo();
  const P = m.ctx.Pricing;
  const preco = (data, sem, opcao, irmao) => P.calc({ timestamp_inscricao: new Date(data), semanas_atuais: sem, opcao_inscricao: opcao, irmao_desconto: !!irmao, clube: 'X' }, {});
  const S1 = 'Semana 1 - 11 a 17 de julho', S12 = 'Semana 1 e semana 2';
  ok(preco('2026-11-27T21:00:00', S1, 'Interno').prontoTotal === 350, 'até 24/12, 1 semana = 350');
  ok(preco('2026-12-24T23:00:00', S1, 'Interno', true).prontoTotal === 315, 'até 24/12, com irmão = 315');
  ok(preco('2026-12-24T23:00:00', S12, 'Interno').prontoTotal === 630, 'até 24/12, 2 semanas = 2 × 315');
  ok(preco('2026-12-25T10:00:00', S1, 'Interno').prontoTotal === 375, 'a 25/12 = 375');
  ok(preco('2027-03-31T12:00:00', S1, 'Interno', true).prontoTotal === 335, 'até 31/3, com desconto = 335');
  ok(preco('2027-04-01T10:00:00', S1, 'Interno').prontoTotal === 395, 'a 1/4 = 395');
  ok(preco('2027-04-01T10:00:00', S12, 'Interno').prontoTotal === 710, 'a 1/4, 2 semanas = 2 × 355');
  ok(preco('2026-11-27T21:00:00', S1, 'Externo', true).prontoTotal === 290, 'externo = 290, sem desconto');
  const s = preco('2026-11-27T21:00:00', S1, 'Interno');
  ok(s.prest1 === 130 && s.prest2 === 220, 'sinal 130 + resto 220', s);
}

// ---------- 3. Pico de inscrições ----------
console.log('\n3. 25 inscrições seguidas');
{
  const m = novoMundo();
  const res = [];
  for (let i = 0; i < 25; i++) res.push(post(m, pedido({}, { atleta: 'Atleta ' + i, irmao: i === 3 ? 'Sim' : 'Não' })));
  ok(res.every(r => r.ok && r.data.recebido && !r.data.lista_espera), 'todas aceites', res.find(r => !r.ok));
  const nums = col(m, 'num_inscricao');
  ok(new Set(nums).size === 25 && Math.min(...nums) === 1 && Math.max(...nums) === 25, 'números de 1 a 25, todos diferentes', nums);
  ok(m.folhas['Respostas do Formulário 1'].linhas.length === 26 && m.folhas.Atletas.linhas.length === 26, '25 linhas em Respostas e em Atletas');
  ok(col(m, 'irmao_desconto')[3] === true && col(m, 'irmao_desconto')[4] === false, 'desconto de irmão marcado só em quem o declarou');
  ok(/pagou o sinal/.test(col(m, 'notas_internas')[0]), 'nota com a forma de pagamento');
  ok(m.enviados.length === 25 && /Subject:/.test(m.enviados[0]), '25 emails de confirmação');
  ok(m.triggers.length === 1, 'leitura dos comprovativos agendada uma só vez', m.triggers.length);
  ok(res[0].data.leitura === 'agendada', 'a família não espera pela leitura do comprovativo');
  ok(/^\d{3}_|CFT|Atleta/.test(m.ficheiros[0].nome) && !/^site_/.test(m.ficheiros[0].nome), 'comprovativo renomeado com o número', m.ficheiros[0].nome);
  ok(get(m, { action: 'clube_contagem', clube: 'clube a' }).data.inscritos === 25, 'contador de clube = 25');
}

// ---------- 4. Reenvio ----------
console.log('\n4. Reenvio da mesma inscrição');
{
  const m = novoMundo();
  const p = pedido();
  const a = post(m, p), b = post(m, p);

  ok(a.ok && b.ok && b.data.repetido === true && a.data.id === b.data.id, 'segunda resposta igual à primeira, marcada como repetida', b);
  ok(m.folhas.Atletas.linhas.length === 2 && m.folhas['Respostas do Formulário 1'].linhas.length === 2, 'uma só linha');
  ok(m.enviados.length === 1, 'um só email');
}
{
  // Reenvio depois de a cache expirar: decide pela coluna id_inscricao.
  const m = novoMundo();
  const p = pedido();
  post(m, p);
  m.ctx.CacheService.getScriptCache().remove('insc_' + p.chave);
  const b = post(m, p);
  ok(b.ok && b.data.repetido === true && m.folhas.Atletas.linhas.length === 2, 'sem cache também não duplica');
  ok(m.ficheiros.length === 1, 'não guarda segunda cópia do comprovativo', m.ficheiros.length);
}
{
  const m = novoMundo();
  const semChave = pedido(); delete semChave.chave;
  const r = post(m, semChave);
  ok(r.ok && /^[a-f0-9-]{36}$/.test(r.data.id), 'página antiga (sem código) continua a funcionar');
}

// ---------- 5. Vagas e lista de espera ----------
console.log('\n5. Semana cheia e lista de espera');
{
  const m = novoMundo({ vagas_por_semana: 3 });
  for (let i = 0; i < 3; i++) post(m, pedido({}, { atleta: 'A' + i }));
  ok(get(m, { action: 'vagas' }).data.semanas[1].cheia === true && get(m, { action: 'vagas' }).data.semanas[2].cheia === false, 'consulta de vagas: semana 1 cheia, semana 2 livre');
  const q = pedido({}, { atleta: 'Quarto' }); delete q.ficheiro;
  const r4 = post(m, q);
  ok(r4.ok && r4.data.lista_espera === true && r4.data.semanas_cheias[0] === 1, '4.ª inscrição na semana 1 vai para lista de espera', r4);
  ok(col(m, 'ativo')[3] === false && /^Lista de espera/.test(col(m, 'motivo_eliminacao')[3]), 'fica inativa com o motivo «Lista de espera»');
  ok(col(m, 'num_inscricao')[3] === 4, 'mantém o número de ordem de chegada');
  ok(m.folhas.Tarefas.linhas.length === 2 && /Lista de espera: Quarto/.test(m.folhas.Tarefas.linhas[1][3]), 'cria tarefa no Dashboard');
  ok(/Lista de espera/.test(Buffer.from(m.enviados[3].match(/Subject: =\?UTF-8\?B\?([^?]+)\?=/)[1], 'base64').toString('utf8')), 'email de lista de espera');
  const r5 = post(m, pedido({}, { atleta: 'Quinto', semanas: 'Semana 2 - 18 a 24 de julho' }));
  ok(r5.ok && r5.data.lista_espera === false, 'semana 2 continua a aceitar');
  const r6 = post(m, pedido({}, { atleta: 'Sexto', semanas: 'Semana 1 e semana 2' }));
  ok(r6.ok && r6.data.lista_espera === true, 'quem escolhe as duas, com uma cheia, fica em espera');
  ok(get(m, { action: 'vagas' }).data.semanas[2].ultimas === 2, 'quem está em espera não ocupa vaga', get(m, { action: 'vagas' }).data);
}
{
  const m = novoMundo();
  ok(get(m, { action: 'vagas' }).data.semanas[1].cheia === false, 'sem Config, o limite é 60');
  for (let i = 0; i < 60; i++) post(m, pedido({}, { atleta: 'A' + i }));
  ok(post(m, pedido({}, { atleta: 'N61' })).data.lista_espera === true, 'a 61.ª inscrição fica em lista de espera');
}

// ---------- 6. Comprovativo ----------
console.log('\n6. Comprovativo');
{
  const m = novoMundo();
  const r1 = post(m, pedido({ ficheiro: { nome: 'IMG_0012.JPG', mime: 'application/octet-stream', base64: 'AAAA' } }));
  ok(r1.ok && r1.data.comprovativo === true, 'fotografia sem tipo: aceite pela extensão', r1);
  const r2 = post(m, pedido({ ficheiro: { nome: 'ficheiro.docx', mime: 'application/msword', base64: 'AAAA' } }));
  ok(r2.ok && r2.data.recebido && r2.data.comprovativo === false && r2.data.comprovativo_erro === true, 'ficheiro inválido: inscrição feita, sem comprovativo', r2);
  ok(m.folhas.Atletas.linhas.length === 3, 'as duas inscrições ficaram registadas');
}

// ---------- 6b. Zeros à esquerda ----------
console.log('\n6b. Zeros à esquerda');
{
  const m = novoMundo();
  const r = post(m, pedido({}, { cc: '00123456', tshirt_num: '00', contacto_emerg: '00351912345678' }));
  ok(r.ok && r.data.recebido, 'inscrição com CC a começar por zeros é aceite', r);
  ok(col(m, 'cc')[0] === '00123456', 'CC mantém os zeros na aba Atletas', col(m, 'cc'));
  ok(col(m, 'tshirt_num')[0] === '00' && col(m, 'contacto_emerg')[0] === '00351912345678', 'número da camisola e contacto mantêm os zeros');
  const resp = m.folhas[Object.keys(m.folhas).find(k => /Respostas/.test(k))];
  ok(resp.linhas[1].indexOf('00123456') >= 0, 'CC mantém os zeros na aba de respostas');
  post(m, pedido());
  ok(col(m, 'cc')[1] === 12345678, 'CC sem zeros fica como antes');
}

// ---------- 7. Erros ----------
console.log('\n7. Erros e arquivo 2026');
{
  const m = novoMundo();
  const r = post(m, pedido({}, { email_ee: 'a@b' }));
  ok(r.ok === false && /Email inválido/.test(r.error), 'email inválido é recusado');
  ok(post(m, pedido({ website: 'http://spam' })).data.recebido === true && m.folhas.Atletas.linhas.length === 1, 'bots descartados em silêncio');
  m.ctx.LockService.getScriptLock = () => ({ tryLock: () => false, releaseLock() {} });
  ok(post(m, pedido()).error === 'OCUPADO', 'servidor ocupado responde OCUPADO (o site tenta de novo)');
  const P6 = m.ctx.Pricing2026.calc({ timestamp_inscricao: new Date('2026-02-01'), semanas_atuais: '1', opcao_inscricao: 'Interno', clube: 'X' }, {});
  ok(P6.prontoTotal === 330, 'arquivo 2026 mantém os preços de 2026 (330)');
}

console.log('\n' + (falhas ? falhas + ' FALHA(S) em ' + feitos + ' verificações. NÃO publicar.' : 'Tudo certo: ' + feitos + ' verificações.'));
process.exit(falhas ? 1 : 0);
