# CFT Dashboard — Deploy do backend (Apps Script)

Este passo-a-passo é a **Fase 1**: criar a cópia de teste do Sheet, montar o Apps Script, validar com `Logger.log` antes de tocar no frontend. Demora ~20 min.

---

## 0. Antes de começar

Faz tudo logado em **`geral@camposft.com`** (a conta que vai ser dona do script e dos endpoints).

---

## 1. Cópia de teste do Sheet

1. Abre o Sheet original: <https://docs.google.com/spreadsheets/d/1LXOqqTt2Ct7xNtRvv_Nu38z5V3pza0NtacgxBM3_WSY/edit>
2. **Ficheiro → Fazer cópia** → nome: `CFT 2026 — TESTE`. Guarda no Drive da conta.
3. Abre a cópia. Confirma que a aba `Respostas do Formulário 1` existe e tem 33 colunas.
4. Copia o **ID do Sheet** do URL — é o segmento entre `/d/` e `/edit`. Vais precisar dele já a seguir.

> A cópia **não está ligada ao Forms** (o Forms continua a escrever no Sheet original). Para testar trigger `onFormSubmit` com a cópia, em alternativa, podes criar um Forms de teste que escreva nesta cópia. Para esta fase, basta o backfill manual.

---

## 2. Criar o projeto Apps Script

1. No Sheet de teste: **Extensões → Apps Script**.
2. Apaga o `Code.gs` que vem por defeito.
3. **Criar 9 ficheiros** (botão `+` ao lado de "Files"):

   - Ficheiro → Script: `Code`, `Auth`, `Config`, `Pricing`, `Inscricoes`, `Historico`, `Emails`, `Triggers`, `Backfill`
   - Cola o conteúdo de cada ficheiro de [`apps-script/`](apps-script/) no respectivo ficheiro do editor.

4. Edita o `appsscript.json` (clica no ⚙️ → "Mostrar ficheiro de manifest 'appsscript.json' no editor" se ainda não estiver visível) e cola o conteúdo de [`apps-script/appsscript.json`](apps-script/appsscript.json).

5. No ficheiro `Code.gs`, substitui a linha
   ```js
   const SHEET_ID = 'COLAR_AQUI_O_ID_DA_COPIA_DE_TESTE';
   ```
   pelo ID da cópia de teste (passo 1.4).

6. **Guardar tudo** (`Ctrl+S`).

---

## 3. Setup das abas + backfill

No editor Apps Script, com o ficheiro `Backfill.gs` aberto:

1. Selecciona a função `setupSheets` no dropdown de funções (topo) → **Run**.
2. Primeira execução pede autorização → "Rever permissões" → escolher `geral@camposft.com` → "Permitir".
3. Verifica em **View → Logs** que diz `setupSheets OK.`.
4. Volta ao Sheet: confirma que existem agora as abas `Atletas`, `Historico`, `Emails`, `Config`. Confirma que a aba do Forms tem `id_inscricao` na col 34 e `migrado_em` na col 35.
5. Volta ao Apps Script. Selecciona `run` (em `Backfill`) → **Run**.
6. Logs devem dizer algo como `Backfill: N linhas migradas. Total Atletas: N`. Verifica a aba `Atletas` no Sheet — deve ter uma linha por inscrição existente.

---

## 4. Whitelist e config

Na aba `Config`:

| key | value |
|---|---|
| whitelist_emails | `geral@camposft.com` |
| client_id | _(deixar vazio por agora — preenche-se quando criarmos o frontend)_ |
| vagas_total | 180 |
| cutoff_desconto | 2026-03-31 |
| prazo_pagamento | 2026-06-21 |
| edicao | 4 |

Se já tiverem outro email admin, acrescenta-o em `whitelist_emails` separado por vírgula.

---

## 5. Deploy como Web App

