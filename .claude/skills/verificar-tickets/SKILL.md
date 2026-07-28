---
name: verificar-tickets
description: Verifica continuamente se as implementações dos tickets do MVP Foode batem com spec, tickets, decisões e ADRs. Orquestra verificadores Sonnet em paralelo, escreve relatórios e sinaliza divergências com correções sugeridas. Use quando o usuário pedir para conferir/auditar implementações de tickets, ou dentro de um /loop de verificação contínua.
---

# Verificação contínua de tickets — MVP Foode Delivery

Você é o **orquestrador**. Agentes externos (GPT 5.6) implementam ticket a ticket em
`.scratch/mvp-foode-delivery/issues/`. Sua função é conferir cada ticket concluído contra
a documentação canônica e **sinalizar divergências com correções pontuais** — nunca corrigir
o código por conta própria.

## Fontes canônicas (ordem de autoridade)

1. `.scratch/mvp-foode-delivery/spec.md` — Implementation Decisions, Testing Decisions, Out of Scope, Further Notes.
2. `.scratch/mvp-foode-delivery/issues/NN-*.md` — checkboxes = requisitos de aceite do ticket.
3. `docs/adr/*.md` — decisões arquiteturais.
4. `docs/decisoes/*.md` — decisões de produto/negócio fechadas (numeradas).
5. `CONTEXT.md` — glossário: nomes de domínio corretos e termos proibidos.

Conflito entre fontes é **finding**, não licença para escolher uma.

## Estado (nunca edite à mão)

- `.scratch/mvp-foode-delivery/verification/ledger.json` — o que já foi verificado e em qual versão.
- `.scratch/mvp-foode-delivery/verification/reports/NN-<slug>.md` — relatório por ticket.
- `.scratch/mvp-foode-delivery/verification/STATUS.md` — painel gerado.
- `.scratch/mvp-foode-delivery/verification/STOP` — se existir, o loop encerra.

## Processo de cada ciclo

### 1. Scan

```
node scripts/verify/scan.mjs
```

Retorna JSON com `stopRequested`, `busy`, `totals` e, por ticket, `implemented`,
`needsVerification` e `reason`. **Não** repita trabalho que o scan diz estar em dia.

### 2. Portões de saída

- `stopRequested: true` → avise o usuário, chame `ScheduleWakeup` com `stop: true` e termine.
- `busy.isBusy: true` e `busy.forceAllowed: false` → o agente de código está escrevendo
  (`busy.newestFile` mostra onde). Rode `node scripts/verify/scan.mjs defer`, informe em
  **uma linha** que adiou e agende o próximo despertar em ~300s. Não gaste contexto além disso.
- `busy.isBusy: true` mas `forceAllowed: true` → verifique assim mesmo e marque os relatórios
  como `snapshot instável` (o código pode mudar durante a análise).
- Nenhum ticket com `needsVerification` → veja §7.

O scan já suprime sozinho duas classes de ruído, então confie nele: reverificação de ticket
aprovado (`kind: "regressao"`) espera o ticket em voo na branch fechar, e nunca passa na frente
de um ticket que nunca foi verificado (`kind: "primeira"`).

### 3. Monte o lote

Pegue os tickets com `needsVerification: true`, **ordem crescente de número** (blockers-first),
**no máximo 4 por ciclo**. Tickets fora do lote ficam para o próximo despertar.

### 4. Dispare os verificadores em paralelo

Leia `verifier-brief.md` (nesta pasta) e monte **uma mensagem única** com uma chamada `Agent`
por ticket do lote:

- `subagent_type: "general-purpose"`
- `model: "sonnet"`
- `run_in_background: false` (chamadas na mesma mensagem já rodam em paralelo; você precisa
  dos resultados para agregar)
- `description`: `"Verifica ticket NN"`
- `prompt`: o `verifier-brief.md` inteiro, com os placeholders substituídos.

Nunca passe mais de um ticket para o mesmo agente.

### 5. Registre o resultado

Cada verificador escreve o próprio relatório e devolve um resumo compacto. Para cada um:

```
node scripts/verify/scan.mjs record --ticket NN --verdict pass|findings|blocked \
  --open <n> --blockers <n> --footprint "apps/api/src,packages/db" \
  --report .scratch/mvp-foode-delivery/verification/reports/NN-slug.md
```

O `--footprint` vem do relatório e é o que faz o próximo ciclo reverificar **só** quando
esses caminhos mudarem. Depois rode `node scripts/verify/scan.mjs summary`.

### 6. Reporte ao usuário

Formato enxuto — ele acompanha vários ciclos:

```
## Ciclo <hora> — tickets NN, NN

**NN <título>** — ⛔ 2 bloqueadores, ⚠️ 1 alto
- <divergência em uma linha> (`arquivo:linha`)
  → **Correção:** <ação pontual, citando a decisão que a fundamenta>
```

Regras do reporte:

- Só suba **BLOQUEADOR** e **ALTO** ao chat; MÉDIO/NOTA ficam no relatório.
- Cada correção sugerida cita a fonte canônica (`spec.md` linha/decisão, `docs/decisoes/NN`, ADR).
- Correções são **pontuais e coerentes com a codebase existente** — nunca proponha reabrir
  decisão fechada, trocar stack, nem refatoração ampla.
- Ticket 100% conforme: uma linha `**NN** ✅ conforme`.
- Nunca edite código do produto. Se o usuário pedir explicitamente para corrigir, aí sim implemente.

### 7. Ritmo e conclusão

Ao final de todo ciclo chame `ScheduleWakeup`:

Se houver um Monitor armado (poll do scanner a cada 90s), **ele é o gatilho real** e o
`ScheduleWakeup` é só heartbeat de segurança — nesse caso use os valores da coluna direita.
Confirme com `TaskList` antes de armar outro; um basta.

| Situação | Sem Monitor | Com Monitor |
| --- | --- | --- |
| Ficou fila de tickets pendentes | 300 | 300 |
| Lote verificado, nada na fila | 900 | 1800 |
| Nada implementado novo há vários ciclos | 1800 | 1800 |
| Repo ocupado (adiado) | 300 | 300 |

**Conclusão** (encerra o loop com `stop: true`): todos os 16 tickets com `implemented: true`,
todos com veredito registrado, `totals.blockers === 0` e nenhum `needsVerification`. Anuncie o
fechamento e aponte `STATUS.md`.

Fora isso o loop é infinito — só para por `STOP`, por pedido do usuário, ou pela conclusão acima.

## Anti-padrões

- Reverificar ticket que o scan marcou como em dia.
- Ler `spec.md` inteiro no seu contexto — quem lê é o verificador Sonnet.
- Rodar `pnpm build/test/lint` durante a verificação: colide com o agente de código.
- Inventar requisito que não está no ticket nem na spec.
- Acumular contexto: cada ciclo é independente, o ledger é a memória.
