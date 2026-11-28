// Gera o email do Jornal do CFT (edição mais recente) a partir de jornal/jornal.json.
// Uso: node jornal/email.js [inscricoes] > email.html
// Email em tabelas com estilos inline e fontes de sistema (Gmail/Outlook ignoram SVG e Google Fonts).
const fs = require('fs');
const path = require('path');
const j = JSON.parse(fs.readFileSync(path.join(__dirname, 'jornal.json'), 'utf8'));
const e = (j.edicoes || []).slice().sort((a, b) => a.data < b.data ? 1 : -1)[0];
if (!e) { console.error('Sem edições'); process.exit(1); }
const insc = process.argv[2];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DASH = 'https://tiagojgcc.github.io/CFT-dashboard/Dashboard.html';
const serif = "Georgia,'Times New Roman',serif";
const sans = "-apple-system,'Segoe UI',Roboto,Arial,sans-serif";
const ink = '#1C1C18', soft = '#5F5E57', green = '#2D6B3C', line = '#E5D9C4';
const dl = new Date(e.data + 'T12:00:00').toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const dNatal = Math.round((new Date('2026-12-24T00:00:00') - new Date(e.data + 'T00:00:00')) / 86400000);
const h2 = t => `<tr><td style="padding:26px 0 10px;font-family:${sans};font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${green}">${t}</td></tr>`;
const p = (t, size) => `<tr><td style="padding:0 0 12px;font-family:${sans};font-size:${size || 16}px;line-height:1.6;color:${soft}">${t}</td></tr>`;
let rows = '';
rows += `<tr><td style="padding:8px 0 0;text-align:center;font-family:${serif};font-size:34px;font-weight:700;color:${ink}">Jornal do CFT</td></tr>`;
rows += `<tr><td style="border-top:3px double ${ink};padding:8px 0 0;text-align:center;font-family:${sans};font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${green}">Nº ${esc(e.numero)} · ${esc(dl)}</td></tr>`;
rows += `<tr><td style="padding:22px 0 8px;font-family:${serif};font-size:28px;line-height:1.2;font-weight:700;color:${ink}">${esc(e.manchete)}</td></tr>`;
if (e.lead) rows += p(esc(e.lead), 17);
const numeros = [];
if (insc !== undefined) numeros.push(`<b style="color:${ink}">${esc(insc)}</b> de 120 inscrições`);
if (dNatal >= 0) numeros.push(`<b style="color:${ink}">${dNatal}</b> dias de preço de Natal`);
if (numeros.length) rows += `<tr><td style="padding:4px 0 6px;border-top:1px solid ${line};border-bottom:1px solid ${line};font-family:${sans};font-size:15px;color:${soft}">${numeros.join(' &nbsp;·&nbsp; ')}</td></tr>`;
if ((e.noticias || []).length) {
  rows += h2('As notícias');
  e.noticias.forEach(n => { rows += `<tr><td style="padding:0 0 4px;font-family:${serif};font-size:19px;font-weight:700;color:${ink}">${esc(n.titulo)}</td></tr>` + p(esc(n.texto)); });
}
if (e.sugestao) {
  const s = e.sugestao;
  rows += h2('Sugestão para hoje');
  rows += `<tr><td style="border-left:3px solid #78C832;padding:2px 0 2px 14px"><div style="font-family:${sans};font-size:17px;font-weight:700;color:${ink};margin-bottom:6px">${esc(s.titulo)}</div><div style="font-family:${sans};font-size:15px;line-height:1.6;color:${soft}">${esc(s.texto)}</div><div style="font-family:${sans};font-size:13px;color:${soft};margin-top:8px"><b>Quem:</b> ${esc(s.quem || 'Tiago ou Miguel')}${s.tempo ? ' · <b>Tempo:</b> ' + esc(s.tempo) : ''}</div></td></tr>`;
}
const lista = (t, arr) => { if (!(arr || []).length) return; rows += h2(t); arr.forEach(x => { rows += `<tr><td style="padding:0 0 10px;font-family:${sans};font-size:15px;line-height:1.55;color:${soft}"><b style="color:${ink}">${esc(x.titulo)}.</b> ${esc(x.texto)}${x.quem ? ' Quem: ' + esc(x.quem) + '.' : ''}</td></tr>`; }); };
lista('Precisa de vocês', e.pendentes);
lista('Decidido', e.decidido);
if ((e.julho || []).length) {
  rows += h2('A caminho de julho');
  const R = { ok: ['Confirmado', green], pend: ['Pendente', '#B4552E'], conf: ['Por confirmar', '#9A9483'] };
  rows += `<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${e.julho.map(r => { const st = R[r.estado] || R.conf; return `<tr><td style="padding:7px 8px 7px 0;border-bottom:1px solid ${line};font-family:${sans};font-size:14px;font-weight:700;color:${ink};width:40%">${esc(r.area)}</td><td style="padding:7px 0;border-bottom:1px solid ${line};font-family:${sans};font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${st[1]}">${esc(r.rotulo || st[0])}</td></tr>`; }).join('')}</table></td></tr>`;
}
if ((e.fora || []).length) { rows += h2('Lá fora'); e.fora.forEach(f => { rows += p(esc(f.texto), 15); }); }
rows += `<tr><td style="padding:26px 0 0"><a href="${DASH}" style="display:inline-block;background:${ink};color:#FBF8F2;font-family:${sans};font-size:14px;font-weight:600;text-decoration:none;padding:11px 18px;border-radius:6px">Abrir no Dashboard</a></td></tr>`;
rows += `<tr><td style="padding:18px 0 0;font-family:${sans};font-size:12px;color:#9A9483">Jornal do CFT · todos os dias às 07:00 · para o Tiago e o Miguel</td></tr>`;
process.stdout.write(`<!doctype html><html lang="pt-PT"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Jornal do CFT · Nº ${esc(e.numero)}</title></head>
<body style="margin:0;padding:0;background-color:#F4EDE0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#F4EDE0" style="background-color:#F4EDE0"><tr><td align="center" style="padding:20px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#FBF8F2" style="max-width:600px;background-color:#FBF8F2;border:1px solid ${line}"><tr><td style="padding:24px 22px 28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr></table>
</td></tr></table></body></html>`);