1. **Deploy → New deployment** → Type: **Web app**.
2. Description: `CFT Dashboard backend v1`.
3. Execute as: **Me (geral@camposft.com)**.
4. Who has access: **Anyone** (a auth real é feita dentro do código via token; o endpoint público sem token responde 403).
5. **Deploy** → autoriza se pedir.
6. Copia o **Web app URL** (acaba em `/exec`). Vais precisar dele no frontend (Fase 2).

> **Sempre que mudares código** tens de fazer **Deploy → Manage deployments → ✏️ Edit → New version → Deploy**. Senão o URL continua a servir a versão antiga.

---

## 6. Teste rápido sem frontend

No editor Apps Script, na consola (Logs), corre estas funções para validar:

### 6.1 `getAll` (sem token — deve falhar)

Cria temporariamente uma função de teste no `Code.gs`:

```js
function _test_getAll_no_token() {
  const r = handle_({ parameter: { action: 'getAll' } }, 'GET');
  Logger.log(r.getContent());
}
```

Run → o log deve mostrar `{"ok":false,"error":"Missing token"}`. ✅

### 6.2 `getAll` falso-bypass para testar a leitura

Para testar a leitura **antes de termos token Google válido do frontend**, comenta temporariamente a linha `const user = Auth.verify(params.token);` em `handle_` e substitui por `const user = 'geral@camposft.com';`. Cria:

```js
function _test_getAll_local() {
  const r = Inscricoes.getAll();
  Logger.log(JSON.stringify(r).substring(0, 2000));
}
```

Deves ver um JSON com `atletas`, `historico` (vazio), `emails` (vazio), `config` e `clube_counts`. ✅
**Reverte** o bypass antes de continuar.

### 6.3 Mutação de exemplo

```js
function _test_update() {
  const all = Inscricoes.getAll();
  const id = all.atletas[0].id_inscricao;
  Logger.log('Atleta: ' + all.atletas[0].atleta + ' / id ' + id);
  const r = Inscricoes.updateSemanas(id, [1, 2], 'teste interno do backfill', 'geral@camposft.com');
  Logger.log(JSON.stringify(r));
}
```

Verifica no Sheet: `semanas_atuais` deve ter mudado, e a aba `Historico` deve ter uma linha nova.

---

## 7. Instalar trigger onFormSubmit (opcional nesta fase)

Só faz sentido com Forms ligado à cópia. Salta este passo se estás só a testar.

```
Triggers.install()  → Run
```

---

## 8. Quando passar para o Sheet real

1. Edita `Code.gs` → muda `SHEET_ID` para o ID do Sheet **real**.
2. Corre `Backfill.setupSheets()` no Sheet real (cria abas e adiciona colunas 34/35 ao Forms).
3. Corre `Backfill.run()` para popular `Atletas` com as inscrições já existentes.
4. Corre `Triggers.install()` para apanhar inscrições futuras.
5. Faz **New version** do deployment (passo 5).

---

## Endpoints disponíveis

Todos via `POST` JSON com body `{ action, token, ... }`. Apenas `getAll` pode ir por `GET ?action=getAll&token=...`.

| action | params extra | descrição |
|---|---|---|
| `getAll` | — | devolve atletas + historico + emails + config + clube_counts |
| `updateSemanas` | id, novas (array), motivo (≥10) | altera semanas, regista histórico |
| `softDelete` | id, motivo (≥10) | marca ativo=false |
| `reactivate` | id, motivo (≥10) | volta a ativo=true |
| `updatePagamento` | id, valor (€) | actualiza valor_pago |
| `toggleIrmao` | id, valor (bool) | aplica/remove desconto irmão |
| `addNota` | id, nota | append nota interna |
| `logEmail` | template, assunto, corpo, destinatarios (array), ids_atletas (array) | regista intenção de envio |
| `markEmailSent` | id (do log) | marca abriu_no_gmail=true |

Resposta sempre `{ ok: true, user, data }` ou `{ ok: false, error }`.

---

---

