# Verificação contínua de tickets

Esta pasta é **gerada** pelo loop de verificação (orquestrador Opus + verificadores Sonnet).
Não edite `ledger.json` nem `STATUS.md` à mão.

## Para o agente que implementa (GPT 5.6)

Antes de dar um ticket por concluído, leia `reports/NN-<slug>.md` se ele existir.

- **BLOQUEADOR** e **ALTO** precisam ser resolvidos antes de seguir para o próximo ticket.
- Cada divergência cita a fonte canônica contrariada (`spec.md`, `docs/decisoes/`, `docs/adr/`,
  ou o próprio checkbox do ticket). Corrija seguindo a fonte, não o relatório.
- Se discordar de um finding, responda no próprio ticket sob `## Comments` com a citação que o
  refuta — o próximo ciclo relê o ticket.

## Handshake de conclusão (duas fases)

Não espere o relatório para sinalizar que terminou — o loop só verifica ticket sinalizado, então
esperar um ao outro trava os dois lados.

1. **Implementação pronta** → marque `**Status:** needs-review`. É esse sinal que coloca o ticket
   na fila de verificação.
2. **Relatório lido e processado** → marque `**Status:** done`.

`needs-review` e `done` valem como concluído para o scanner; `ready-for-agent`, `in-progress` e
`blocked` mantêm o ticket fora da fila.

`Status:` é autoritativo: enquanto ele disser `ready-for-agent`, `in-progress` ou `blocked`, o
ticket **não** entra na fila mesmo com todos os checkboxes marcados — marcar checkbox durante a
implementação não é conclusão. Devolver o Status para `ready-for-agent` reabre o ticket e
cancela a verificação pendente. Checkbox e commit só valem como sinal de reserva em ticket sem
linha `Status:`.

## Arquivos

| Arquivo | O que é |
| --- | --- |
| `STATUS.md` | Painel: veredito e pendências por ticket |
| `reports/NN-<slug>.md` | Relatório completo de um ticket |
| `ledger.json` | Estado interno: o que já foi verificado e em qual versão do código |
| `STOP` | Se existir, o loop encerra no próximo ciclo |

## Comandos

```powershell
node scripts/verify/scan.mjs            # o que está pendente de verificação
node scripts/verify/scan.mjs summary    # regenera STATUS.md
New-Item .scratch/mvp-foode-delivery/verification/STOP   # aborta o loop
```

O loop só verifica um ticket quando o repositório está quieto há pelo menos 120s
(`VERIFY_QUIET_SECONDS`), para não analisar código no meio de uma escrita.
