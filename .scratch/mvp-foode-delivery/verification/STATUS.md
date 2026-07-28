# Verificação automática — mvp-foode-delivery

_Atualizado em 2026-07-28T16:13:46.588Z · branch `cursor/auth-rbac-dono-operador-391f` · HEAD `783d01a9`_

Relatórios gerados pelo loop de verificação (orquestrador Opus + verificadores Sonnet).
Cada relatório confronta a implementação com `spec.md`, o ticket, `docs/decisoes/` e `docs/adr/`.

- Tickets: **16** · sinalizados como concluídos: **3**
- Conformes: **3** · com divergências: **0** · na fila: **0**
- Bloqueadores abertos: **0**

| # | Ticket | Impl. | Veredito | Abertos | Bloq. | Verificado em | Relatório |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 01 | Bootstrapar monorepo e identidade Foode | sim | ✅ conforme | 0 | 0 | 2026-07-28 16:13 | [relatório](reports/01-bootstrap-monorepo-identidade-foode.md) |
| 02 | Instalar Loja, `store_id` e RLS efetiva | sim | ✅ conforme | 0 | 0 | 2026-07-28 16:13 | [relatório](reports/02-loja-store-id-rls.md) |
| 03 | Autenticar Dono e Operador e aplicar RBAC | sim | ✅ conforme | 0 | 0 | 2026-07-28 15:58 | [relatório](reports/03-auth-rbac-dono-operador.md) |
| 04 | Bloquear produção com CI e migrations validadas | não | — | — | — | — | — |
| 05 | Gerenciar e publicar o Cardápio da Loja | não | — | — | — | — | — |
| 06 | Configurar Complementos e montar o carrinho | não | — | — | — | — | — |
| 07 | Aplicar horários e Pausa no Canal próprio | não | — | — | — | — | — |
| 08 | Concluir o primeiro Pedido Guest na Retirada | não | — | — | — | — | — |
| 09 | Adicionar Delivery por Taxa fixa ou bairro | não | — | — | — | — | — |
| 10 | Pagar por PIX Woovi em `pilot_platform` | não | — | — | — | — | — |
| 11 | Pagar por Crédito Asaas em `pilot_platform` | não | — | — | — | — | — |
| 12 | Cancelar Pedido e executar Estorno automático | não | — | — | — | — | — |
| 13 | Converter Guest em conta e aplicar Cupom de boas-vindas | não | — | — | — | — | — |
| 14 | Expor Plano, relatórios e Ledger ao Dono | não | — | — | — | — | — |
| 15 | Reconciliar pagamentos e repasses por Railway Cron | não | — | — | — | — | — |
| 16 | Futuro: onboarding assistido de subconta `baas` | não | — | — | — | — | — |

🔄 = já verificado antes, mas o código/ticket mudou depois — está na fila para nova verificação.

## Na fila

Nada pendente.

## Como parar o loop

Crie o arquivo `.scratch/mvp-foode-delivery/verification/STOP` (`New-Item .scratch/mvp-foode-delivery/verification/STOP`) ou peça "pare o loop de verificação" no chat.