# FASE 2 — Frontend + Login + Netlify

## 9. Criar OAuth Client (Google Cloud)

1. Vai a <https://console.cloud.google.com/apis/credentials> com `geral@camposft.com`.
2. **Create credentials → OAuth client ID**.
   - Se for a primeira vez na project, configura o **OAuth consent screen** (User type: External; Publishing status: Testing; adiciona `geral@camposft.com` como test user).
   - Application type: **Web application**.
   - Name: `CFT Dashboard frontend`.
   - **Authorized JavaScript origins** (adiciona todos os locais onde o frontend vai correr):
     - `http://localhost:8000` (testes locais)
     - `https://<o-teu-site>.netlify.app` (após deploy Netlify)
   - **Authorized redirect URIs:** deixa em branco (Google Identity Services usa popup, não redirect).
3. Cria → copia o **Client ID** (termina em `.apps.googleusercontent.com`).

## 10. Preencher config no frontend e no Sheet

**No `Dashboard.html`** (linhas ~530–534) substitui:
```js
window.CFT_CONFIG = {
  API_URL:   'https://script.google.com/macros/s/AK.../exec',  // do passo 5
  CLIENT_ID: '1234567890-abc...apps.googleusercontent.com'      // do passo 9
};
```

**Na aba Config do Sheet** preenche `client_id` com o mesmo valor (Auth.gs valida o `aud` do token contra este).

## 11. Testar localmente

```bash
cd "C:\...\CFT - Dashboard"
python -m http.server 8000
```
Abre <http://localhost:8000/Dashboard.html>. Deves ver o ecrã de login. Entra com `geral@camposft.com`. O dashboard carrega com dados reais da cópia de teste.

Checklist mínimo no UI:
- [ ] Login com `geral@camposft.com` entra; outro email é rejeitado (toast de erro).
- [ ] KPIs e tabela populam com dados da aba Atletas.
- [ ] Editar valor pago numa linha → toast "Pagamento atualizado", aparece em Histórico.
- [ ] Toggle ✓ irmão recalcula valor devido (sem desconto → 295 ou 330) e regista evento.
- [ ] ✎ Editar semanas: motivo <10 chars desativa botão; com motivo válido grava e refresca.
- [ ] × Eliminar atleta: motivo obrigatório; atleta sai da Lista, aparece em Eliminados.
- [ ] Tab "Eliminados" → ↺ Reativar com motivo; volta à Lista.
- [ ] "Atualizar agora" no appbar → spinner + última-atualização HH:MM.
- [ ] Auto-refresh a cada 45 s (dispara silenciosamente).
- [ ] Modal email: regista no `Emails` + abre Gmail compose com BCC preenchido.

## 12. Deploy Netlify

1. <https://app.netlify.com> → **Add new site → Deploy manually** → arrasta a pasta inteira do projeto (`CFT - Dashboard`).
2. Após primeiro deploy, recolhe o URL (`xxx.netlify.app`).
3. Volta ao **Google Cloud → OAuth client** (passo 9) e adiciona esse URL aos *Authorized JavaScript origins*. Save.
4. (Opcional) Em Netlify → Site settings → Domain → renomeia para algo tipo `cft-dashboard.netlify.app`.
5. Para iterações futuras: ou voltas a arrastar a pasta, ou ligas ao GitHub para deploy automático.

> **Não precisas de Netlify Password Protection.** A protecção real está no backend (whitelist + token Google). O site Netlify pode estar público — quem entrar sem login Google válido não vê nada e o backend rejeita pedidos.

## 13. Passar para o Sheet real

1. No Apps Script, edita `Code.gs` → muda `SHEET_ID` para o ID do Sheet **real**.
2. Corre `Backfill.setupSheets()` no Sheet real (cria abas e adiciona colunas 34/35 ao Forms).
3. Corre `Backfill.run()` — popula `Atletas`.
4. Corre `Triggers.install()` — apanha inscrições futuras automaticamente.
5. **Deploy → Manage deployments → Edit → New version → Deploy** (importante: senão o `/exec` continua a apontar à cópia).
6. O `API_URL` no `Dashboard.html` continua igual (o URL `/exec` não muda entre versões).

