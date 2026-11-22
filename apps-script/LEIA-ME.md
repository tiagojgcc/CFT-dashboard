# Backend do Dashboard e das inscrições (Apps Script)

**O único ficheiro a colar no Apps Script é `CFT_All.gs`.**
Projeto «CFT Dashboard», conta `geral@camposft.com`, ficheiro `Código.gs`.

Os outros `.gs` desta pasta (`Code.gs`, `Pricing.gs`, etc.) são cópias antigas por módulo, de 2026.
Não têm a inscrição pelo site nem os preços de 2027. **Não colar.**

## Antes de publicar

```
node apps-script/testes/verificar.js
```

Tem de acabar em «Tudo certo». Usa uma folha simulada em memória: não toca no Sheet, no Drive nem no Gmail.

## Publicar

1. Abrir o Apps Script numa janela anónima, só com `geral@camposft.com`.
2. Substituir todo o conteúdo de `Código.gs` pelo de `CFT_All.gs`. Guardar.
3. Implementar → Gerir implementações → editar → **Nova versão** → Implementar. O endereço `/exec` não muda.
4. Testar com `camposft.com/inscricao.html?teste=1` e apagar as linhas de teste nas abas Respostas, Atletas, Historico, Emails (e Tarefas, se for lista de espera).

Para voltar atrás: Gerir implementações → escolher a versão anterior.

## O que este ficheiro tem (22/11/2026)

- Tudo o que estava no ar na versão 27 (inscrição pelo site, preços 2027, arquivo 2026).
- Postal de Natal no email de confirmação, até 24/12, e emails ajustados ao telemóvel.
- Código único por inscrição: reenvios não criam segunda inscrição nem segundo email.
- Vagas por semana (`vagas_por_semana` no Config, 60 se não existir). Semana cheia: a inscrição fica inativa com o motivo «Lista de espera», recebe email próprio e cria uma tarefa no Dashboard. Para dar a vaga: reativar na Lista.
- Número de inscrição atribuído dentro do mesmo bloqueio que escreve a linha.
- Leitura do comprovativo um minuto depois, fora do pedido da família.
- Um comprovativo que não se consegue guardar já não impede a inscrição.

Interruptores no Config: `email_auto_inscricao = nao`, `postal_natal = nao`.
