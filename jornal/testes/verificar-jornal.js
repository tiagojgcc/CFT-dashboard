// Verificações do Jornal do CFT. Correr na raiz do repositório com um servidor local:
//   python3 -m http.server 8765 &  node jornal/testes/verificar-jornal.js
const { chromium, devices } = require('playwright');
const fs = require('fs'); const { execSync } = require('child_process');
const R = []; const ok = (n, c, d) => R.push([c ? 'PASSOU' : 'FALHOU', n, d || '']);
(async () => {
  // 1. JSON válido e completo
  const j = JSON.parse(fs.readFileSync('jornal/jornal.json', 'utf8'));
  const ed = j.edicoes;
  ok('1. jornal.json válido, edições com campos obrigatórios', ed.length >= 1 && ed.every(e => e.data && e.numero && e.manchete && e.sugestao && e.sugestao.titulo && Array.isArray(e.noticias)), ed.length + ' edições');
  // 2. Privacidade: sem emails, telefones, IBAN, NIF no ficheiro público
  const raw = fs.readFileSync('jornal/jornal.json', 'utf8');
  const priv = [/[\w.+-]+@[\w-]+\.[\w.]+/, /\b9\d{8}\b/, /PT50\s?\d/, /\bNIF\b/i, /\b\d{9}\b/];
  ok('2. ficheiro público sem emails, telefones, IBAN ou NIF', !priv.some(r => r.test(raw)));
  // 3. Preços iguais aos oficiais
  const html = fs.readFileSync('Dashboard.html', 'utf8');
  const jsJ = html.slice(html.indexOf('// ============ JORNAL DO CFT'), html.indexOf('badgeJornal();'));
  const precos = ['350 €', '315 €', '375 €', '335 €', '395 €', '355 €'].every(p => jsJ.includes(p));
  const errados = /\b(330|295|310|275) €/.test(jsJ + raw);
  ok('3. preços no jornal = preços oficiais (350/315, 375/335, 395/355)', precos && !errados);
  // 4. Email gerado em tabelas, sem SVG nem <style>, com ligação https
  const em = execSync('node jornal/email.js 2').toString();
  ok('4. email do jornal: tabelas, sem SVG/<style>, link https para o Dashboard', /<table/.test(em) && !/<svg|<style/.test(em) && /href="https:\/\/tiagojgcc\.github\.io\/CFT-dashboard\/Dashboard\.html"/.test(em), em.length + ' bytes');
  // 5. Script de verificação existente do backend
  let vb = ''; try { vb = execSync('node apps-script/testes/verificar.js 2>&1').toString(); } catch (e) { vb = String(e.stdout || e.message); }
  const vbOk = !/falh|erro|✗|FAIL/i.test(vb.split('\n').slice(-5).join('\n'));
  ok('5. verificações do backend (apps-script/testes/verificar.js)', vbOk, vb.trim().split('\n').slice(-1)[0]);

  const b = await chromium.launch();
  for (const [nm, opt] of [['computador', { viewport: { width: 1280, height: 900 } }], ['telemóvel', { ...devices['iPhone 13'] }]]) {
    const c = await b.newContext(opt); const p = await c.newPage();
    const errs = []; p.on('pageerror', e => { if (!/gis is not defined/.test(e.message)) errs.push(e.message); });
    await p.goto('http://localhost:8765/Dashboard.html'); await p.waitForTimeout(1200);
    const res = await p.evaluate(async () => {
      document.getElementById('login-overlay').style.display = 'none';
      dataAll = [
        { id: 'a', ativo: true, semana: '1', timestamp: new Date(Date.now() - 3600e3).toISOString() },
        { id: 'b', ativo: true, semana: '1,2', timestamp: new Date(Date.now() - 50 * 3600e3).toISOString() },
        { id: 'c', ativo: false, semana: '2', timestamp: new Date().toISOString() }];
      data = dataAll.filter(a => a.ativo);
      tarefasBackend = [];
      const calls = [];
      Api.tarefa_create = async (...a) => { calls.push(['create', ...a]); return { id: 'T' + calls.length }; };
      Api.tarefa_resolve = async (id) => { calls.push(['resolve', id]); return {}; };
      window.__calls = calls;
      showTab('jornal'); await renderJornal(true);
      const kp = [...document.querySelectorAll('.jn-kpi-v')].map(e => e.firstChild.textContent.trim());
      return { kp, manchete: document.querySelector('.jn h1').textContent, panel: document.getElementById('panel-jornal').classList.contains('active') };
    });
    ok(`6. ${nm}: jornal abre sem erros e mostra a edição mais recente`, res.panel && res.manchete === ed.slice().sort((a,b)=>a.data<b.data?1:-1)[0].manchete && errs.length === 0, errs.join('; '));
    ok(`7. ${nm}: números ao vivo certos (2 inscrições, S1=2, S2=1, 1 nova em 24h)`, JSON.stringify(res.kp.slice(0, 4)) === JSON.stringify(['2', '2', '1', '1']), res.kp.join(','));
    const w = await p.evaluate(() => document.documentElement.scrollWidth);
    ok(`8. ${nm}: sem scroll horizontal`, w <= (nm === 'telemóvel' ? 390 : 1280), w + 'px');
    if (nm === 'computador') {
      // 9. botão leva à secção certa
      await p.click('.jn-go'); const t1 = await p.evaluate(() => document.querySelector('.panel.active').id);
      ok('9. «Ver inscrições» abre a secção Inscrições', t1 === 'panel-list', t1);
      // 10. «Pôr no plano» e «Feito» gravam no Plano partilhado
      await p.evaluate(() => showTab('jornal')); await p.waitForTimeout(300);
      await p.click('.jn-btn.ghost'); await p.waitForTimeout(400);
      const st = await p.evaluate(() => ({ calls: window.__calls, txt: document.querySelector('.jn-tip .jn-acts-btn').innerText, plano: plItems().length }));
      const c0 = st.calls[0] || [];
      const desc = c0[2] ? JSON.parse(c0[2]) : {};
      const exp = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
      ok('10. «Pôr no plano» cria tarefa no Plano partilhado (prazo +3 dias) e o jornal mostra o estado', c0[0] === 'create' && c0[3] === 'plano' && desc.prazo === exp && st.plano === 1 && /No plano/.test(st.txt), st.txt.replace(/\n/g, ' '));
      const st2 = await p.evaluate(async () => { tarefasBackend = []; window.__calls.length = 0; renderJornal(); await new Promise(r => setTimeout(r, 200)); document.querySelector('.jn-tip .jn-btn:not(.ghost)').click(); await new Promise(r => setTimeout(r, 400)); return { calls: window.__calls.map(c => c[0]), txt: document.querySelector('.jn-tip .jn-acts-btn').innerText }; });
      ok('11. «✓ Feito» cria e fecha a tarefa no Plano e mostra «Feito»', st2.calls.join() === 'create,resolve' && /Feito/.test(st2.txt), st2.txt);
      // 12. Tarefas do jornal não aparecem nas «Tarefas manuais»
      const manual = await p.evaluate(() => (tarefasBackend || []).filter(t => t.id_atleta !== PLANO_MARK).length);
      ok('12. sugestões não poluem a lista de tarefas manuais', manual === 0);
      // 13. Todas as outras secções continuam a abrir sem erros
      const before = errs.length;
      await p.evaluate(async () => { for (const t of [...document.querySelectorAll('.side-nav .tab')].map(x => x.dataset.panel)) { try { showTab(t); } catch (e) { throw new Error(t + ': ' + e.message); } await new Promise(r => setTimeout(r, 150)); } });
      await p.waitForTimeout(500);
      ok('13. todas as secções do Dashboard abrem sem erros', errs.length === before, errs.slice(before).join('; '));
      // 14. Arquivo 2026: Jornal escondido
      const hid = await p.evaluate(() => { document.body.dataset.edicao='2026'; const t = document.querySelector('.side-nav .tab[data-panel="jornal"]'); return getComputedStyle(t).display; });
      ok('14. no Arquivo 2026 o Jornal não aparece', hid === 'none', 'display=' + hid);
      await p.evaluate(() => { document.body.dataset.edicao='2027'; });
    }
    await c.close();
  }
  await b.close();
  console.log(R.map(r => r.join(' | ')).join('\n'));
  console.log('\nTotal:', R.filter(r => r[0] === 'PASSOU').length, 'de', R.length);
})();