---

## Questionário de satisfação (pós-edição)

O questionário vive em [`questionario.html`](questionario.html) — servido pelo **GitHub Pages** junto com o Dashboard (o site publica automaticamente a partir do branch `main`, em `https://tiagojgcc.github.io/CFT-dashboard/questionario.html`). As respostas caem na aba **`Satisfacao`** do Sheet (criada automaticamente na 1ª submissão). A submissão usa a action pública `survey_submit` do mesmo endpoint `/exec` — **não precisa de login** (protecção: honeypot + sanitização; nunca expõe dados, só recebe).

**Para pôr a funcionar:**

1. **Frontend**: automático — assim que o código chega ao `main`, o GitHub Pages publica sozinho (1-2 min).
2. **Apps Script** (único passo manual): cola o novo ficheiro `Satisfacao.gs` e o `Code.gs`/`EmailTemplates.gs`/`EmailDraft.gs` atualizados → **Deploy → Manage deployments → ✏️ → New version → Deploy**.
3. **Config do Sheet** — **opcional**: o Dashboard deriva o link do questionário automaticamente do próprio site, por isso não é preciso configurar nada. Estas chaves existem só como afinação:

   | key | value | para quê |
   |---|---|---|
   | `survey_url` | `https://tiagojgcc.github.io/CFT-dashboard/questionario.html` | fallback do link (só usado se o draft for criado fora do Dashboard) |
   | `survey_edicao` | `CFT 2026` | edição mostrada no email/header (ex.: "CFT 2026 · OBRIGADO") |

4. **No topo do `questionario.html`**: confirma o `API_URL` (é o mesmo `/exec` do Dashboard) e, se quiseres chips clicáveis na pergunta "que treinador te marcou pela positiva", preenche `TREINADORES: ['Nome1', 'Nome2', …]` — vazio mostra campo de texto livre.

**Como enviar:** o email de agradecimento é o template `agradecimento` — disponível no painel inline de cada atleta (pill "Agradecimento + questionário", com link pré-preenchido com nome/clube) e em bulk na Lista ("🙏 Agradecimento + questionário · todos em BCC", link genérico). O email pede explicitamente que a fase **«No campo»** seja respondida em conjunto com o atleta.

**Formato do questionário:** 4 fases curtas (Inscrição & comunicação → Organização & confiança → No campo *com o atleta* → Para o ano), quase tudo avaliações de 1 toque (1–5 e NPS 0–10), **nenhuma pergunta obrigatória**, identificação opcional no fim. As respostas analisam-se diretamente na aba `Satisfacao` (filtros/pivots do Sheets).

---

## Resolução de problemas

- **"CFT_CONFIG.CLIENT_ID não configurado"** → preencheste em `Dashboard.html` mas não fizeste reload? Hard reload (Ctrl+Shift+R).
- **"Email not authorized"** → `whitelist_emails` em Config não tem o email exato. Verifica typos / caso (lowercase OK).
- **"Token audience mismatch"** → o `client_id` em Config não bate com o do `Dashboard.html`. Têm de ser idênticos.
- **CORS error no fetch** → o Apps Script aceita pedidos de qualquer origem mas o `Content-Type` tem de ser `text/plain` (não `application/json`) para evitar preflight. Já está tratado em `api.js`.
- **Token expira ao fim de 1 h** → o utilizador é forçado a fazer login outra vez. Como só usas durante o trabalho e Google guarda a sessão, aparece silenciosamente o "Continuar como geral@camposft.com".
- **Mudei código no Apps Script mas o frontend não vê** → fizeste **New version**? Sem isso, o `/exec` continua a servir a versão antiga.

